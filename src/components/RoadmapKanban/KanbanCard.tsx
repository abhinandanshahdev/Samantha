import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FaBuilding, FaLayerGroup, FaBolt, FaCalendar, FaGripVertical } from 'react-icons/fa';
import { UseCase, Agent } from '../../types';
import './KanbanCard.css';

interface KanbanCardProps {
  useCase: UseCase | Agent;
  onClick: (useCase: UseCase | Agent) => void;
}

const KanbanCard: React.FC<KanbanCardProps> = ({ useCase, onClick }) => {
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'concept':
        return '#77787B'; // Metal Grey
      case 'proof_of_concept':
        return '#C68D6D'; // Earthy Brown
      case 'validation':
        return '#F6BD60'; // Sunset Yellow
      case 'pilot':
        return '#00A79D'; // Sea Green
      case 'production':
        return '#B79546'; // Gold
      default:
        return '#77787B';
    }
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'Low':
        return '#9e9e9e';
      case 'Medium':
        return '#4A90E2';
      case 'High':
        return '#7FCDCD';
      default:
        return '#9e9e9e';
    }
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
      className={`kanban-card ${isDragging ? 'dragging' : ''}`}
      {...attributes}
    >
      {/* Drag handle - visible on touch devices, use this to drag */}
      <div
        className="kanban-card-drag-handle"
        {...listeners}
        onClick={(e) => e.stopPropagation()}
      >
        <FaGripVertical />
      </div>

      {/* Card content - click to open */}
      <div className="kanban-card-content" onClick={handleClick}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <h4 className="kanban-card-title" style={{ margin: 0 }}>{useCase.title}</h4>
        </div>

        {useCase.description && (
          <p className="kanban-card-description">{useCase.description}</p>
        )}
      </div>
    </div>
  );
};

export default KanbanCard;
