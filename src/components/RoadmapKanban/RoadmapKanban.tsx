import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  DragMoveEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCorners,
  Modifier,
} from '@dnd-kit/core';
import { motion } from 'framer-motion';
import { UseCase, KanbanStatus, SearchFilters, Category } from '../../types';
import { useCaseAPI, categoryAPI } from '../../services/apiService';
import { useActiveDomainId } from '../../context/DomainContext';
import KanbanColumn from './KanbanColumn';
import KanbanCard from './KanbanCard';
import LoadingAnimation from '../LoadingAnimation/LoadingAnimation';
import ChatAssistant from '../ChatAssistant/ChatAssistant';
import FilterPanel from '../FilterPanel/FilterPanel';
import './RoadmapKanban.css';

// Number of items to load per column initially and on "Load more"
const ITEMS_PER_LOAD = 20;

// Column state for grouped loading
interface ColumnState {
  items: UseCase[];
  totalCount: number;
  hasMore: boolean;
  isLoading: boolean;
}

interface RoadmapKanbanProps {
  onUseCaseClick: (useCase: UseCase) => void;
  showAIChat?: boolean;
  onCloseChatClick?: () => void;
  user?: any;
  searchQuery?: string;
}

const KANBAN_COLUMNS: { id: KanbanStatus; title: string }[] = [
  { id: 'intention', title: 'Intent' },
  { id: 'experimentation', title: 'Experiment' },
  { id: 'commitment', title: 'Commitment' },
  { id: 'implementation', title: 'Implement' },
  { id: 'integration', title: 'Integrate' },
  { id: 'blocked', title: 'Blocked' },
  { id: 'slow_burner', title: 'Slow Burner' },
  { id: 'de_prioritised', title: 'De-prioritised' },
  { id: 'on_hold', title: 'On Hold' },
];

const FILTER_STORAGE_KEY = 'samantha_filter_preferences';

// Initial column states - defined outside component to prevent recreation on each render
const createInitialColumnStates = (): Record<KanbanStatus, ColumnState> => ({
  intention: { items: [], totalCount: 0, hasMore: false, isLoading: false },
  experimentation: { items: [], totalCount: 0, hasMore: false, isLoading: false },
  commitment: { items: [], totalCount: 0, hasMore: false, isLoading: false },
  implementation: { items: [], totalCount: 0, hasMore: false, isLoading: false },
  integration: { items: [], totalCount: 0, hasMore: false, isLoading: false },
  blocked: { items: [], totalCount: 0, hasMore: false, isLoading: false },
  slow_burner: { items: [], totalCount: 0, hasMore: false, isLoading: false },
  de_prioritised: { items: [], totalCount: 0, hasMore: false, isLoading: false },
  on_hold: { items: [], totalCount: 0, hasMore: false, isLoading: false },
});

const RoadmapKanban: React.FC<RoadmapKanbanProps> = ({
  onUseCaseClick,
  showAIChat = false,
  onCloseChatClick,
  user,
  searchQuery = ''
}) => {
  const activeDomainId = useActiveDomainId();

  // Load initial filters from localStorage
  const getInitialFilters = (): SearchFilters => {
    try {
      const savedFilters = localStorage.getItem(FILTER_STORAGE_KEY);
      if (savedFilters) {
        return JSON.parse(savedFilters);
      }
    } catch (error) {
      console.error('Error loading saved filters:', error);
    }
    return {};
  };

  const [isLoading, setIsLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filters, setFilters] = useState<SearchFilters>(getInitialFilters);
  const [isUpdating, setIsUpdating] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);

  // Per-column state for grouped loading
  const [columnStates, setColumnStates] = useState<Record<KanbanStatus, ColumnState>>(createInitialColumnStates);
  const [totalCount, setTotalCount] = useState(0);

  // Track if initial load is complete to avoid re-fetching
  const initialLoadRef = useRef<string | null>(null);

  // Keep a reference to all items for drag-drop and filtering purposes
  const allItemsRef = useRef<Map<string, UseCase>>(new Map());

  // Ref for the scrollable board container (for auto-scroll during drag)
  const boardRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 150,
        tolerance: 8,
      },
    })
  );

  // Custom modifier to position drag overlay near the touch/pointer position
  // This fixes the issue where the overlay appears far from where you're dragging
  const adjustTranslate: Modifier = ({ transform, activatorEvent, draggingNodeRect }) => {
    if (!draggingNodeRect || !activatorEvent) {
      return transform;
    }

    // On touch devices, position overlay so it's visible below the finger
    const isTouchEvent = 'touches' in activatorEvent;
    if (isTouchEvent) {
      return {
        ...transform,
        // Offset slightly so the card is visible below the finger
        y: transform.y + 20,
      };
    }

    return transform;
  };

  // Auto-scroll when dragging near edges
  const handleDragMove = useCallback((event: DragMoveEvent) => {
    if (!boardRef.current) return;

    const { activatorEvent } = event;
    if (!activatorEvent) return;

    // Get the current pointer/touch position
    let clientX: number;
    const touchEvent = activatorEvent as TouchEvent;
    const mouseEvent = activatorEvent as MouseEvent;

    if ('touches' in activatorEvent && touchEvent.touches && touchEvent.touches.length > 0) {
      clientX = touchEvent.touches[0].clientX;
    } else if ('clientX' in activatorEvent) {
      clientX = mouseEvent.clientX;
    } else {
      return;
    }

    const board = boardRef.current;
    const boardRect = board.getBoundingClientRect();
    const edgeThreshold = 60; // pixels from edge to trigger scroll
    const scrollSpeed = 15; // pixels per frame

    // Clear any existing auto-scroll
    if (autoScrollRef.current) {
      cancelAnimationFrame(autoScrollRef.current);
      autoScrollRef.current = null;
    }

    // Check if near left edge
    if (clientX < boardRect.left + edgeThreshold) {
      const scrollLeft = () => {
        if (board.scrollLeft > 0) {
          board.scrollLeft -= scrollSpeed;
          autoScrollRef.current = requestAnimationFrame(scrollLeft);
        }
      };
      autoScrollRef.current = requestAnimationFrame(scrollLeft);
    }
    // Check if near right edge
    else if (clientX > boardRect.right - edgeThreshold) {
      const scrollRight = () => {
        const maxScroll = board.scrollWidth - board.clientWidth;
        if (board.scrollLeft < maxScroll) {
          board.scrollLeft += scrollSpeed;
          autoScrollRef.current = requestAnimationFrame(scrollRight);
        }
      };
      autoScrollRef.current = requestAnimationFrame(scrollRight);
    }
  }, []);

  // Stop auto-scroll when drag ends
  const stopAutoScroll = useCallback(() => {
    if (autoScrollRef.current) {
      cancelAnimationFrame(autoScrollRef.current);
      autoScrollRef.current = null;
    }
  }, []);

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

  // Update filters when search query changes
  useEffect(() => {
    setFilters(prevFilters => ({
      ...prevFilters,
      search: searchQuery || undefined
    }));
  }, [searchQuery]);

  // Combine filters with active domain
  const filtersWithDomain = useMemo(() => {
    const combined = { ...filters };
    if (activeDomainId) {
      combined.domain_id = activeDomainId;
    }
    return combined;
  }, [filters, activeDomainId]);

  // Load items for a specific column
  const loadColumnItems = useCallback(async (
    columnId: KanbanStatus,
    offset: number = 0,
    append: boolean = false
  ) => {
    // Mark column as loading
    setColumnStates(prev => ({
      ...prev,
      [columnId]: { ...prev[columnId], isLoading: true }
    }));

    try {
      // Filter by status instead of kanban_pillar
      const items = await useCaseAPI.getAll({
        ...filtersWithDomain,
        statuses: [columnId],
        limit: ITEMS_PER_LOAD,
        offset
      });

      // Update items reference for drag-drop
      items.forEach(item => allItemsRef.current.set(item.id, item));

      setColumnStates(prev => {
        const currentItems = append ? prev[columnId].items : [];
        const newItems = [...currentItems, ...items];
        return {
          ...prev,
          [columnId]: {
            ...prev[columnId],
            items: newItems,
            hasMore: items.length === ITEMS_PER_LOAD,
            isLoading: false
          }
        };
      });

      return items;
    } catch (error) {
      console.error(`Failed to load items for column ${columnId}:`, error);
      setColumnStates(prev => ({
        ...prev,
        [columnId]: { ...prev[columnId], isLoading: false }
      }));
      return [];
    }
  }, [filtersWithDomain]);

  // Load grouped stats and initial items for all columns
  useEffect(() => {
    const loadData = async () => {
      const filterKey = JSON.stringify({ ...filtersWithDomain });

      // Skip if already loading the same filter combination
      if (initialLoadRef.current === filterKey) return;
      initialLoadRef.current = filterKey;

      setIsLoading(true);
      allItemsRef.current.clear();

      try {
        // First, get grouped counts using status as the group_by field
        const groupedStats = await useCaseAPI.getGroupedStats('status', filtersWithDomain);

        setTotalCount(groupedStats.total_count);

        // Initialize column states with counts
        const newColumnStates: Record<KanbanStatus, ColumnState> = createInitialColumnStates();
        KANBAN_COLUMNS.forEach(col => {
          const count = groupedStats.groups[col.id]?.count || 0;
          newColumnStates[col.id] = {
            items: [],
            totalCount: count,
            hasMore: count > ITEMS_PER_LOAD,
            isLoading: count > 0
          };
        });
        setColumnStates(newColumnStates);

        // Load initial items for all columns in parallel
        const loadPromises = KANBAN_COLUMNS.map(async (col) => {
          const count = groupedStats.groups[col.id]?.count || 0;
          if (count > 0) {
            const items = await useCaseAPI.getAll({
              ...filtersWithDomain,
              statuses: [col.id],
              limit: ITEMS_PER_LOAD,
              offset: 0
            });

            // Store items in reference map
            items.forEach(item => allItemsRef.current.set(item.id, item));

            return { columnId: col.id, items, count };
          }
          return { columnId: col.id, items: [], count: 0 };
        });

        const results = await Promise.all(loadPromises);

        // Update column states with loaded items
        setColumnStates(prev => {
          const updated = { ...prev };
          results.forEach(({ columnId, items, count }) => {
            updated[columnId] = {
              items,
              totalCount: count,
              hasMore: items.length < count,
              isLoading: false
            };
          });
          return updated;
        });

      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [filtersWithDomain, filters, activeDomainId]);

  // Handler for loading more items in a column
  const handleLoadMore = useCallback(async (columnId: KanbanStatus) => {
    const currentColumn = columnStates[columnId];
    if (currentColumn.isLoading || !currentColumn.hasMore) return;

    await loadColumnItems(columnId, currentColumn.items.length, true);
  }, [columnStates, loadColumnItems]);

  const handleFiltersChange = useCallback((newFilters: SearchFilters) => {
    setFilters(newFilters);
  }, []);

  const handleClearFilters = useCallback(() => {
    setFilters({});
    // Reset the filter key to allow re-fetching
    initialLoadRef.current = null;
  }, []);

  // Get all loaded items as arrays for backwards compatibility
  const allUseCases = useMemo(() => {
    const items: UseCase[] = [];
    KANBAN_COLUMNS.forEach(col => {
      columnStates[col.id].items.forEach(item => {
        items.push(item);
      });
    });
    return items;
  }, [columnStates]);

  // Filter initiatives for the dropdown - now just returns loaded items
  // In a future phase, this could use server-side search
  const filteredInitiativesForDropdown = useMemo(() => {
    return allUseCases;
  }, [allUseCases]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    // Lock page scroll while dragging to prevent double-scroll effect
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.touchAction = 'none';
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    stopAutoScroll();
    // Restore page scroll
    document.body.style.overflow = '';
    document.body.style.touchAction = '';
    document.documentElement.style.overflow = '';
    document.documentElement.style.touchAction = '';

    if (!over) {
      return;
    }

    // Prevent concurrent updates
    if (isUpdating) {
      return;
    }

    const itemId = active.id as string;
    const validStatuses: KanbanStatus[] = ['intention', 'experimentation', 'commitment', 'implementation', 'integration', 'blocked', 'slow_burner', 'de_prioritised', 'on_hold'];

    // Find item in column states or reference map
    const item = allItemsRef.current.get(itemId);
    if (!item) {
      console.error('Item not found:', itemId);
      return;
    }

    let newStatus: KanbanStatus;

    // Check if dropped on a column or on a card within a column
    const overIdString = String(over.id);

    if (validStatuses.includes(overIdString as KanbanStatus)) {
      // Dropped directly on a column
      newStatus = overIdString as KanbanStatus;
    } else {
      // Dropped on another card - find which column that card is in
      const targetCard = allItemsRef.current.get(overIdString);

      if (targetCard && targetCard.status) {
        newStatus = targetCard.status;
      } else {
        console.error('Could not determine target column. Over ID:', overIdString);
        alert('Could not determine where to drop the card. Please try again.');
        return;
      }
    }

    const oldStatus = item.status || 'intention';

    // Don't update if status hasn't changed
    if (oldStatus === newStatus) {
      return;
    }

    // Set updating flag
    setIsUpdating(true);

    // Optimistically update the UI by moving item between columns
    setColumnStates(prev => {
      const updatedItem = { ...item, status: newStatus };
      allItemsRef.current.set(itemId, updatedItem);

      return {
        ...prev,
        [oldStatus]: {
          ...prev[oldStatus],
          items: prev[oldStatus].items.filter(i => i.id !== itemId),
          totalCount: prev[oldStatus].totalCount - 1
        },
        [newStatus]: {
          ...prev[newStatus],
          items: [...prev[newStatus].items, updatedItem],
          totalCount: prev[newStatus].totalCount + 1
        }
      };
    });

    // Update the backend
    try {
      await useCaseAPI.updateStatus(itemId, newStatus);
    } catch (error: any) {
      console.error('Failed to update kanban status:', error);

      let errorMessage = 'Failed to update status. Please try again.';
      if (error.response?.data?.error) {
        errorMessage = `Error: ${error.response.data.error}`;
      } else if (error.message) {
        errorMessage = `Error: ${error.message}`;
      }

      // Revert the optimistic update on error
      setColumnStates(prev => {
        const revertedItem = { ...item, status: oldStatus };
        allItemsRef.current.set(itemId, revertedItem);

        return {
          ...prev,
          [newStatus]: {
            ...prev[newStatus],
            items: prev[newStatus].items.filter(i => i.id !== itemId),
            totalCount: prev[newStatus].totalCount - 1
          },
          [oldStatus]: {
            ...prev[oldStatus],
            items: [...prev[oldStatus].items, revertedItem],
            totalCount: prev[oldStatus].totalCount + 1
          }
        };
      });

      alert(errorMessage);
    } finally {
      setIsUpdating(false);
    }
  };

  // Find active item for drag overlay
  const activeItem = activeId ? allItemsRef.current.get(activeId) : null;

  // Handler that processes UseCase clicks
  const handleCardClick = (item: UseCase) => {
    onUseCaseClick(item);
  };

  if (isLoading) {
    return (
      <div className="roadmap-kanban-loading">
        <LoadingAnimation />
      </div>
    );
  }

  return (
    <div className="roadmap-kanban-container">
      <div className="roadmap-kanban-content">
        {/* Sidebar with Filter Panel */}
        <div className="roadmap-kanban-sidebar">
          <div className="sidebar-count">
            <div style={{
              fontSize: '16px',
              fontWeight: '600',
              color: '#374151'
            }}>
              {`${totalCount} initiative${totalCount !== 1 ? 's' : ''} found`}
            </div>
          </div>
          <FilterPanel
            categories={categories}
            filters={filters}
            onFiltersChange={handleFiltersChange}
            onClearFilters={handleClearFilters}
            hideKanbanStatus={true}
            hideDeliveryDateFilters={true}
            initiatives={filteredInitiativesForDropdown}
          />
        </div>

        {/* Main Content - Kanban Board */}
        <motion.div
          className="roadmap-kanban-main"
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          <div className="kanban-container-wrapper">
            <div className="roadmap-kanban-board" ref={boardRef}>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
              >
                {KANBAN_COLUMNS.map((column, idx) => (
                  <motion.div
                    key={column.id}
                    initial={{ y: 8, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.05 * idx, duration: 0.3 }}
                  >
                    <KanbanColumn
                      id={column.id}
                      title={column.title}
                      useCases={columnStates[column.id].items}
                      totalCount={columnStates[column.id].totalCount}
                      hasMore={columnStates[column.id].hasMore}
                      isLoadingMore={columnStates[column.id].isLoading}
                      onLoadMore={() => handleLoadMore(column.id)}
                      onCardClick={handleCardClick}
                    />
                  </motion.div>
                ))}

                <DragOverlay modifiers={[adjustTranslate]} dropAnimation={null}>
                  {activeItem ? (
                    <div className="kanban-drag-overlay">
                      <KanbanCard useCase={activeItem} onClick={() => {}} />
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </div>
          </div>
        </motion.div>
      </div>

      {/* AI Chat Interface */}
      {showAIChat && (
        <ChatAssistant
          useCases={allUseCases}
          isOpen={showAIChat}
          onClose={onCloseChatClick || (() => {})}
        />
      )}
    </div>
  );
};

export default RoadmapKanban;
