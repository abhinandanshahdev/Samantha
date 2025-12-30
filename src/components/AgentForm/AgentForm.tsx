import React, { useState, useEffect } from 'react';
import { FaMagic, FaLightbulb } from 'react-icons/fa';
import { Agent, AgentType, Department, UseCase } from '../../types';
import { agentAPI, agentTypeAPI, departmentAPI, useCaseAPI, aiAutoCompleteAPI, dataSensitivityLevelsAPI } from '../../services/apiService';
import { useActiveDomainId } from '../../context/DomainContext';
import './AgentForm.css';

interface AgentFormProps {
  agent?: Agent;
  onSave: (agent: Agent) => void;
  onCancel: () => void;
  isEdit?: boolean;
  user?: any;
}

const AgentForm: React.FC<AgentFormProps> = ({ agent, onSave, onCancel, isEdit = false, user }) => {
  const activeDomainId = useActiveDomainId();
  const [formData, setFormData] = useState({
    title: agent?.title || '',
    description: agent?.description || '',
    problem_statement: agent?.problem_statement || '',
    solution_overview: agent?.solution_overview || '',
    technical_implementation: agent?.technical_implementation || '',
    results_metrics: agent?.results_metrics || '',
    agent_type: agent?.agent_type || '',
    status: agent?.status || 'concept' as const,
    department: agent?.department || '',
    owner_name: agent?.owner_name || user?.name || '',
    owner_email: agent?.owner_email || user?.email || '',
    strategic_impact: agent?.strategic_impact || 'Medium' as const,
    complexity: agent?.complexity || {
      data_complexity: 'Medium' as const,
      integration_complexity: 'Medium' as const,
      intelligence_complexity: 'Medium' as const,
      functional_complexity: 'Medium' as const
    },
    justification: agent?.justification || '',
    kanban_pillar: agent?.kanban_pillar || 'backlog' as const,
    expected_delivery_date: agent?.expected_delivery_date || '',
    data_sensitivity: agent?.data_sensitivity || 'Public',
    roadmap_link: agent?.roadmap_link || '',
    value_realisation_link: agent?.value_realisation_link || '',
    domain_id: activeDomainId || 1
  });

  const [agentTypes, setAgentTypes] = useState<AgentType[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [initiatives, setInitiatives] = useState<UseCase[]>([]);
  const [dataSensitivityLevels, setDataSensitivityLevels] = useState<Array<{ name: string; description: string }>>([]);
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
        const [typesData, deptsData, initiativesData, dataSensitivityData] = await Promise.all([
          agentTypeAPI.getAll(activeDomainId || undefined),
          departmentAPI.getAll(activeDomainId || undefined),
          useCaseAPI.getAll({ domain_id: activeDomainId || undefined }),
          dataSensitivityLevelsAPI.getAll()
        ]);
        console.log('📦 Loaded agent types:', typesData.map(t => t.name));
        console.log('📦 Loaded departments:', deptsData.map(d => d.name));
        setAgentTypes(typesData);
        setDepartments(deptsData);
        setInitiatives(initiativesData);
        setDataSensitivityLevels(dataSensitivityData.map(level => ({
          name: level.name,
          description: level.description
        })));

        // Load linked initiatives if editing
        if (isEdit && agent?.id) {
          const agentData = await agentAPI.getById(agent.id);
          if (agentData.linked_initiatives) {
            setSelectedInitiatives(agentData.linked_initiatives);
            console.log('📦 Loaded linked initiatives:', agentData.linked_initiatives);
          }
        }
      } catch (error) {
        console.error('Error loading form data:', error);
      }
    };

    if (activeDomainId) {
      loadData();
    }
  }, [activeDomainId, isEdit, agent?.id]);

  // Debug logging for formData changes
  useEffect(() => {
    console.log('🔄 Form data updated:', {
      agent_type: formData.agent_type,
      department: formData.department,
      status: formData.status
    });
  }, [formData.agent_type, formData.department, formData.status]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleComplexityChange = (field: keyof typeof formData.complexity, value: 'Low' | 'Medium' | 'High') => {
    setFormData(prev => ({
      ...prev,
      complexity: { ...prev.complexity, [field]: value }
    }));
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
      // Call backend API for agent generation
      const response = await aiAutoCompleteAPI.generateAgentFromPrompt(prompt, activeDomainId);

      if (response.success && response.data) {
        console.log('✅ AI Generated Data:', response.data);
        console.log('📋 Available Agent Types:', agentTypes.map(t => t.name));
        console.log('📋 Available Departments:', departments.map(d => d.name));
        console.log('🔍 Agent Type Match:', {
          generated: response.data.agent_type,
          exists: agentTypes.some(t => t.name === response.data.agent_type)
        });
        console.log('🔍 Department Match:', {
          generated: response.data.department,
          exists: departments.some(d => d.name === response.data.department)
        });

        const newFormData = {
          ...formData,
          ...response.data,
          owner_name: user?.name || formData.owner_name,
          owner_email: user?.email || formData.owner_email
        };

        console.log('📝 Setting form data to:', newFormData);
        setFormData(newFormData);

        if (response.fallback) {
          console.log('🔄 Frontend: Used fallback generation');
        }

        setShowGenerativeInterface(false);
        setPrompt('');
      } else {
        throw new Error(response.error || 'Invalid response from server');
      }
    } catch (error) {
      console.error('Error generating from prompt:', error);
      // Show user-friendly error message
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
    if (!formData.agent_type) newErrors.agent_type = 'Agent type is required';
    if (!formData.department) newErrors.department = 'Department is required';
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
      // Scroll to first error field after a brief delay to let state update
      setTimeout(() => {
        const firstErrorField = Object.keys(errors)[0];
        // Try multiple selectors to find the error field
        const element =
          document.getElementById(firstErrorField) ||
          document.querySelector(`[name="${firstErrorField}"]`) ||
          document.querySelector('.error') ||
          document.querySelector('.error-message');

        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Try to focus the field if it's an input
          if (element instanceof HTMLInputElement ||
              element instanceof HTMLSelectElement ||
              element instanceof HTMLTextAreaElement) {
            element.focus();
          }
        } else {
          // Fallback: scroll to top of form
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }, 100);
      return;
    }

    setIsSubmitting(true);

    try {
      if (isEdit && agent) {
        await agentAPI.update(agent.id, { ...formData, selectedInitiatives });
        onSave({ ...agent, ...formData });
      } else {
        const result = await agentAPI.create({ ...formData, selectedInitiatives });
        const createdAgent = await agentAPI.getById(result.id);
        onSave(createdAgent);
      }
    } catch (error) {
      console.error('Error saving agent:', error);
      alert('Failed to save agent. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="agent-form-container">
      <div className="form-header">
        <h1>{isEdit ? 'Edit Agent' : 'Create New Agent'}</h1>
        <button
          type="button"
          className="cancel-button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }}
        >
          ✕ Cancel
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
                <h3>Describe your agent</h3>
              </div>
              <p>Tell us about your agent and we'll help you fill out the form:</p>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g., I want to build a customer service agent using GPT-4 that can handle product inquiries, process returns, and escalate complex issues to human support..."
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

      <form id="agent-form" className="agent-form" onSubmit={handleSubmit}>
        <div className="form-section">
          <h2>Required Information</h2>

          <div className="form-group">
            <label htmlFor="title">
              Agent Title <span className="required-indicator">*</span>
            </label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleChange}
              className={errors.title ? 'error' : ''}
              placeholder="Enter agent title"
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
              placeholder="Describe the agent's purpose and capabilities"
              rows={4}
            />
            {errors.description && <span className="error-message">{errors.description}</span>}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="agent_type">
                Agent Type <span className="required-indicator">*</span>
              </label>
              <select
                id="agent_type"
                name="agent_type"
                value={formData.agent_type}
                onChange={handleChange}
                className={errors.agent_type ? 'error' : ''}
              >
                <option value="">Select agent type</option>
                {agentTypes.map(type => (
                  <option key={type.id} value={type.name}>{type.name}</option>
                ))}
              </select>
              {errors.agent_type && <span className="error-message">{errors.agent_type}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="department">
                Department <span className="required-indicator">*</span>
              </label>
              <select
                id="department"
                name="department"
                value={formData.department}
                onChange={handleChange}
                className={errors.department ? 'error' : ''}
              >
                <option value="">Select department</option>
                {departments.map(dept => (
                  <option key={dept.id} value={dept.name}>{dept.name}</option>
                ))}
              </select>
              {errors.department && <span className="error-message">{errors.department}</span>}
            </div>

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
                <option value="concept">Concept</option>
                <option value="proof_of_concept">Proof of Concept</option>
                <option value="validation">Validation</option>
                <option value="pilot">Pilot</option>
                <option value="production">Production</option>
              </select>
              {errors.status && <span className="error-message">{errors.status}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="data_sensitivity">Data Sensitivity (Optional)</label>
              <select
                id="data_sensitivity"
                name="data_sensitivity"
                value={formData.data_sensitivity}
                onChange={handleChange}
              >
                {dataSensitivityLevels.map(level => (
                  <option key={level.name} value={level.name}>
                    {level.name}
                  </option>
                ))}
              </select>
              <small className="form-help-text">Classification level for data sensitivity</small>
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
              placeholder="What problem does this agent solve?"
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
              placeholder="How does the agent solve this problem?"
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

        <div className="form-grid">
          {/* Complexity Section */}
          <div className="form-section">
            <h2>Complexity Assessment</h2>

            <div className="complexity-grid">
              <div className="form-group">
                <label htmlFor="data_complexity">Data Complexity</label>
                <select
                  id="data_complexity"
                  value={formData.complexity.data_complexity}
                  onChange={(e) => handleComplexityChange('data_complexity', e.target.value as 'Low' | 'Medium' | 'High')}
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="integration_complexity">Integration Complexity</label>
                <select
                  id="integration_complexity"
                  value={formData.complexity.integration_complexity}
                  onChange={(e) => handleComplexityChange('integration_complexity', e.target.value as 'Low' | 'Medium' | 'High')}
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="intelligence_complexity">Intelligence Complexity</label>
                <select
                  id="intelligence_complexity"
                  value={formData.complexity.intelligence_complexity}
                  onChange={(e) => handleComplexityChange('intelligence_complexity', e.target.value as 'Low' | 'Medium' | 'High')}
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="functional_complexity">Functional Complexity</label>
                <select
                  id="functional_complexity"
                  value={formData.complexity.functional_complexity}
                  onChange={(e) => handleComplexityChange('functional_complexity', e.target.value as 'Low' | 'Medium' | 'High')}
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>
            </div>
          </div>

          {/* Strategic Impact Section */}
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
                placeholder="Justify the strategic impact and complexity ratings"
                rows={3}
              />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h2>Linked Initiatives</h2>
          <p className="section-description">
            Select initiatives that this agent implements or supports {!isEdit && <span className="required-indicator">*</span>}
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
                  initiative.department?.toLowerCase().includes(initiativeSearchTerm.toLowerCase()) ||
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
                        {initiative.department} • {initiative.category}
                      </div>
                    </div>
                  </label>
                ))}

              {initiatives.filter(initiative =>
                initiative.title.toLowerCase().includes(initiativeSearchTerm.toLowerCase()) ||
                initiative.description?.toLowerCase().includes(initiativeSearchTerm.toLowerCase()) ||
                initiative.department?.toLowerCase().includes(initiativeSearchTerm.toLowerCase()) ||
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
            {isSubmitting ? 'Saving...' : (isEdit ? 'Update Agent' : 'Create Agent')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AgentForm;
