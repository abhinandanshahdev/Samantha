import React, { useState, useEffect } from 'react';
import { Domain, DomainType, StrategicPillar, Outcome } from '../../types';
import { domainAPI, strategicPillarsAPI, outcomesAPI } from '../../services/apiService';
import { useDomain } from '../../context/DomainContext';
import { FaCheckCircle, FaEdit, FaTrash, FaPlus, FaSave, FaTimes, FaExchangeAlt, FaArrowLeft, FaChevronDown, FaChevronUp, FaBullseye } from 'react-icons/fa';
import './DomainManagement.css';

interface DomainManagementProps {
  onBack?: () => void;
}

const DomainManagement: React.FC<DomainManagementProps> = ({ onBack }) => {
  const { activeDomain, availableDomains, switchDomain, refreshDomains } = useDomain();
  const [domains, setDomains] = useState<Domain[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingDomain, setEditingDomain] = useState<Domain | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [formData, setFormData] = useState<Partial<Domain>>({
    name: '',
    type: 'custom',
    hero_message: '',
    subtitle: 'Family Initiatives',
    is_active: true
  });

  // Pillar management state
  const [expandedDomainId, setExpandedDomainId] = useState<number | null>(null);
  const [domainPillars, setDomainPillars] = useState<{ [domainId: number]: StrategicPillar[] }>({});
  const [isPillarLoading, setIsPillarLoading] = useState(false);
  const [editingPillar, setEditingPillar] = useState<StrategicPillar | null>(null);
  const [isCreatingPillar, setIsCreatingPillar] = useState(false);
  const [pillarFormDomainId, setPillarFormDomainId] = useState<number | null>(null);
  const [pillarFormData, setPillarFormData] = useState<Partial<StrategicPillar>>({
    name: '',
    description: '',
    display_order: 0
  });

  // Outcomes (KPI) management state
  const [expandedOutcomesDomainId, setExpandedOutcomesDomainId] = useState<number | null>(null);
  const [domainOutcomes, setDomainOutcomes] = useState<{ [domainId: number]: Outcome[] }>({});
  const [isOutcomeLoading, setIsOutcomeLoading] = useState(false);
  const [editingOutcome, setEditingOutcome] = useState<Outcome | null>(null);
  const [isCreatingOutcome, setIsCreatingOutcome] = useState(false);
  const [outcomeFormDomainId, setOutcomeFormDomainId] = useState<number | null>(null);
  const [outcomeFormData, setOutcomeFormData] = useState<Partial<Outcome>>({
    outcome_key: '',
    title: '',
    measure: '',
    progress: 0,
    maturity: undefined,
    display_order: 0
  });

  // Domain deletion state
  const [deletionPreview, setDeletionPreview] = useState<{
    domain_id: number;
    domain_name: string;
    counts: Record<string, number>;
    total_items: number;
    warning: string;
  } | null>(null);
  const [deleteConfirmationStep, setDeleteConfirmationStep] = useState<1 | 2>(1);
  const [deleteConfirmationCode, setDeleteConfirmationCode] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    loadDomains();
  }, []);

  const loadDomains = async () => {
    try {
      setIsLoading(true);
      const fetchedDomains = await domainAPI.getAll();
      setDomains(fetchedDomains);
    } catch (err) {
      console.error('Error loading domains:', err);
      setError('Failed to load domains');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = () => {
    setIsCreating(true);
    setEditingDomain(null);
    setFormData({
      name: '',
      type: 'custom',
      hero_message: '',
      subtitle: 'Family Initiatives',
      is_active: true
    });
    setError(null);
    setSuccessMessage(null);
  };

  const handleEdit = (domain: Domain) => {
    setEditingDomain(domain);
    setIsCreating(false);
    setFormData({
      name: domain.name,
      type: domain.type,
      hero_message: domain.hero_message || '',
      subtitle: domain.subtitle || 'Strategic Initiatives @ DoF',
      is_active: domain.is_active
    });
    setError(null);
    setSuccessMessage(null);
  };

  const handleCancel = () => {
    setEditingDomain(null);
    setIsCreating(false);
    setFormData({
      name: '',
      type: 'custom',
      hero_message: '',
      subtitle: 'Family Initiatives',
      is_active: true
    });
    setError(null);
  };

  const handleSave = async () => {
    try {
      setError(null);
      setSuccessMessage(null);

      if (!formData.name) {
        setError('Domain name is required');
        return;
      }

      if (isCreating) {
        // Create new domain
        await domainAPI.create(formData);
        setSuccessMessage('Domain created successfully');
      } else if (editingDomain) {
        // Update existing domain
        await domainAPI.update(editingDomain.id, formData);
        setSuccessMessage('Domain updated successfully');
      }

      // Reload domains and refresh context
      await loadDomains();
      await refreshDomains();
      handleCancel();
    } catch (err: any) {
      console.error('Error saving domain:', err);
      setError(err.response?.data?.error || 'Failed to save domain');
    }
  };

  const handleDeleteClick = async (domain: Domain) => {
    try {
      setError(null);
      setSuccessMessage(null);
      // Fetch deletion preview
      const preview = await domainAPI.getDeletionPreview(domain.id);
      setDeletionPreview(preview);
      setDeleteConfirmationStep(1);
      setDeleteConfirmationCode('');
    } catch (err: any) {
      console.error('Error fetching deletion preview:', err);
      setError(err.response?.data?.error || 'Failed to fetch deletion preview');
    }
  };

  const handleCancelDelete = () => {
    setDeletionPreview(null);
    setDeleteConfirmationStep(1);
    setDeleteConfirmationCode('');
  };

  const handleConfirmDelete = async () => {
    if (!deletionPreview) return;

    if (deleteConfirmationStep === 1) {
      // Move to step 2 if there's data to delete
      if (deletionPreview.total_items > 0) {
        setDeleteConfirmationStep(2);
        return;
      }
    }

    // Final confirmation - check if code matches domain name
    if (deletionPreview.total_items > 0 && deleteConfirmationCode !== deletionPreview.domain_name) {
      setError(`Please type "${deletionPreview.domain_name}" exactly to confirm deletion`);
      return;
    }

    try {
      setIsDeleting(true);
      setError(null);
      await domainAPI.delete(deletionPreview.domain_id, {
        forceDelete: deletionPreview.total_items > 0,
        confirmationCode: deleteConfirmationCode
      });
      setSuccessMessage(`Domain "${deletionPreview.domain_name}" and all associated data deleted successfully. This action has been logged.`);
      handleCancelDelete();
      await loadDomains();
      await refreshDomains();
    } catch (err: any) {
      console.error('Error deleting domain:', err);
      setError(err.response?.data?.error || 'Failed to delete domain');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSwitchDomain = (domainId: number) => {
    switchDomain(domainId);
  };

  // Pillar management functions
  const loadPillarsForDomain = async (domainId: number) => {
    try {
      setIsPillarLoading(true);
      const pillars = await strategicPillarsAPI.getAll(domainId);
      setDomainPillars(prev => ({ ...prev, [domainId]: pillars }));
    } catch (err) {
      console.error('Error loading pillars:', err);
      setError('Failed to load pillars');
    } finally {
      setIsPillarLoading(false);
    }
  };

  const handleTogglePillars = async (domainId: number) => {
    if (expandedDomainId === domainId) {
      setExpandedDomainId(null);
    } else {
      setExpandedDomainId(domainId);
      if (!domainPillars[domainId]) {
        await loadPillarsForDomain(domainId);
      }
    }
  };

  const handleCreatePillar = (domainId: number) => {
    setIsCreatingPillar(true);
    setEditingPillar(null);
    setPillarFormDomainId(domainId);
    setPillarFormData({
      name: '',
      description: '',
      display_order: 0
    });
    setError(null);
    setSuccessMessage(null);
  };

  const handleEditPillar = (pillar: StrategicPillar) => {
    setEditingPillar(pillar);
    setIsCreatingPillar(false);
    setPillarFormDomainId(pillar.domain_id);
    setPillarFormData({
      name: pillar.name,
      description: pillar.description,
      display_order: pillar.display_order || 0
    });
    setError(null);
    setSuccessMessage(null);
  };

  const handleCancelPillar = () => {
    setEditingPillar(null);
    setIsCreatingPillar(false);
    setPillarFormDomainId(null);
    setPillarFormData({
      name: '',
      description: '',
      display_order: 0
    });
    setError(null);
  };

  const handleSavePillar = async () => {
    try {
      setError(null);
      setSuccessMessage(null);

      if (!pillarFormData.name) {
        setError('Pillar name is required');
        return;
      }

      if (!pillarFormDomainId) {
        setError('Domain ID is missing');
        return;
      }

      if (isCreatingPillar) {
        // Create new pillar
        await strategicPillarsAPI.create({
          ...pillarFormData,
          domain_id: pillarFormDomainId
        });
        setSuccessMessage('Strategic Pillar created successfully');
      } else if (editingPillar) {
        // Update existing pillar
        await strategicPillarsAPI.update(editingPillar.id, pillarFormData);
        setSuccessMessage('Strategic Pillar updated successfully');
      }

      // Reload pillars for the domain
      await loadPillarsForDomain(pillarFormDomainId);
      await loadDomains(); // Refresh domain stats
      handleCancelPillar();
    } catch (err: any) {
      console.error('Error saving pillar:', err);
      setError(err.response?.data?.error || 'Failed to save pillar');
    }
  };

  const handleDeletePillar = async (pillar: StrategicPillar) => {
    if (!window.confirm(`Are you sure you want to delete "${pillar.name}"? This will also delete all associated strategic goals.`)) {
      return;
    }

    try {
      setError(null);
      setSuccessMessage(null);
      await strategicPillarsAPI.delete(pillar.id);
      setSuccessMessage('Strategic Pillar deleted successfully');
      await loadPillarsForDomain(pillar.domain_id);
      await loadDomains(); // Refresh domain stats
    } catch (err: any) {
      console.error('Error deleting pillar:', err);
      setError(err.response?.data?.error || 'Failed to delete pillar');
    }
  };

  // Outcomes (KPI) management functions
  const loadOutcomesForDomain = async (domainId: number) => {
    try {
      setIsOutcomeLoading(true);
      const outcomes = await outcomesAPI.getAll(domainId);
      setDomainOutcomes(prev => ({ ...prev, [domainId]: outcomes }));
    } catch (err) {
      console.error('Error loading outcomes:', err);
      setError('Failed to load outcomes');
    } finally {
      setIsOutcomeLoading(false);
    }
  };

  const handleToggleOutcomes = async (domainId: number) => {
    if (expandedOutcomesDomainId === domainId) {
      setExpandedOutcomesDomainId(null);
    } else {
      setExpandedOutcomesDomainId(domainId);
      if (!domainOutcomes[domainId]) {
        await loadOutcomesForDomain(domainId);
      }
    }
  };

  const handleCreateOutcome = (domainId: number) => {
    setIsCreatingOutcome(true);
    setEditingOutcome(null);
    setOutcomeFormDomainId(domainId);

    // Get next display order
    const existingOutcomes = domainOutcomes[domainId] || [];
    const maxOrder = existingOutcomes.length > 0
      ? Math.max(...existingOutcomes.map(o => o.display_order))
      : 0;

    setOutcomeFormData({
      outcome_key: '',
      title: '',
      measure: '',
      progress: 0,
      maturity: undefined,
      display_order: maxOrder + 1
    });
    setError(null);
    setSuccessMessage(null);
  };

  const handleEditOutcome = (outcome: Outcome) => {
    setEditingOutcome(outcome);
    setIsCreatingOutcome(false);
    setOutcomeFormDomainId(outcome.domain_id);
    setOutcomeFormData({
      outcome_key: outcome.outcome_key,
      title: outcome.title,
      measure: outcome.measure,
      progress: outcome.progress,
      maturity: outcome.maturity,
      display_order: outcome.display_order
    });
    setError(null);
    setSuccessMessage(null);
  };

  const handleCancelOutcome = () => {
    setEditingOutcome(null);
    setIsCreatingOutcome(false);
    setOutcomeFormDomainId(null);
    setOutcomeFormData({
      outcome_key: '',
      title: '',
      measure: '',
      progress: 0,
      maturity: undefined,
      display_order: 0
    });
    setError(null);
  };

  const handleSaveOutcome = async () => {
    try {
      setError(null);
      setSuccessMessage(null);

      // Validation
      if (!outcomeFormData.title?.trim()) {
        setError('Title is required');
        return;
      }
      if (!outcomeFormData.outcome_key?.trim()) {
        setError('Outcome key is required');
        return;
      }
      if (!outcomeFormData.measure?.trim()) {
        setError('Measure is required');
        return;
      }
      if (!outcomeFormDomainId) {
        setError('Domain ID is missing');
        return;
      }

      // Validate progress/maturity values
      if (outcomeFormData.progress !== undefined) {
        const progress = Number(outcomeFormData.progress);
        if (isNaN(progress) || progress < 0 || progress > 100) {
          setError('Progress must be between 0 and 100');
          return;
        }
        outcomeFormData.progress = progress;
      }

      if (outcomeFormData.maturity !== undefined && outcomeFormData.maturity !== null) {
        const maturity = Number(outcomeFormData.maturity);
        if (isNaN(maturity) || maturity < 1 || maturity > 5) {
          setError('Maturity must be between 1 and 5');
          return;
        }
        outcomeFormData.maturity = maturity;
      }

      if (isCreatingOutcome) {
        // Create new outcome
        const newOutcome = {
          ...outcomeFormData,
          domain_id: outcomeFormDomainId
        };
        await outcomesAPI.create(newOutcome);
        setSuccessMessage('Outcome (KPI) created successfully');
      } else if (editingOutcome) {
        // Update existing outcome
        await outcomesAPI.update(editingOutcome.id!, outcomeFormData);
        setSuccessMessage('Outcome (KPI) updated successfully');
      }

      // Reload outcomes for the domain
      await loadOutcomesForDomain(outcomeFormDomainId);
      await loadDomains(); // Refresh domain stats if needed
      handleCancelOutcome();
    } catch (err: any) {
      console.error('Error saving outcome:', err);
      setError(err.response?.data?.error || 'Failed to save outcome');
    }
  };

  const handleDeleteOutcome = async (outcome: Outcome) => {
    if (!window.confirm(`Are you sure you want to delete "${outcome.title}"?`)) {
      return;
    }

    try {
      setError(null);
      setSuccessMessage(null);
      await outcomesAPI.delete(outcome.id!);
      setSuccessMessage('Outcome (KPI) deleted successfully');
      await loadOutcomesForDomain(outcome.domain_id);
      await loadDomains(); // Refresh domain stats
    } catch (err: any) {
      console.error('Error deleting outcome:', err);
      setError(err.response?.data?.error || 'Failed to delete outcome');
    }
  };

  if (isLoading) {
    return <div className="domain-management-loading">Loading domains...</div>;
  }

  return (
    <div className="domain-management">
      <div className="domain-management-header">
        <div className="header-with-back">
          {onBack && (
            <button className="back-button" onClick={onBack}>
              <FaArrowLeft /> Back
            </button>
          )}
          <div>
            <h1>Domain Management</h1>
            <p className="domain-subtitle">Manage initiative domains and switch between them</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="domain-alert domain-alert-error">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="domain-alert domain-alert-success">
          {successMessage}
        </div>
      )}

      {/* Domain Deletion Confirmation Modal */}
      {deletionPreview && (
        <div className="deletion-modal-overlay">
          <div className="deletion-modal">
            <div className="deletion-modal-header">
              <h3>Delete Domain: {deletionPreview.domain_name}</h3>
            </div>

            <div className="deletion-modal-body">
              {deleteConfirmationStep === 1 ? (
                <>
                  <div className="deletion-warning">
                    <strong>Warning:</strong> {deletionPreview.warning}
                  </div>

                  {deletionPreview.total_items > 0 && (
                    <div className="deletion-counts">
                      <h4>The following will be permanently deleted:</h4>
                      <ul>
                        {deletionPreview.counts.initiatives > 0 && (
                          <li>{deletionPreview.counts.initiatives} initiative(s)</li>
                        )}
                        {deletionPreview.counts.agents > 0 && (
                          <li>{deletionPreview.counts.agents} agent(s)</li>
                        )}
                        {deletionPreview.counts.pillars > 0 && (
                          <li>{deletionPreview.counts.pillars} strategic pillar(s)</li>
                        )}
                        {deletionPreview.counts.goals > 0 && (
                          <li>{deletionPreview.counts.goals} strategic goal(s)</li>
                        )}
                        {deletionPreview.counts.categories > 0 && (
                          <li>{deletionPreview.counts.categories} category(ies)</li>
                        )}
                        {deletionPreview.counts.departments > 0 && (
                          <li>{deletionPreview.counts.departments} department(s)</li>
                        )}
                        {deletionPreview.counts.agent_types > 0 && (
                          <li>{deletionPreview.counts.agent_types} agent type(s)</li>
                        )}
                        {deletionPreview.counts.outcomes > 0 && (
                          <li>{deletionPreview.counts.outcomes} outcome(s)/KPI(s)</li>
                        )}
                      </ul>
                    </div>
                  )}

                  <div className="deletion-audit-notice">
                    This action will be logged in the audit trail and reported.
                  </div>
                </>
              ) : (
                <>
                  <div className="deletion-final-warning">
                    <strong>FINAL CONFIRMATION</strong>
                    <p>This action is irreversible. All data will be permanently deleted.</p>
                  </div>

                  <div className="deletion-confirmation-input">
                    <label>
                      Type <strong>"{deletionPreview.domain_name}"</strong> to confirm deletion:
                    </label>
                    <input
                      type="text"
                      value={deleteConfirmationCode}
                      onChange={(e) => setDeleteConfirmationCode(e.target.value)}
                      placeholder={deletionPreview.domain_name}
                      autoFocus
                    />
                  </div>
                </>
              )}
            </div>

            <div className="deletion-modal-footer">
              <button
                className="btn btn-secondary"
                onClick={handleCancelDelete}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={handleConfirmDelete}
                disabled={isDeleting || (deleteConfirmationStep === 2 && deleteConfirmationCode !== deletionPreview.domain_name)}
              >
                {isDeleting ? 'Deleting...' : (
                  deleteConfirmationStep === 1
                    ? (deletionPreview.total_items > 0 ? 'Continue to Final Confirmation' : 'Delete Domain')
                    : 'Permanently Delete All Data'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Domain Info Bar */}
      <div className="active-domain-info">
        <div className="active-domain-info-header">
          <div>
            <div className="active-domain-label">Current Domain</div>
            <h2 className="active-domain-name">{activeDomain?.name}</h2>
            <p className="active-domain-subtitle">{activeDomain?.subtitle}</p>
          </div>
          <span className="domain-type-badge">{activeDomain?.type.toUpperCase()}</span>
        </div>
        <div className="domain-stats">
          <div className="stat">
            <span className="stat-value">{activeDomain?.initiative_count || 0}</span>
            <span className="stat-label">Initiatives</span>
          </div>
          <div className="stat">
            <span className="stat-value">{activeDomain?.pillar_count || 0}</span>
            <span className="stat-label">Pillars</span>
          </div>
          <div className="stat">
            <span className="stat-value">{activeDomain?.goal_count || 0}</span>
            <span className="stat-label">Goals</span>
          </div>
        </div>
      </div>

      {/* Create/Edit Form */}
      {(isCreating || editingDomain) && (
        <div className="domain-form-card">
          <h3>{isCreating ? 'Create New Domain' : 'Edit Domain'}</h3>

          <div className="form-group">
            <label>Domain Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Information Security"
            />
          </div>

          <div className="form-group">
            <label>Domain Type *</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as DomainType })}
            >
              <option value="ai">AI & Data Science</option>
              <option value="data">Data Management</option>
              <option value="infosec">Information Security</option>
              <option value="infrastructure">Infrastructure</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          <div className="form-group">
            <label>Subtitle</label>
            <input
              type="text"
              value={formData.subtitle}
              onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
              placeholder="e.g., Strategic Initiatives @ DoF"
            />
          </div>

          <div className="form-group">
            <label>Hero Message</label>
            <textarea
              value={formData.hero_message}
              onChange={(e) => setFormData({ ...formData, hero_message: e.target.value })}
              placeholder="Enter a hero message for the value dashboard"
              rows={3}
            />
          </div>

          <div className="form-actions">
            <button className="btn btn-primary" onClick={handleSave}>
              <FaSave /> Save
            </button>
            <button className="btn btn-secondary" onClick={handleCancel}>
              <FaTimes /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Pillar Create/Edit Form */}
      {(isCreatingPillar || editingPillar) && (
        <div className="domain-form-card">
          <h3>{isCreatingPillar ? 'Create New Strategic Pillar' : 'Edit Strategic Pillar'}</h3>

          <div className="form-group">
            <label>Pillar Name *</label>
            <input
              type="text"
              value={pillarFormData.name}
              onChange={(e) => setPillarFormData({ ...pillarFormData, name: e.target.value })}
              placeholder="e.g., Data Governance & Quality"
            />
          </div>

          <div className="form-group">
            <label>Description *</label>
            <textarea
              value={pillarFormData.description}
              onChange={(e) => setPillarFormData({ ...pillarFormData, description: e.target.value })}
              placeholder="Enter a description for this strategic pillar"
              rows={3}
            />
          </div>

          <div className="form-group">
            <label>Display Order</label>
            <input
              type="number"
              value={pillarFormData.display_order}
              onChange={(e) => setPillarFormData({ ...pillarFormData, display_order: parseInt(e.target.value) || 0 })}
              placeholder="0"
              min="0"
            />
            <small style={{ color: '#666', fontSize: '0.85rem', fontStyle: 'italic' }}>Lower numbers appear first</small>
          </div>

          <div className="form-actions">
            <button className="btn btn-primary" onClick={handleSavePillar}>
              <FaSave /> Save Pillar
            </button>
            <button className="btn btn-secondary" onClick={handleCancelPillar}>
              <FaTimes /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Outcome (KPI) Create/Edit Form */}
      {(isCreatingOutcome || editingOutcome) && (
        <div className="domain-form-card">
          <h3>{isCreatingOutcome ? 'Create New Outcome (KPI)' : 'Edit Outcome (KPI)'}</h3>

          <div className="form-group">
            <label>Outcome Key *</label>
            <input
              type="text"
              value={outcomeFormData.outcome_key}
              onChange={(e) => setOutcomeFormData({ ...outcomeFormData, outcome_key: e.target.value })}
              placeholder="e.g., financial, sustainability, operational"
              disabled={!isCreatingOutcome}
            />
            <small>Unique identifier for this outcome (cannot be changed after creation)</small>
          </div>

          <div className="form-group">
            <label>Title *</label>
            <input
              type="text"
              value={outcomeFormData.title}
              onChange={(e) => setOutcomeFormData({ ...outcomeFormData, title: e.target.value })}
              placeholder="e.g., Financial Management Excellence using AI"
            />
          </div>

          <div className="form-group">
            <label>Measure Description *</label>
            <textarea
              value={outcomeFormData.measure}
              onChange={(e) => setOutcomeFormData({ ...outcomeFormData, measure: e.target.value })}
              placeholder="e.g., % of identified processes augmented using AI"
              rows={2}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Progress (0-100%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={outcomeFormData.progress}
                onChange={(e) => setOutcomeFormData({ ...outcomeFormData, progress: parseInt(e.target.value) || 0 })}
              />
            </div>

            <div className="form-group">
              <label>Maturity (1-5) - Optional</label>
              <input
                type="number"
                min="1"
                max="5"
                value={outcomeFormData.maturity || ''}
                onChange={(e) => setOutcomeFormData({ ...outcomeFormData, maturity: e.target.value ? parseInt(e.target.value) : undefined })}
                placeholder="Leave empty if not using maturity"
              />
            </div>

            <div className="form-group">
              <label>Display Order</label>
              <input
                type="number"
                min="0"
                value={outcomeFormData.display_order}
                onChange={(e) => setOutcomeFormData({ ...outcomeFormData, display_order: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div className="form-actions">
            <button className="btn btn-primary" onClick={handleSaveOutcome}>
              <FaSave /> Save Outcome
            </button>
            <button className="btn btn-secondary" onClick={handleCancelOutcome}>
              <FaTimes /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Domain List */}
      <div className="domains-section">
        <div className="section-header">
          <h3>All Domains</h3>
          {!isCreating && !editingDomain && (
            <button className="btn btn-primary" onClick={handleCreate}>
              <FaPlus /> Create Domain
            </button>
          )}
        </div>

        <div className="domains-grid">
          {domains.map((domain) => (
            <div
              key={domain.id}
              className={`domain-card ${domain.id === activeDomain?.id ? 'active' : ''}`}
            >
              <div className="domain-card-header">
                <h4>{domain.name}</h4>
                <span className="domain-type-badge">{domain.type}</span>
              </div>

              <p className="domain-card-subtitle">{domain.subtitle}</p>

              <div className="domain-card-stats">
                <span>{domain.initiative_count || 0} initiatives</span>
                <span>{domain.pillar_count || 0} pillars</span>
                <span>{domain.goal_count || 0} goals</span>
              </div>

              <div className="domain-card-actions">
                {domain.id !== activeDomain?.id && (
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => handleSwitchDomain(domain.id)}
                  >
                    <FaExchangeAlt /> Switch
                  </button>
                )}
                {domain.id === activeDomain?.id && (
                  <span className="active-badge">
                    <FaCheckCircle /> Active
                  </span>
                )}
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => handleEdit(domain)}
                >
                  <FaEdit /> Edit
                </button>
                {domain.id !== activeDomain?.id && (
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => handleDeleteClick(domain)}
                  >
                    <FaTrash /> Delete
                  </button>
                )}
              </div>

              {/* Pillar Management Section */}
              <div className="pillar-management-section">
                <button
                  className="btn btn-sm btn-link pillar-toggle"
                  onClick={() => handleTogglePillars(domain.id)}
                >
                  {expandedDomainId === domain.id ? <FaChevronUp /> : <FaChevronDown />}
                  {expandedDomainId === domain.id ? 'Hide' : 'Manage'} Strategic Pillars
                </button>

                {expandedDomainId === domain.id && (
                  <div className="pillars-container">
                    <div className="pillars-header">
                      <h5>Strategic Pillars</h5>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => handleCreatePillar(domain.id)}
                        disabled={isCreatingPillar || editingPillar !== null}
                      >
                        <FaPlus /> Add Pillar
                      </button>
                    </div>

                    {isPillarLoading ? (
                      <div className="pillar-loading">Loading pillars...</div>
                    ) : domainPillars[domain.id]?.length > 0 ? (
                      <div className="pillars-list">
                        {domainPillars[domain.id].map((pillar) => (
                          <div key={pillar.id} className="pillar-item">
                            <div className="pillar-info">
                              <h6>
                                <span style={{ color: '#B79546', fontWeight: '600', marginRight: '8px' }}>
                                  #{pillar.display_order}
                                </span>
                                {pillar.name}
                              </h6>
                              <p>{pillar.description}</p>
                            </div>
                            <div className="pillar-actions">
                              <button
                                className="btn btn-xs btn-secondary"
                                onClick={() => handleEditPillar(pillar)}
                                disabled={isCreatingPillar || editingPillar !== null}
                              >
                                <FaEdit />
                              </button>
                              <button
                                className="btn btn-xs btn-danger"
                                onClick={() => handleDeletePillar(pillar)}
                                disabled={isCreatingPillar || editingPillar !== null}
                              >
                                <FaTrash />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="no-pillars">
                        No strategic pillars yet. Create one to get started!
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Outcomes (KPIs) Management Section */}
              <div className="outcomes-management-section">
                <button
                  className="btn btn-sm btn-link outcomes-toggle"
                  onClick={() => handleToggleOutcomes(domain.id)}
                >
                  {expandedOutcomesDomainId === domain.id ? <FaChevronUp /> : <FaChevronDown />}
                  {expandedOutcomesDomainId === domain.id ? 'Hide' : 'Manage'} Outcomes (KPIs)
                  <FaBullseye style={{ marginLeft: '4px' }} />
                </button>

                {expandedOutcomesDomainId === domain.id && (
                  <div className="outcomes-container">
                    <div className="outcomes-header">
                      <h5>Domain Outcomes (KPIs)</h5>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => handleCreateOutcome(domain.id)}
                        disabled={isCreatingOutcome || editingOutcome !== null}
                      >
                        <FaPlus /> Add Outcome
                      </button>
                    </div>

                    {isOutcomeLoading ? (
                      <div className="outcome-loading">Loading outcomes...</div>
                    ) : domainOutcomes[domain.id]?.length > 0 ? (
                      <div className="outcomes-list">
                        {domainOutcomes[domain.id].map((outcome) => (
                          <div key={outcome.id} className="outcome-item">
                            <div className="outcome-info">
                              <div className="outcome-header-row">
                                <h6>{outcome.title}</h6>
                                <span className="outcome-key-badge">{outcome.outcome_key}</span>
                              </div>
                              <p className="outcome-measure">{outcome.measure}</p>
                              <div className="outcome-metrics">
                                {outcome.maturity !== undefined && outcome.maturity !== null ? (
                                  <span className="metric-badge maturity">
                                    Maturity: {outcome.maturity}/5
                                  </span>
                                ) : (
                                  <span className="metric-badge progress">
                                    Progress: {outcome.progress}%
                                  </span>
                                )}
                                <span className="metric-badge order">Order: {outcome.display_order}</span>
                              </div>
                            </div>
                            <div className="outcome-actions">
                              <button
                                className="btn btn-xs btn-secondary"
                                onClick={() => handleEditOutcome(outcome)}
                                disabled={isCreatingOutcome || editingOutcome !== null}
                              >
                                <FaEdit />
                              </button>
                              <button
                                className="btn btn-xs btn-danger"
                                onClick={() => handleDeleteOutcome(outcome)}
                                disabled={isCreatingOutcome || editingOutcome !== null}
                              >
                                <FaTrash />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="no-outcomes">
                        No outcomes (KPIs) yet. Create one to get started!
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DomainManagement;
