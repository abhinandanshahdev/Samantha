import React, { useEffect, useState } from 'react';
import { Task, User, TaskInitiativeAssociation, InitiativeTaskAssociation, KanbanStatus } from '../../types';
import { taskAssociationsAPI, taskAPI } from '../../services/apiService';
import { motion } from 'framer-motion';
import CommentThread from '../CommentThread/CommentThread';
import './TaskDetail.css';
import { FaHeart } from 'react-icons/fa';
import { ViewType } from '../../hooks/useHistoryNavigation';

interface TaskDetailProps {
  task: Task;
  onBack: () => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  canEdit: boolean;
  user?: User;
  onInitiativeClick?: (initiativeId: string) => void;
  onTaskClick?: (task: Task) => void;
  previousView?: ViewType;
}

const TaskDetail: React.FC<TaskDetailProps> = ({
  task,
  onBack,
  onEdit,
  onDelete,
  canEdit,
  user,
  onInitiativeClick,
  onTaskClick,
  previousView
}) => {
  const [relatedInitiatives, setRelatedInitiatives] = useState<TaskInitiativeAssociation[]>([]);
  const [siblingTasks, setSiblingTasks] = useState<InitiativeTaskAssociation[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(true);
  const [loadingSiblings, setLoadingSiblings] = useState(true);

  const currentUserId = user?.id || '';
  const currentUserName = user?.name || 'Anonymous';
  const isAdmin = canEdit;

  useEffect(() => {
    const loadRelatedInitiatives = async () => {
      if (task.id) {
        try {
          setLoadingRelated(true);
          const associations = await taskAssociationsAPI.getInitiativesForTask(task.id);
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
  }, [task.id]);

  useEffect(() => {
    const loadSiblingTasks = async () => {
      if (relatedInitiatives.length === 0) {
        setSiblingTasks([]);
        setLoadingSiblings(false);
        return;
      }

      try {
        setLoadingSiblings(true);
        const allTasks: InitiativeTaskAssociation[] = [];

        // Fetch tasks for each related initiative
        for (const initiative of relatedInitiatives) {
          try {
            const tasks = await taskAssociationsAPI.getTasksForInitiative(initiative.use_case_id);
            allTasks.push(...tasks);
          } catch (error) {
            console.error(`Failed to load tasks for initiative ${initiative.use_case_id}:`, error);
          }
        }

        // Remove duplicates and current task
        const uniqueTasks = allTasks.reduce((acc: InitiativeTaskAssociation[], current) => {
          const isDuplicate = acc.some(t => t.task_id === current.task_id);
          const isCurrentTask = current.task_id === task.id;
          if (!isDuplicate && !isCurrentTask) {
            acc.push(current);
          }
          return acc;
        }, []);

        setSiblingTasks(uniqueTasks);
      } catch (error) {
        console.error('Failed to load sibling tasks:', error);
        setSiblingTasks([]);
      } finally {
        setLoadingSiblings(false);
      }
    };

    loadSiblingTasks();
  }, [relatedInitiatives, task.id]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
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
        return '#F59E0B';
      case 'de_prioritised':
        return '#9e9e9e';
      case 'on_hold':
        return '#6366F1';
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

  const getBackButtonText = () => {
    if (previousView === 'dashboard') return '<- Back to Tasks';
    if (previousView === 'roadmap') return '<- Back to Kanban';
    if (previousView === 'roadmap_timeline') return '<- Back to Timeline';
    return '<- Back to Tasks';
  };

  const handleDelete = () => {
    if (window.confirm(`Are you sure you want to delete "${task.title}"?`)) {
      onDelete(task);
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
                onEdit(task);
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
            <h1 className="detail-title">{task.title}</h1>
            <div
              className="detail-status"
              style={{ backgroundColor: getStatusColor(task.status) }}
            >
              {getStatusLabel(task.status)}
            </div>
          </div>

          <div className="detail-meta">
            {(task.owner_name || task.owner_email) && (
              <div className="meta-item">
                <span className="meta-label">Task Owner:</span>
                <span className="meta-value">
                  {task.owner_name}
                  {task.owner_email && ` (${task.owner_email})`}
                </span>
              </div>
            )}
            <div className="meta-item">
              <span className="meta-label">Author:</span>
              <span className="meta-value">{task.author_name}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Strategic Impact:</span>
              <span className="meta-value">{task.strategic_impact}</span>
            </div>
            {task.effort_level && (
              <div className="meta-item">
                <span className="meta-label">Effort Level:</span>
                <span className="meta-value">{task.effort_level}</span>
              </div>
            )}
            {task.expected_delivery_date && (
              <div className="meta-item">
                <span className="meta-label">Expected Delivery:</span>
                <span className="meta-value">{task.expected_delivery_date}</span>
              </div>
            )}
            <div className="meta-item">
              <span className="meta-label">Created:</span>
              <span className="meta-value">{formatDate(task.created_date)}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Last Updated:</span>
              <span className="meta-value">{formatDate(task.updated_date)}</span>
            </div>
          </div>

          <div className="detail-description">
            <h2>Description</h2>
            <p>{task.description}</p>
          </div>

          <div className="detail-section">
            <h2>Problem Statement</h2>
            <p>{task.problem_statement}</p>
          </div>

          <div className="detail-section">
            <h2>Solution Overview</h2>
            <p>{task.solution_overview}</p>
          </div>

          {task.technical_implementation && (
            <div className="detail-section">
              <h2>Technical Implementation</h2>
              <p>{task.technical_implementation}</p>
            </div>
          )}

          {task.results_metrics && (
            <div className="detail-section">
              <h2>Results & Metrics</h2>
              <p>{task.results_metrics}</p>
            </div>
          )}

          {task.lessons_learned && (
            <div className="detail-section">
              <h2>Lessons Learned</h2>
              <p>{task.lessons_learned}</p>
            </div>
          )}

          {task.justification && (
            <div className="detail-section">
              <h2>Strategic Justification</h2>
              <p>{task.justification}</p>
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
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="no-alignments">No related initiatives found.</div>
            )}
          </div>

          <div className="detail-section">
            <h2>Sibling Tasks</h2>
            {loadingSiblings ? (
              <div className="loading-message">Loading sibling tasks...</div>
            ) : siblingTasks.length > 0 ? (
              <div className="related-list-table">
                {siblingTasks.map((taskAssoc, idx) => (
                  <motion.div
                    key={taskAssoc.association_id}
                    className="related-list-row related-list-row--task"
                    initial={{ y: 8, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.03 * idx, duration: 0.2 }}
                    onClick={async () => {
                      if (onTaskClick) {
                        try {
                          const fullTask = await taskAPI.getById(taskAssoc.task_id);
                          onTaskClick(fullTask);
                        } catch (error) {
                          console.error('Failed to load task:', error);
                        }
                      }
                    }}
                  >
                    <div
                      className="related-list-status"
                      style={{ backgroundColor: getStatusColor(taskAssoc.status) }}
                      title={getStatusLabel(taskAssoc.status)}
                    />
                    <div className="related-list-title">{taskAssoc.title}</div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="no-alignments">No sibling tasks found.</div>
            )}
          </div>

        </div>

        <div className="detail-sidebar">
          <CommentThread
            entityId={task.id}
            entityType="task"
            currentUserId={currentUserId}
            currentUserName={currentUserName}
          />
        </div>
      </div>
    </div>
  );
};

export default TaskDetail;
