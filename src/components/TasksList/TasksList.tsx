import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { FixedSizeList as List } from 'react-window';
import InfiniteLoader from 'react-window-infinite-loader';
import { Task, TaskFilters, UseCase, InitiativeTaskAssociation, KanbanStatus } from '../../types';
import { taskAPI, taskLikesAPI, useCaseAPI, taskAssociationsAPI } from '../../services/apiService';
import { useActiveDomainId } from '../../context/DomainContext';
import FilterPanel from '../FilterPanel/FilterPanel';
import TaskCard from '../TaskCard/TaskCard';
import InitiativeCard from '../InitiativeCard/InitiativeCard';
import ChatAssistant from '../ChatAssistant/ChatAssistant';
import EmptyState from '../EmptyState/EmptyState';
import LoadingAnimation from '../LoadingAnimation/LoadingAnimation';
import { emptyStateMessages } from '../../data/emptyStates';
import { FaThLarge, FaList, FaSortAmountDown, FaPlus, FaProjectDiagram, FaChevronDown, FaChevronUp, FaHeart, FaComment } from 'react-icons/fa';
import './TasksList.css';

const BUFFER_SIZE = 50; // Number of items to load per batch
const ITEM_HEIGHT_LIST = 70; // Height of list row

const STATUS_COLORS: Record<KanbanStatus, string> = {
  intention: '#77787B',
  experimentation: '#9B59B6',
  commitment: '#C68D6D',
  implementation: '#4A90E2',
  integration: '#00A79D',
  blocked: '#E74C3C',
  slow_burner: '#F6BD60',
  de_prioritised: '#9e9e9e',
  on_hold: '#B79546'
};

const STATUS_LABELS: Record<KanbanStatus, string> = {
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

const STATUS_ORDER: KanbanStatus[] = ['intention', 'experimentation', 'commitment', 'implementation', 'integration'];

interface TasksCountBarProps {
  statusBreakdown: Record<string, number>;
  totalCount: number;
}

const TasksCountBar: React.FC<TasksCountBarProps> = ({ statusBreakdown, totalCount }) => {
  const statusCounts = useMemo(() => {
    // Always return all statuses in fixed order
    return STATUS_ORDER.map(status => ({
      status,
      count: statusBreakdown[status] || 0,
      color: STATUS_COLORS[status] || STATUS_COLORS.intention,
      label: STATUS_LABELS[status] || status
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

interface TasksListProps {
  onTaskClick: (task: Task) => void;
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
  initialFilters?: TaskFilters;
  onFiltersChange?: (filters: TaskFilters) => void;
}

const TasksList: React.FC<TasksListProps> = ({
  onTaskClick,
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
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filters, setFilters] = useState<TaskFilters>(initialFilters || {});
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'initiative'>(() => {
    const savedViewMode = localStorage.getItem('tasks_view_mode');
    return (savedViewMode as 'grid' | 'list' | 'initiative') || 'grid';
  });
  const [sortBy, setSortBy] = useState<'created' | 'updated'>(() => {
    const savedSortBy = localStorage.getItem('tasks_sort_by');
    return (savedSortBy as 'created' | 'updated') || 'updated';
  });
  const [hasScrolled, setHasScrolled] = useState(false);
  const [likedTasks, setLikedTasks] = useState<Set<string>>(new Set());
  const [useCases, setUseCases] = useState<UseCase[]>([]);
  const [useCaseTasks, setUseCaseTasks] = useState<Record<string, InitiativeTaskAssociation[]>>({});
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
    localStorage.setItem('tasks_view_mode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem('tasks_sort_by', sortBy);
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
        const stats = await taskAPI.getStatsWithFilters(filtersWithDomain);
        setTotalCount(stats.total_count);
        setStatusBreakdown(stats.status_breakdown);
        setHasNextPage(stats.total_count > 0);
      } catch (error) {
        console.error('Error loading task statistics:', error);
        setTotalCount(0);
        setStatusBreakdown({});
      }
    };

    loadStats();
  }, [filtersWithDomain, activeDomainId]);

  // Clear data when filters or domain change
  useEffect(() => {
    setTasks([]);
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
      const newTasks = await taskAPI.getAll({
        ...filtersWithDomain,
        limit: stopIndex - startIndex + 1,
        offset: startIndex
      });

      setTasks(prevTasks => {
        const updatedTasks = [...prevTasks];

        // Insert new items at correct positions
        newTasks.forEach((task, index) => {
          updatedTasks[startIndex + index] = task;
        });

        return updatedTasks;
      });

      // Batch load like status for newly loaded tasks
      if (newTasks.length > 0) {
        try {
          const taskIds = newTasks.map(t => t.id);
          const { liked_ids } = await taskLikesAPI.batchCheckLiked(taskIds);
          setLikedTasks(prev => {
            const newSet = new Set(prev);
            liked_ids.forEach(id => newSet.add(id));
            return newSet;
          });
        } catch (error) {
          console.error('Error batch loading liked tasks:', error);
        }
      }

      // Update hasNextPage based on whether we got fewer items than expected
      if (newTasks.length < (stopIndex - startIndex + 1)) {
        setHasNextPage(false);
      }

    } catch (error) {
      console.error('Error loading tasks:', error);
      // Remove the range from loaded ranges so we can retry
      loadedRanges.current.delete(rangeKey);
    } finally {
      setIsLoadingMore(false);
    }
  }, [filtersWithDomain, activeDomainId, isLoadingMore]);

  // Check if item is loaded
  const isItemLoaded = useCallback((index: number) => {
    return !!tasks[index];
  }, [tasks]);

  // Load initial batch of tasks when stats load or view is not initiative
  useEffect(() => {
    if (viewMode !== 'initiative' && totalCount > 0 && tasks.length === 0 && !isLoadingMore) {
      loadMoreItems(0, BUFFER_SIZE - 1);
    }
  }, [totalCount, viewMode, tasks.length, isLoadingMore, loadMoreItems]);

  // Reset scroll indicator when view changes
  useEffect(() => {
    setHasScrolled(false);
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [viewMode, filters, searchQuery]);

  // Load use cases when in initiative view mode
  useEffect(() => {
    const loadUseCases = async () => {
      if (viewMode !== 'initiative' || !activeDomainId) return;

      try {
        setIsLoading(true);
        // Apply task filters to fetch only relevant use cases
        const fetchedUseCases = await useCaseAPI.getAll({
          domain_id: activeDomainId,
          limit: 400,
          tags: filters.tags,
          statuses: filters.statuses,
          strategic_impact: filters.strategic_impact,
          expected_delivery_year: filters.expected_delivery_year,
          expected_delivery_month: filters.expected_delivery_month,
          search: searchQuery
        });
        setUseCases(fetchedUseCases);

        // Load task associations for each use case
        const tasksMap: Record<string, InitiativeTaskAssociation[]> = {};
        await Promise.all(
          fetchedUseCases.map(async (useCase) => {
            try {
              const associations = await taskAssociationsAPI.getTasksForInitiative(useCase.id);
              tasksMap[useCase.id] = associations;
            } catch (error) {
              console.error(`Failed to load tasks for use case ${useCase.id}:`, error);
              tasksMap[useCase.id] = [];
            }
          })
        );
        setUseCaseTasks(tasksMap);
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
    filters.statuses,
    filters.strategic_impact,
    filters.expected_delivery_year,
    filters.expected_delivery_month
  ]);

  const handleFilterChange = (newFilters: TaskFilters) => {
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

  const handleLikeToggle = async (taskId: string) => {
    try {
      const result = await taskLikesAPI.toggle(taskId);

      if (result.liked) {
        setLikedTasks(prev => new Set(prev).add(taskId));
      } else {
        setLikedTasks(prev => {
          const newSet = new Set(prev);
          newSet.delete(taskId);
          return newSet;
        });
      }

      setTasks(prevTasks =>
        prevTasks.map(task =>
          task.id === taskId
            ? { ...task, likes_count: result.count }
            : task
        )
      );
    } catch (error) {
      console.error('Error toggling like:', error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await taskAPI.delete(id);
      setTasks(prevTasks => prevTasks.filter(task => task.id !== id));
    } catch (error) {
      console.error('Error deleting task:', error);
      alert('Failed to delete task');
    }
  };

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
                0 tasks found
              </div>
            </div>
            <FilterPanel
              filters={filters}
              onFiltersChange={handleFilterChange}
              onClearFilters={handleClearFilters}
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
                      Add Task
                    </button>
                  )}
                </div>
              </div>
            </div>

            <EmptyState
              title={emptyStateMessages.noTasks?.title || "No tasks found"}
              message={emptyStateMessages.noTasks?.message || "Create your first task to get started."}
              actionText={isAdmin ? "Create Your First Task" : undefined}
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
              {totalCount} task{totalCount !== 1 ? 's' : ''} found
            </div>
          </div>
          <FilterPanel
            filters={filters}
            onFiltersChange={handleFilterChange}
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
              <TasksCountBar statusBreakdown={statusBreakdown} totalCount={totalCount} />
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
                      className={`view-toggle-btn ${viewMode === 'initiative' ? 'active' : ''}`}
                      onClick={() => setViewMode('initiative')}
                      title="Initiative view"
                    >
                      <FaProjectDiagram />
                    </button>
                    <div className="disclaimer-icon-container">
                      <span className="disclaimer-icon">i</span>
                      <div className="disclaimer-tooltip">
                        {viewMode === 'initiative'
                          ? 'Tasks grouped by initiative. Tap to expand, click for details. Count not additive - tasks may support multiple initiatives.'
                          : viewMode === 'grid'
                          ? 'Cards view with key information. Click any task for full details.'
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
                    Add Task
                  </button>
                )}
              </div>
            </div>
          </div>

          {isLoading && tasks.length === 0 ? (
            <LoadingAnimation type={viewMode === 'list' ? 'list' : 'cards'} message={viewMode === 'initiative' ? "Loading Initiatives..." : "Loading Tasks..."} />
          ) : viewMode === 'initiative' ? (
            <div className="use-cases-scroll-wrapper">
              <div
                ref={containerRef}
                className="use-cases-container grid-view"
                onScroll={handleScroll}
              >
                {useCases
                  .filter((useCase: UseCase) => {
                    const tasksForThisUseCase = useCaseTasks[useCase.id] || [];
                    return tasksForThisUseCase.length > 0;
                  })
                  .map((useCase: UseCase) => {
                  const tasksForThisUseCase = useCaseTasks[useCase.id] || [];
                  const isExpanded = expandedUseCases.has(useCase.id);
                  const hasTasks = tasksForThisUseCase.length > 0;

                  return (
                    <div key={useCase.id} className="usecase-with-tasks">
                      <InitiativeCard
                        useCase={useCase}
                        onClick={onUseCaseClick ? () => onUseCaseClick(useCase) : () => {}}
                        viewMode="grid"
                      />
                      <div
                        className={`tasks-footer ${!hasTasks ? 'no-tasks' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (hasTasks) {
                            toggleUseCaseExpansion(useCase.id);
                          }
                        }}
                        style={{ cursor: hasTasks ? 'pointer' : 'default' }}
                      >
                        <span className="tasks-count">
                          {tasksForThisUseCase.length} Task{tasksForThisUseCase.length !== 1 ? 's' : ''}
                        </span>
                        {hasTasks && (isExpanded ? <FaChevronUp /> : <FaChevronDown />)}
                      </div>
                      {isExpanded && hasTasks && (
                        <div className="expanded-tasks">
                          {tasksForThisUseCase.map((association: InitiativeTaskAssociation) => {
                            const task = tasks.find(t => t.id === association.task_id);
                            const likesCount = task?.likes_count || 0;
                            const commentsCount = task?.comments_count || 0;

                            return (
                              <div
                                key={association.task_id}
                                className="mini-task-card"
                                onClick={async () => {
                                  try {
                                    const fullTask = await taskAPI.getById(association.task_id);
                                    onTaskClick(fullTask);
                                  } catch (error) {
                                    console.error('Failed to load task:', error);
                                  }
                                }}
                              >
                                <div className="mini-task-title">{association.title}</div>
                                <div className="mini-task-stats">
                                  <span>
                                    <FaHeart style={{ color: likedTasks.has(association.task_id) ? '#e74c3c' : '#9ca3af' }} />
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
                  <div className="scroll-arrow">v</div>
                </div>
              )}
            </div>
          ) : viewMode === 'list' ? (
            <div className="table-view-wrapper">
              <div className="table-header">
                <div className="table-header-cell title-col">Task</div>
                <div className="table-header-cell desc-col">What is it?</div>
                <div className="table-header-cell impact-col"></div>
                <div className="table-header-cell initiative-col"></div>
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
                        const task = tasks[index];
                        return (
                          <div style={style}>
                            {task ? (
                              <TaskCard
                                key={task.id}
                                task={task}
                                onClick={onTaskClick}
                                onEdit={isAdmin ? (t) => onTaskClick(t) : undefined}
                                onDelete={isAdmin ? handleDelete : undefined}
                                showActions={isAdmin}
                                viewMode="list"
                                onLike={handleLikeToggle}
                                isLiked={likedTasks.has(task.id)}
                              />
                            ) : (
                              <div className="task-skeleton-row">
                                <div className="skeleton-cell title-col"></div>
                                <div className="skeleton-cell desc-col"></div>
                                <div className="skeleton-cell impact-col"></div>
                                <div className="skeleton-cell initiative-col"></div>
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
                    const loadedCount = tasks.filter(t => t).length;
                    if (loadedCount < totalCount) {
                      loadMoreItems(loadedCount, loadedCount + BUFFER_SIZE - 1);
                    }
                  }
                }}
              >
                {tasks.filter(t => t).map((task: Task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onClick={onTaskClick}
                    onEdit={isAdmin ? (t) => onTaskClick(t) : undefined}
                    onDelete={isAdmin ? handleDelete : undefined}
                    showActions={isAdmin}
                    viewMode="grid"
                    onLike={handleLikeToggle}
                    isLiked={likedTasks.has(task.id)}
                  />
                ))}
                {isLoadingMore && (
                  <div className="loading-more">
                    <div className="loading-spinner"></div>
                    <span>Loading more tasks...</span>
                  </div>
                )}
              </div>
              {totalCount > 6 && !hasScrolled && (
                <div className="scroll-hint">
                  <span>Scroll for more</span>
                  <div className="scroll-arrow">v</div>
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

export default TasksList;
