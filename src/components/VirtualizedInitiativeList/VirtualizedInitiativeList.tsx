import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FixedSizeList as List } from 'react-window';
import InfiniteLoader from 'react-window-infinite-loader';
import { UseCase, SearchFilters } from '../../types';
import { useCaseAPI } from '../../services/apiService';
import { useActiveDomainId } from '../../context/DomainContext';
import InitiativeCard from '../InitiativeCard/InitiativeCard';
import './VirtualizedInitiativeList.css';

interface VirtualizedInitiativeListProps {
  filters: SearchFilters;
  onUseCaseClick: (useCase: UseCase) => void;
  onEditUseCase: (useCase: UseCase) => void;
  onDeleteUseCase: (id: string) => Promise<void>;
  user: any;
  onStatsUpdate: (stats: { total_count: number; status_breakdown: Record<string, number>; filtered: boolean }) => void;
}

const ITEM_HEIGHT = 280; // Height of each use case card
const BUFFER_SIZE = 50;  // Number of items to load per batch

const VirtualizedInitiativeList: React.FC<VirtualizedInitiativeListProps> = ({
  filters,
  onUseCaseClick,
  onEditUseCase,
  onDeleteUseCase,
  user,
  onStatsUpdate
}) => {
  const activeDomainId = useActiveDomainId();
  const [useCases, setUseCases] = useState<UseCase[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(true);
  const listRef = useRef<List>(null);
  const loaderRef = useRef<InfiniteLoader | null>(null);

  // Track what we've loaded to avoid duplicate API calls
  const loadedRanges = useRef<Set<string>>(new Set());

  // Combine filters with active domain
  const filtersWithDomain = useMemo(() => {
    const combined = { ...filters };
    if (activeDomainId) {
      combined.domain_id = activeDomainId;
    }
    return combined;
  }, [filters, activeDomainId]);

  // Clear data when filters or domain change
  useEffect(() => {
    setUseCases([]);
    setTotalCount(0);
    setHasNextPage(true);
    loadedRanges.current.clear();

    // Reset the list scroll position
    if (listRef.current) {
      listRef.current.scrollToItem(0);
    }

    // Clear cached items in infinite loader
    if (loaderRef.current) {
      loaderRef.current.resetloadMoreItemsCache();
    }
  }, [filtersWithDomain]);

  // Load statistics
  useEffect(() => {
    const loadStats = async () => {
      try {
        const stats = await useCaseAPI.getStats(filtersWithDomain);
        setTotalCount(stats.total_count);
        setHasNextPage(stats.total_count > 0);
        onStatsUpdate(stats);
      } catch (error) {
        console.error('Failed to load use case statistics:', error);
      }
    };

    loadStats();
  }, [filtersWithDomain, onStatsUpdate]);

  // Load more items function
  const loadMoreItems = useCallback(async (startIndex: number, stopIndex: number) => {
    const rangeKey = `${startIndex}-${stopIndex}`;
    
    // Prevent duplicate loads
    if (loadedRanges.current.has(rangeKey) || isLoading) {
      return;
    }

    setIsLoading(true);
    loadedRanges.current.add(rangeKey);

    try {
      const newUseCases = await useCaseAPI.getAll({
        ...filtersWithDomain,
        limit: stopIndex - startIndex + 1,
        offset: startIndex
      });

      setUseCases(prevUseCases => {
        const updatedUseCases = [...prevUseCases];
        
        // Insert new items at correct positions
        newUseCases.forEach((useCase, index) => {
          updatedUseCases[startIndex + index] = useCase;
        });
        
        return updatedUseCases;
      });

      // Update hasNextPage based on whether we got fewer items than expected
      if (newUseCases.length < (stopIndex - startIndex + 1)) {
        setHasNextPage(false);
      }

    } catch (error) {
      console.error('Failed to load use cases:', error);
      // Remove the range from loaded ranges so we can retry
      loadedRanges.current.delete(rangeKey);
    } finally {
      setIsLoading(false);
    }
  }, [filtersWithDomain, isLoading]);

  // Check if item is loaded
  const isItemLoaded = useCallback((index: number) => {
    return !!useCases[index];
  }, [useCases]);

  // Render individual use case item
  const renderUseCaseItem = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const useCase = useCases[index];

    return (
      <div style={style} className="virtualized-use-case-item">
        {useCase ? (
          <InitiativeCard
            useCase={useCase}
            onClick={() => onUseCaseClick(useCase)}
            onEdit={() => onEditUseCase(useCase)}
            onDelete={() => onDeleteUseCase(useCase.id)}
            showActions={user?.role === 'admin'}
          />
        ) : (
          <div className="use-case-skeleton">
            <div className="skeleton-header"></div>
            <div className="skeleton-content"></div>
            <div className="skeleton-footer"></div>
          </div>
        )}
      </div>
    );
  }, [useCases, onUseCaseClick, onEditUseCase, onDeleteUseCase, user]);

  // Memoize item count to prevent unnecessary re-renders
  const itemCount = useMemo(() => {
    return hasNextPage ? totalCount + 1 : totalCount;
  }, [totalCount, hasNextPage]);

  // Container height calculation
  const containerHeight = Math.min(600, Math.max(300, itemCount * ITEM_HEIGHT));

  if (totalCount === 0 && !isLoading) {
    return (
      <div className="virtualized-use-case-list-empty">
        <div className="empty-state">
          <h3>No initiatives found</h3>
          <p>Try adjusting your search filters or create a new initiative.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="virtualized-use-case-list">
      <InfiniteLoader
        ref={loaderRef}
        isItemLoaded={isItemLoaded}
        itemCount={itemCount}
        loadMoreItems={loadMoreItems}
        threshold={5} // Start loading 5 items before reaching the end
      >
        {({ onItemsRendered, ref }) => (
          <List
            ref={(el) => {
              (listRef as any).current = el;
              ref(el);
            }}
            height={containerHeight}
            itemCount={itemCount}
            itemSize={ITEM_HEIGHT}
            onItemsRendered={onItemsRendered}
            overscanCount={2} // Render 2 extra items above and below viewport
            width="100%"
          >
            {renderUseCaseItem}
          </List>
        )}
      </InfiniteLoader>
      
      {isLoading && (
        <div className="virtualized-loading">
          <div className="loading-spinner"></div>
          <span>Loading initiatives...</span>
        </div>
      )}
    </div>
  );
};

export default VirtualizedInitiativeList;