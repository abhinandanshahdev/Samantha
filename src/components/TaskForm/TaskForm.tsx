import React, { useState, useEffect } from 'react';
import { FaMagic, FaLightbulb } from 'react-icons/fa';
import { Task, UseCase, KanbanStatus, EffortLevel } from '../../types';
import { taskAPI, useCaseAPI, aiAutoCompleteAPI } from '../../services/apiService';
import { useActiveDomainId } from '../../context/DomainContext';
import './TaskForm.css';

interface TaskFormProps {
  task?: Task;
  onSave: (task: Task) => void;
  onCancel: () => void;
  isEdit?: boolean;
  user?: any;
}

const TaskForm: React.FC<TaskFormProps> = ({ task, onSave, onCancel, isEdit = false, user }) => {
  const activeDomainId = useActiveDomainId();
  const [formData, setFormData] = useState({
    title: task?.title || '',
    description: task?.description || '',
    problem_statement: task?.problem_statement || '',
    solution_overview: task?.solution_overview || '',
    technical_implementation: task?.technical_implementation || '',
    results_metrics: task?.results_metrics || '',
    status: task?.status || 'intention' as KanbanStatus,
    owner_name: task?.owner_name || user?.name || '',
    owner_email: task?.owner_email || user?.email || '',
    strategic_impact: task?.strategic_impact || 'Medium' as const,
    effort_level: task?.effort_level || 'Medium' as EffortLevel,
    justification: task?.justification || '',
    expected_delivery_date: task?.expected_delivery_date || '',
    roadmap_link: task?.roadmap_link || '',
    value_realisation_link: task?.value_realisation_link || '',
    domain_id: activeDomainId || 1
  });

  const [initiatives, setInitiatives] = useState<UseCase[]>([]);
  const [selectedInitiatives, setSelectedInitiatives] = useState<string[]>([]);
  const [initiativeSearchTerm, setInitiativeSearchTerm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showGenerativeInterface, setShowGenerativeInterface] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const initiativesData = await useCaseAPI.getAll({ domain_id: activeDomainId || undefined });
        setInitiatives(initiativesData);

        // Load linked initiatives if editing
        if (isEdit && task?.id) {
          const taskData = await taskAPI.getById(task.id);
          if (taskData.linked_initiatives) {
            setSelectedInitiatives(taskData.linked_initiatives);
          }
        }
      } catch (error) {
        console.error('Error loading form data:', error);
      }
    };

    if (activeDomainId) {
      loadData();
    }
  }, [activeDomainId, isEdit, task?.id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleInitiativeToggle = (initiativeId: string) => {
    setSelectedInitiatives(prev =>
      prev.includes(initiativeId)
        ? prev.filter(id => id !== initiativeId)
        : [...prev, initiativeId]
    );
  };

  const generateFromPrompt = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);

    try {
      const response = await aiAutoCompleteAPI.generateTaskFromPrompt(prompt, activeDomainId);

      if (response.success && response.data) {
        const newFormData = {
          ...formData,
          ...response.data,
          owner_name: user?.name || formData.owner_name,
          owner_email: user?.email || formData.owner_email
        };

        setFormData(newFormData);

        setShowGenerativeInterface(false);
        setPrompt('');
      } else {
        throw new Error(response.error || 'Invalid response from server');
      }
    } catch (error) {
      console.error('Error generating from prompt:', error);
      alert('Failed to generate form fields. Please try again or fill the form manually.');
    } finally {
      setIsGenerating(false);
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) newErrors.title = 'Title is required';
    if (!formData.description.trim()) newErrors.description = 'Description is required';
    if (!formData.problem_statement.trim()) newErrors.problem_statement = 'Problem statement is required';
    if (!formData.solution_overview.trim()) newErrors.solution_overview = 'Solution overview is required';
    if (!formData.status) newErrors.status = 'Status is required';

    // Only require initiatives when creating, not when editing
    if (!isEdit && selectedInitiatives.length === 0) {
      newErrors.selectedInitiatives = 'At least one initiative must be linked';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      setTimeout(() => {
        const firstErrorField = Object.keys(errors)[0];
        const element =
          document.getElementById(firstErrorField) ||
          document.querySelector(`[name="${firstErrorField}"]`) ||
          document.querySelector('.error') ||
          document.querySelector('.error-message');

        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (element instanceof HTMLInputElement ||
              element instanceof HTMLSelectElement ||
              element instanceof HTMLTextAreaElement) {
            element.focus();
          }
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }, 100);
      return;
    }

    setIsSubmitting(true);

    try {
      if (isEdit && task) {
        await taskAPI.update(task.id, { ...formData, selectedInitiatives });
        onSave({ ...task, ...formData });
      } else {
        const result = await taskAPI.create({ ...formData, selectedInitiatives });
        const createdTask = await taskAPI.getById(result.id);
        onSave(createdTask);
      }
    } catch (error) {
      console.error('Error saving task:', error);
      alert('Failed to save task. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
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

  return (
    <div className="task-form-container">
      <div className="form-header">
        <h1>{isEdit ? 'Edit Task' : 'Create New Task'}</h1>
        <button
          type="button"
          className="cancel-button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }}
        >
          X Cancel
        </button>
      </div>

      {!isEdit && (
        <div className="generative-interface">
          <button
            className="generative-toggle"
            onClick={() => setShowGenerativeInterface(!showGenerativeInterface)}
          >
            <FaMagic />
            {showGenerativeInterface ? 'Hide AI Assistant' : 'Use AI Assistant'}
          </button>

          {showGenerativeInterface && (
            <div className="prompt-section">
              <div className="prompt-header">
                <FaLightbulb />
                <h3>Describe your task</h3>
              </div>
              <p>Tell us about your task and we'll help you fill out the form:</p>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g., I need to organize the family calendar for the upcoming school year, track all activities, and coordinate schedules..."
                rows={4}
                className="prompt-input"
              />
              <button
                className="generate-button"
                onClick={generateFromPrompt}
                disabled={!prompt.trim() || isGenerating}
              >
                {isGenerating ? 'Generating...' : 'Generate Form Fields'}
              </button>
            </div>
          )}
        </div>
      )}

      <form id="task-form" className="task-form" onSubmit={handleSubmit}>
        <div className="form-section">
          <h2>Required Information</h2>

          <div className="form-group">
            <label htmlFor="title">
              Task Title <span className="required-indicator">*</span>
            </label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleChange}
              className={errors.title ? 'error' : ''}
              placeholder="Enter task title"
            />
            {errors.title && <span className="error-message">{errors.title}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="description">
              Description <span className="required-indicator">*</span>
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              className={errors.description ? 'error' : ''}
              placeholder="Describe the task's purpose and scope"
              rows={4}
            />
            {errors.description && <span className="error-message">{errors.description}</span>}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="status">
                Status <span className="required-indicator">*</span>
              </label>
              <select
                id="status"
                name="status"
                value={formData.status}
                onChange={handleChange}
                className={errors.status ? 'error' : ''}
              >
                <option value="intention">{getStatusLabel('intention')}</option>
                <option value="experimentation">{getStatusLabel('experimentation')}</option>
                <option value="commitment">{getStatusLabel('commitment')}</option>
                <option value="implementation">{getStatusLabel('implementation')}</option>
                <option value="integration">{getStatusLabel('integration')}</option>
                <option value="blocked">{getStatusLabel('blocked')}</option>
                <option value="slow_burner">{getStatusLabel('slow_burner')}</option>
                <option value="de_prioritised">{getStatusLabel('de_prioritised')}</option>
                <option value="on_hold">{getStatusLabel('on_hold')}</option>
              </select>
              {errors.status && <span className="error-message">{errors.status}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="effort_level">Effort Level</label>
              <select
                id="effort_level"
                name="effort_level"
                value={formData.effort_level}
                onChange={handleChange}
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="expected_delivery_date">Expected Delivery Date</label>
              <input
                type="date"
                id="expected_delivery_date"
                name="expected_delivery_date"
                value={formData.expected_delivery_date}
                onChange={handleChange}
              />
            </div>

            <div className="form-group">
              <label htmlFor="roadmap_link">Link to Roadmap (Optional)</label>
              <input
                type="text"
                id="roadmap_link"
                name="roadmap_link"
                value={formData.roadmap_link}
                onChange={handleChange}
                placeholder="e.g., https://example.com/roadmap"
              />
              <small className="form-help-text">URL or hyperlink to the roadmap</small>
            </div>

            <div className="form-group">
              <label htmlFor="value_realisation_link">Link to Value Realisation (Optional)</label>
              <input
                type="text"
                id="value_realisation_link"
                name="value_realisation_link"
                value={formData.value_realisation_link}
                onChange={handleChange}
                placeholder="e.g., https://example.com/value-realisation"
              />
              <small className="form-help-text">URL or hyperlink to value realisation details</small>
            </div>
          </div>
        </div>

        <div className="form-section">
          <h2>Problem & Solution</h2>

          <div className="form-group">
            <label htmlFor="problem_statement">
              Problem Statement <span className="required-indicator">*</span>
            </label>
            <textarea
              id="problem_statement"
              name="problem_statement"
              value={formData.problem_statement}
              onChange={handleChange}
              className={errors.problem_statement ? 'error' : ''}
              placeholder="What problem does this task solve?"
              rows={4}
            />
            {errors.problem_statement && <span className="error-message">{errors.problem_statement}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="solution_overview">
              Solution Overview <span className="required-indicator">*</span>
            </label>
            <textarea
              id="solution_overview"
              name="solution_overview"
              value={formData.solution_overview}
              onChange={handleChange}
              className={errors.solution_overview ? 'error' : ''}
              placeholder="How does this task address the problem?"
              rows={4}
            />
            {errors.solution_overview && <span className="error-message">{errors.solution_overview}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="technical_implementation">Technical Implementation</label>
            <textarea
              id="technical_implementation"
              name="technical_implementation"
              value={formData.technical_implementation}
              onChange={handleChange}
              placeholder="Technical details and implementation approach"
              rows={4}
            />
          </div>
        </div>

        <div className="form-section">
          <h2>Strategic Impact</h2>
          <div className="form-group">
            <label htmlFor="strategic_impact">
              Strategic Impact <span className="required-indicator">*</span>
            </label>
            <select
              id="strategic_impact"
              value={formData.strategic_impact}
              onChange={handleChange}
              name="strategic_impact"
              className={errors.strategic_impact ? 'error' : ''}
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
            {errors.strategic_impact && <span className="error-message">{errors.strategic_impact}</span>}
          </div>
          <div className="form-group">
            <label htmlFor="justification">Justification</label>
            <textarea
              id="justification"
              name="justification"
              value={formData.justification}
              onChange={handleChange}
              placeholder="Justify the strategic impact rating"
              rows={3}
            />
          </div>
        </div>

        <div className="form-section">
          <h2>Linked Initiatives</h2>
          <p className="section-description">
            Select initiatives that this task implements or supports {!isEdit && <span className="required-indicator">*</span>}
          </p>
          {errors.selectedInitiatives && <span className="error-message">{errors.selectedInitiatives}</span>}

          <div className="related-use-cases-create">
            <input
              type="text"
              className="search-input"
              placeholder="Search for initiatives to link..."
              value={initiativeSearchTerm}
              onChange={(e) => setInitiativeSearchTerm(e.target.value)}
            />

            <div className="use-cases-list">
              {initiatives
                .filter(initiative =>
                  initiative.title.toLowerCase().includes(initiativeSearchTerm.toLowerCase()) ||
                  initiative.description?.toLowerCase().includes(initiativeSearchTerm.toLowerCase()) ||
                  initiative.category?.toLowerCase().includes(initiativeSearchTerm.toLowerCase())
                )
                .slice(0, 10)
                .map(initiative => (
                  <label key={initiative.id} className="use-case-checkbox-item">
                    <input
                      type="checkbox"
                      checked={selectedInitiatives.includes(initiative.id)}
                      onChange={() => handleInitiativeToggle(initiative.id)}
                    />
                    <div className="use-case-info">
                      <div className="use-case-title">{initiative.title}</div>
                      <div className="use-case-meta">
                        {initiative.category}
                      </div>
                    </div>
                  </label>
                ))}

              {initiatives.filter(initiative =>
                initiative.title.toLowerCase().includes(initiativeSearchTerm.toLowerCase()) ||
                initiative.description?.toLowerCase().includes(initiativeSearchTerm.toLowerCase()) ||
                initiative.category?.toLowerCase().includes(initiativeSearchTerm.toLowerCase())
              ).length === 0 && (
                <p className="no-results">
                  {initiativeSearchTerm ? 'No matching initiatives found' : 'No initiatives available'}
                </p>
              )}
            </div>

            {selectedInitiatives.length > 0 && (
              <div className="selected-count">
                {selectedInitiatives.length} initiative(s) selected
              </div>
            )}
          </div>
        </div>

        <div className="form-section">
          <h2>Additional Information</h2>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="owner_name">Owner Name</label>
              <input
                type="text"
                id="owner_name"
                name="owner_name"
                value={formData.owner_name}
                onChange={handleChange}
                placeholder="Enter owner name"
              />
            </div>

            <div className="form-group">
              <label htmlFor="owner_email">Owner Email</label>
              <input
                type="email"
                id="owner_email"
                name="owner_email"
                value={formData.owner_email}
                onChange={handleChange}
                placeholder="Enter owner email"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="results_metrics">Results & Metrics</label>
            <textarea
              id="results_metrics"
              name="results_metrics"
              value={formData.results_metrics}
              onChange={handleChange}
              placeholder="Key results and performance metrics"
              rows={3}
            />
          </div>
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="cancel-button"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button type="submit" className="save-button" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : (isEdit ? 'Update Task' : 'Create Task')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default TaskForm;
