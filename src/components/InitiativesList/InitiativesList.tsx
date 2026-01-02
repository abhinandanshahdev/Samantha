import React, { useState, useMemo, useEffect, useRef } from 'react';
import { FixedSizeList as List } from 'react-window';
import { UseCase, SearchFilters, Category } from '../../types';
import { categoryAPI, useCaseAPI } from '../../services/apiService';
import { useActiveDomainId } from '../../context/DomainContext';
import FilterPanel from '../FilterPanel/FilterPanel';
import InitiativeCard from '../InitiativeCard/InitiativeCard';
import ChatAssistant from '../ChatAssistant/ChatAssistant';
import EmptyState from '../EmptyState/EmptyState';
import LoadingAnimation from '../LoadingAnimation/LoadingAnimation';
import { emptyStateMessages } from '../../data/emptyStates';
import { FaSortAmountDown, FaPlus, FaSort, FaSortUp, FaSortDown } from 'react-icons/fa';
import './InitiativesList.css';

// Status colors - cohesive modern palette
const STATUS_COLORS = {
  intention: '#94A3B8', // Slate grey
  experimentation: '#A78BFA', // Violet
  commitment: '#FB923C', // Orange
  implementation: '#60A5FA', // Blue
  integration: '#34D399', // Emerald
  blocked: '#F87171', // Red
  slow_burner: '#FBBF24', // Amber
  de_prioritised: '#9CA3AF', // Grey
  on_hold: '#6B7280' // Dark grey
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

// Short labels for bar chart legend
const LEGEND_LABELS = {
  intention: 'Intent',
  experimentation: 'Experiment',
  commitment: 'Commit',
  implementation: 'Implement',
  integration: 'Integrate',
  blocked: 'Blocked',
  slow_burner: 'Slow',
  de_prioritised: 'De-pri',
  on_hold: 'Hold'
};

interface StatusCount {
  status: string;
  count: number;
  color: string;
  label: string;
  legendLabel: string;
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
      label: STATUS_LABELS[status as keyof typeof STATUS_LABELS] || status,
      legendLabel: LEGEND_LABELS[status as keyof typeof LEGEND_LABELS] || status
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
          <div key={item.status} className="status-legend-item" title={item.label}>
            <span className="status-legend-dot" style={{ backgroundColor: item.color }} />
            <span className="status-legend-text">{item.legendLabel}</span>
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
  const [sortBy, setSortBy] = useState<'created' | 'updated'>(() => {
    // Load saved sort preference from localStorage
    const savedSortBy = localStorage.getItem('ai_initiatives_sort_by');
    return (savedSortBy as 'created' | 'updated') || 'updated';
  });
  const [sortField, setSortField] = useState<'title' | 'status' | 'date'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [hasScrolled, setHasScrolled] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const virtualListRef = useRef<any>(null);

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

  // Reset scroll indicator when filters change
  useEffect(() => {
    setHasScrolled(false);
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [filters, searchQuery]);

  // Status order for sorting (Intention → Integration)
  const STATUS_SORT_ORDER: Record<string, number> = {
    'intention': 1,
    'experimentation': 2,
    'commitment': 3,
    'implementation': 4,
    'integration': 5,
    'blocked': 6,
    'slow_burner': 7,
    'de_prioritised': 8,
    'on_hold': 9
  };

  // Sort use cases (filtering is now done server-side)
  const sortedUseCases = useMemo(() => {
    const sorted = [...useCases];
    sorted.sort((a, b) => {
      let comparison = 0;

      if (sortField === 'title') {
        comparison = a.title.localeCompare(b.title);
      } else if (sortField === 'status') {
        const orderA = STATUS_SORT_ORDER[a.status] || 99;
        const orderB = STATUS_SORT_ORDER[b.status] || 99;
        comparison = orderA - orderB;
      } else {
        // Default to date sorting
        const dateA = new Date(sortBy === 'created' ? a.created_date : a.updated_date);
        const dateB = new Date(sortBy === 'created' ? b.created_date : b.updated_date);
        comparison = dateA.getTime() - dateB.getTime();
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
    return sorted;
  }, [useCases, sortBy, sortField, sortDirection]);

  const handleSort = (field: 'title' | 'status' | 'date') => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'title' ? 'asc' : 'desc');
    }
  };

  const getSortIcon = (field: 'title' | 'status' | 'date') => {
    if (sortField !== field) return <FaSort className="sort-icon inactive" />;
    return sortDirection === 'asc'
      ? <FaSortUp className="sort-icon active" />
      : <FaSortDown className="sort-icon active" />;
  };

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
            <LoadingAnimation type="list" message="Loading Initiatives..." />
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
          ) : (
            <div className="table-view-wrapper">
              {/* Table Header */}
              <div className="table-header">
                <div
                  className={`table-header-cell title-col sortable ${sortField === 'title' ? 'active' : ''}`}
                  onClick={() => handleSort('title')}
                >
                  Initiative {getSortIcon('title')}
                </div>
                <div
                  className={`table-header-cell status-col sortable ${sortField === 'status' ? 'active' : ''}`}
                  onClick={() => handleSort('status')}
                >
                  Status {getSortIcon('status')}
                </div>
                <div className="table-header-cell desc-col">Description</div>
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