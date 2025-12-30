import React from 'react';
import { FaBuilding, FaBolt, FaEdit, FaTrash, FaHeart, FaComment, FaMicrochip, FaProjectDiagram } from 'react-icons/fa';
import { Agent } from '../../types';
import './AgentCard.css';

interface AgentCardProps {
  agent: Agent;
  onClick: (agent: Agent) => void;
  onEdit?: (agent: Agent) => void;
  onDelete?: (id: string) => Promise<void>;
  showActions?: boolean;
  viewMode?: 'grid' | 'list';
  onLike?: (agentId: string) => void;
  isLiked?: boolean;
}

const AgentCard: React.FC<AgentCardProps> = ({ agent, onClick, onEdit, onDelete, showActions = false, viewMode = 'grid', onLike, isLiked = false }) => {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'concept':
        return '#77787B';
      case 'proof_of_concept':
        return '#C68D6D';
      case 'validation':
        return '#F6BD60';
      case 'pilot':
        return '#00A79D';
      case 'production':
        return '#B79546';
      default:
        return '#77787B';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'concept':
        return 'Concept';
      case 'proof_of_concept':
        return 'Proof of Concept';
      case 'validation':
        return 'Validation';
      case 'pilot':
        return 'Pilot';
      case 'production':
        return 'Production';
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
      <div className="table-row" onClick={() => onClick(agent)}>
        <div className="table-cell title-col">{agent.title}</div>
        <div className="table-cell desc-col">{agent.description || 'No description available'}</div>
        <div className="table-cell dept-col">
          <span
            className="metadata-icon tooltip-trigger"
            data-tooltip={agent.department}
            onClick={(e) => e.stopPropagation()}
          >
            <FaBuilding />
          </span>
        </div>
        <div className="table-cell cat-col">
          <span
            className="metadata-icon tooltip-trigger"
            data-tooltip={agent.agent_type}
            onClick={(e) => e.stopPropagation()}
          >
            <FaMicrochip />
          </span>
        </div>
        <div className="table-cell impact-col">
          <span
            className="metadata-icon tooltip-trigger"
            data-tooltip={`${agent.strategic_impact} Impact`}
            onClick={(e) => e.stopPropagation()}
          >
            <FaBolt />
          </span>
        </div>
        <div className="table-cell status-col">
          <div
            className="status-dot-table tooltip-trigger"
            style={{
              backgroundColor: getStatusColor(agent.status)
            }}
            data-tooltip={getStatusLabel(agent.status)}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="agent-card grid-view"
      onClick={() => onClick(agent)}
    >
      {/* Status dot indicator with tooltip */}
      <div
        className="status-dot tooltip-trigger"
        style={{
          backgroundColor: getStatusColor(agent.status),
          position: 'absolute',
          top: '12px',
          right: '12px'
        }}
        data-tooltip={getStatusLabel(agent.status)}
        onClick={(e) => e.stopPropagation()}
      />

      {/* Action buttons for admin */}
      {showActions && (
        <div className="action-buttons">
          <button
            className="action-btn edit-btn"
            onClick={(e) => {
              e.stopPropagation();
              onEdit?.(agent);
            }}
            title="Edit agent"
          >
            <FaEdit />
          </button>
          <button
            className="action-btn delete-btn"
            onClick={async (e) => {
              e.stopPropagation();
              if (window.confirm('Are you sure you want to delete this agent?')) {
                await onDelete?.(agent.id);
              }
            }}
            title="Delete agent"
          >
            <FaTrash />
          </button>
        </div>
      )}

      <div className="card-content">
        <div className="card-title">
          {agent.title}
        </div>

        <div className="card-description">
          {agent.description || 'No description available'}
        </div>

        {/* Footer with metadata and engagement */}
        <div className="card-footer-row">
          {/* Left side - metadata icons */}
          <div className="card-metadata-icons">
            <span
              className="metadata-icon tooltip-trigger"
              data-tooltip={agent.department}
              onClick={(e) => e.stopPropagation()}
            >
              <FaBuilding />
            </span>
            <span
              className="metadata-icon tooltip-trigger"
              data-tooltip={agent.agent_type}
              onClick={(e) => e.stopPropagation()}
            >
              <FaMicrochip />
            </span>
          </div>

          {/* Right side - social engagement */}
          <div className="card-social-engagement">
            {agent.likes_count !== undefined && (
              <span
                className={`engagement-item ${isLiked ? 'liked' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onLike?.(agent.id);
                }}
                style={{ cursor: onLike ? 'pointer' : 'default' }}
              >
                <FaHeart className="engagement-icon" />
                <span className="engagement-count">{agent.likes_count}</span>
              </span>
            )}
            {agent.comments_count !== undefined && (
              <span className="engagement-item">
                <FaComment className="engagement-icon" />
                <span className="engagement-count">{agent.comments_count}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentCard;
