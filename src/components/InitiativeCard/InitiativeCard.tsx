import React from 'react';
import { FaCalendar, FaTags, FaLayerGroup, FaBolt, FaTag, FaEdit, FaTrash, FaEllipsisV, FaHeart, FaComment } from 'react-icons/fa';
import { UseCase } from '../../types';
import './InitiativeCard.css';

interface InitiativeCardProps {
  useCase: UseCase;
  onClick: (useCase: UseCase) => void;
  onEdit?: (useCase: UseCase) => void;
  onDelete?: (id: string) => Promise<void>;
  showActions?: boolean;
  viewMode?: 'grid' | 'list';
  onLike?: (useCaseId: string) => void;
  isLiked?: boolean;
}

const InitiativeCard: React.FC<InitiativeCardProps> = ({ useCase, onClick, onEdit, onDelete, showActions = false, viewMode = 'grid', onLike, isLiked = false }) => {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusColor = (status: string) => {
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

  const getStatusLabel = (status: string) => {
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

  const getCategoryColor = (category: string) => {
    // Very subtle golden colors for bottom section
    return '#D4C5A9';
  };

  const getTagColor = (tag: string, index: number) => {
    // Very subtle golden colors for bottom section
    const goldenColors = ['#D4C5A9', '#C9B992', '#D1C2A5', '#CFC0A1', '#D4C5A9', '#C9B992'];
    return goldenColors[index % goldenColors.length];
  };

  const getImpactTagColor = (impact: string) => {
    // Very subtle golden colors for bottom section
    return '#D4C5A9';
  };

  if (viewMode === 'list') {
    return (
      <div className="table-row" onClick={() => onClick(useCase)}>
        <div className="table-cell title-col">{useCase.title}</div>
        <div className="table-cell desc-col">{useCase.description || 'No description available'}</div>
        <div className="table-cell cat-col">
          <span
            className="metadata-icon tooltip-trigger"
            data-tooltip={useCase.category}
            onClick={(e) => e.stopPropagation()}
          >
            <FaLayerGroup />
          </span>
        </div>
        <div className="table-cell impact-col">
          <span
            className="metadata-icon tooltip-trigger"
            data-tooltip={`${useCase.strategic_impact} Impact`}
            onClick={(e) => e.stopPropagation()}
          >
            <FaBolt />
          </span>
        </div>
        <div className="table-cell status-col">
          <div
            className="status-dot-table tooltip-trigger"
            style={{
              backgroundColor: getStatusColor(useCase.status)
            }}
            data-tooltip={getStatusLabel(useCase.status)}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="initiative-card grid-view"
      onClick={() => onClick(useCase)}
    >
      {/* Status dot indicator with tooltip */}
      <div
        className="status-dot tooltip-trigger"
        style={{
          backgroundColor: getStatusColor(useCase.status),
          position: 'absolute',
          top: '12px',
          right: '12px'
        }}
        data-tooltip={getStatusLabel(useCase.status)}
        onClick={(e) => e.stopPropagation()}
      />

      {/* Action buttons for admin */}
      {showActions && (
        <div className="action-buttons">
          <button
            className="action-btn edit-btn"
            onClick={(e) => {
              e.stopPropagation();
              onEdit?.(useCase);
            }}
            title="Edit use case"
          >
            <FaEdit />
          </button>
          <button
            className="action-btn delete-btn"
            onClick={async (e) => {
              e.stopPropagation();
              if (window.confirm('Are you sure you want to delete this use case?')) {
                await onDelete?.(useCase.id);
              }
            }}
            title="Delete use case"
          >
            <FaTrash />
          </button>
        </div>
      )}

      <div className="card-content">
        <div className="card-title">
          {useCase.title}
        </div>

        <div className="card-description">
          {useCase.description || 'No description available'}
        </div>

        {/* Footer with metadata and engagement */}
        <div className="card-footer-row">
          {/* Left side - metadata icons */}
          <div className="card-metadata-icons">
            <span
              className="metadata-icon tooltip-trigger"
              data-tooltip={useCase.category}
              onClick={(e) => e.stopPropagation()}
            >
              <FaLayerGroup />
            </span>
            <span
              className="metadata-icon tooltip-trigger"
              data-tooltip={`${useCase.strategic_impact} Impact`}
              onClick={(e) => e.stopPropagation()}
            >
              <FaBolt />
            </span>
          </div>

          {/* Right side - social engagement */}
          <div className="card-social-engagement">
            {useCase.likes_count !== undefined && (
              <span
                className={`engagement-item ${isLiked ? 'liked' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onLike?.(useCase.id);
                }}
                style={{ cursor: onLike ? 'pointer' : 'default' }}
              >
                <FaHeart className="engagement-icon" />
                <span className="engagement-count">{useCase.likes_count}</span>
              </span>
            )}
            {useCase.comments_count !== undefined && (
              <span className="engagement-item">
                <FaComment className="engagement-icon" />
                <span className="engagement-count">{useCase.comments_count}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InitiativeCard; 