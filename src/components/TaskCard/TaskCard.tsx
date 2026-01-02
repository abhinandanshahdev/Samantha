import React from 'react';
import { FaBolt, FaEdit, FaTrash, FaHeart, FaComment, FaProjectDiagram } from 'react-icons/fa';
import { Task, KanbanStatus } from '../../types';
import './TaskCard.css';

interface TaskCardProps {
  task: Task;
  onClick: (task: Task) => void;
  onEdit?: (task: Task) => void;
  onDelete?: (id: string) => Promise<void>;
  showActions?: boolean;
  viewMode?: 'grid' | 'list';
  onLike?: (taskId: string) => void;
  isLiked?: boolean;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, onClick, onEdit, onDelete, showActions = false, viewMode = 'grid', onLike, isLiked = false }) => {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusColor = (status: KanbanStatus) => {
    switch (status) {
      case 'intention':
        return '#77787B';
      case 'experimentation':
        return '#9B59B6';
      case 'commitment':
        return '#C68D6D';
      case 'implementation':
        return '#4A90E2';
      case 'integration':
        return '#00A79D';
      case 'blocked':
        return '#E74C3C';
      case 'slow_burner':
        return '#F6BD60';
      case 'de_prioritised':
        return '#9e9e9e';
      case 'on_hold':
        return '#B79546';
      default:
        return '#77787B';
    }
  };

  const getStatusLabel = (status: KanbanStatus) => {
    switch (status) {
      case 'intention':
        return 'Intention';
      case 'experimentation':
        return 'Experimentation';
      case 'commitment':
        return 'Commitment';
      case 'implementation':
        return 'Implementation';
      case 'integration':
        return 'Integration';
      case 'blocked':
        return 'Blocked';
      case 'slow_burner':
        return 'Slow Burner';
      case 'de_prioritised':
        return 'De-prioritised';
      case 'on_hold':
        return 'On Hold';
      default:
        return status;
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

  if (viewMode === 'list') {
    return (
      <div className="table-row" onClick={() => onClick(task)}>
        <div className="table-cell title-col">{task.title}</div>
        <div className="table-cell desc-col">{task.description || 'No description available'}</div>
        <div className="table-cell impact-col">
          <span
            className="metadata-icon tooltip-trigger"
            data-tooltip={`${task.strategic_impact} Impact`}
            onClick={(e) => e.stopPropagation()}
          >
            <FaBolt />
          </span>
        </div>
        <div className="table-cell initiative-col">
          <span
            className="metadata-icon tooltip-trigger"
            data-tooltip={`${task.initiative_count || 0} linked initiatives`}
            onClick={(e) => e.stopPropagation()}
          >
            <FaProjectDiagram />
          </span>
        </div>
        <div className="table-cell status-col">
          <div
            className="status-dot-table tooltip-trigger"
            style={{
              backgroundColor: getStatusColor(task.status)
            }}
            data-tooltip={getStatusLabel(task.status)}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="task-card grid-view"
      onClick={() => onClick(task)}
    >
      {/* Status dot indicator with tooltip */}
      <div
        className="status-dot tooltip-trigger"
        style={{
          backgroundColor: getStatusColor(task.status),
          position: 'absolute',
          top: '12px',
          right: '12px'
        }}
        data-tooltip={getStatusLabel(task.status)}
        onClick={(e) => e.stopPropagation()}
      />

      {/* Action buttons for admin */}
      {showActions && (
        <div className="action-buttons">
          <button
            className="action-btn edit-btn"
            onClick={(e) => {
              e.stopPropagation();
              onEdit?.(task);
            }}
            title="Edit task"
          >
            <FaEdit />
          </button>
          <button
            className="action-btn delete-btn"
            onClick={async (e) => {
              e.stopPropagation();
              if (window.confirm('Are you sure you want to delete this task?')) {
                await onDelete?.(task.id);
              }
            }}
            title="Delete task"
          >
            <FaTrash />
          </button>
        </div>
      )}

      <div className="card-content">
        <div className="card-title">
          {task.title}
        </div>

        <div className="card-description">
          {task.description || 'No description available'}
        </div>

        {/* Footer with metadata and engagement */}
        <div className="card-footer-row">
          {/* Left side - metadata icons */}
          <div className="card-metadata-icons">
            <span
              className="metadata-icon tooltip-trigger"
              data-tooltip={`${task.strategic_impact} Impact`}
              onClick={(e) => e.stopPropagation()}
            >
              <FaBolt />
            </span>
            <span
              className="metadata-icon tooltip-trigger"
              data-tooltip={`${task.initiative_count || 0} linked initiatives`}
              onClick={(e) => e.stopPropagation()}
            >
              <FaProjectDiagram />
            </span>
          </div>

          {/* Right side - social engagement */}
          <div className="card-social-engagement">
            {task.likes_count !== undefined && (
              <span
                className={`engagement-item ${isLiked ? 'liked' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onLike?.(task.id);
                }}
                style={{ cursor: onLike ? 'pointer' : 'default' }}
              >
                <FaHeart className="engagement-icon" />
                <span className="engagement-count">{task.likes_count}</span>
              </span>
            )}
            {task.comments_count !== undefined && (
              <span className="engagement-item">
                <FaComment className="engagement-icon" />
                <span className="engagement-count">{task.comments_count}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskCard;
