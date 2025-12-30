import React, { useEffect, useState } from 'react';
import { UseCase, UseCaseGoalAlignment, User, UseCaseAssociation, Agent } from '../../types';
import { useCaseAPI, associationsAPI, agentAssociationsAPI, agentAPI } from '../../services/apiService';
import { motion } from 'framer-motion';
import CommentThread from '../CommentThread/CommentThread';
import './InitiativeDetail.css';
// Import stars
import { FaHeart } from 'react-icons/fa';
import { ViewType } from '../../hooks/useHistoryNavigation';

interface InitiativeDetailProps {
  useCase: UseCase;
  onBack: () => void;
  onEdit: (useCase: UseCase) => void;
  onDelete: (useCase: UseCase) => void;
  canEdit: boolean;
  user?: User;
  onUseCaseClick?: (useCase: UseCase) => void;
  onAgentClick?: (agent: Agent) => void;
  previousView?: ViewType;
}

const InitiativeDetail: React.FC<InitiativeDetailProps> = ({
  useCase,
  onBack,
  onEdit,
  onDelete,
  canEdit,
  user,
  onUseCaseClick,
  onAgentClick,
  previousView
}) => {
  const [strategicGoalAlignments, setStrategicGoalAlignments] = useState<UseCaseGoalAlignment[]>([]);
  const [loadingAlignments, setLoadingAlignments] = useState(true);
  const [relatedUseCases, setRelatedUseCases] = useState<UseCaseAssociation[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(true);
  const [relatedAgents, setRelatedAgents] = useState<any[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);

  // Use the user prop passed from parent (App.tsx)
  const currentUserId = user?.id || '';
  const currentUserName = user?.name || 'Anonymous';
  const isAdmin = canEdit; // canEdit is already computed from isAdmin in parent

  // Load strategic goal alignments
  useEffect(() => {
    const loadAlignments = async () => {
      if (useCase.id) {
        try {
          setLoadingAlignments(true);
          const alignments = await useCaseAPI.getAlignments(useCase.id);
          setStrategicGoalAlignments(alignments);
        } catch (error) {
          console.error('Failed to load strategic goal alignments:', error);
          setStrategicGoalAlignments([]);
        } finally {
          setLoadingAlignments(false);
        }
      }
    };

    loadAlignments();
  }, [useCase.id]);

  // Load related use cases
  useEffect(() => {
    const loadRelatedUseCases = async () => {
      if (useCase.id) {
        try {
          setLoadingRelated(true);
          const associations = await associationsAPI.getAll(useCase.id);
          setRelatedUseCases(associations);
        } catch (error) {
          console.error('Failed to load related use cases:', error);
          setRelatedUseCases([]);
        } finally {
          setLoadingRelated(false);
        }
      }
    };

    loadRelatedUseCases();
  }, [useCase.id]);

  // Load related agents
  useEffect(() => {
    const loadRelatedAgents = async () => {
      if (useCase.id) {
        try {
          setLoadingAgents(true);
          const agents = await agentAssociationsAPI.getAgentsForInitiative(useCase.id);
          setRelatedAgents(agents);
        } catch (error) {
          console.error('Failed to load related agents:', error);
          setRelatedAgents([]);
        } finally {
          setLoadingAgents(false);
        }
      }
    };

    loadRelatedAgents();
  }, [useCase.id]);

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
    // Using DoF Secondary Colors (Sea Green, Earthy Brown, Sunset Yellow) + Primary Colors
    switch (status) {
      case 'concept':
        return '#77787B'; // Metal Grey (Primary) - Neutral starting point
      case 'proof_of_concept':
        return '#C68D6D'; // Earthy Brown (Secondary) - Stability/Testing
      case 'validation':
        return '#F6BD60'; // Sunset Yellow (Secondary) - Dependability/Progress
      case 'pilot':
        return '#00A79D'; // Sea Green (Secondary) - Renewal/Active development
      case 'production':
        return '#B79546'; // Gold (Primary) - Wealth/Quality/Achievement
      default:
        return '#77787B'; // Metal Grey (Primary)
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

  const getKanbanStatusColor = (status: string) => {
    switch (status) {
      case 'backlog':
        return '#77787B'; // Metal Grey
      case 'prioritised':
        return '#F6BD60'; // Sunset Yellow
      case 'in_progress':
        return '#00A79D'; // Sea Green
      case 'completed':
        return '#B79546'; // Gold
      case 'blocked':
        return '#dc3545'; // Red
      case 'slow_burner':
        return '#C68D6D'; // Earthy Brown
      case 'de_prioritised':
        return '#6c757d'; // Grey
      case 'on_hold':
        return '#ffc107'; // Amber
      default:
        return '#77787B';
    }
  };

  const getKanbanStatusLabel = (status: string) => {
    switch (status) {
      case 'backlog':
        return 'Backlog';
      case 'prioritised':
        return 'Prioritised';
      case 'in_progress':
        return 'In Progress';
      case 'completed':
        return 'Completed';
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

  const getBackButtonText = () => {
    switch (previousView) {
      case 'roadmap':
        return '← Back to Kanban';
      case 'roadmap_timeline':
        return '← Back to Timeline';
      case 'dashboard':
        return '← Back to Initiatives';
      default:
        return '← Back to Initiatives';
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
        
        {canEdit && (
          <div className="action-buttons">
            <button 
              type="button"
              className="edit-button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onEdit(useCase);
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
                onDelete(useCase);
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
            <h1 className="detail-title">{useCase.title}</h1>
            <div 
              className="detail-status"
              style={{ backgroundColor: getStatusColor(useCase.status) }}
            >
              {getStatusLabel(useCase.status)}
            </div>
          </div>

          <div className="detail-meta">
            <div className="meta-item">
              <span className="meta-label">Category:</span>
              <span className="meta-value">{useCase.category}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Department:</span>
              <span className="meta-value">{useCase.department}</span>
            </div>
            {(useCase.owner_name || useCase.owner_email) && (
              <div className="meta-item">
                <span className="meta-label">Initiative Owner:</span>
                <span className="meta-value">
                  {useCase.owner_name}
                  {useCase.owner_email && (
                    <> (<a href={`mailto:${useCase.owner_email}`}>{useCase.owner_email}</a>)</>
                  )}
                </span>
              </div>
            )}
            <div className="meta-item">
              <span className="meta-label">Created By:</span>
              <span className="meta-value">{useCase.author_name}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Created:</span>
              <span className="meta-value">{formatDate(useCase.created_date)}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Updated:</span>
              <span className="meta-value">{formatDate(useCase.updated_date)}</span>
            </div>
            {useCase.likes_count !== undefined && (
              <div className="meta-item">
                <span className="meta-label">Likes:</span>
                <span className="meta-value likes-count">
                  <FaHeart className="like-icon" /> {useCase.likes_count}
                </span>
              </div>
            )}
          </div>

          {/* Delivery Information Section */}
          {(useCase.kanban_pillar || useCase.expected_delivery_date) && (
            <div className="detail-section delivery-info-section">
              <h2>Delivery Information</h2>
              <div className="delivery-info-grid">
                {useCase.kanban_pillar && (
                  <div className="delivery-info-item">
                    <span className="meta-label">Delivery Status:</span>
                    <span
                      className="kanban-status-badge"
                      style={{ backgroundColor: getKanbanStatusColor(useCase.kanban_pillar) }}
                    >
                      {getKanbanStatusLabel(useCase.kanban_pillar)}
                    </span>
                  </div>
                )}
                {useCase.expected_delivery_date && (
                  <div className="delivery-info-item">
                    <span className="meta-label">Expected Delivery:</span>
                    <span className="meta-value">{useCase.expected_delivery_date}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="detail-description">
            <h2>Description</h2>
            <p>{useCase.description}</p>
          </div>

          <div className="detail-section">
            <h2>Problem Statement</h2>
            <p>{useCase.problem_statement}</p>
          </div>

          <div className="detail-section">
            <h2>Solution Overview</h2>
            <p>{useCase.solution_overview}</p>
          </div>

          {useCase.results_metrics && (
            <div className="detail-section">
              <h2>Results & Metrics</h2>
              <p>{useCase.results_metrics}</p>
            </div>
          )}

          {useCase.lessons_learned && (
            <div className="detail-section">
              <h2>Lessons Learned</h2>
              <p>{useCase.lessons_learned}</p>
            </div>
          )}

          {useCase.technical_implementation && (
            <div className="detail-section">
              <h2>Technical Implementation</h2>
              <p>{useCase.technical_implementation}</p>
            </div>
          )}

          <div className="detail-section">
            <h2>Strategic Impact</h2>
            <div><strong>Impact:</strong> {useCase.strategic_impact}</div>
            {useCase.justification && (
              <div><strong>Justification:</strong> {useCase.justification}</div>
            )}
          </div>

          {/* Strategic Goal Alignments Section */}
          <div className="detail-section">
            <h2>Strategic Goal Alignments</h2>
            {loadingAlignments ? (
              <div className="loading-message">Loading strategic goal alignments...</div>
            ) : strategicGoalAlignments.length > 0 ? (
              <div className="strategic-alignments">
                {strategicGoalAlignments.map((alignment, index) => (
                  <div key={index} className="alignment-item">
                    <div className="alignment-header">
                      <h3 className="goal-title">{alignment.goal_title}</h3>
                      <span className={`alignment-strength ${alignment.alignment_strength.toLowerCase()}`}>
                        {alignment.alignment_strength}
                      </span>
                    </div>
                    <p className="goal-description">{alignment.goal_description}</p>
                    {alignment.rationale && (
                      <div className="alignment-rationale">
                        <strong>Rationale:</strong> {alignment.rationale}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-alignments">No strategic goal alignments found for this use case.</div>
            )}
          </div>

          {/* Related Use Cases Section */}
          <div className="detail-section">
            <h2>Related Initiatives</h2>
            {loadingRelated ? (
              <div className="loading-message">Loading related initiatives...</div>
            ) : relatedUseCases.length > 0 ? (
              <div className="related-list-table">
                {relatedUseCases.map((association, idx) => (
                  <motion.div
                    key={association.association_id}
                    className="related-list-row"
                    initial={{ y: 8, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.03 * idx, duration: 0.2 }}
                    onClick={() => {
                      if (onUseCaseClick) {
                        const relatedUseCase: UseCase = {
                          id: association.use_case_id,
                          title: association.title,
                          description: association.description,
                          status: association.status as any,
                          category: association.category,
                          department: association.department
                        } as UseCase;
                        onUseCaseClick(relatedUseCase);
                      }
                    }}
                  >
                    <div
                      className="related-list-status"
                      style={{ backgroundColor: getStatusColor(association.status) }}
                      title={getStatusLabel(association.status)}
                    />
                    <div className="related-list-title">{association.title}</div>
                    <div className="related-list-badge related-list-badge--category">{association.category}</div>
                    <div className="related-list-badge related-list-badge--dept">{association.department}</div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="no-alignments">No related initiatives found.</div>
            )}
          </div>

          {/* Related Agents Section */}
          <div className="detail-section">
            <h2>Related Agents</h2>
            {loadingAgents ? (
              <div className="loading-message">Loading related agents...</div>
            ) : relatedAgents.length > 0 ? (
              <div className="related-list-table">
                {relatedAgents.map((agent, idx) => (
                  <motion.div
                    key={agent.agent_id}
                    className="related-list-row related-list-row--agent"
                    initial={{ y: 8, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.03 * idx, duration: 0.2 }}
                    onClick={async () => {
                      if (onAgentClick) {
                        try {
                          const fullAgent = await agentAPI.getById(agent.agent_id);
                          onAgentClick(fullAgent);
                        } catch (error) {
                          console.error('Failed to load agent:', error);
                        }
                      }
                    }}
                    style={{ cursor: onAgentClick ? 'pointer' : 'default' }}
                  >
                    <div
                      className="related-list-status"
                      style={{ backgroundColor: agent.status ? getStatusColor(agent.status) : '#77787B' }}
                      title={agent.status ? getStatusLabel(agent.status) : 'Unknown'}
                    />
                    <div className="related-list-title">{agent.title}</div>
                    <div className="related-list-badge related-list-badge--type">{agent.agent_type}</div>
                    <div className="related-list-badge related-list-badge--dept">{agent.department}</div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="no-alignments">No related agents found.</div>
            )}
          </div>

          {useCase.complexity && (
            <div className="detail-section">
              <h2>Complexity Analysis</h2>
              <div className="complexity-grid">
                <div className="complexity-item">
                  <strong>Data Complexity:</strong> {useCase.complexity.data_complexity}
                </div>
                <div className="complexity-item">
                  <strong>Integration Complexity:</strong> {useCase.complexity.integration_complexity}
                </div>
                <div className="complexity-item">
                  <strong>Intelligence Complexity:</strong> {useCase.complexity.intelligence_complexity}
                </div>
                <div className="complexity-item">
                  <strong>Functional Complexity:</strong> {useCase.complexity.functional_complexity}
                </div>
              </div>
            </div>
          )}

          {(useCase.tags && useCase.tags.length > 0) || (useCase.attachments && useCase.attachments.length > 0) ? (
            <div className="detail-section">
              <h2>Additional Information</h2>
              {useCase.tags && useCase.tags.length > 0 && (
                <div className="meta-item">
                  <span className="meta-label">Tags:</span>
                  <div className="tags-container">
                    {useCase.tags.map((tag, index) => (
                      <span key={index} className="tag">{tag}</span>
                    ))}
                  </div>
                </div>
              )}
              {useCase.attachments && useCase.attachments.length > 0 && (
                <div className="meta-item">
                  <span className="meta-label">Attachments:</span>
                  <div className="attachments-container">
                    {useCase.attachments.map((attachment, index) => (
                      <span key={index} className="attachment">{attachment}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* Comments Section */}
          {currentUserId ? (
            <CommentThread
              useCaseId={useCase.id}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              isAdmin={isAdmin}
            />
          ) : (
            <div style={{ padding: '1.5rem', background: 'white', borderRadius: '8px', marginTop: '2rem' }}>
              <p>Please log in to view and post comments.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default InitiativeDetail; 