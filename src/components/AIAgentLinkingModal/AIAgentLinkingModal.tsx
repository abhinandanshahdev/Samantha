import React, { useState, useEffect } from 'react';
import { FaPlus, FaTimes, FaMagic, FaCheck, FaEdit, FaTrash } from 'react-icons/fa';
import { Sparkles } from 'lucide-react';
import { Agent, AgentType, Department } from '../../types';
import { agentAPI, aiAutoCompleteAPI, agentTypeAPI, departmentAPI } from '../../services/apiService';
import { useActiveDomainId } from '../../context/DomainContext';
import './AIAgentLinkingModal.css';

interface AIAgentLinkingModalProps {
  isOpen: boolean;
  onClose: () => void;
  linkedAgents: Agent[];
  onAgentsChange: (agents: Agent[]) => void;
  initiativeDescription?: string;
  initiativeTitle?: string;
  ownerName?: string;
  ownerEmail?: string;
  initiativeId?: string;
  isEditingInitiative: boolean;
  initiativeDepartment?: string;
}

const AIAgentLinkingModal: React.FC<AIAgentLinkingModalProps> = ({
  isOpen,
  onClose,
  linkedAgents,
  onAgentsChange,
  initiativeDescription,
  initiativeTitle,
  ownerName,
  ownerEmail,
  initiativeId,
  isEditingInitiative,
  initiativeDepartment
}) => {
  const activeDomainId = useActiveDomainId();
  const [localLinkedAgents, setLocalLinkedAgents] = useState<Agent[]>(linkedAgents);
  const [allAgents, setAllAgents] = useState<Agent[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddAgentsPanel, setShowAddAgentsPanel] = useState(false);
  const [selectedAgentsToAdd, setSelectedAgentsToAdd] = useState<string[]>([]);
  const [showPromptPanel, setShowPromptPanel] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [editedFields, setEditedFields] = useState<Partial<Agent>>({});
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const [agentTypes, setAgentTypes] = useState<AgentType[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [showAutoGeneratePanel, setShowAutoGeneratePanel] = useState(false);
  const [autoGeneratePrompt, setAutoGeneratePrompt] = useState('');
  const [numberOfAgents, setNumberOfAgents] = useState(3);

  useEffect(() => {
    console.log('🔄 Modal: linkedAgents prop changed, updating local state:', linkedAgents.length, linkedAgents.map(a => ({ id: a.id, title: a.title })));
    setLocalLinkedAgents(linkedAgents);
  }, [linkedAgents]);

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
    const loadAllAgents = async () => {
      if (!activeDomainId) return;
      try {
        const agents = await agentAPI.getAll({ domain_id: activeDomainId, limit: 1000 });
        setAllAgents(agents);
      } catch (error) {
        console.error('Failed to load agents:', error);
      }
    };

    if (isOpen) {
      loadAllAgents();
    }
  }, [isOpen, activeDomainId]);

  // Load agent types and departments
  useEffect(() => {
    const loadDropdownData = async () => {
      if (!activeDomainId) return;
      try {
        const [typesData, deptsData] = await Promise.all([
          agentTypeAPI.getAll(activeDomainId),
          departmentAPI.getAll(activeDomainId)
        ]);
        setAgentTypes(typesData);
        setDepartments(deptsData);
      } catch (error) {
        console.error('Failed to load agent types and departments:', error);
      }
    };

    if (isOpen && activeDomainId) {
      loadDropdownData();
    }
  }, [isOpen, activeDomainId]);

  const handleAddExistingAgents = () => {
    const agentsToAdd = allAgents.filter(agent => selectedAgentsToAdd.includes(agent.id));
    const updatedAgents = [...localLinkedAgents, ...agentsToAdd];
    setLocalLinkedAgents(updatedAgents);
    onAgentsChange(updatedAgents);
    setSelectedAgentsToAdd([]);
    setShowAddAgentsPanel(false);
  };

  const handleUnlinkAgent = (agentId: string) => {
    console.log('handleUnlinkAgent called with agentId:', agentId);
    console.log('Current linked agents:', localLinkedAgents.map(a => ({ id: a.id, title: a.title })));

    if (!agentId) {
      console.error('Cannot unlink agent: agentId is undefined');
      alert('Error: Cannot unlink agent - ID is missing');
      return;
    }

    const agentToRemove = localLinkedAgents.find(agent => agent.id === agentId);
    console.log('Agent to remove:', agentToRemove);

    const updatedAgents = localLinkedAgents.filter(agent => agent.id !== agentId);
    console.log('Updated agents after filter:', updatedAgents.map(a => ({ id: a.id, title: a.title })));

    setLocalLinkedAgents(updatedAgents);
    onAgentsChange(updatedAgents);
    console.log('Agent unlinked successfully. Remaining agents:', updatedAgents.length);
  };

  const handlePromptAgent = async () => {
    if (!promptText.trim()) return;

    // Check if we're creating a new initiative (not editing)
    if (!isEditingInitiative || !initiativeId) {
      alert('Please save the initiative first before generating agents. Agents must be associated with a saved initiative.');
      return;
    }

    console.log('🤖 Starting agent generation with prompt:', promptText);
    setIsGenerating(true);
    try {
      const response = await aiAutoCompleteAPI.generateAgentFromPrompt(promptText, activeDomainId);
      console.log('📥 AI Response:', response);

      if (response.success && response.data) {
        console.log('✅ AI generation successful, creating agent...');
        // Create a new agent object with the generated data
        const newAgent: Partial<Agent> = {
          id: `temp-${Date.now()}`, // Temporary ID
          title: response.data.title || 'New Agent',
          description: response.data.description || '',
          agent_type: response.data.agent_type || '',
          department: response.data.department || '',
          status: response.data.status || 'concept',
          problem_statement: response.data.problem_statement || '',
          solution_overview: response.data.solution_overview || '',
          technical_implementation: response.data.technical_implementation || '',
          results_metrics: response.data.results_metrics || '',
          lessons_learned: response.data.lessons_learned || '',
          owner_name: ownerName || '',
          owner_email: ownerEmail || '',
          strategic_impact: response.data.strategic_impact || 'Medium',
          complexity: response.data.complexity || {
            data_complexity: 'Medium',
            integration_complexity: 'Medium',
            intelligence_complexity: 'Medium',
            functional_complexity: 'Medium'
          },
          justification: response.data.justification || '',
          kanban_pillar: 'backlog',
          domain_id: activeDomainId || 1,
          created_date: new Date().toISOString(),
          updated_date: new Date().toISOString()
        };

        console.log('🆕 New agent created:', newAgent);
        console.log('📊 Current linked agents before adding:', localLinkedAgents.length);

        const updatedAgents = [...localLinkedAgents, newAgent as Agent];
        console.log('📊 Updated agents list:', updatedAgents.length, updatedAgents.map(a => ({ id: a.id, title: a.title })));

        setLocalLinkedAgents(updatedAgents);
        onAgentsChange(updatedAgents);
        console.log('✅ Agent added to list and parent notified');

        setPromptText('');
        setShowPromptPanel(false);
      } else {
        console.warn('⚠️ AI generation failed or returned no data:', response);
        alert('AI generation did not return valid data. Please try again.');
      }
    } catch (error) {
      console.error('❌ Error generating agent:', error);
      alert('Failed to generate agent. Please try again.');
    } finally {
      setIsGenerating(false);
      console.log('🏁 Agent generation process completed');
    }
  };

  const handleAutoGenerateAgents = async () => {
    if (!initiativeDescription && !initiativeTitle) {
      alert('Please provide an initiative title or description first.');
      return;
    }

    // Check if we're creating a new initiative (not editing)
    if (!isEditingInitiative || !initiativeId) {
      alert('Please save the initiative first before generating agents. Agents must be associated with a saved initiative.');
      return;
    }

    setIsAutoGenerating(true);
    try {
      // Build base prompt from initiative details
      let basePrompt = `Based on this initiative: "${initiativeTitle || ''}\n\n${initiativeDescription || ''}"`;

      // Add custom prompt if provided
      if (autoGeneratePrompt.trim()) {
        basePrompt += `\n\nAdditional requirements: ${autoGeneratePrompt}`;
      }

      basePrompt += `\n\nSuggest agents that would be needed to implement this solution.`;

      // Add department context if available
      if (initiativeDepartment) {
        basePrompt += `\n\nNote: This initiative is for the ${initiativeDepartment} department.`;
      }

      // Generate multiple agents using the defined number
      const generatedAgents: Agent[] = [];

      for (let i = 0; i < numberOfAgents; i++) {
        const response = await aiAutoCompleteAPI.generateAgentFromPrompt(
          `${basePrompt}\n\nGenerate agent ${i + 1} of ${numberOfAgents}. Make it unique from the others.`,
          activeDomainId
        );

        if (response.success && response.data) {
          const newAgent: Partial<Agent> = {
            id: `temp-autogen-${Date.now()}-${i}`,
            title: response.data.title || `Agent ${i + 1}`,
            description: response.data.description || '',
            agent_type: response.data.agent_type || '',
            department: response.data.department || initiativeDepartment || '',
            status: response.data.status || 'concept',
            problem_statement: response.data.problem_statement || '',
            solution_overview: response.data.solution_overview || '',
            technical_implementation: response.data.technical_implementation || '',
            results_metrics: response.data.results_metrics || '',
            lessons_learned: response.data.lessons_learned || '',
            owner_name: ownerName || '',
            owner_email: ownerEmail || '',
            strategic_impact: response.data.strategic_impact || 'Medium',
            complexity: response.data.complexity || {
              data_complexity: 'Medium',
              integration_complexity: 'Medium',
              intelligence_complexity: 'Medium',
              functional_complexity: 'Medium'
            },
            justification: response.data.justification || '',
            kanban_pillar: 'backlog',
            domain_id: activeDomainId || 1,
            created_date: new Date().toISOString(),
            updated_date: new Date().toISOString()
          };

          generatedAgents.push(newAgent as Agent);
        }
      }

      const updatedAgents = [...localLinkedAgents, ...generatedAgents];
      setLocalLinkedAgents(updatedAgents);
      onAgentsChange(updatedAgents);

      // Close the panel and reset inputs
      setShowAutoGeneratePanel(false);
      setAutoGeneratePrompt('');
    } catch (error) {
      console.error('Error auto-generating agents:', error);
      alert('Failed to auto-generate agents. Please try again.');
    } finally {
      setIsAutoGenerating(false);
    }
  };

  const handleStartEdit = (agent: Agent) => {
    setEditingAgentId(agent.id);
    setEditedFields({
      title: agent.title,
      description: agent.description,
      agent_type: agent.agent_type,
      department: agent.department,
      status: agent.status
    });
  };

  const handleSaveEdit = async (agentId: string) => {
    try {
      console.log('💾 Saving agent edits:', { agentId, editedFields });

      // If it's a real agent (not temp), update via API
      if (!agentId.startsWith('temp')) {
        // Get the full agent object from local state
        const fullAgent = localLinkedAgents.find(a => a.id === agentId);
        if (!fullAgent) {
          throw new Error('Agent not found in local state');
        }

        // Merge edited fields with full agent data
        const fullUpdateData = {
          ...fullAgent,
          ...editedFields,
          domain_id: activeDomainId || fullAgent.domain_id
        };

        console.log('🔄 Calling agentAPI.update with full data:', agentId, fullUpdateData);
        await agentAPI.update(agentId, fullUpdateData);
        console.log('✅ Agent updated successfully via API');
      } else {
        console.log('⏭️ Skipping API update for temp agent');
      }

      // Update local state
      const updatedAgents = localLinkedAgents.map(agent =>
        agent.id === agentId ? { ...agent, ...editedFields } : agent
      );
      setLocalLinkedAgents(updatedAgents);
      onAgentsChange(updatedAgents);
      console.log('✅ Local state updated');

      setEditingAgentId(null);
      setEditedFields({});
    } catch (error: any) {
      console.error('❌ Error saving agent:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        agentId,
        editedFields
      });
      alert(`Failed to save agent changes: ${error.response?.data?.error || error.response?.data?.message || error.message || 'Unknown error'}`);
    }
  };

  const handleCancelEdit = () => {
    setEditingAgentId(null);
    setEditedFields({});
  };

  const filteredAvailableAgents = allAgents.filter(agent => {
    const isNotLinked = !localLinkedAgents.some(linked => linked.id === agent.id);
    const matchesSearch = agent.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          agent.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          agent.agent_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          agent.department?.toLowerCase().includes(searchTerm.toLowerCase());
    return isNotLinked && matchesSearch;
  });

  if (!isOpen) {
    console.log('AIAgentLinkingModal: isOpen is false, not rendering');
    return null;
  }

  console.log('AIAgentLinkingModal: Rendering modal, isOpen =', isOpen);

  return (
    <div className="modal-overlay">
      <div className="modal-container ai-agent-linking-modal">
        <div className="modal-header">
          <h2>Agent Design Assistant</h2>
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
              Prompt an Agent
            </button>
            <button
              type="button"
              className="ai-action-button autogen-button"
              onClick={() => setShowAutoGeneratePanel(!showAutoGeneratePanel)}
            >
              <FaMagic />
              Autogenerate Agents
            </button>
            <button
              type="button"
              className="ai-action-button add-existing-button"
              onClick={() => setShowAddAgentsPanel(!showAddAgentsPanel)}
            >
              <FaPlus />
              Add Existing Agents
            </button>
          </div>

          {/* Prompt Panel */}
          {showPromptPanel && (
            <div className="prompt-panel slide-in">
              <h3>Describe the Agent</h3>
              <textarea
                className="prompt-textarea"
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="e.g., I need an agent that handles customer inquiries using natural language processing..."
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
                  onClick={handlePromptAgent}
                  disabled={!promptText.trim() || isGenerating}
                >
                  {isGenerating ? 'Generating...' : 'Generate Agent'}
                </button>
              </div>
            </div>
          )}

          {/* Autogenerate Panel */}
          {showAutoGeneratePanel && (
            <div className="prompt-panel slide-in">
              <h3>Autogenerate Agents</h3>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500', fontSize: '14px' }}>
                  Number of Agents
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={numberOfAgents}
                  onChange={(e) => setNumberOfAgents(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
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
                  placeholder="e.g., Focus on customer service agents with chatbot capabilities..."
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
                    setNumberOfAgents(3);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="generate-button"
                  onClick={handleAutoGenerateAgents}
                  disabled={isAutoGenerating}
                >
                  {isAutoGenerating ? 'Generating...' : `Generate ${numberOfAgents} Agent${numberOfAgents !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          )}

          {/* Add Existing Agents Panel */}
          {showAddAgentsPanel && (
            <div className="add-agents-panel slide-in">
              <h3>Select Existing Agents</h3>
              <input
                type="text"
                className="search-input"
                placeholder="Search agents by title, type, or department..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <div className="agents-selection-list">
                {filteredAvailableAgents.length === 0 ? (
                  <p className="no-results">No agents available to add</p>
                ) : (
                  filteredAvailableAgents.map(agent => (
                    <label key={agent.id} className="agent-checkbox-item">
                      <input
                        type="checkbox"
                        checked={selectedAgentsToAdd.includes(agent.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedAgentsToAdd([...selectedAgentsToAdd, agent.id]);
                          } else {
                            setSelectedAgentsToAdd(selectedAgentsToAdd.filter(id => id !== agent.id));
                          }
                        }}
                      />
                      <div className="agent-info">
                        <div className="agent-title">{agent.title}</div>
                        <div className="agent-meta">
                          {agent.agent_type} • {agent.department} • {agent.status}
                        </div>
                      </div>
                    </label>
                  ))
                )}
              </div>
              <div className="add-agents-actions">
                <button
                  type="button"
                  className="cancel-button"
                  onClick={() => {
                    setShowAddAgentsPanel(false);
                    setSelectedAgentsToAdd([]);
                    setSearchTerm('');
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="add-button"
                  onClick={handleAddExistingAgents}
                  disabled={selectedAgentsToAdd.length === 0}
                >
                  Add {selectedAgentsToAdd.length} Agent{selectedAgentsToAdd.length !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          )}

          {/* Linked Agents Table */}
          <div className="linked-agents-section">
            <h3>Linked Agents ({localLinkedAgents.length})</h3>
            <div className={`agents-table-container ${localLinkedAgents.length === 0 ? 'empty' : ''}`}>
              {localLinkedAgents.length === 0 ? (
                <div className="empty-state">
                  <p>No agents linked yet. Use the buttons above to add or generate agents.</p>
                </div>
              ) : (
                <div className="agents-table-scroll">
                  <table className="agents-table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Description</th>
                        <th>Agent Type</th>
                        <th>Department</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {localLinkedAgents.map(agent => (
                        <tr key={agent.id}>
                          <td>
                            {editingAgentId === agent.id ? (
                              <input
                                type="text"
                                value={editedFields.title || ''}
                                onChange={(e) => setEditedFields({ ...editedFields, title: e.target.value })}
                                className="inline-edit-input"
                              />
                            ) : (
                              agent.title
                            )}
                          </td>
                          <td>
                            {editingAgentId === agent.id ? (
                              <input
                                type="text"
                                value={editedFields.description || ''}
                                onChange={(e) => setEditedFields({ ...editedFields, description: e.target.value })}
                                className="inline-edit-input"
                              />
                            ) : (
                              <div className="description-cell">{agent.description}</div>
                            )}
                          </td>
                          <td>
                            {editingAgentId === agent.id ? (
                              <select
                                value={editedFields.agent_type || ''}
                                onChange={(e) => setEditedFields({ ...editedFields, agent_type: e.target.value })}
                                className="inline-edit-select"
                              >
                                <option value="">Select agent type</option>
                                {agentTypes.map(type => (
                                  <option key={type.id} value={type.name}>{type.name}</option>
                                ))}
                              </select>
                            ) : (
                              agent.agent_type
                            )}
                          </td>
                          <td>
                            {editingAgentId === agent.id ? (
                              <select
                                value={editedFields.department || ''}
                                onChange={(e) => setEditedFields({ ...editedFields, department: e.target.value })}
                                className="inline-edit-select"
                              >
                                <option value="">Select department</option>
                                {departments.map(dept => (
                                  <option key={dept.id} value={dept.name}>{dept.name}</option>
                                ))}
                              </select>
                            ) : (
                              agent.department
                            )}
                          </td>
                          <td>
                            {editingAgentId === agent.id ? (
                              <select
                                value={editedFields.status || ''}
                                onChange={(e) => setEditedFields({ ...editedFields, status: e.target.value as any })}
                                className="inline-edit-select"
                              >
                                <option value="concept">Concept</option>
                                <option value="proof_of_concept">Proof of Concept</option>
                                <option value="validation">Validation</option>
                                <option value="pilot">Pilot</option>
                                <option value="production">Production</option>
                              </select>
                            ) : (
                              <span className={`status-badge status-${agent.status}`}>
                                {agent.status}
                              </span>
                            )}
                          </td>
                          <td>
                            <div className="action-links">
                              {editingAgentId === agent.id ? (
                                <>
                                  <a
                                    href="#"
                                    className="action-link save-link"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      handleSaveEdit(agent.id);
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
                                      handleStartEdit(agent);
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
                                      console.log('Unlink button clicked in modal for agent:', agent.id, agent.title);
                                      handleUnlinkAgent(agent.id);
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

export default AIAgentLinkingModal;
