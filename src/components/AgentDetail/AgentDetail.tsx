import React, { useEffect, useState } from 'react';
import { Agent, User, AgentInitiativeAssociation, UseCase, InitiativeAgentAssociation } from '../../types';
import { agentAssociationsAPI, agentAPI } from '../../services/apiService';
import { motion } from 'framer-motion';
import CommentThread from '../CommentThread/CommentThread';
import './AgentDetail.css';
import { FaHeart } from 'react-icons/fa';
import { ViewType } from '../../hooks/useHistoryNavigation';

interface AgentDetailProps {
  agent: Agent;
  onBack: () => void;
  onEdit: (agent: Agent) => void;
  onDelete: (agent: Agent) => void;
  canEdit: boolean;
  user?: User;
  onInitiativeClick?: (initiativeId: string) => void;
  onAgentClick?: (agent: Agent) => void;
  previousView?: ViewType;
}

const AgentDetail: React.FC<AgentDetailProps> = ({
  agent,
  onBack,
  onEdit,
  onDelete,
  canEdit,
  user,
  onInitiativeClick,
  onAgentClick,
  previousView
}) => {
  const [relatedInitiatives, setRelatedInitiatives] = useState<AgentInitiativeAssociation[]>([]);
  const [siblingAgents, setSiblingAgents] = useState<InitiativeAgentAssociation[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(true);
  const [loadingSiblings, setLoadingSiblings] = useState(true);

  const currentUserId = user?.id || '';
  const currentUserName = user?.name || 'Anonymous';
  const isAdmin = canEdit;

  useEffect(() => {
    const loadRelatedInitiatives = async () => {
      if (agent.id) {
        try {
          setLoadingRelated(true);
          const associations = await agentAssociationsAPI.getInitiativesForAgent(agent.id);
          setRelatedInitiatives(associations);
        } catch (error) {
          console.error('Failed to load related initiatives:', error);
          setRelatedInitiatives([]);
        } finally {
          setLoadingRelated(false);
        }
      }
    };

    loadRelatedInitiatives();
  }, [agent.id]);

  useEffect(() => {
    const loadSiblingAgents = async () => {
      if (relatedInitiatives.length === 0) {
        setSiblingAgents([]);
        setLoadingSiblings(false);
        return;
      }

      try {
        setLoadingSiblings(true);
        const allAgents: InitiativeAgentAssociation[] = [];

        // Fetch agents for each related initiative
        for (const initiative of relatedInitiatives) {
          try {
            const agents = await agentAssociationsAPI.getAgentsForInitiative(initiative.use_case_id);
            allAgents.push(...agents);
          } catch (error) {
            console.error(`Failed to load agents for initiative ${initiative.use_case_id}:`, error);
          }
        }

        // Remove duplicates and current agent
        const uniqueAgents = allAgents.reduce((acc: InitiativeAgentAssociation[], current) => {
          const isDuplicate = acc.some(agent => agent.agent_id === current.agent_id);
          const isCurrentAgent = current.agent_id === agent.id;
          if (!isDuplicate && !isCurrentAgent) {
            acc.push(current);
          }
          return acc;
        }, []);

        setSiblingAgents(uniqueAgents);
      } catch (error) {
        console.error('Failed to load sibling agents:', error);
        setSiblingAgents([]);
      } finally {
        setLoadingSiblings(false);
      }
    };

    loadSiblingAgents();
  }, [relatedInitiatives, agent.id]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
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

  const getBackButtonText = () => {
    if (previousView === 'dashboard') return '← Back to Agents';
    if (previousView === 'roadmap') return '← Back to Kanban';
    if (previousView === 'roadmap_timeline') return '← Back to Timeline';
    return '← Back to Agents';
  };

  const handleDelete = () => {
    if (window.confirm(`Are you sure you want to delete "${agent.title}"?`)) {
      onDelete(agent);
    }
  };

  return (
    <div className="use-case-detail">
      <div className="detail-header">
        <button
          type="button"
          className="back-button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onBack();
          }}
        >
          {getBackButtonText()}
        </button>

        {isAdmin && (
          <div className="action-buttons">
            <button
              type="button"
              className="edit-button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onEdit(agent);
              }}
            >
              Edit
            </button>
            <button
              type="button"
              className="delete-button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDelete();
              }}
            >
              Delete
            </button>
          </div>
        )}
      </div>

      <div className="detail-content">
        <div className="detail-main">
          <div className="detail-title-section">
            <h1 className="detail-title">{agent.title}</h1>
            <div
              className="detail-status"
              style={{ backgroundColor: getStatusColor(agent.status) }}
            >
              {getStatusLabel(agent.status)}
            </div>
          </div>

          <div className="detail-meta">
            <div className="meta-item">
              <span className="meta-label">Agent Type:</span>
              <span className="meta-value">{agent.agent_type}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Department:</span>
              <span className="meta-value">{agent.department}</span>
            </div>
            {(agent.owner_name || agent.owner_email) && (
              <div className="meta-item">
                <span className="meta-label">Agent Owner:</span>
                <span className="meta-value">
                  {agent.owner_name}
                  {agent.owner_email && ` (${agent.owner_email})`}
                </span>
              </div>
            )}
            <div className="meta-item">
              <span className="meta-label">Author:</span>
              <span className="meta-value">{agent.author_name}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Created:</span>
              <span className="meta-value">{formatDate(agent.created_date)}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Last Updated:</span>
              <span className="meta-value">{formatDate(agent.updated_date)}</span>
            </div>
          </div>

          <div className="detail-description">
            <h2>Description</h2>
            <p>{agent.description}</p>
          </div>

          <div className="detail-section">
            <h2>Problem Statement</h2>
            <p>{agent.problem_statement}</p>
          </div>

          <div className="detail-section">
            <h2>Solution Overview</h2>
            <p>{agent.solution_overview}</p>
          </div>

          {agent.technical_implementation && (
            <div className="detail-section">
              <h2>Technical Implementation</h2>
              <p>{agent.technical_implementation}</p>
            </div>
          )}

          {agent.results_metrics && (
            <div className="detail-section">
              <h2>Results & Metrics</h2>
              <p>{agent.results_metrics}</p>
            </div>
          )}

          {agent.lessons_learned && (
            <div className="detail-section">
              <h2>Lessons Learned</h2>
              <p>{agent.lessons_learned}</p>
            </div>
          )}

          <div className="detail-section">
            <h2>Complexity Analysis</h2>
            <div className="complexity-grid">
              <div className="complexity-item">
                <strong>Data Complexity:</strong> {agent.complexity.data_complexity}
              </div>
              <div className="complexity-item">
                <strong>Integration Complexity:</strong> {agent.complexity.integration_complexity}
              </div>
              <div className="complexity-item">
                <strong>Intelligence Complexity:</strong> {agent.complexity.intelligence_complexity}
              </div>
              <div className="complexity-item">
                <strong>Functional Complexity:</strong> {agent.complexity.functional_complexity}
              </div>
            </div>
          </div>

          {agent.justification && (
            <div className="detail-section">
              <h2>Strategic Impact</h2>
              <div><strong>Impact:</strong> {agent.strategic_impact}</div>
              <div><strong>Justification:</strong> {agent.justification}</div>
            </div>
          )}

          <div className="detail-section">
            <h2>Related Initiatives</h2>
            {loadingRelated ? (
              <div className="loading-message">Loading related initiatives...</div>
            ) : relatedInitiatives.length > 0 ? (
              <div className="related-list-table">
                {relatedInitiatives.map((initiative, idx) => (
                  <motion.div
                    key={initiative.association_id}
                    className="related-list-row"
                    initial={{ y: 8, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.03 * idx, duration: 0.2 }}
                    onClick={() => {
                      if (onInitiativeClick) {
                        onInitiativeClick(initiative.use_case_id);
                      }
                    }}
                  >
                    <div
                      className="related-list-status"
                      style={{ backgroundColor: getStatusColor(initiative.status) }}
                      title={getStatusLabel(initiative.status)}
                    />
                    <div className="related-list-title">{initiative.title}</div>
                    <div className="related-list-badge related-list-badge--category">{initiative.category}</div>
                    <div className="related-list-badge related-list-badge--dept">{initiative.department}</div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="no-alignments">No related initiatives found.</div>
            )}
          </div>

          <div className="detail-section">
            <h2>Sibling Agents</h2>
            {loadingSiblings ? (
              <div className="loading-message">Loading sibling agents...</div>
            ) : siblingAgents.length > 0 ? (
              <div className="related-list-table">
                {siblingAgents.map((agentAssoc, idx) => (
                  <motion.div
                    key={agentAssoc.association_id}
                    className="related-list-row related-list-row--agent"
                    initial={{ y: 8, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.03 * idx, duration: 0.2 }}
                    onClick={async () => {
                      if (onAgentClick) {
                        try {
                          const fullAgent = await agentAPI.getById(agentAssoc.agent_id);
                          onAgentClick(fullAgent);
                        } catch (error) {
                          console.error('Failed to load agent:', error);
                        }
                      }
                    }}
                  >
                    <div
                      className="related-list-status"
                      style={{ backgroundColor: getStatusColor(agentAssoc.status) }}
                      title={getStatusLabel(agentAssoc.status)}
                    />
                    <div className="related-list-title">{agentAssoc.title}</div>
                    <div className="related-list-badge related-list-badge--type">{agentAssoc.agent_type}</div>
                    <div className="related-list-badge related-list-badge--dept">{agentAssoc.department}</div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="no-alignments">No sibling agents found.</div>
            )}
          </div>

        </div>

        <div className="detail-sidebar">
          <CommentThread
            entityId={agent.id}
            entityType="agent"
            currentUserId={currentUserId}
            currentUserName={currentUserName}
          />
        </div>
      </div>
    </div>
  );
};

export default AgentDetail;
