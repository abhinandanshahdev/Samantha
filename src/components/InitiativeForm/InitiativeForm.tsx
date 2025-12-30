import React, { useState, useEffect } from 'react';
import { FaMagic } from 'react-icons/fa';
import { FaLightbulb } from 'react-icons/fa';
import { UseCase, Category, Department, StrategicGoal, Agent } from '../../types';
import { categoryAPI, departmentAPI, strategicGoalsAPI, useCaseAPI, aiAutoCompleteAPI, agentAPI, agentAssociationsAPI, dataSensitivityLevelsAPI } from '../../services/apiService';
import { useActiveDomainId } from '../../context/DomainContext';
import RelatedInitiatives from '../RelatedInitiatives/RelatedInitiatives';
import AIAgentLinkingModal from '../AIAgentLinkingModal/AIAgentLinkingModal';
import './InitiativeForm.css';
import { useRef } from 'react';

interface InitiativeFormProps {
  useCase?: UseCase;
  onSave: (useCase: Partial<UseCase>) => void;
  onCancel: () => void;
  isEditing: boolean;
}

const InitiativeForm: React.FC<InitiativeFormProps> = ({
  useCase,
  onSave,
  onCancel,
  isEditing
}) => {
  const activeDomainId = useActiveDomainId();
  const [formData, setFormData] = useState<Partial<UseCase>>({
    title: '',
    description: '',
    problem_statement: '',
    solution_overview: '',
    technical_implementation: '',
    category: '',
    department: '',
    status: 'concept',
    strategic_impact: 'Low',
    complexity: {
      data_complexity: 'Low',
      integration_complexity: 'Low',
      intelligence_complexity: 'Low',
      functional_complexity: 'Low'
    },
    justification: '',
    kanban_pillar: 'backlog',
    expected_delivery_date: '',
    tags: [],
    data_sensitivity: 'Public',
    roadmap_link: '',
    value_realisation_link: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showGenerativeInterface, setShowGenerativeInterface] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [strategicGoals, setStrategicGoals] = useState<StrategicGoal[]>([]);
  const [dataSensitivityLevels, setDataSensitivityLevels] = useState<Array<{ name: string; description: string }>>([]);
  const [selectedGoalIds, setSelectedGoalIds] = useState<string[]>([]);
  const [selectedRelatedUseCaseIds, setSelectedRelatedUseCaseIds] = useState<string[]>([]);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [linkedAgents, setLinkedAgents] = useState<Agent[]>([]);
  const [allUseCases, setAllUseCases] = useState<UseCase[]>([]);
  const [relatedUseCasesSearchTerm, setRelatedUseCasesSearchTerm] = useState('');
  const [showAIAgentModal, setShowAIAgentModal] = useState(false);
  const [currentTagInput, setCurrentTagInput] = useState('');
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);
  const formDataRef = useRef<Partial<UseCase>>(formData);

  // Keep the ref updated with the latest formData
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  // Load categories, strategic goals, and data sensitivity levels filtered by domain
  useEffect(() => {
    const loadData = async () => {
      try {
        const [fetchedCategories, fetchedGoals, fetchedDataSensitivityLevels] = await Promise.all([
          categoryAPI.getAll(activeDomainId),
          strategicGoalsAPI.getAll({ status: 'active', domain_id: activeDomainId }),
          dataSensitivityLevelsAPI.getAll()
        ]);
        setCategories(fetchedCategories);
        setStrategicGoals(fetchedGoals);
        setDataSensitivityLevels(fetchedDataSensitivityLevels.map(level => ({
          name: level.name,
          description: level.description
        })));
      } catch (error) {
        console.error('Failed to load form data:', error);
      }
    };

    loadData();
  }, [activeDomainId]);

  // Load departments (filtered by domain)
  useEffect(() => {
    const loadDepartments = async () => {
      try {
        const fetchedDepartments = await departmentAPI.getAll(activeDomainId || undefined);
        setDepartments(fetchedDepartments);
      } catch (error) {
        console.error('Failed to load departments:', error);
      }
    };

    loadDepartments();
  }, [activeDomainId]);

  // Load all use cases for related use cases selection (filtered by domain)
  useEffect(() => {
    const loadUseCases = async () => {
      try {
        const filters: any = { limit: 1000 };
        if (activeDomainId) {
          filters.domain_id = activeDomainId;
        }
        const useCases = await useCaseAPI.getAll(filters);
        // Filter out current use case if editing
        const filteredUseCases = isEditing && useCase?.id
          ? useCases.filter(uc => uc.id !== useCase.id)
          : useCases;
        setAllUseCases(filteredUseCases);
      } catch (error) {
        console.error('Failed to load use cases:', error);
      }
    };

    loadUseCases();
  }, [activeDomainId, isEditing, useCase?.id]);

  // Initialize form with existing data if editing
  useEffect(() => {
    if (useCase && isEditing) {
      setFormData({
        ...useCase,
      });
    }
  }, [useCase, isEditing]);

  // Load strategic goal alignments when editing
  useEffect(() => {
    if (useCase && isEditing && useCase.id) {
      const loadAlignments = async () => {
        try {
          const alignments = await useCaseAPI.getAlignments(useCase.id);
          const goalIds = alignments.map(alignment => alignment.strategic_goal_id);
          setSelectedGoalIds(goalIds);
        } catch (error) {
          console.error('Failed to load strategic goal alignments:', error);
        }
      };

      loadAlignments();
    }
  }, [useCase, isEditing]);

  // Load linked agents when editing
  useEffect(() => {
    if (useCase && isEditing && useCase.id) {
      const loadLinkedAgents = async () => {
        try {
          const associations = await agentAssociationsAPI.getAgentsForInitiative(useCase.id);
          // Fetch full agent details for each association
          const agentPromises = associations.map(assoc => agentAPI.getById(assoc.agent_id));
          const agents = await Promise.all(agentPromises);
          setLinkedAgents(agents);
          setSelectedAgentIds(agents.map(a => a.id));
        } catch (error) {
          console.error('Failed to load linked agents:', error);
        }
      };

      loadLinkedAgents();
    }
  }, [useCase, isEditing, activeDomainId]);

  // Setup auto-save timer (once)
  useEffect(() => {
    // Load draft if not editing
    if (!isEditing) {
      const savedDraft = localStorage.getItem('useCaseDraft');
      if (savedDraft) {
        setFormData(JSON.parse(savedDraft));
      }
    }

    // Setup auto-save timer
    const setupAutoSave = () => {
      if (autoSaveTimer.current) {
        clearInterval(autoSaveTimer.current);
      }

      autoSaveTimer.current = setInterval(() => {
        const currentFormData = formDataRef.current;
        if (currentFormData && Object.keys(currentFormData).length > 0) {
          localStorage.setItem('useCaseDraft', JSON.stringify(currentFormData));
        }
      }, 30000);
    };

    setupAutoSave();

    return () => {
      if (autoSaveTimer.current) {
        clearInterval(autoSaveTimer.current);
      }
    };
  }, [isEditing]); // Only depends on isEditing, not formData

  const generateFromPrompt = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    
    try {
      // Call backend API for use case generation
      const response = await aiAutoCompleteAPI.generateUseCaseFromPrompt(prompt, activeDomainId);
      
      if (response.success && response.data) {
        setFormData(prev => ({
          ...prev,
          ...response.data
        }));
        
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

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.title?.trim()) {
      newErrors.title = 'Title is required';
    }
    if (!formData.description?.trim()) {
      newErrors.description = 'Description is required';
    }
    if (!formData.problem_statement?.trim()) {
      newErrors.problem_statement = 'Problem statement is required';
    }
    if (!formData.solution_overview?.trim()) {
      newErrors.solution_overview = 'Solution overview is required';
    }
    if (!formData.category) {
      newErrors.category = 'Category is required';
    }
    if (!formData.department) {
      newErrors.department = 'Department is required';
    }
    if (!formData.strategic_impact) {
      newErrors.strategic_impact = 'Strategic impact is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: keyof UseCase, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  const handleComplexityChange = (complexityType: keyof UseCase['complexity'], value: string) => {
    setFormData(prev => ({
      ...prev,
      complexity: {
        ...prev.complexity!,
        [complexityType]: value
      }
    }));
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Validate that we have an active domain
      if (!activeDomainId) {
        alert('No active domain selected. Please select a domain first.');
        setIsSubmitting(false);
        return;
      }

      // Create temp agents before saving the initiative (only in edit mode)
      const tempAgents = linkedAgents.filter(a => a.id.startsWith('temp-'));
      const existingAgents = linkedAgents.filter(a => !a.id.startsWith('temp-'));
      let finalAgentIds = existingAgents.map(a => a.id);

      console.log('🔍 Checking agents:', {
        totalAgents: linkedAgents.length,
        tempAgents: tempAgents.length,
        existingAgents: existingAgents.length,
        isEditing,
        useCaseId: useCase?.id
      });

      if (tempAgents.length > 0) {
        console.log(`💾 Creating ${tempAgents.length} temp agent(s) before saving initiative...`);

        if (isEditing && useCase?.id) {
          // Edit mode: create agents linked to current initiative
          for (let i = 0; i < tempAgents.length; i++) {
            const tempAgent = tempAgents[i];
            try {
              console.log(`Creating agent ${i + 1}/${tempAgents.length}: "${tempAgent.title}"`);

              // Convert object fields to strings if needed
              const agentData = {
                ...tempAgent,
                // Ensure results_metrics is a string, not an object
                results_metrics: typeof tempAgent.results_metrics === 'object'
                  ? JSON.stringify(tempAgent.results_metrics)
                  : tempAgent.results_metrics || '',
                // Ensure lessons_learned is a string
                lessons_learned: tempAgent.lessons_learned || '',
                selectedInitiatives: [useCase.id]
              };

              const response = await agentAPI.create(agentData);
              console.log(`✅ Agent ${i + 1} created with ID: ${response.id}`);
              finalAgentIds.push(response.id);
            } catch (error: any) {
              console.error(`❌ Failed to create agent ${i + 1}:`, {
                title: tempAgent.title,
                agent_type: tempAgent.agent_type,
                department: tempAgent.department,
                error: error.response?.data
              });
              // Rollback: delete successfully created agents
              console.log(`🔄 Rolling back ${finalAgentIds.length} successfully created agents...`);
              for (const createdId of finalAgentIds) {
                try {
                  await agentAPI.delete(createdId);
                  console.log(`✅ Rolled back agent: ${createdId}`);
                } catch (rollbackError) {
                  console.error(`Failed to rollback agent: ${createdId}`, rollbackError);
                }
              }
              throw new Error(`Failed to create agent "${tempAgent.title}": ${error.response?.data?.error || error.message}`);
            }
          }
        } else {
          // Create mode: shouldn't have temp agents (prevented by modal)
          console.warn('⚠️ Temp agents found in create mode - this should not happen');
        }
      }

      // Save the use case with selected strategic goals, related use cases, and agents
      const useCaseData = {
        ...formData,
        domain_id: activeDomainId, // Include active domain ID
        selectedStrategicGoals: selectedGoalIds,
        selectedRelatedUseCases: selectedRelatedUseCaseIds,
        selectedAgents: finalAgentIds // Use updated IDs (temp agents now have real IDs)
      };

      await onSave(useCaseData);
      localStorage.removeItem('useCaseDraft');
    } catch (error: any) {
      console.error('Error saving use case:', error);

      // Handle validation errors from backend
      if (error.response?.status === 400 && error.response?.data?.details) {
        // Backend returned field-specific errors - show inline in form
        const backendErrors: Record<string, string> = {};

        Object.entries(error.response.data.details).forEach(([field, message]) => {
          if (message) {
            backendErrors[field] = message as string;
          }
        });

        setErrors(backendErrors);

        // Scroll to first error field after a brief delay to let state update
        setTimeout(() => {
          const firstErrorField = Object.keys(backendErrors)[0];
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
      } else if (error.response?.data?.error) {
        // Backend returned a general error message - scroll to top
        setErrors({ general: error.response.data.error });
        setTimeout(() => {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }, 100);
      } else {
        // Generic error - scroll to top
        setErrors({ general: 'Failed to save initiative. Please try again.' });
        setTimeout(() => {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }, 100);
      }
    } finally {
      setIsSubmitting(false);
    }
  };


  const handleAgentsChange = (agents: Agent[]) => {
    console.log('📋 handleAgentsChange called with:', agents.map(a => ({ id: a.id, title: a.title })));

    // Simply update state - don't create agents yet
    // Agents will be created when the form is submitted
    setLinkedAgents(agents);
    setSelectedAgentIds(agents.map(a => a.id));

    const tempCount = agents.filter(a => a.id.startsWith('temp-')).length;
    if (tempCount > 0) {
      console.log(`📝 ${tempCount} temp agent(s) will be created when initiative is saved`);
    }
  };

  // Tag management functions
  const handleAddTag = () => {
    const trimmedTag = currentTagInput.trim();
    if (trimmedTag && !formData.tags?.includes(trimmedTag)) {
      setFormData({
        ...formData,
        tags: [...(formData.tags || []), trimmedTag]
      });
      setCurrentTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData({
      ...formData,
      tags: formData.tags?.filter(tag => tag !== tagToRemove) || []
    });
  };

  const handleTagInputKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  return (
    <div className="use-case-form-container">
      <div className="form-header">
        <h1>{isEditing ? 'Edit Initiative' : 'Create New Initiative'}</h1>
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

      {errors.general && (
        <div className="error-banner" style={{
          padding: '12px 16px',
          marginBottom: '20px',
          backgroundColor: '#FEE2E2',
          border: '1px solid #EF4444',
          borderRadius: '6px',
          color: '#991B1B',
          fontSize: '14px'
        }}>
          {errors.general}
        </div>
      )}

      {!isEditing && (
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
                <h3>Describe your initiative</h3>
              </div>
              <p>Tell us about your project and we'll help you fill out the form:</p>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g., I want to build a chatbot using GPT-4 for customer support that can handle common queries and escalate complex issues to human agents..."
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

      <form onSubmit={handleSubmit} className="use-case-form">
        <div className="form-grid">
          {/* Required Fields Section */}
          <div className="form-section">
            <h2>Required Information</h2>
            
            <div className="form-group">
              <label htmlFor="title">
                Title <span className="required-indicator">*</span>
              </label>
              <input
                type="text"
                id="title"
                value={formData.title || ''}
                onChange={(e) => handleInputChange('title', e.target.value)}
                className={errors.title ? 'error' : ''}
                placeholder="Enter initiative title"
              />
              {errors.title && <span className="error-message">{errors.title}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="description">
                Description <span className="required-indicator">*</span>
              </label>
              <textarea
                id="description"
                value={formData.description || ''}
                onChange={(e) => handleInputChange('description', e.target.value)}
                className={errors.description ? 'error' : ''}
                placeholder="Brief description of the initiative"
                rows={3}
              />
              {errors.description && <span className="error-message">{errors.description}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="category">
                Category <span className="required-indicator">*</span>
              </label>
              <select
                id="category"
                value={formData.category || ''}
                onChange={(e) => handleInputChange('category', e.target.value)}
                className={errors.category ? 'error' : ''}
              >
                <option value="">Select a category</option>
                {categories.map(category => (
                  <option key={category.id} value={category.name}>
                    {category.name}
                  </option>
                ))}
              </select>
              {formData.category && (
                <div className="category-description">
                  {categories.find(c => c.name === formData.category)?.description}
                </div>
              )}
              {errors.category && <span className="error-message">{errors.category}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="department">
                Department <span className="required-indicator">*</span>
              </label>
              <select
                id="department"
                value={formData.department || ''}
                onChange={(e) => handleInputChange('department', e.target.value)}
                className={errors.department ? 'error' : ''}
              >
                <option value="">Select a department</option>
                {departments.map(department => (
                  <option key={department.id} value={department.name}>
                    {department.name}
                  </option>
                ))}
              </select>
              {errors.department && <span className="error-message">{errors.department}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="owner_name">Initiative Owner Name</label>
              <input
                type="text"
                id="owner_name"
                value={formData.owner_name || ''}
                onChange={(e) => handleInputChange('owner_name', e.target.value)}
                placeholder="Name of the person owning this initiative"
              />
            </div>

            <div className="form-group">
              <label htmlFor="owner_email">Initiative Owner Email</label>
              <input
                type="email"
                id="owner_email"
                value={formData.owner_email || ''}
                onChange={(e) => handleInputChange('owner_email', e.target.value)}
                placeholder="Email of the initiative owner"
              />
            </div>

            <div className="form-group">
              <label htmlFor="status">Status</label>
              <select
                id="status"
                value={formData.status || 'concept'}
                onChange={(e) => handleInputChange('status', e.target.value)}
              >
                <option value="concept">Concept</option>
                <option value="proof_of_concept">Proof of Concept</option>
                <option value="validation">Validation</option>
                <option value="pilot">Pilot</option>
                <option value="production">Production</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="kanban_pillar">Delivery Status</label>
              <select
                id="kanban_pillar"
                value={formData.kanban_pillar || 'backlog'}
                onChange={(e) => handleInputChange('kanban_pillar', e.target.value)}
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
            </div>

            <div className="form-group">
              <label htmlFor="expected_delivery_date">Expected Delivery (Optional)</label>
              <input
                type="text"
                id="expected_delivery_date"
                value={formData.expected_delivery_date || ''}
                onChange={(e) => handleInputChange('expected_delivery_date', e.target.value)}
                placeholder="e.g., Jan 2025"
                maxLength={8}
              />
              <small className="form-help-text">Format: MMM YYYY (e.g., Jan 2025, Dec 2025)</small>
            </div>

            <div className="form-group">
              <label htmlFor="tags">Tags (Optional)</label>
              <div className="tags-input-container">
                <input
                  type="text"
                  id="tags"
                  value={currentTagInput}
                  onChange={(e) => setCurrentTagInput(e.target.value)}
                  onKeyPress={handleTagInputKeyPress}
                  placeholder="e.g., Delivery team: Accenture"
                />
                <button
                  type="button"
                  className="add-tag-button"
                  onClick={handleAddTag}
                  disabled={!currentTagInput.trim()}
                >
                  Add Tag
                </button>
              </div>
              {formData.tags && formData.tags.length > 0 && (
                <div className="tags-list">
                  {formData.tags.map((tag, index) => (
                    <span key={index} className="tag-item">
                      {tag}
                      <button
                        type="button"
                        className="remove-tag-button"
                        onClick={() => handleRemoveTag(tag)}
                        aria-label={`Remove tag ${tag}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <small className="form-help-text">Add custom tags to categorize this initiative (press Enter or click Add Tag)</small>
            </div>

            <div className="form-group">
              <label htmlFor="data_sensitivity">Data Sensitivity (Optional)</label>
              <select
                id="data_sensitivity"
                value={formData.data_sensitivity || 'Public'}
                onChange={(e) => handleInputChange('data_sensitivity', e.target.value)}
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
                value={formData.roadmap_link || ''}
                onChange={(e) => handleInputChange('roadmap_link', e.target.value)}
                placeholder="e.g., https://example.com/roadmap"
              />
              <small className="form-help-text">URL or hyperlink to the roadmap</small>
            </div>

            <div className="form-group">
              <label htmlFor="value_realisation_link">Link to Value Realisation (Optional)</label>
              <input
                type="text"
                id="value_realisation_link"
                value={formData.value_realisation_link || ''}
                onChange={(e) => handleInputChange('value_realisation_link', e.target.value)}
                placeholder="e.g., https://example.com/value-realisation"
              />
              <small className="form-help-text">URL or hyperlink to value realisation details</small>
            </div>
          </div>

          {/* Problem & Solution Section */}
          <div className="form-section">
            <h2>Problem & Solution</h2>
            
            <div className="form-group">
              <label htmlFor="problem_statement">
                Problem Statement <span className="required-indicator">*</span>
              </label>
              <textarea
                id="problem_statement"
                value={formData.problem_statement || ''}
                onChange={(e) => handleInputChange('problem_statement', e.target.value)}
                className={errors.problem_statement ? 'error' : ''}
                placeholder="Describe the problem this initiative solves"
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
                value={formData.solution_overview || ''}
                onChange={(e) => handleInputChange('solution_overview', e.target.value)}
                className={errors.solution_overview ? 'error' : ''}
                placeholder="Describe the solution approach"
                rows={4}
              />
              {errors.solution_overview && <span className="error-message">{errors.solution_overview}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="technical_implementation">Technical Implementation</label>
              <textarea
                id="technical_implementation"
                value={formData.technical_implementation || ''}
                onChange={(e) => handleInputChange('technical_implementation', e.target.value)}
                placeholder="Describe the technical implementation details"
                rows={4}
              />
            </div>

            {/* Manage Agents Button - Styled like AI Assistant */}
            <button
              type="button"
              className="generative-toggle"
              onClick={() => {
                console.log('Manage Agents button clicked');
                // Scroll to top before opening modal
                window.scrollTo({ top: 0, behavior: 'smooth' });
                // Small delay to allow scroll to complete before opening modal
                setTimeout(() => {
                  setShowAIAgentModal(true);
                  console.log('showAIAgentModal set to true');
                }, 300);
              }}
            >
              <FaMagic />
              Manage Agents ({linkedAgents.length} linked)
            </button>

            {linkedAgents.length > 0 && (
              <div className="linked-agents-preview">
                <h4>Linked Agents:</h4>
                <div className="agents-chips">
                  {linkedAgents.map(agent => (
                    <div key={agent.id} className="agent-chip">
                      <span className="agent-chip-title">{agent.title}</span>
                      <span className="agent-chip-type">{agent.agent_type}</span>
                      <button
                        type="button"
                        className="agent-chip-remove"
                        onClick={() => {
                          console.log('Unlinking agent from preview chip:', agent.id);
                          const updatedAgents = linkedAgents.filter(a => a.id !== agent.id);
                          setLinkedAgents(updatedAgents);
                          setSelectedAgentIds(updatedAgents.map(a => a.id));
                        }}
                        title="Remove agent"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>


          {/* Complexity Section */}
          <div className="form-section">
            <h2>Complexity Assessment</h2>
            
            <div className="complexity-grid">
              <div className="form-group">
                <label htmlFor="data_complexity">Data Complexity</label>
                <select
                  id="data_complexity"
                  value={formData.complexity?.data_complexity || 'Low'}
                  onChange={(e) => handleComplexityChange('data_complexity', e.target.value)}
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
                  value={formData.complexity?.integration_complexity || 'Low'}
                  onChange={(e) => handleComplexityChange('integration_complexity', e.target.value)}
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
                  value={formData.complexity?.intelligence_complexity || 'Low'}
                  onChange={(e) => handleComplexityChange('intelligence_complexity', e.target.value)}
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
                  value={formData.complexity?.functional_complexity || 'Low'}
                  onChange={(e) => handleComplexityChange('functional_complexity', e.target.value)}
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
                value={formData.strategic_impact || 'Low'}
                onChange={e => handleInputChange('strategic_impact', e.target.value)}
                className={errors.strategic_impact ? 'error' : ''}
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
              {errors.strategic_impact && <span className="error-message">{errors.strategic_impact}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="justification">
                Justification <span style={{ color: '#aaa', fontWeight: 400 }}>(optional)</span>
              </label>
              <textarea
                id="justification"
                value={formData.justification || ''}
                onChange={e => handleInputChange('justification', e.target.value)}
                placeholder="Explain why you chose this impact level (optional)"
                rows={3}
              />
            </div>
          </div>

          {/* Strategic Goals Alignment Section */}
          <div className="form-section">
            <h2>Strategic Goals Alignment</h2>
            <p className="section-description">
              Align this initiative with strategic goals for prioritization assessment
            </p>
            
            <div className="form-group">
              <label>Select aligned strategic goals (optional)</label>
              <div className="strategic-goals-list">
                {strategicGoals.map(goal => (
                  <div key={goal.id} className="strategic-goal-item">
                    <input
                      type="checkbox"
                      id={`goal-${goal.id}`}
                      checked={selectedGoalIds.includes(goal.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedGoalIds(prev => [...prev, goal.id]);
                        } else {
                          setSelectedGoalIds(prev => prev.filter(id => id !== goal.id));
                        }
                      }}
                    />
                    <label htmlFor={`goal-${goal.id}`} className="goal-label">
                      <div className="goal-header">
                        <span className="goal-title">{goal.title}</span>
                        <div className="goal-badges">
                          <span className="pillar-badge">{goal.strategic_pillar_name}</span>
                        </div>
                      </div>
                      <p className="goal-description">{goal.description}</p>
                    </label>
                  </div>
                ))}
              </div>
              
              {strategicGoals.length === 0 && (
                <p className="no-goals-message">
                  No active strategic goals found. Strategic goals can be created from the dashboard.
                </p>
              )}
            </div>
          </div>

          {/* Related Use Cases Section */}
          <div className="form-section">
            <label className="section-label">Related Initiatives (Optional)</label>
            <p className="section-description">
              Select other initiatives that are related to or complement this one
            </p>

            {isEditing && useCase?.id ? (
              // Use existing RelatedInitiatives component for edit mode
              <RelatedInitiatives
                useCaseId={useCase.id}
                currentUseCaseTitle={useCase.title}
                onNavigate={() => {}} // No navigation in edit mode
              />
            ) : (
              // Simple selection interface for create mode
              <div className="related-use-cases-create">
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search for initiatives to relate..."
                  value={relatedUseCasesSearchTerm}
                  onChange={(e) => setRelatedUseCasesSearchTerm(e.target.value)}
                />

                <div className="use-cases-list">
                  {allUseCases
                    .filter(uc =>
                      uc.title.toLowerCase().includes(relatedUseCasesSearchTerm.toLowerCase()) ||
                      uc.description?.toLowerCase().includes(relatedUseCasesSearchTerm.toLowerCase()) ||
                      uc.department?.toLowerCase().includes(relatedUseCasesSearchTerm.toLowerCase())
                    )
                    .slice(0, 10)
                    .map(uc => (
                      <label key={uc.id} className="use-case-checkbox-item">
                        <input
                          type="checkbox"
                          checked={selectedRelatedUseCaseIds.includes(uc.id!)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedRelatedUseCaseIds([...selectedRelatedUseCaseIds, uc.id!]);
                            } else {
                              setSelectedRelatedUseCaseIds(
                                selectedRelatedUseCaseIds.filter(id => id !== uc.id)
                              );
                            }
                          }}
                        />
                        <div className="use-case-info">
                          <div className="use-case-title">{uc.title}</div>
                          <div className="use-case-meta">
                            {uc.department} • {uc.category}
                          </div>
                        </div>
                      </label>
                    ))}

                  {allUseCases.filter(uc =>
                    uc.title.toLowerCase().includes(relatedUseCasesSearchTerm.toLowerCase()) ||
                    uc.description?.toLowerCase().includes(relatedUseCasesSearchTerm.toLowerCase()) ||
                    uc.department?.toLowerCase().includes(relatedUseCasesSearchTerm.toLowerCase())
                  ).length === 0 && (
                    <p className="no-results">
                      {relatedUseCasesSearchTerm ? 'No matching initiatives found' : 'No initiatives available'}
                    </p>
                  )}
                </div>

                {selectedRelatedUseCaseIds.length > 0 && (
                  <div className="selected-count">
                    {selectedRelatedUseCaseIds.length} initiative(s) selected
                  </div>
                )}
              </div>
            )}
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
          <button
            type="submit"
            className="save-button"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : (isEditing ? 'Update Initiative' : 'Create Initiative')}
          </button>
        </div>
      </form>

      {/* AI Agent Linking Modal */}
      <AIAgentLinkingModal
        isOpen={showAIAgentModal}
        onClose={() => setShowAIAgentModal(false)}
        linkedAgents={linkedAgents}
        onAgentsChange={handleAgentsChange}
        initiativeDescription={formData.description}
        initiativeTitle={formData.title}
        ownerName={formData.owner_name}
        ownerEmail={formData.owner_email}
        initiativeId={useCase?.id}
        isEditingInitiative={isEditing}
        initiativeDepartment={formData.department}
      />
    </div>
  );
};

export default InitiativeForm; 