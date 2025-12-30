import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FaGripVertical } from 'react-icons/fa';
import { UseCase, Agent } from '../../types';
import './TimelineCard.css';

interface TimelineCardProps {
  useCase: UseCase | Agent;
  onClick: (useCase: UseCase | Agent) => void;
}

const TimelineCard: React.FC<TimelineCardProps> = ({ useCase, onClick }) => {
  // Check if the item is an agent
  const isAgent = 'agent_type' in useCase;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: useCase.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleClick = (e: React.MouseEvent) => {
    // Don't trigger click if we were dragging
    if (isDragging) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onClick(useCase);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`timeline-card ${isDragging ? 'dragging' : ''}`}
      {...attributes}
    >
      {/* Drag handle - visible on touch devices */}
      <div
        className="timeline-card-drag-handle"
        {...listeners}
        onClick={(e) => e.stopPropagation()}
      >
        <FaGripVertical />
      </div>

      {/* Card content - click to open */}
      <div className="timeline-card-content" onClick={handleClick}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <h4 className="timeline-card-title" style={{ margin: 0 }}>{useCase.title}</h4>
        </div>

        {useCase.description && (
          <p className="timeline-card-description">{useCase.description}</p>
        )}
      </div>
    </div>
  );
};

export default TimelineCard;
