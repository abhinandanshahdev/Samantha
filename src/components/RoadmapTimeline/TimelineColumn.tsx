import React, { useRef, useState, useEffect } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { UseCase, Agent } from '../../types';
import TimelineCard from './TimelineCard';
import { FaChevronRight, FaChevronDown } from 'react-icons/fa';

interface TimelineColumnProps {
  id: string;
  title: string;
  useCases: (UseCase | Agent)[];
  totalCount?: number;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  onCardClick: (useCase: UseCase | Agent) => void;
  isCollapsible?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  variant?: 'default' | 'unplanned' | 'past';
}

const TimelineColumn: React.FC<TimelineColumnProps> = ({
  id,
  title,
  useCases,
  totalCount,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  onCardClick,
  isCollapsible = false,
  isCollapsed = false,
  onToggleCollapse,
  variant = 'default'
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: id,
  });

  const contentRef = useRef<HTMLDivElement>(null);
  const [showScrollIndicator, setShowScrollIndicator] = useState(false);

  // Display count: use totalCount if provided, otherwise fall back to loaded items count
  const displayCount = totalCount !== undefined ? totalCount : useCases.length;

  useEffect(() => {
    const handleScroll = () => {
      if (contentRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
        const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10;
        setShowScrollIndicator(!isAtBottom && scrollHeight > clientHeight);
      }
    };

    const contentElement = contentRef.current;
    if (contentElement) {
      handleScroll(); // Check initially
      contentElement.addEventListener('scroll', handleScroll);

      // Also check when content changes
      const observer = new ResizeObserver(handleScroll);
      observer.observe(contentElement);

      return () => {
        contentElement.removeEventListener('scroll', handleScroll);
        observer.disconnect();
      };
    }
  }, [useCases]);

  return (
    <div
      className={`timeline-column ${isCollapsed ? 'collapsed' : ''} ${variant !== 'default' ? `timeline-column-${variant}` : ''}`}
      ref={setNodeRef}
      onClick={isCollapsed && isCollapsible ? onToggleCollapse : undefined}
    >
      {isCollapsed ? (
        <div className="collapsed-column-content">
          <div className="collapsed-chevron">
            <FaChevronRight />
          </div>
          <div className="collapsed-label">
            {title}
          </div>
          {displayCount > 0 && (
            <div className="collapsed-count">{displayCount}</div>
          )}
        </div>
      ) : (
        <>
          <div
            className={`timeline-column-header ${isOver ? 'is-over' : ''} ${isCollapsible ? 'collapsible' : ''}`}
            onClick={isCollapsible ? onToggleCollapse : undefined}
          >
            {isCollapsible && (
              <span className="collapse-icon">
                <FaChevronDown />
              </span>
            )}
            <h3 className="timeline-column-title">{title}</h3>
            <span className="timeline-column-count">{displayCount}</span>
          </div>

          <div
            ref={contentRef}
            className={`timeline-column-content ${isOver ? 'is-over' : ''}`}
          >
            {useCases.length === 0 && !isLoadingMore ? (
              <div className="timeline-column-empty">
                <p>No initiatives</p>
              </div>
            ) : (
              <>
                <SortableContext
                  items={useCases.map(uc => uc.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {useCases.map((useCase) => (
                    <TimelineCard
                      key={useCase.id}
                      useCase={useCase}
                      onClick={onCardClick}
                    />
                  ))}
                </SortableContext>

                {/* Load More Button */}
                {hasMore && onLoadMore && (
                  <button
                    className="timeline-load-more"
                    onClick={onLoadMore}
                    disabled={isLoadingMore}
                  >
                    {isLoadingMore ? (
                      <span className="loading-spinner-small" />
                    ) : (
                      `Load more (${useCases.length} of ${displayCount})`
                    )}
                  </button>
                )}
              </>
            )}
          </div>
          {showScrollIndicator && (
            <div className="timeline-scroll-indicator">
              <FaChevronDown />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TimelineColumn;
