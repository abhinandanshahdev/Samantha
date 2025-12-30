import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { UseCase, KanbanStatus, Agent } from '../../types';
import KanbanCard from './KanbanCard';

interface KanbanColumnProps {
  id: KanbanStatus;
  title: string;
  useCases: (UseCase | Agent)[];
  totalCount?: number;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  onCardClick: (useCase: UseCase | Agent) => void;
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({
  id,
  title,
  useCases,
  totalCount,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  onCardClick
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: id,
  });

  // Display count: use totalCount if provided, otherwise fall back to loaded items count
  const displayCount = totalCount !== undefined ? totalCount : useCases.length;

  return (
    <div className="kanban-column">
      <div className="kanban-column-header">
        <h3 className="kanban-column-title">{title}</h3>
        <span className="kanban-column-count">{displayCount}</span>
      </div>

      <div
        ref={setNodeRef}
        className={`kanban-column-content ${isOver ? 'is-over' : ''}`}
      >
        {useCases.length === 0 && !isLoadingMore ? (
          <div className="kanban-column-empty">
            <p>No initiatives</p>
          </div>
        ) : (
          <>
            <SortableContext
              items={useCases.map(uc => uc.id)}
              strategy={verticalListSortingStrategy}
            >
              {useCases.map((useCase) => (
                <KanbanCard
                  key={useCase.id}
                  useCase={useCase}
                  onClick={onCardClick}
                />
              ))}
            </SortableContext>

            {/* Load More Button */}
            {hasMore && onLoadMore && (
              <button
                className="kanban-load-more"
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
    </div>
  );
};

export default KanbanColumn;
