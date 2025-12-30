import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { FixedSizeList as List } from 'react-window';
import InfiniteLoader from 'react-window-infinite-loader';
import { Agent, AgentFilters, AgentType, UseCase, InitiativeAgentAssociation } from '../../types';
import { agentAPI, agentTypeAPI, agentLikesAPI, useCaseAPI, agentAssociationsAPI } from '../../services/apiService';
import { useActiveDomainId } from '../../context/DomainContext';
import FilterPanel from '../FilterPanel/FilterPanel';
import AgentCard from '../AgentCard/AgentCard';
import InitiativeCard from '../InitiativeCard/InitiativeCard';
import ChatAssistant from '../ChatAssistant/ChatAssistant';
import EmptyState from '../EmptyState/EmptyState';
import LoadingAnimation from '../LoadingAnimation/LoadingAnimation';
import { emptyStateMessages } from '../../data/emptyStates';
import { FaThLarge, FaList, FaSortAmountDown, FaPlus, FaProjectDiagram, FaChevronDown, FaChevronUp, FaHeart, FaComment } from 'react-icons/fa';
import './AgentsList.css';

const BUFFER_SIZE = 50; // Number of items to load per batch
const ITEM_HEIGHT_LIST = 70; // Height of list row

const STATUS_COLORS = {
  concept: '#77787B',
  proof_of_concept: '#C68D6D',
  validation: '#F6BD60',
  pilot: '#00A79D',
  production: '#B79546'
};

const STATUS_LABELS = {
  concept: 'Concept',
  proof_of_concept: 'PoC',
  validation: 'Validation',
  pilot: 'Pilot',
  production: 'Production'
};

const STATUS_ORDER = ['concept', 'proof_of_concept', 'validation', 'pilot', 'production'];

interface AgentsCountBarProps {
  statusBreakdown: Record<string, number>;
  totalCount: number;
}

const AgentsCountBar: React.FC<AgentsCountBarProps> = ({ statusBreakdown, totalCount }) => {
  const statusCounts = useMemo(() => {
    // Always return all statuses in fixed order
    return STATUS_ORDER.map(status => ({
      status,
      count: statusBreakdown[status] || 0,
      color: STATUS_COLORS[status as keyof typeof STATUS_COLORS] || STATUS_COLORS.concept,
      label: STATUS_LABELS[status as keyof typeof STATUS_LABELS] || status
    }));
  }, [statusBreakdown]);

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

interface AgentsListProps {
  onAgentClick: (agent: Agent) => void;
  onUseCaseClick?: (useCase: UseCase) => void;
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
  initialFilters?: AgentFilters;
  onFiltersChange?: (filters: AgentFilters) => void;
}

const AgentsList: React.FC<AgentsListProps> = ({
  onAgentClick,
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
  const [agents, setAgents] = useState<Agent[]>([]);
  const [filters, setFilters] = useState<AgentFilters>(initialFilters || {});
  const [agentTypes, setAgentTypes] = useState<AgentType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'usecase'>(() => {
    const savedViewMode = localStorage.getItem('ai_agents_view_mode');
    return (savedViewMode as 'grid' | 'list' | 'usecase') || 'grid';
  });
  const [sortBy, setSortBy] = useState<'created' | 'updated'>(() => {
    const savedSortBy = localStorage.getItem('ai_agents_sort_by');
    return (savedSortBy as 'created' | 'updated') || 'updated';
  });
  const [hasScrolled, setHasScrolled] = useState(false);
  const [likedAgents, setLikedAgents] = useState<Set<string>>(new Set());
  const [useCases, setUseCases] = useState<UseCase[]>([]);
  const [useCaseAgents, setUseCaseAgents] = useState<Record<string, InitiativeAgentAssociation[]>>({});
  const [expandedUseCases, setExpandedUseCases] = useState<Set<string>>(new Set());
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const containerRef = useRef<HTMLDivElement>(null);
  const virtualListRef = useRef<any>(null);

  // Infinite scroll state
  const [totalCount, setTotalCount] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [statusBreakdown, setStatusBreakdown] = useState<Record<string, number>>({});
  const loadedRanges = useRef<Set<string>>(new Set());
  const infiniteLoaderRef = useRef<InfiniteLoader | null>(null);

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
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem('ai_agents_view_mode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem('ai_agents_sort_by', sortBy);
  }, [sortBy]);

  // Update filters when initialFilters prop changes
  useEffect(() => {
    if (initialFilters) {
      const timer = setTimeout(() => {
        setFilters(prev => ({ ...prev, ...initialFilters }));
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [initialFilters]);

  useEffect(() => {
    const loadAgentTypes = async () => {
      try {
        const types = await agentTypeAPI.getAll(activeDomainId || undefined);
        setAgentTypes(types);
      } catch (error) {
        console.error('Error loading agent types:', error);
      }
    };

    if (activeDomainId) {
      loadAgentTypes();
    }
  }, [activeDomainId]);

  // Combine filters with active domain for API calls
  const filtersWithDomain = useMemo(() => {
    const combined = { ...filters, search: searchQuery };
    if (activeDomainId) {
      combined.domain_id = activeDomainId;
    }
    return combined;
  }, [filters, activeDomainId, searchQuery]);

  // Load stats on filter change (for infinite scroll)
  useEffect(() => {
    const loadStats = async () => {
      if (!activeDomainId) return;

      try {
        const stats = await agentAPI.getStatsWithFilters(filtersWithDomain);
        setTotalCount(stats.total_count);
        setStatusBreakdown(stats.status_breakdown);
        setHasNextPage(stats.total_count > 0);
      } catch (error) {
        console.error('Error loading agent statistics:', error);
        setTotalCount(0);
        setStatusBreakdown({});
      }
    };

    loadStats();
  }, [filtersWithDomain, activeDomainId]);

  // Clear data when filters or domain change
  useEffect(() => {
    setAgents([]);
    setHasNextPage(true);
    loadedRanges.current.clear();

    // Reset the list scroll position
    if (virtualListRef.current) {
      virtualListRef.current.scrollToItem(0);
    }

    // Clear cached items in infinite loader
    if (infiniteLoaderRef.current) {
      infiniteLoaderRef.current.resetloadMoreItemsCache();
    }
  }, [filtersWithDomain]);

  // Load more items function for infinite scroll
  const loadMoreItems = useCallback(async (startIndex: number, stopIndex: number) => {
    if (!activeDomainId) return;

    const rangeKey = `${startIndex}-${stopIndex}`;

    // Prevent duplicate loads
    if (loadedRanges.current.has(rangeKey) || isLoadingMore) {
      return;
    }

    setIsLoadingMore(true);
    loadedRanges.current.add(rangeKey);

    try {
      const newAgents = await agentAPI.getAll({
        ...filtersWithDomain,
        limit: stopIndex - startIndex + 1,
        offset: startIndex
      });

      setAgents(prevAgents => {
        const updatedAgents = [...prevAgents];

        // Insert new items at correct positions
        newAgents.forEach((agent, index) => {
          updatedAgents[startIndex + index] = agent;
        });

        return updatedAgents;
      });

      // Batch load like status for newly loaded agents
      if (newAgents.length > 0) {
        try {
          const agentIds = newAgents.map(a => a.id);
          const { liked_ids } = await agentLikesAPI.batchCheckLiked(agentIds);
          setLikedAgents(prev => {
            const newSet = new Set(prev);
            liked_ids.forEach(id => newSet.add(id));
            return newSet;
          });
        } catch (error) {
          console.error('Error batch loading liked agents:', error);
        }
      }

      // Update hasNextPage based on whether we got fewer items than expected
      if (newAgents.length < (stopIndex - startIndex + 1)) {
        setHasNextPage(false);
      }

    } catch (error) {
      console.error('Error loading agents:', error);
      // Remove the range from loaded ranges so we can retry
      loadedRanges.current.delete(rangeKey);
    } finally {
      setIsLoadingMore(false);
    }
  }, [filtersWithDomain, activeDomainId, isLoadingMore]);

  // Check if item is loaded
  const isItemLoaded = useCallback((index: number) => {
    return !!agents[index];
  }, [agents]);

  // Note: Like status is now loaded in batches via loadMoreItems using batchCheckLiked

  // Load initial batch of agents when stats load or view is not usecase
  useEffect(() => {
    if (viewMode !== 'usecase' && totalCount > 0 && agents.length === 0 && !isLoadingMore) {
      loadMoreItems(0, BUFFER_SIZE - 1);
    }
  }, [totalCount, viewMode, agents.length, isLoadingMore, loadMoreItems]);

  // Reset scroll indicator when view changes
  useEffect(() => {
    setHasScrolled(false);
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [viewMode, filters, searchQuery]);

  // Load use cases when in usecase view mode
  useEffect(() => {
    const loadUseCases = async () => {
      if (viewMode !== 'usecase' || !activeDomainId) return;

      try {
        setIsLoading(true);
        // Apply agent filters to fetch only relevant use cases
        // Pass all filters that are applicable to use cases
        const fetchedUseCases = await useCaseAPI.getAll({
          domain_id: activeDomainId,
          limit: 400,
          tags: filters.tags,
          data_sensitivity: filters.data_sensitivity,
          departments: filters.departments,
          statuses: filters.statuses,
          strategic_impact: filters.strategic_impact,
          kanban_pillar: filters.kanban_pillar,
          expected_delivery_year: filters.expected_delivery_year,
          expected_delivery_month: filters.expected_delivery_month,
          agent_types: filters.agent_types, // Filter by agents' types
          search: searchQuery
        });
        setUseCases(fetchedUseCases);

        // Load agent associations for each use case
        const agentsMap: Record<string, InitiativeAgentAssociation[]> = {};
        await Promise.all(
          fetchedUseCases.map(async (useCase) => {
            try {
              const associations = await agentAssociationsAPI.getAgentsForInitiative(useCase.id);
              agentsMap[useCase.id] = associations;
            } catch (error) {
              console.error(`Failed to load agents for use case ${useCase.id}:`, error);
              agentsMap[useCase.id] = [];
            }
          })
        );
        setUseCaseAgents(agentsMap);
      } catch (error) {
        console.error('Failed to load use cases:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadUseCases();
  }, [
    viewMode,
    activeDomainId,
    searchQuery,
    filters.tags,
    filters.data_sensitivity,
    filters.departments,
    filters.statuses,
    filters.strategic_impact,
    filters.kanban_pillar,
    filters.expected_delivery_year,
    filters.expected_delivery_month,
    filters.agent_types
  ]);

  const handleFilterChange = (newFilters: AgentFilters) => {
    setFilters(newFilters);
    onFiltersChange?.(newFilters);
  };

  const toggleUseCaseExpansion = (useCaseId: string) => {
    setExpandedUseCases(prev => {
      const newSet = new Set(prev);
      if (newSet.has(useCaseId)) {
        newSet.delete(useCaseId);
      } else {
        newSet.add(useCaseId);
      }
      return newSet;
    });
  };

  const handleClearFilters = () => {
    setFilters({});
    onFiltersChange?.({});
  };

  const handleLikeToggle = async (agentId: string) => {
    try {
      const result = await agentLikesAPI.toggle(agentId);

      if (result.liked) {
        setLikedAgents(prev => new Set(prev).add(agentId));
      } else {
        setLikedAgents(prev => {
          const newSet = new Set(prev);
          newSet.delete(agentId);
          return newSet;
        });
      }

      setAgents(prevAgents =>
        prevAgents.map(agent =>
          agent.id === agentId
            ? { ...agent, likes_count: result.count }
            : agent
        )
      );
    } catch (error) {
      console.error('Error toggling like:', error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await agentAPI.delete(id);
      setAgents(prevAgents => prevAgents.filter(agent => agent.id !== id));
    } catch (error) {
      console.error('Error deleting agent:', error);
      alert('Failed to delete agent');
    }
  };

  // Note: Sorting by created/updated date should be done server-side.
  // For now, agents are returned in default server order (created_date DESC).
  // TODO: Add sort_by query parameter to backend /agents endpoint if client-side sorting is needed.

  const isAdmin = user?.role === 'admin';

  if (!isLoading && totalCount === 0) {
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
                0 agents found
              </div>
            </div>
            <FilterPanel
              filters={filters}
              onFiltersChange={handleFilterChange}
              onClearFilters={handleClearFilters}
              showAgentTypeFilter={true}
              agentTypes={agentTypes}
              hideKanbanStatus={true}
              hideDeliveryDateFilters={true}
              sortBy={sortBy}
              onSortChange={setSortBy}
            />
          </div>

          <div className="dashboard-main">
            <div className="dashboard-header">
              <div className="status-breakdown"></div>
              <div className="dashboard-controls">
                <div className="dashboard-actions">
                  {isAdmin && (
                    <button className="create-button" onClick={onCreateClick}>
                      <FaPlus />
                      Add Agent
                    </button>
                  )}
                </div>
              </div>
            </div>

            <EmptyState
              title={emptyStateMessages.noAgents.title}
              message={emptyStateMessages.noAgents.message}
              actionText={isAdmin ? "Create Your First Agent" : undefined}
              onAction={isAdmin ? onCreateClick : undefined}
            />
          </div>
        </div>
      </div>
    );
  }

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
              {totalCount} agent{totalCount !== 1 ? 's' : ''} found
            </div>
          </div>
          <FilterPanel
            filters={filters}
            onFiltersChange={handleFilterChange}
            onClearFilters={handleClearFilters}
            showAgentTypeFilter={true}
            agentTypes={agentTypes}
            hideKanbanStatus={true}
            hideDeliveryDateFilters={true}
            sortBy={sortBy}
            onSortChange={setSortBy}
          />
        </div>

        <div className="dashboard-main">
          <div className="dashboard-header">
            <div className="status-breakdown">
              <AgentsCountBar statusBreakdown={statusBreakdown} totalCount={totalCount} />
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
                      className={`view-toggle-btn ${viewMode === 'usecase' ? 'active' : ''}`}
                      onClick={() => setViewMode('usecase')}
                      title="Use Case view"
                    >
                      <FaProjectDiagram />
                    </button>
                    <div className="disclaimer-icon-container">
                      <span className="disclaimer-icon">i</span>
                      <div className="disclaimer-tooltip">
                        {viewMode === 'usecase'
                          ? 'Agents grouped by initiative. Tap to expand, click for details. Count not additive - agents may support multiple initiatives.'
                          : viewMode === 'grid'
                          ? 'Cards view with key information. Click any agent for full details.'
                          : 'Compact table format for quick comparison.'}
                      </div>
                    </div>
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
                {isAdmin && (
                  <button className="create-button" onClick={onCreateClick}>
                    <FaPlus />
                    Add Agent
                  </button>
                )}
              </div>
            </div>
          </div>

          {isLoading && agents.length === 0 ? (
            <LoadingAnimation type={viewMode === 'list' ? 'list' : 'cards'} message={viewMode === 'usecase' ? "Loading Initiatives..." : "Loading Agents..."} />
          ) : viewMode === 'usecase' ? (
            <div className="use-cases-scroll-wrapper">
              <div
                ref={containerRef}
                className="use-cases-container grid-view"
                onScroll={handleScroll}
              >
                {useCases
                  .filter((useCase: UseCase) => {
                    const agentsForThisUseCase = useCaseAgents[useCase.id] || [];
                    return agentsForThisUseCase.length > 0;
                  })
                  .map((useCase: UseCase) => {
                  const agentsForThisUseCase = useCaseAgents[useCase.id] || [];
                  const isExpanded = expandedUseCases.has(useCase.id);
                  const hasAgents = agentsForThisUseCase.length > 0;

                  return (
                    <div key={useCase.id} className="usecase-with-agents">
                      <InitiativeCard
                        useCase={useCase}
                        onClick={onUseCaseClick ? () => onUseCaseClick(useCase) : () => {}}
                        viewMode="grid"
                      />
                      <div
                        className={`agents-footer ${!hasAgents ? 'no-agents' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (hasAgents) {
                            toggleUseCaseExpansion(useCase.id);
                          }
                        }}
                        style={{ cursor: hasAgents ? 'pointer' : 'default' }}
                      >
                        <span className="agents-count">
                          {agentsForThisUseCase.length} Agent{agentsForThisUseCase.length !== 1 ? 's' : ''}
                        </span>
                        {hasAgents && (isExpanded ? <FaChevronUp /> : <FaChevronDown />)}
                      </div>
                      {isExpanded && hasAgents && (
                        <div className="expanded-agents">
                          {agentsForThisUseCase.map((association: InitiativeAgentAssociation) => {
                            const agent = agents.find(a => a.id === association.agent_id);
                            const likesCount = agent?.likes_count || 0;
                            const commentsCount = agent?.comments_count || 0;

                            return (
                              <div
                                key={association.agent_id}
                                className="mini-agent-card"
                                onClick={async () => {
                                  try {
                                    const fullAgent = await agentAPI.getById(association.agent_id);
                                    onAgentClick(fullAgent);
                                  } catch (error) {
                                    console.error('Failed to load agent:', error);
                                  }
                                }}
                              >
                                <div className="mini-agent-title">{association.title}</div>
                                <div className="mini-agent-stats">
                                  <span>
                                    <FaHeart style={{ color: likedAgents.has(association.agent_id) ? '#e74c3c' : '#9ca3af' }} />
                                    {likesCount}
                                  </span>
                                  <span>
                                    <FaComment />
                                    {commentsCount}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {useCases.length > 6 && !hasScrolled && (
                <div className="scroll-hint">
                  <span>Scroll for more</span>
                  <div className="scroll-arrow">↓</div>
                </div>
              )}
            </div>
          ) : viewMode === 'list' ? (
            <div className="table-view-wrapper">
              <div className="table-header">
                <div className="table-header-cell title-col">Agent</div>
                <div className="table-header-cell desc-col">What is it?</div>
                <div className="table-header-cell dept-col"></div>
                <div className="table-header-cell cat-col"></div>
                <div className="table-header-cell impact-col"></div>
                <div className="table-header-cell status-col"></div>
              </div>

              <div className="virtual-scroll-container">
                <InfiniteLoader
                  ref={infiniteLoaderRef}
                  isItemLoaded={isItemLoaded}
                  itemCount={hasNextPage ? totalCount + 1 : totalCount}
                  loadMoreItems={loadMoreItems}
                  threshold={5}
                >
                  {({ onItemsRendered, ref }) => (
                    <List
                      ref={(el) => {
                        virtualListRef.current = el;
                        ref(el);
                      }}
                      height={window.innerHeight - 250}
                      width="100%"
                      itemCount={hasNextPage ? totalCount + 1 : totalCount}
                      itemSize={ITEM_HEIGHT_LIST}
                      onItemsRendered={onItemsRendered}
                      overscanCount={2}
                      onScroll={(props) => {
                        if (props.scrollDirection === 'forward') {
                          setHasScrolled(true);
                        }
                      }}
                      className="table-body"
                    >
                      {({ index, style }) => {
                        const agent = agents[index];
                        return (
                          <div style={style}>
                            {agent ? (
                              <AgentCard
                                key={agent.id}
                                agent={agent}
                                onClick={onAgentClick}
                                onEdit={isAdmin ? (a) => onAgentClick(a) : undefined}
                                onDelete={isAdmin ? handleDelete : undefined}
                                showActions={isAdmin}
                                viewMode="list"
                                onLike={handleLikeToggle}
                                isLiked={likedAgents.has(agent.id)}
                              />
                            ) : (
                              <div className="agent-skeleton-row">
                                <div className="skeleton-cell title-col"></div>
                                <div className="skeleton-cell desc-col"></div>
                                <div className="skeleton-cell dept-col"></div>
                                <div className="skeleton-cell cat-col"></div>
                                <div className="skeleton-cell impact-col"></div>
                                <div className="skeleton-cell status-col"></div>
                              </div>
                            )}
                          </div>
                        );
                      }}
                    </List>
                  )}
                </InfiniteLoader>
              </div>
            </div>
          ) : (
            <div className="use-cases-scroll-wrapper">
              <div
                ref={containerRef}
                className="use-cases-container grid-view"
                onScroll={(e) => {
                  handleScroll(e);
                  // Load more when near bottom
                  const element = e.currentTarget;
                  const scrollBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
                  if (scrollBottom < 200 && hasNextPage && !isLoadingMore) {
                    const loadedCount = agents.filter(a => a).length;
                    if (loadedCount < totalCount) {
                      loadMoreItems(loadedCount, loadedCount + BUFFER_SIZE - 1);
                    }
                  }
                }}
              >
                {agents.filter(a => a).map((agent: Agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    onClick={onAgentClick}
                    onEdit={isAdmin ? (a) => onAgentClick(a) : undefined}
                    onDelete={isAdmin ? handleDelete : undefined}
                    showActions={isAdmin}
                    viewMode="grid"
                    onLike={handleLikeToggle}
                    isLiked={likedAgents.has(agent.id)}
                  />
                ))}
                {isLoadingMore && (
                  <div className="loading-more">
                    <div className="loading-spinner"></div>
                    <span>Loading more agents...</span>
                  </div>
                )}
              </div>
              {totalCount > 6 && !hasScrolled && (
                <div className="scroll-hint">
                  <span>Scroll for more</span>
                  <div className="scroll-arrow">↓</div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {showAIChat && onCloseChatClick && (
        <ChatAssistant
          useCases={[]}
          isOpen={showAIChat}
          onClose={onCloseChatClick}
        />
      )}
    </div>
  );
};

export default AgentsList;
