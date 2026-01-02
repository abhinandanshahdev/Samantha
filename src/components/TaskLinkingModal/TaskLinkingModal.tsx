import React, { useState, useEffect } from 'react';
import { FaPlus, FaTimes, FaMagic, FaCheck, FaEdit, FaTrash } from 'react-icons/fa';
import { Sparkles } from 'lucide-react';
import { Task, KanbanStatus } from '../../types';
import { taskAPI, aiAutoCompleteAPI } from '../../services/apiService';
import { useActiveDomainId } from '../../context/DomainContext';
import './TaskLinkingModal.css';

interface TaskLinkingModalProps {
  isOpen: boolean;
  onClose: () => void;
  linkedTasks: Task[];
  onTasksChange: (tasks: Task[]) => void;
  initiativeDescription?: string;
  initiativeTitle?: string;
  ownerName?: string;
  ownerEmail?: string;
  initiativeId?: string;
  isEditingInitiative: boolean;
}

const TaskLinkingModal: React.FC<TaskLinkingModalProps> = ({
  isOpen,
  onClose,
  linkedTasks,
  onTasksChange,
  initiativeDescription,
  initiativeTitle,
  ownerName,
  ownerEmail,
  initiativeId,
  isEditingInitiative
}) => {
  const activeDomainId = useActiveDomainId();
  const [localLinkedTasks, setLocalLinkedTasks] = useState<Task[]>(linkedTasks);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddTasksPanel, setShowAddTasksPanel] = useState(false);
  const [selectedTasksToAdd, setSelectedTasksToAdd] = useState<string[]>([]);
  const [showPromptPanel, setShowPromptPanel] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editedFields, setEditedFields] = useState<Partial<Task>>({});
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const [showAutoGeneratePanel, setShowAutoGeneratePanel] = useState(false);
  const [autoGeneratePrompt, setAutoGeneratePrompt] = useState('');
  const [numberOfTasks, setNumberOfTasks] = useState(3);

  useEffect(() => {
    setLocalLinkedTasks(linkedTasks);
  }, [linkedTasks]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  useEffect(() => {
    const loadAllTasks = async () => {
      if (!activeDomainId) return;
      try {
        const tasks = await taskAPI.getAll({ domain_id: activeDomainId, limit: 1000 });
        setAllTasks(tasks);
      } catch (error) {
        console.error('Failed to load tasks:', error);
      }
    };

    if (isOpen) {
      loadAllTasks();
    }
  }, [isOpen, activeDomainId]);

  const handleAddExistingTasks = () => {
    const tasksToAdd = allTasks.filter(task => selectedTasksToAdd.includes(task.id));
    const updatedTasks = [...localLinkedTasks, ...tasksToAdd];
    setLocalLinkedTasks(updatedTasks);
    onTasksChange(updatedTasks);
    setSelectedTasksToAdd([]);
    setShowAddTasksPanel(false);
  };

  const handleUnlinkTask = (taskId: string) => {
    if (!taskId) {
      console.error('Cannot unlink task: taskId is undefined');
      alert('Error: Cannot unlink task - ID is missing');
      return;
    }

    const updatedTasks = localLinkedTasks.filter(task => task.id !== taskId);
    setLocalLinkedTasks(updatedTasks);
    onTasksChange(updatedTasks);
  };

  const handlePromptTask = async () => {
    if (!promptText.trim()) return;

    if (!isEditingInitiative || !initiativeId) {
      alert('Please save the initiative first before generating tasks. Tasks must be associated with a saved initiative.');
      return;
    }

    setIsGenerating(true);
    try {
      const response = await aiAutoCompleteAPI.generateTaskFromPrompt(promptText, activeDomainId);

      if (response.success && response.data) {
        const newTask: Partial<Task> = {
          id: `temp-${Date.now()}`,
          title: response.data.title || 'New Task',
          description: response.data.description || '',
          status: response.data.status || 'intention',
          problem_statement: response.data.problem_statement || '',
          solution_overview: response.data.solution_overview || '',
          technical_implementation: response.data.technical_implementation || '',
          results_metrics: response.data.results_metrics || '',
          lessons_learned: response.data.lessons_learned || '',
          owner_name: ownerName || '',
          owner_email: ownerEmail || '',
          strategic_impact: response.data.strategic_impact || 'Medium',
          effort_level: response.data.effort_level || 'Medium',
          justification: response.data.justification || '',
          domain_id: activeDomainId || 1,
          created_date: new Date().toISOString(),
          updated_date: new Date().toISOString()
        };

        const updatedTasks = [...localLinkedTasks, newTask as Task];
        setLocalLinkedTasks(updatedTasks);
        onTasksChange(updatedTasks);

        setPromptText('');
        setShowPromptPanel(false);
      } else {
        alert('AI generation did not return valid data. Please try again.');
      }
    } catch (error) {
      console.error('Error generating task:', error);
      alert('Failed to generate task. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAutoGenerateTasks = async () => {
    if (!initiativeDescription && !initiativeTitle) {
      alert('Please provide an initiative title or description first.');
      return;
    }

    if (!isEditingInitiative || !initiativeId) {
      alert('Please save the initiative first before generating tasks. Tasks must be associated with a saved initiative.');
      return;
    }

    setIsAutoGenerating(true);
    try {
      let basePrompt = `Based on this initiative: "${initiativeTitle || ''}\n\n${initiativeDescription || ''}"`;

      if (autoGeneratePrompt.trim()) {
        basePrompt += `\n\nAdditional requirements: ${autoGeneratePrompt}`;
      }

      basePrompt += `\n\nSuggest tasks that would be needed to implement this solution.`;

      const generatedTasks: Task[] = [];

      for (let i = 0; i < numberOfTasks; i++) {
        const response = await aiAutoCompleteAPI.generateTaskFromPrompt(
          `${basePrompt}\n\nGenerate task ${i + 1} of ${numberOfTasks}. Make it unique from the others.`,
          activeDomainId
        );

        if (response.success && response.data) {
          const newTask: Partial<Task> = {
            id: `temp-autogen-${Date.now()}-${i}`,
            title: response.data.title || `Task ${i + 1}`,
            description: response.data.description || '',
            status: response.data.status || 'intention',
            problem_statement: response.data.problem_statement || '',
            solution_overview: response.data.solution_overview || '',
            technical_implementation: response.data.technical_implementation || '',
            results_metrics: response.data.results_metrics || '',
            lessons_learned: response.data.lessons_learned || '',
            owner_name: ownerName || '',
            owner_email: ownerEmail || '',
            strategic_impact: response.data.strategic_impact || 'Medium',
            effort_level: response.data.effort_level || 'Medium',
            justification: response.data.justification || '',
            domain_id: activeDomainId || 1,
            created_date: new Date().toISOString(),
            updated_date: new Date().toISOString()
          };

          generatedTasks.push(newTask as Task);
        }
      }

      const updatedTasks = [...localLinkedTasks, ...generatedTasks];
      setLocalLinkedTasks(updatedTasks);
      onTasksChange(updatedTasks);

      setShowAutoGeneratePanel(false);
      setAutoGeneratePrompt('');
    } catch (error) {
      console.error('Error auto-generating tasks:', error);
      alert('Failed to auto-generate tasks. Please try again.');
    } finally {
      setIsAutoGenerating(false);
    }
  };

  const handleStartEdit = (task: Task) => {
    setEditingTaskId(task.id);
    setEditedFields({
      title: task.title,
      description: task.description,
      status: task.status,
      effort_level: task.effort_level
    });
  };

  const handleSaveEdit = async (taskId: string) => {
    try {
      if (!taskId.startsWith('temp')) {
        const fullTask = localLinkedTasks.find(t => t.id === taskId);
        if (!fullTask) {
          throw new Error('Task not found in local state');
        }

        const fullUpdateData = {
          ...fullTask,
          ...editedFields,
          domain_id: activeDomainId || fullTask.domain_id
        };

        await taskAPI.update(taskId, fullUpdateData);
      }

      const updatedTasks = localLinkedTasks.map(task =>
        task.id === taskId ? { ...task, ...editedFields } : task
      );
      setLocalLinkedTasks(updatedTasks);
      onTasksChange(updatedTasks);

      setEditingTaskId(null);
      setEditedFields({});
    } catch (error: any) {
      console.error('Error saving task:', error);
      alert(`Failed to save task changes: ${error.response?.data?.error || error.response?.data?.message || error.message || 'Unknown error'}`);
    }
  };

  const handleCancelEdit = () => {
    setEditingTaskId(null);
    setEditedFields({});
  };

  const getStatusLabel = (status: KanbanStatus) => {
    switch (status) {
      case 'intention': return 'Intention';
      case 'experimentation': return 'Experimentation';
      case 'commitment': return 'Commitment';
      case 'implementation': return 'Implementation';
      case 'integration': return 'Integration';
      case 'blocked': return 'Blocked';
      case 'slow_burner': return 'Slow Burner';
      case 'de_prioritised': return 'De-prioritised';
      case 'on_hold': return 'On Hold';
      default: return status;
    }
  };

  const filteredAvailableTasks = allTasks.filter(task => {
    const isNotLinked = !localLinkedTasks.some(linked => linked.id === task.id);
    const matchesSearch = task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          task.description?.toLowerCase().includes(searchTerm.toLowerCase());
    return isNotLinked && matchesSearch;
  });

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay">
      <div className="modal-container task-linking-modal">
        <div className="modal-header">
          <h2>Task Design Assistant</h2>
          <button type="button" className="close-button" onClick={onClose}>
            <FaTimes />
          </button>
        </div>

        <div className="modal-body">
          {/* AI-Assisted Actions */}
          <div className="ai-actions-bar">
            <button
              type="button"
              className="ai-action-button prompt-button"
              onClick={() => setShowPromptPanel(!showPromptPanel)}
            >
              <Sparkles size={18} strokeWidth={2} />
              Prompt a Task
            </button>
            <button
              type="button"
              className="ai-action-button autogen-button"
              onClick={() => setShowAutoGeneratePanel(!showAutoGeneratePanel)}
            >
              <FaMagic />
              Autogenerate Tasks
            </button>
            <button
              type="button"
              className="ai-action-button add-existing-button"
              onClick={() => setShowAddTasksPanel(!showAddTasksPanel)}
            >
              <FaPlus />
              Add Existing Tasks
            </button>
          </div>

          {/* Prompt Panel */}
          {showPromptPanel && (
            <div className="prompt-panel slide-in">
              <h3>Describe the Task</h3>
              <textarea
                className="prompt-textarea"
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="e.g., I need a task for organizing the family calendar..."
                rows={4}
              />
              <div className="prompt-actions">
                <button
                  type="button"
                  className="cancel-button"
                  onClick={() => {
                    setShowPromptPanel(false);
                    setPromptText('');
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="generate-button"
                  onClick={handlePromptTask}
                  disabled={!promptText.trim() || isGenerating}
                >
                  {isGenerating ? 'Generating...' : 'Generate Task'}
                </button>
              </div>
            </div>
          )}

          {/* Autogenerate Panel */}
          {showAutoGeneratePanel && (
            <div className="prompt-panel slide-in">
              <h3>Autogenerate Tasks</h3>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500', fontSize: '14px' }}>
                  Number of Tasks
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={numberOfTasks}
                  onChange={(e) => setNumberOfTasks(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}
                />
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500', fontSize: '14px' }}>
                  Custom Prompt (Optional)
                </label>
                <textarea
                  className="prompt-textarea"
                  value={autoGeneratePrompt}
                  onChange={(e) => setAutoGeneratePrompt(e.target.value)}
                  placeholder="e.g., Focus on scheduling and coordination tasks..."
                  rows={4}
                />
              </div>
              <div className="prompt-actions">
                <button
                  type="button"
                  className="cancel-button"
                  onClick={() => {
                    setShowAutoGeneratePanel(false);
                    setAutoGeneratePrompt('');
                    setNumberOfTasks(3);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="generate-button"
                  onClick={handleAutoGenerateTasks}
                  disabled={isAutoGenerating}
                >
                  {isAutoGenerating ? 'Generating...' : `Generate ${numberOfTasks} Task${numberOfTasks !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          )}

          {/* Add Existing Tasks Panel */}
          {showAddTasksPanel && (
            <div className="add-tasks-panel slide-in">
              <h3>Select Existing Tasks</h3>
              <input
                type="text"
                className="search-input"
                placeholder="Search tasks by title..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <div className="tasks-selection-list">
                {filteredAvailableTasks.length === 0 ? (
                  <p className="no-results">No tasks available to add</p>
                ) : (
                  filteredAvailableTasks.map(task => (
                    <label key={task.id} className="task-checkbox-item">
                      <input
                        type="checkbox"
                        checked={selectedTasksToAdd.includes(task.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedTasksToAdd([...selectedTasksToAdd, task.id]);
                          } else {
                            setSelectedTasksToAdd(selectedTasksToAdd.filter(id => id !== task.id));
                          }
                        }}
                      />
                      <div className="task-info">
                        <div className="task-title">{task.title}</div>
                        <div className="task-meta">
                          {getStatusLabel(task.status)} {task.effort_level && `| ${task.effort_level} effort`}
                        </div>
                      </div>
                    </label>
                  ))
                )}
              </div>
              <div className="add-tasks-actions">
                <button
                  type="button"
                  className="cancel-button"
                  onClick={() => {
                    setShowAddTasksPanel(false);
                    setSelectedTasksToAdd([]);
                    setSearchTerm('');
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="add-button"
                  onClick={handleAddExistingTasks}
                  disabled={selectedTasksToAdd.length === 0}
                >
                  Add {selectedTasksToAdd.length} Task{selectedTasksToAdd.length !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          )}

          {/* Linked Tasks Table */}
          <div className="linked-tasks-section">
            <h3>Linked Tasks ({localLinkedTasks.length})</h3>
            <div className={`tasks-table-container ${localLinkedTasks.length === 0 ? 'empty' : ''}`}>
              {localLinkedTasks.length === 0 ? (
                <div className="empty-state">
                  <p>No tasks linked yet. Use the buttons above to add or generate tasks.</p>
                </div>
              ) : (
                <div className="tasks-table-scroll">
                  <table className="tasks-table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Description</th>
                        <th>Status</th>
                        <th>Effort</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {localLinkedTasks.map(task => (
                        <tr key={task.id}>
                          <td>
                            {editingTaskId === task.id ? (
                              <input
                                type="text"
                                value={editedFields.title || ''}
                                onChange={(e) => setEditedFields({ ...editedFields, title: e.target.value })}
                                className="inline-edit-input"
                              />
                            ) : (
                              task.title
                            )}
                          </td>
                          <td>
                            {editingTaskId === task.id ? (
                              <input
                                type="text"
                                value={editedFields.description || ''}
                                onChange={(e) => setEditedFields({ ...editedFields, description: e.target.value })}
                                className="inline-edit-input"
                              />
                            ) : (
                              <div className="description-cell">{task.description}</div>
                            )}
                          </td>
                          <td>
                            {editingTaskId === task.id ? (
                              <select
                                value={editedFields.status || ''}
                                onChange={(e) => setEditedFields({ ...editedFields, status: e.target.value as KanbanStatus })}
                                className="inline-edit-select"
                              >
                                <option value="backlog">Backlog</option>
                                <option value="prioritised">Prioritised</option>
                                <option value="in_progress">In Progress</option>
                                <option value="completed">Completed</option>
                                <option value="blocked">Blocked</option>
                                <option value="slow_burner">Slow Burner</option>
                                <option value="de_prioritised">De-prioritised</option>
                                <option value="on_hold">On Hold</option>
                              </select>
                            ) : (
                              <span className={`status-badge status-${task.status}`}>
                                {getStatusLabel(task.status)}
                              </span>
                            )}
                          </td>
                          <td>
                            {editingTaskId === task.id ? (
                              <select
                                value={editedFields.effort_level || 'Medium'}
                                onChange={(e) => setEditedFields({ ...editedFields, effort_level: e.target.value as any })}
                                className="inline-edit-select"
                              >
                                <option value="Low">Low</option>
                                <option value="Medium">Medium</option>
                                <option value="High">High</option>
                              </select>
                            ) : (
                              task.effort_level || 'Medium'
                            )}
                          </td>
                          <td>
                            <div className="action-links">
                              {editingTaskId === task.id ? (
                                <>
                                  <a
                                    href="#"
                                    className="action-link save-link"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      handleSaveEdit(task.id);
                                    }}
                                  >
                                    Save
                                  </a>
                                  {' | '}
                                  <a
                                    href="#"
                                    className="action-link cancel-link"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      handleCancelEdit();
                                    }}
                                  >
                                    Cancel
                                  </a>
                                </>
                              ) : (
                                <>
                                  <a
                                    href="#"
                                    className="action-link edit-link"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      handleStartEdit(task);
                                    }}
                                  >
                                    Edit
                                  </a>
                                  {' | '}
                                  <a
                                    href="#"
                                    className="action-link delete-link"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handleUnlinkTask(task.id);
                                    }}
                                  >
                                    Unlink
                                  </a>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="secondary-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default TaskLinkingModal;
