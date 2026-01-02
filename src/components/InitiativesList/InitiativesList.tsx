import React, { useState, useMemo, useEffect, useRef } from 'react';
import { FixedSizeList as List } from 'react-window';
import { UseCase, SearchFilters, Category } from '../../types';
import { categoryAPI, useCaseAPI, likesAPI } from '../../services/apiService';
import { useActiveDomainId } from '../../context/DomainContext';
import FilterPanel from '../FilterPanel/FilterPanel';
import InitiativeCard from '../InitiativeCard/InitiativeCard';
import PrioritizationMatrix from '../PrioritizationMatrix/PrioritizationMatrix';
import ChatAssistant from '../ChatAssistant/ChatAssistant';
import EmptyState from '../EmptyState/EmptyState';
import LoadingAnimation from '../LoadingAnimation/LoadingAnimation';
import { emptyStateMessages } from '../../data/emptyStates';
import { FaThLarge, FaList, FaSortAmountDown, FaPlus, FaChartLine, FaBuilding, FaLayerGroup, FaBolt, FaTag } from 'react-icons/fa';
import './InitiativesList.css';

// Status colors matching new family workflow
const STATUS_COLORS = {
  intention: '#77787B', // Metal Grey
  experimentation: '#9B59B6', // Purple
  commitment: '#C68D6D', // Earthy Brown
  implementation: '#4A90E2', // Blue
  integration: '#00A79D', // Sea Green
  blocked: '#E74C3C', // Red
  slow_burner: '#F6BD60', // Sunset Yellow
  de_prioritised: '#9e9e9e', // Grey
  on_hold: '#B79546' // Gold
};

const STATUS_LABELS = {
  intention: 'Intention',
  experimentation: 'Experimentation',
  commitment: 'Commitment',
  implementation: 'Implementation',
  integration: 'Integration',
  blocked: 'Blocked',
  slow_burner: 'Slow Burner',
  de_prioritised: 'De-prioritised',
  on_hold: 'On Hold'
};

interface StatusCount {
  status: string;
  count: number;
  color: string;
  label: string;
}

interface InitiativesCountBarProps {
  useCases: UseCase[];
}

const STATUS_ORDER = ['intention', 'experimentation', 'commitment', 'implementation', 'integration'];

const InitiativesCountBar: React.FC<InitiativesCountBarProps> = ({ useCases }) => {
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    useCases.forEach(useCase => {
      counts[useCase.status] = (counts[useCase.status] || 0) + 1;
    });

    // Always return all statuses in fixed order
    return STATUS_ORDER.map(status => ({
      status,
      count: counts[status] || 0,
      color: STATUS_COLORS[status as keyof typeof STATUS_COLORS] || STATUS_COLORS.intention,
      label: STATUS_LABELS[status as keyof typeof STATUS_LABELS] || status
    }));
  }, [useCases]);

  const totalCount = useCases.length;

  if (totalCount === 0) return null;

  return (
    <div className="status-bar-chart">
      <div className="status-bar-container">
        {statusCounts.map((item) => (
          <div
            key={item.status}
            className={`status-bar-segment ${item.count === 0 ? 'zero-count' : ''}`}
            style={{
              backgroundColor: item.color,
              flex: item.count === 0 ? 0.5 : item.count
            }}
            title={`${item.label}: ${item.count}`}
          >
            <span className="status-bar-count">{item.count}</span>
          </div>
        ))}
      </div>
      <div className="status-bar-legend">
        {statusCounts.map((item) => (
          <div key={item.status} className="status-legend-item">
            <span className="status-legend-dot" style={{ backgroundColor: item.color }} />
            <span className="status-legend-text">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

interface InitiativesListProps {
  onUseCaseClick: (useCase: UseCase) => void;
  onCreateClick: () => void;
  onSearch: (query: string) => void;
  onUserMenuClick: () => void;
  searchQuery?: string;
  user?: {
    name: string;
    role: string;
  };
  showAIChat?: boolean;
  onCloseChatClick?: () => void;
  initialFilters?: SearchFilters;
  onFiltersChange?: (filters: SearchFilters) => void;
}

const InitiativesList: React.FC<InitiativesListProps> = ({
  onUseCaseClick,
  onCreateClick,
  onSearch,
  onUserMenuClick,
  searchQuery,
  user,
  showAIChat,
  onCloseChatClick,
  initialFilters,
  onFiltersChange
}) => {
  const activeDomainId = useActiveDomainId();
  const [useCases, setUseCases] = useState<UseCase[]>([]);
  const [filters, setFilters] = useState<SearchFilters>(initialFilters || {});
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'matrix'>(() => {
    // Load saved view mode preference from localStorage
    const savedViewMode = localStorage.getItem('ai_initiatives_view_mode');
    return (savedViewMode as 'grid' | 'list' | 'matrix') || 'grid';
  });
  const [sortBy, setSortBy] = useState<'created' | 'updated'>(() => {
    // Load saved sort preference from localStorage
    const savedSortBy = localStorage.getItem('ai_initiatives_sort_by');
    return (savedSortBy as 'created' | 'updated') || 'updated';
  });
  const [hasScrolled, setHasScrolled] = useState(false);
  const [likedUseCases, setLikedUseCases] = useState<Set<string>>(new Set());
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const containerRef = useRef<HTMLDivElement>(null);
  const virtualListRef = useRef<any>(null);

  // Handle mobile detection and force list view
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (mobile && viewMode !== 'list') {
        setViewMode('list');
      }
    };
    window.addEventListener('resize', handleResize);
    // Check on mount
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [viewMode]);

  // Save view mode preference to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('ai_initiatives_view_mode', viewMode);
  }, [viewMode]);

  // Save sort preference to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('ai_initiatives_sort_by', sortBy);
  }, [sortBy]);

  // Update filters when initialFilters prop changes
  useEffect(() => {
    if (initialFilters) {
      // Use a slight delay to ensure FilterPanel has loaded localStorage data first
      const timer = setTimeout(() => {
        setFilters(prev => ({ ...prev, ...initialFilters }));
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [initialFilters]);

  // Load categories (filtered by domain)
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const fetchedCategories = await categoryAPI.getAll(activeDomainId);
        setCategories(fetchedCategories);
      } catch (error) {
        console.error('Failed to load categories:', error);
      }
    };

    loadCategories();
  }, [activeDomainId]);


  // Load use cases when filters, search query, or domain change
  useEffect(() => {
    const loadUseCases = async () => {
      // Don't load if domain hasn't been loaded yet
      if (activeDomainId === null) return;

      const effectiveSearchQuery = searchQuery || '';

      try {
        setIsLoading(true);
        const apiFilters = { ...filters, domain_id: activeDomainId, limit: 1000 };
        if (effectiveSearchQuery) {
          apiFilters.search = effectiveSearchQuery;
        }

        const fetchedUseCases = await useCaseAPI.getAll(apiFilters);
        setUseCases(fetchedUseCases);
      } catch (error) {
        console.error('Failed to load filtered use cases:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadUseCases();
  }, [filters, searchQuery, activeDomainId]);

  // Load liked use cases for the current user
  useEffect(() => {
    const loadLikedUseCases = async () => {
      if (useCases.length === 0) return;

      try {
        const liked = new Set<string>();
        // Check like status for each use case
        await Promise.all(
          useCases.map(async (useCase) => {
            try {
              const { liked: isLiked } = await likesAPI.check(useCase.id);
              if (isLiked) {
                liked.add(useCase.id);
              }
            } catch (error) {
              console.error(`Failed to check like status for use case ${useCase.id}:`, error);
            }
          })
        );
        setLikedUseCases(liked);
      } catch (error) {
        console.error('Failed to load liked use cases:', error);
      }
    };

    loadLikedUseCases();
  }, [useCases]);

  // Reset scroll indicator when view changes
  useEffect(() => {
    setHasScrolled(false);
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [viewMode, filters, searchQuery]);

  // Sort use cases (filtering is now done server-side)
  const sortedUseCases = useMemo(() => {
    const sorted = [...useCases];
    sorted.sort((a, b) => {
      const dateA = new Date(sortBy === 'created' ? a.created_date : a.updated_date);
      const dateB = new Date(sortBy === 'created' ? b.created_date : b.updated_date);
      return dateB.getTime() - dateA.getTime(); // Most recent first
    });
    return sorted;
  }, [useCases, sortBy]);

  // For virtual scrolling, we'll implement a threshold-based approach
  // Only virtualize when we have more than 50 items to avoid complexity for smaller lists
  const shouldUseVirtualScrolling = sortedUseCases.length > 50;



  const handleFiltersChange = (newFilters: SearchFilters) => {
    setFilters(newFilters);
    // Also notify parent component to persist filters
    onFiltersChange?.(newFilters);
  };

  const handleClearFilters = () => {
    setFilters({});
    // Also notify parent component to clear persisted filters
    onFiltersChange?.({});
  };

  const handleUseCaseClick = (useCase: UseCase) => {
    onUseCaseClick(useCase);
  };

  const handleLike = async (useCaseId: string) => {
    try {
      // Optimistically update the UI
      const wasLiked = likedUseCases.has(useCaseId);
      const newLikedUseCases = new Set(likedUseCases);

      if (wasLiked) {
        newLikedUseCases.delete(useCaseId);
      } else {
        newLikedUseCases.add(useCaseId);
      }
      setLikedUseCases(newLikedUseCases);

      // Update the use case's likes_count in the local state
      setUseCases(prevUseCases =>
        prevUseCases.map(uc => {
          if (uc.id === useCaseId) {
            return {
              ...uc,
              likes_count: wasLiked
                ? Math.max((uc.likes_count || 0) - 1, 0)
                : (uc.likes_count || 0) + 1
            };
          }
          return uc;
        })
      );

      // Call the API to toggle the like
      const result = await likesAPI.toggle(useCaseId);

      // Update the use case's likes_count with the actual count from the server
      setUseCases(prevUseCases =>
        prevUseCases.map(uc => {
          if (uc.id === useCaseId) {
            return {
              ...uc,
              likes_count: result.count
            };
          }
          return uc;
        })
      );

      // Update liked state based on server response
      const finalLikedUseCases = new Set(likedUseCases);
      if (result.liked) {
        finalLikedUseCases.add(useCaseId);
      } else {
        finalLikedUseCases.delete(useCaseId);
      }
      setLikedUseCases(finalLikedUseCases);
    } catch (error) {
      console.error('Failed to toggle like:', error);
      // Revert the optimistic update on error
      const revertedLikedUseCases = new Set(likedUseCases);
      if (likedUseCases.has(useCaseId)) {
        revertedLikedUseCases.delete(useCaseId);
      } else {
        revertedLikedUseCases.add(useCaseId);
      }
      setLikedUseCases(revertedLikedUseCases);
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const element = e.currentTarget;
    if (element.scrollTop > 50) {
      setHasScrolled(true);
    }
  };

  return (
    <div className="dashboard">
      <div className="dashboard-content">
        <div className="dashboard-sidebar">
          <div className="sidebar-count">
            <div style={{
              fontSize: '16px',
              fontWeight: '500',
              color: '#9CA3AF'
            }}>
              {sortedUseCases.length} initiative{sortedUseCases.length !== 1 ? 's' : ''} found
            </div>
          </div>
          <FilterPanel
            categories={categories}
            filters={filters}
            onFiltersChange={handleFiltersChange}
            onClearFilters={handleClearFilters}
            hideKanbanStatus={true}
            hideDeliveryDateFilters={true}
            sortBy={sortBy}
            onSortChange={setSortBy}
          />
        </div>

        <div className="dashboard-main">
          <div className="dashboard-header">
            <div className="status-breakdown">
              <InitiativesCountBar useCases={sortedUseCases} />
            </div>
            <div className="dashboard-controls">
              <div className="view-controls">
                {!isMobile && (
                  <div className="view-toggle">
                    <button
                      className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
                      onClick={() => setViewMode('grid')}
                      title="Grid view"
                    >
                      <FaThLarge />
                    </button>
                    <button
                      className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                      onClick={() => setViewMode('list')}
                      title="List view"
                    >
                      <FaList />
                    </button>
                    <button
                      className={`view-toggle-btn ${viewMode === 'matrix' ? 'active' : ''}`}
                      onClick={() => setViewMode('matrix')}
                      title="Matrix view"
                    >
                      <FaChartLine />
                    </button>
                  </div>
                )}
                
                <div className="sort-controls">
                  <FaSortAmountDown />
                  <select 
                    value={sortBy} 
                    onChange={(e) => setSortBy(e.target.value as 'created' | 'updated')}
                    className="sort-dropdown"
                  >
                    <option value="updated">Date Modified</option>
                    <option value="created">Date Added</option>
                  </select>
                </div>
              </div>
              
              <div className="dashboard-actions">
                {user?.role === 'admin' && (
                  <button className="create-button" onClick={onCreateClick}>
                    <FaPlus />
                    Add Initiative
                  </button>
                )}
              </div>
            </div>
          </div>

          {isLoading && useCases.length === 0 ? (
            <LoadingAnimation type={viewMode === 'list' ? 'list' : 'cards'} message="Loading Initiatives..." />
          ) : useCases.length === 0 ? (
            <EmptyState
              title={emptyStateMessages.useCases.title}
              message={emptyStateMessages.useCases.message}
              actionText={user?.role === 'admin' ? emptyStateMessages.useCases.actionText : undefined}
              onAction={user?.role === 'admin' ? onCreateClick : undefined}
              icon="add"
            />
          ) : sortedUseCases.length === 0 ? (
            <EmptyState
              title={emptyStateMessages.filteredUseCases.title}
              message={emptyStateMessages.filteredUseCases.message}
              actionText={emptyStateMessages.filteredUseCases.actionText}
              onAction={handleClearFilters}
              icon="search"
            />
          ) : viewMode === 'matrix' ? (
            <div className="matrix-container-wrapper">
              <PrioritizationMatrix
                useCases={sortedUseCases}
                onUseCaseClick={handleUseCaseClick}
              />
            </div>
          ) : viewMode === 'list' ? (
            <div className="table-view-wrapper">
              {/* Table Header */}
              <div className="table-header">
                <div className="table-header-cell title-col">Initiative</div>
                <div className="table-header-cell desc-col">What is it?</div>
                <div className="table-header-cell dept-col"></div>
                <div className="table-header-cell cat-col"></div>
                <div className="table-header-cell impact-col"></div>
                <div className="table-header-cell status-col"></div>
              </div>

              {/* Table Body */}
              {shouldUseVirtualScrolling ? (
                <div className="virtual-scroll-container">
                  <List
                    ref={virtualListRef}
                    height={window.innerHeight - 250}
                    width="100%"
                    itemCount={sortedUseCases.length}
                    itemSize={70}
                    onScroll={(props) => {
                      if (props.scrollDirection === 'forward') {
                        setHasScrolled(true);
                      }
                    }}
                    className="table-body"
                  >
                    {({ index, style }) => (
                      <div style={style}>
                        <InitiativeCard
                          key={sortedUseCases[index].id}
                          useCase={sortedUseCases[index]}
                          onClick={handleUseCaseClick}
                          viewMode="list"
                        />
                      </div>
                    )}
                  </List>
                </div>
              ) : (
                <div
                  ref={containerRef}
                  className="table-body"
                  onScroll={handleScroll}
                >
                  {sortedUseCases.map((useCase: UseCase) => (
                    <InitiativeCard
                      key={useCase.id}
                      useCase={useCase}
                      onClick={handleUseCaseClick}
                      viewMode="list"
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="use-cases-scroll-wrapper">
              {/* Regular scrolling for grid view */}
              <div
                ref={containerRef}
                className="use-cases-container grid-view"
                onScroll={handleScroll}
              >
                {sortedUseCases.map((useCase: UseCase) => (
                  <InitiativeCard
                    key={useCase.id}
                    useCase={useCase}
                    onClick={handleUseCaseClick}
                    viewMode="grid"
                    onLike={handleLike}
                    isLiked={likedUseCases.has(useCase.id)}
                  />
                ))}
              </div>
              {sortedUseCases.length > 6 && !hasScrolled && (
                <div className="scroll-hint">
                  <span>Scroll for more</span>
                  <div className="scroll-arrow">↓</div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* AI Chat Interface */}
      <ChatAssistant
        useCases={sortedUseCases}
        isOpen={showAIChat || false}
        onClose={onCloseChatClick || (() => {})}
      />
    </div>
  );
};

export default InitiativesList; 