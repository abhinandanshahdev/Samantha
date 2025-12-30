import React, { useState, useEffect } from 'react';
import Stepper from '../common/Stepper';
import { Domain, ExportPreviewResponse, ExportPreviewDomain } from '../../../../types';
import { useCaseAPI, domainAPI } from '../../../../services/apiService';
import './ExportWizard.css';

interface ExportWizardProps {
  onClose: () => void;
}

type ExportStep = 'select' | 'preview' | 'exporting' | 'complete';

const ExportWizard: React.FC<ExportWizardProps> = ({ onClose }) => {
  const [currentStep, setCurrentStep] = useState<ExportStep>('select');
  const [domains, setDomains] = useState<Domain[]>([]);
  const [selectedDomains, setSelectedDomains] = useState<number[]>([]);
  const [previewData, setPreviewData] = useState<ExportPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState(0);

  const steps = [
    { label: 'Select Domains', completed: currentStep !== 'select', active: currentStep === 'select' },
    { label: 'Preview', completed: currentStep === 'exporting' || currentStep === 'complete', active: currentStep === 'preview' },
    { label: 'Export', completed: currentStep === 'complete', active: currentStep === 'exporting' },
    { label: 'Complete', completed: false, active: currentStep === 'complete' }
  ];

  useEffect(() => {
    loadDomains();
  }, []);

  const loadDomains = async () => {
    try {
      setLoading(true);
      const data = await domainAPI.getAll();
      setDomains(data);
    } catch (err) {
      setError('Failed to load domains');
    } finally {
      setLoading(false);
    }
  };

  const handleDomainToggle = (domainId: number) => {
    setSelectedDomains(prev =>
      prev.includes(domainId)
        ? prev.filter(id => id !== domainId)
        : [...prev, domainId]
    );
  };

  const handleSelectAll = () => {
    if (selectedDomains.length === domains.length) {
      setSelectedDomains([]);
    } else {
      setSelectedDomains(domains.map(d => d.id));
    }
  };

  const handleNext = async () => {
    if (currentStep === 'select') {
      if (selectedDomains.length === 0) {
        setError('Please select at least one domain');
        return;
      }
      try {
        setLoading(true);
        setError(null);
        const preview = await useCaseAPI.getExportPreview(selectedDomains);
        setPreviewData(preview);
        setCurrentStep('preview');
      } catch (err) {
        setError('Failed to load export preview');
      } finally {
        setLoading(false);
      }
    } else if (currentStep === 'preview') {
      setCurrentStep('exporting');
      handleExport();
    }
  };

  const handleBack = () => {
    if (currentStep === 'preview') {
      setCurrentStep('select');
    }
  };

  const handleExport = async () => {
    try {
      setExportProgress(10);
      // Simulate progress
      const progressInterval = setInterval(() => {
        setExportProgress(prev => Math.min(prev + 15, 90));
      }, 200);

      await useCaseAPI.exportToJson(selectedDomains);

      clearInterval(progressInterval);
      setExportProgress(100);
      setTimeout(() => {
        setCurrentStep('complete');
      }, 500);
    } catch (err) {
      setError('Export failed. Please try again.');
      setCurrentStep('preview');
    }
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat().format(num);
  };

  const renderSelectStep = () => (
    <div className="export-step-content">
      <div className="step-header">
        <h3>Select Domains to Export</h3>
        <p>Choose one or more domains. All data within selected domains will be exported.</p>
      </div>

      <div className="select-actions">
        <button className="btn-link" onClick={handleSelectAll}>
          {selectedDomains.length === domains.length ? 'Deselect All' : 'Select All'}
        </button>
        <span className="selected-count">{selectedDomains.length} of {domains.length} selected</span>
      </div>

      <div className="domain-cards-grid">
        {domains.map(domain => (
          <div
            key={domain.id}
            className={`domain-card ${selectedDomains.includes(domain.id) ? 'selected' : ''}`}
            onClick={() => handleDomainToggle(domain.id)}
          >
            <div className="domain-card-header">
              <input
                type="checkbox"
                checked={selectedDomains.includes(domain.id)}
                onChange={() => handleDomainToggle(domain.id)}
                onClick={e => e.stopPropagation()}
              />
              <h4>{domain.name}</h4>
            </div>
            <div className="domain-card-stats">
              <div className="stat">
                <span className="stat-value">{domain.initiative_count || 0}</span>
                <span className="stat-label">Initiatives</span>
              </div>
              <div className="stat">
                <span className="stat-value">{domain.pillar_count || 0}</span>
                <span className="stat-label">Pillars</span>
              </div>
              <div className="stat">
                <span className="stat-value">{domain.goal_count || 0}</span>
                <span className="stat-label">Goals</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderPreviewStep = () => (
    <div className="export-step-content">
      <div className="step-header">
        <h3>Export Preview</h3>
        <p>Review what will be exported. Total: {formatNumber(previewData?.total_entities || 0)} entities (~{previewData?.estimated_size_kb || 0} KB)</p>
      </div>

      <div className="preview-domains">
        {previewData?.domains.map((domain: ExportPreviewDomain) => (
          <div key={domain.id} className="preview-domain">
            <div className="preview-domain-header">
              <h4>{domain.name}</h4>
              <span className="entity-count">{formatNumber(domain.total)} entities</span>
            </div>
            <div className="preview-domain-tree">
              {Object.entries(domain.counts).map(([key, count]) => (
                count > 0 && (
                  <div key={key} className="tree-item">
                    <span className="tree-label">{key.replace(/_/g, ' ')}</span>
                    <span className="tree-count">{formatNumber(count)}</span>
                  </div>
                )
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderExportingStep = () => (
    <div className="export-step-content exporting">
      <div className="export-progress">
        <div className="progress-icon">
          <svg viewBox="0 0 24 24" width="48" height="48" className="spinning">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" strokeDasharray="40 60" />
          </svg>
        </div>
        <h3>Exporting Data...</h3>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${exportProgress}%` }} />
        </div>
        <p>{exportProgress}% complete</p>
      </div>
    </div>
  );

  const renderCompleteStep = () => (
    <div className="export-step-content complete">
      <div className="complete-icon">
        <svg viewBox="0 0 24 24" width="64" height="64" fill="#28a745">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
        </svg>
      </div>
      <h3>Export Complete!</h3>
      <p>Your domains have been exported successfully.</p>
      <p className="file-info">File: domain-export-{new Date().toISOString().split('T')[0]}.json</p>
      <div className="complete-stats">
        <div className="stat">
          <span className="stat-value">{previewData?.domains.length || 0}</span>
          <span className="stat-label">Domains</span>
        </div>
        <div className="stat">
          <span className="stat-value">{formatNumber(previewData?.total_entities || 0)}</span>
          <span className="stat-label">Entities</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="export-wizard">
      <Stepper steps={steps} currentStep={steps.findIndex(s => s.active)} />

      {error && <div className="error-banner">{error}</div>}
      {loading && currentStep === 'select' && <div className="loading-overlay">Loading domains...</div>}

      {currentStep === 'select' && renderSelectStep()}
      {currentStep === 'preview' && renderPreviewStep()}
      {currentStep === 'exporting' && renderExportingStep()}
      {currentStep === 'complete' && renderCompleteStep()}

      <div className="wizard-actions">
        {currentStep === 'select' && (
          <>
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={handleNext} disabled={selectedDomains.length === 0}>
              Next
            </button>
          </>
        )}
        {currentStep === 'preview' && (
          <>
            <button className="btn-secondary" onClick={handleBack}>Back</button>
            <button className="btn-primary" onClick={handleNext}>
              Export Now
            </button>
          </>
        )}
        {currentStep === 'complete' && (
          <>
            <button className="btn-secondary" onClick={onClose}>Close</button>
            <button className="btn-primary" onClick={() => {
              setCurrentStep('select');
              setSelectedDomains([]);
              setPreviewData(null);
            }}>
              Export Another
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default ExportWizard;
