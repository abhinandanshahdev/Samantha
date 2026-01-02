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
import { UseCase, SearchFilters, TaskFilters, Category, Task } from '../../types';
import { useCaseAPI, categoryAPI, taskAPI } from '../../services/apiService';
import { FaListAlt, FaTasks } from 'react-icons/fa';
import { useActiveDomainId } from '../../context/DomainContext';
import TimelineColumn from './TimelineColumn';
import TimelineCard from './TimelineCard';
import LoadingAnimation from '../LoadingAnimation/LoadingAnimation';
import ChatAssistant from '../ChatAssistant/ChatAssistant';
import FilterPanel from '../FilterPanel/FilterPanel';
import './RoadmapTimeline.css';

// Number of items to load per column initially and on "Load more"
const ITEMS_PER_LOAD = 20;

// View mode type
type ViewMode = 'initiatives' | 'tasks';

// Column state for grouped loading
interface ColumnState {
  items: (UseCase | Task)[];
  totalCount: number;
  hasMore: boolean;
  isLoading: boolean;
}

interface RoadmapTimelineProps {
  onUseCaseClick: (useCase: UseCase) => void;
  onTaskClick?: (task: Task) => void;
  showAIChat?: boolean;
  onCloseChatClick?: () => void;
  user?: any;
  searchQuery?: string;
}

// Generate month columns based on range
const generateMonthColumns = (monthsCount: number) => {
  const columns = [];
  const today = new Date();

  for (let i = 0; i < monthsCount; i++) {
    const date = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const monthStr = date.toLocaleString('default', { month: 'short' });
    const yearStr = date.getFullYear().toString();
    const monthNum = date.getMonth() + 1; // 1-12
    const id = `${yearStr}-${String(monthNum).padStart(2, '0')}`;

    columns.push({
      id,
      title: `${monthStr} ${yearStr}`,
      year: date.getFullYear(),
      month: monthNum
    });
  }

  return columns;
};

const FILTER_STORAGE_KEY = 'samantha_roadmap_filter_preferences';

const RoadmapTimeline: React.FC<RoadmapTimelineProps> = ({
  onUseCaseClick,
  onTaskClick,
  showAIChat = false,
  onCloseChatClick,
  user,
  searchQuery = ''
}) => {
  const activeDomainId = useActiveDomainId();

  // View mode state: initiatives or tasks
  const [viewMode, setViewMode] = useState<ViewMode>('initiatives');

  // Initiatives list for task filter dropdown (loaded separately)
  const [initiativesForFilter, setInitiativesForFilter] = useState<UseCase[]>([]);

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
  const [filters, setFilters] = useState<SearchFilters | TaskFilters>(getInitialFilters);
  const [isUpdating, setIsUpdating] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedRange, setSelectedRange] = useState<3 | 6 | 12>(6);
  const [monthColumns, setMonthColumns] = useState(generateMonthColumns(6));
  const [isUnplannedCollapsed, setIsUnplannedCollapsed] = useState(true);
  const [isPastCollapsed, setIsPastCollapsed] = useState(true);

  // Per-column state for grouped loading
  const [columnStates, setColumnStates] = useState<Record<string, ColumnState>>({});
  const [totalCount, setTotalCount] = useState(0);

  // Track if initial load is complete to avoid re-fetching
  const initialLoadRef = useRef<string | null>(null);

  // Keep a reference to all items for drag-drop purposes
  const allItemsRef = useRef<Map<string, UseCase | Task>>(new Map());

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
  const adjustTranslate: Modifier = ({ transform, activatorEvent }) => {
    if (!activatorEvent) {
      return transform;
    }

    // On touch devices, position overlay so it's visible below the finger
    const isTouchEvent = 'touches' in activatorEvent;
    if (isTouchEvent) {
      return {
        ...transform,
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

  // Regenerate columns when range changes
  useEffect(() => {
    setMonthColumns(generateMonthColumns(selectedRange));
  }, [selectedRange]);

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

  // Load initiatives for filter dropdown when in tasks mode
  useEffect(() => {
    if (viewMode === 'tasks') {
      const loadInitiatives = async () => {
        try {
          const initiatives = await useCaseAPI.getAll({
            domain_id: activeDomainId || undefined,
            limit: 500 // Load enough for dropdown
          });
          setInitiativesForFilter(initiatives);
        } catch (error) {
          console.error('Failed to load initiatives for filter:', error);
        }
      };
      loadInitiatives();
    }
  }, [viewMode, activeDomainId]);

  // Reset data when view mode changes
  useEffect(() => {
    initialLoadRef.current = null;
    setColumnStates({});
    allItemsRef.current.clear();
    setFilters({});
  }, [viewMode]);

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

  // Helper to get month key from expected_delivery_month format
  const getMonthKey = (item: UseCase | Task): string => {
    if (!item.expected_delivery_date) return 'unplanned';
    const dateParts = item.expected_delivery_date.split('-');
    return `${dateParts[0]}-${dateParts[1]}`;
  };

  // Helper to get the column key for an item (considering 'past' column)
  const getColumnKey = (item: UseCase | Task): string => {
    const monthKey = getMonthKey(item);
    if (monthKey === 'unplanned') return 'unplanned';

    // Check if this month is before the current month
    const today = new Date();
    const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    if (monthKey < currentMonthKey) {
      return 'past';
    }
    return monthKey;
  };

  // Load items for a specific month column
  const loadColumnItems = useCallback(async (
    monthId: string,
    offset: number = 0,
    append: boolean = false
  ) => {
    // Mark column as loading
    setColumnStates(prev => ({
      ...prev,
      [monthId]: { ...prev[monthId], isLoading: true }
    }));

    try {
      // Parse month ID to get year and month for filtering
      const isUnplanned = monthId === 'unplanned';
      const isPast = monthId === 'past';
      let filterMonth: string | undefined;
      let filterYear: number | undefined;

      if (!isUnplanned && !isPast) {
        const [year, month] = monthId.split('-');
        filterYear = parseInt(year);
        filterMonth = month;
      }

      // Load items based on view mode
      let items: (UseCase | Task)[];
      if (viewMode === 'tasks') {
        items = await taskAPI.getAll({
          ...filtersWithDomain,
          expected_delivery_year: (isUnplanned || isPast) ? undefined : filterYear,
          expected_delivery_month: isUnplanned ? 'unplanned' : isPast ? 'past' : filterMonth,
          limit: ITEMS_PER_LOAD,
          offset
        });
      } else {
        items = await useCaseAPI.getAll({
          ...filtersWithDomain,
          expected_delivery_year: (isUnplanned || isPast) ? undefined : filterYear,
          expected_delivery_month: isUnplanned ? 'unplanned' : isPast ? 'past' : filterMonth,
          limit: ITEMS_PER_LOAD,
          offset
        });
      }

      // Update items reference for drag-drop
      items.forEach(item => allItemsRef.current.set(item.id, item));

      setColumnStates(prev => {
        const currentItems = append ? (prev[monthId]?.items || []) : [];
        const newItems = [...currentItems, ...items];
        return {
          ...prev,
          [monthId]: {
            ...prev[monthId],
            items: newItems,
            hasMore: items.length === ITEMS_PER_LOAD,
            isLoading: false
          }
        };
      });

      return items;
    } catch (error) {
      console.error(`Failed to load items for column ${monthId}:`, error);
      setColumnStates(prev => ({
        ...prev,
        [monthId]: { ...(prev[monthId] || { items: [], totalCount: 0, hasMore: false, isLoading: false }), isLoading: false }
      }));
      return [];
    }
  }, [filtersWithDomain, viewMode]);

  // Load grouped stats and initial items for all columns
  useEffect(() => {
    const loadData = async () => {
      const filterKey = JSON.stringify({ ...filtersWithDomain, selectedRange, viewMode });

      // Skip if already loading the same filter combination
      if (initialLoadRef.current === filterKey) return;
      initialLoadRef.current = filterKey;

      setIsLoading(true);
      allItemsRef.current.clear();

      try {
        // First, get grouped counts by expected_delivery_month
        const groupedStats = viewMode === 'tasks'
          ? await taskAPI.getGroupedStats('expected_delivery_month', filtersWithDomain)
          : await useCaseAPI.getGroupedStats('expected_delivery_month', filtersWithDomain);

        console.log('RoadmapTimeline: groupedStats received:', groupedStats);
        console.log('RoadmapTimeline: monthColumns:', monthColumns.map(c => c.id));
        setTotalCount(groupedStats.total_count);

        // Calculate "past" count by summing all months before the current month
        const today = new Date();
        const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        let pastCount = 0;
        Object.keys(groupedStats.groups).forEach(key => {
          // Check if this is a month key (YYYY-MM format) and if it's before current month
          if (key.match(/^\d{4}-\d{2}$/) && key < currentMonthKey) {
            pastCount += groupedStats.groups[key]?.count || 0;
          }
        });

        // Initialize column states with counts
        const newColumnStates: Record<string, ColumnState> = {
          unplanned: {
            items: [],
            totalCount: groupedStats.groups['unplanned']?.count || 0,
            hasMore: (groupedStats.groups['unplanned']?.count || 0) > ITEMS_PER_LOAD,
            isLoading: (groupedStats.groups['unplanned']?.count || 0) > 0
          },
          past: {
            items: [],
            totalCount: pastCount,
            hasMore: pastCount > ITEMS_PER_LOAD,
            isLoading: pastCount > 0
          }
        };

        // Initialize month columns
        monthColumns.forEach(col => {
          const count = groupedStats.groups[col.id]?.count || 0;
          newColumnStates[col.id] = {
            items: [],
            totalCount: count,
            hasMore: count > ITEMS_PER_LOAD,
            isLoading: count > 0
          };
        });
        setColumnStates(newColumnStates);

        // Create list of all columns to load (unplanned + past + month columns)
        const columnsToLoad = ['unplanned', 'past', ...monthColumns.map(col => col.id)];

        // Load initial items for all columns in parallel
        const loadPromises = columnsToLoad.map(async (colId) => {
          // Get count from the appropriate source (pastCount for 'past', groupedStats for others)
          const count = colId === 'past' ? pastCount : (groupedStats.groups[colId]?.count || 0);
          if (count > 0) {
            const isUnplanned = colId === 'unplanned';
            const isPast = colId === 'past';
            let filterMonth: string | undefined;
            let filterYear: number | undefined;

            if (!isUnplanned && !isPast) {
              const [year, month] = colId.split('-');
              filterYear = parseInt(year);
              filterMonth = month;
            }

            let items: (UseCase | Task)[];
            if (viewMode === 'tasks') {
              items = await taskAPI.getAll({
                ...filtersWithDomain,
                expected_delivery_year: (isUnplanned || isPast) ? undefined : filterYear,
                expected_delivery_month: isUnplanned ? 'unplanned' : isPast ? 'past' : filterMonth,
                limit: ITEMS_PER_LOAD,
                offset: 0
              });
            } else {
              items = await useCaseAPI.getAll({
                ...filtersWithDomain,
                expected_delivery_year: (isUnplanned || isPast) ? undefined : filterYear,
                expected_delivery_month: isUnplanned ? 'unplanned' : isPast ? 'past' : filterMonth,
                limit: ITEMS_PER_LOAD,
                offset: 0
              });
            }

            // Store items in reference map
            items.forEach(item => allItemsRef.current.set(item.id, item));

            return { columnId: colId, items, count };
          }
          return { columnId: colId, items: [], count: 0 };
        });

        const results = await Promise.all(loadPromises);
        console.log('RoadmapTimeline: load results:', results);

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
  }, [filtersWithDomain, filters, activeDomainId, monthColumns, selectedRange, viewMode]);

  // Handler for loading more items in a column
  const handleLoadMore = useCallback(async (monthId: string) => {
    const currentColumn = columnStates[monthId];
    if (!currentColumn || currentColumn.isLoading || !currentColumn.hasMore) return;

    await loadColumnItems(monthId, currentColumn.items.length, true);
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
    const items: (UseCase | Task)[] = [];
    Object.values(columnStates).forEach(col => {
      col.items.forEach(item => {
        items.push(item);
      });
    });
    return items;
  }, [columnStates]);

  // Filter initiatives for the dropdown - now just returns loaded items
  const filteredInitiativesForDropdown = useMemo(() => {
    return allUseCases as UseCase[];
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
    const overIdString = String(over.id);

    // Find item in reference map
    const item = allItemsRef.current.get(itemId);
    if (!item) {
      console.error('Item not found:', itemId);
      return;
    }

    // Determine old column key (uses 'past' for past months)
    const oldColumnKey = getColumnKey(item);

    // Determine target month
    let targetMonthKey: string;
    let newDeliveryDateString: string | null = null;

    if (overIdString === 'past') {
      // Can't drop items into the past column - it's read-only
      return;
    }

    if (overIdString === 'unplanned') {
      // Dropped on unplanned column
      targetMonthKey = 'unplanned';
      newDeliveryDateString = null;
    } else {
      // Check if dropped on a month column directly
      const targetMonth = monthColumns.find(col => col.id === overIdString);

      if (targetMonth) {
        targetMonthKey = targetMonth.id;
        const monthStr = String(targetMonth.month).padStart(2, '0');
        newDeliveryDateString = `${targetMonth.year}-${monthStr}-01`;
      } else {
        // Dropped on another card - find which month that card is in
        const targetCard = allItemsRef.current.get(overIdString);

        if (targetCard) {
          const cardMonthKey = getMonthKey(targetCard);
          if (cardMonthKey === 'unplanned') {
            targetMonthKey = 'unplanned';
            newDeliveryDateString = null;
          } else {
            // Check if the target card is in a "past" month (before current month)
            const today = new Date();
            const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
            if (cardMonthKey < currentMonthKey) {
              // Can't drop into past column
              return;
            }

            const foundMonth = monthColumns.find(col => col.id === cardMonthKey);
            if (foundMonth) {
              targetMonthKey = foundMonth.id;
              const monthStr = String(foundMonth.month).padStart(2, '0');
              newDeliveryDateString = `${foundMonth.year}-${monthStr}-01`;
            } else {
              alert('Could not determine where to drop the card. Please try again.');
              return;
            }
          }
        } else {
          alert('Could not determine where to drop the card. Please try again.');
          return;
        }
      }
    }

    // Don't update if nothing changed
    if (oldColumnKey === targetMonthKey) {
      return;
    }

    // If moving to unplanned and already unplanned, skip
    if (targetMonthKey === 'unplanned' && !item.expected_delivery_date) {
      return;
    }

    const oldDate = item.expected_delivery_date;

    // Set updating flag
    setIsUpdating(true);

    // Optimistically update the UI by moving item between columns
    setColumnStates(prev => {
      const updatedItem = { ...item, expected_delivery_date: newDeliveryDateString || undefined };
      allItemsRef.current.set(itemId, updatedItem);

      const oldColumn = prev[oldColumnKey] || { items: [], totalCount: 0, hasMore: false, isLoading: false };
      const newColumn = prev[targetMonthKey] || { items: [], totalCount: 0, hasMore: false, isLoading: false };

      return {
        ...prev,
        [oldColumnKey]: {
          ...oldColumn,
          items: oldColumn.items.filter(i => i.id !== itemId),
          totalCount: Math.max(0, oldColumn.totalCount - 1)
        },
        [targetMonthKey]: {
          ...newColumn,
          items: [...newColumn.items, updatedItem],
          totalCount: newColumn.totalCount + 1
        }
      };
    });

    // Update the backend based on view mode
    try {
      if (viewMode === 'tasks') {
        await taskAPI.updateDeliveryDate(itemId, newDeliveryDateString);
      } else {
        await useCaseAPI.updateDeliveryDate(itemId, newDeliveryDateString);
      }
    } catch (error: any) {
      console.error('Failed to update delivery date:', error);

      let errorMessage = 'Failed to update delivery date. Please try again.';
      if (error.response?.data?.error) {
        errorMessage = `Error: ${error.response.data.error}`;
      } else if (error.message) {
        errorMessage = `Error: ${error.message}`;
      }

      // Revert the optimistic update on error
      setColumnStates(prev => {
        const revertedItem = { ...item, expected_delivery_date: oldDate };
        allItemsRef.current.set(itemId, revertedItem);

        const targetColumn = prev[targetMonthKey] || { items: [], totalCount: 0, hasMore: false, isLoading: false };
        const oldColumn = prev[oldColumnKey] || { items: [], totalCount: 0, hasMore: false, isLoading: false };

        return {
          ...prev,
          [targetMonthKey]: {
            ...targetColumn,
            items: targetColumn.items.filter(i => i.id !== itemId),
            totalCount: Math.max(0, targetColumn.totalCount - 1)
          },
          [oldColumnKey]: {
            ...oldColumn,
            items: [...oldColumn.items, revertedItem],
            totalCount: oldColumn.totalCount + 1
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

  // Handler that processes card clicks - delegates to appropriate handler based on view mode
  const handleCardClick = (item: UseCase | Task) => {
    if (viewMode === 'tasks' && onTaskClick) {
      onTaskClick(item as Task);
    } else {
      onUseCaseClick(item as UseCase);
    }
  };

  if (isLoading) {
    return (
      <div className="roadmap-timeline-loading">
        <LoadingAnimation />
      </div>
    );
  }

  return (
    <div className="roadmap-timeline-container">
      <div className="roadmap-timeline-content">
        {/* Sidebar with Filter Panel */}
        <div className="roadmap-timeline-sidebar">
          {/* View Mode Toggle */}
          <div className="view-mode-toggle">
            <button
              className={`view-mode-btn ${viewMode === 'initiatives' ? 'active' : ''}`}
              onClick={() => setViewMode('initiatives')}
            >
              <FaListAlt />
              <span>Initiatives</span>
            </button>
            <button
              className={`view-mode-btn ${viewMode === 'tasks' ? 'active' : ''}`}
              onClick={() => setViewMode('tasks')}
            >
              <FaTasks />
              <span>Tasks</span>
            </button>
          </div>

          <div className="sidebar-count">
            <div style={{
              fontSize: '16px',
              fontWeight: '600',
              color: '#374151'
            }}>
              {`${totalCount} ${viewMode === 'tasks' ? 'task' : 'initiative'}${totalCount !== 1 ? 's' : ''} found`}
            </div>
          </div>
          <FilterPanel
            categories={categories}
            filters={filters}
            onFiltersChange={handleFiltersChange}
            onClearFilters={handleClearFilters}
            hideKanbanStatus={true}
            hideDeliveryDateFilters={true}
            showTaskFilter={viewMode === 'tasks'}
            initiatives={viewMode === 'tasks' ? initiativesForFilter : filteredInitiativesForDropdown}
          />
        </div>

        {/* Main Content - Timeline Board */}
        <motion.div
          className="roadmap-timeline-main"
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          {/* Range Selector */}
          <motion.div
            className="timeline-range-selector"
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.3 }}
          >
            <button
              className={`range-btn ${selectedRange === 3 ? 'active' : ''}`}
              onClick={() => setSelectedRange(3)}
            >
              Next 3 months
            </button>
            <button
              className={`range-btn ${selectedRange === 6 ? 'active' : ''}`}
              onClick={() => setSelectedRange(6)}
            >
              Next 6 months
            </button>
            <button
              className={`range-btn ${selectedRange === 12 ? 'active' : ''}`}
              onClick={() => setSelectedRange(12)}
            >
              Next 12 months
            </button>
          </motion.div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
          >
            <motion.div
              className="timeline-board-container"
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.3 }}
            >
              {/* Fixed Unplanned Column */}
              <div className="timeline-fixed-column">
                <TimelineColumn
                  key="unplanned"
                  id="unplanned"
                  title="Unplanned"
                  useCases={(columnStates['unplanned']?.items || []) as UseCase[]}
                  totalCount={columnStates['unplanned']?.totalCount || 0}
                  hasMore={columnStates['unplanned']?.hasMore || false}
                  isLoadingMore={columnStates['unplanned']?.isLoading || false}
                  onLoadMore={() => handleLoadMore('unplanned')}
                  onCardClick={handleCardClick}
                  isCollapsible={true}
                  isCollapsed={isUnplannedCollapsed}
                  onToggleCollapse={() => setIsUnplannedCollapsed(!isUnplannedCollapsed)}
                  variant="unplanned"
                />
              </div>

              {/* Fixed Past Column - items with dates before current month */}
              {(columnStates['past']?.totalCount || 0) > 0 && (
                <div className={`timeline-fixed-column timeline-fixed-past ${isPastCollapsed ? 'collapsed' : ''}`}>
                  <TimelineColumn
                    key="past"
                    id="past"
                    title="Past"
                    useCases={(columnStates['past']?.items || []) as UseCase[]}
                    totalCount={columnStates['past']?.totalCount || 0}
                    hasMore={columnStates['past']?.hasMore || false}
                    isLoadingMore={columnStates['past']?.isLoading || false}
                    onLoadMore={() => handleLoadMore('past')}
                    onCardClick={handleCardClick}
                    isCollapsible={true}
                    isCollapsed={isPastCollapsed}
                    onToggleCollapse={() => setIsPastCollapsed(!isPastCollapsed)}
                    variant="past"
                  />
                </div>
              )}

              {/* Scrollable Month Columns */}
              <div className="timeline-scrollable-columns" ref={boardRef}>
                <div className="roadmap-timeline-board">
                  {monthColumns.map((column, idx) => (
                    <motion.div
                      key={column.id}
                      initial={{ y: 8, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.2 + (0.03 * idx), duration: 0.3 }}
                    >
                      <TimelineColumn
                        id={column.id}
                        title={column.title}
                        useCases={(columnStates[column.id]?.items || []) as UseCase[]}
                        totalCount={columnStates[column.id]?.totalCount || 0}
                        hasMore={columnStates[column.id]?.hasMore || false}
                        isLoadingMore={columnStates[column.id]?.isLoading || false}
                        onLoadMore={() => handleLoadMore(column.id)}
                        onCardClick={handleCardClick}
                      />
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>

            <DragOverlay modifiers={[adjustTranslate]} dropAnimation={null}>
              {activeItem ? (
                <div className="timeline-drag-overlay">
                  <TimelineCard useCase={activeItem as UseCase} onClick={() => {}} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </motion.div>
      </div>

      {/* AI Chat Interface */}
      {showAIChat && (
        <ChatAssistant
          useCases={allUseCases as UseCase[]}
          isOpen={showAIChat}
          onClose={onCloseChatClick || (() => {})}
        />
      )}
    </div>
  );
};

export default RoadmapTimeline;
