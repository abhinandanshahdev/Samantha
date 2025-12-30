import React, { useState, useCallback } from 'react';
import Stepper from '../common/Stepper';
import { ImportValidationResponse, ImportResponse, ImportDomainResult } from '../../../../types';
import { useCaseAPI } from '../../../../services/apiService';
import { useDomain } from '../../../../context/DomainContext';
import './ImportWizard.css';

interface ImportWizardProps {
  onClose: () => void;
}

type ImportStep = 'upload' | 'preview' | 'validation' | 'importing' | 'complete';

const ImportWizard: React.FC<ImportWizardProps> = ({ onClose }) => {
  const { refreshDomains } = useDomain();
  const [currentStep, setCurrentStep] = useState<ImportStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [validationResult, setValidationResult] = useState<ImportValidationResponse | null>(null);
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const steps = [
    { label: 'Upload', completed: currentStep !== 'upload', active: currentStep === 'upload' },
    { label: 'Preview', completed: ['validation', 'importing', 'complete'].includes(currentStep), active: currentStep === 'preview' },
    { label: 'Validate', completed: ['importing', 'complete'].includes(currentStep), active: currentStep === 'validation' },
    { label: 'Import', completed: currentStep === 'complete', active: currentStep === 'importing' },
    { label: 'Complete', completed: false, active: currentStep === 'complete' }
  ];

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type === 'application/json') {
      setFile(droppedFile);
      setError(null);
    } else {
      setError('Please upload a JSON file');
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type === 'application/json' || selectedFile.name.endsWith('.json')) {
        setFile(selectedFile);
        setError(null);
      } else {
        setError('Please upload a JSON file');
      }
    }
  };

  const handleValidate = async () => {
    if (!file) return;

    try {
      setLoading(true);
      setError(null);
      const result = await useCaseAPI.validateJsonImport(file);
      setValidationResult(result);
      setCurrentStep('validation');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to validate import file');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file) return;

    setCurrentStep('importing');
    setImportProgress(10);

    try {
      const progressInterval = setInterval(() => {
        setImportProgress(prev => Math.min(prev + 10, 90));
      }, 300);

      const result = await useCaseAPI.importFromJson(file);

      clearInterval(progressInterval);
      setImportProgress(100);
      setImportResult(result);

      // Refresh domains list so the newly imported domain appears
      // This is critical - without this, the user won't see the new domain
      await refreshDomains();

      setTimeout(() => {
        setCurrentStep('complete');
      }, 500);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Import failed');
      setCurrentStep('validation');
    }
  };

  const handleBack = () => {
    if (currentStep === 'preview') {
      setCurrentStep('upload');
    } else if (currentStep === 'validation') {
      setCurrentStep('preview');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const renderUploadStep = () => (
    <div className="import-step-content">
      <div className="step-header">
        <h3>Upload JSON File</h3>
        <p>Upload a domain export file to import data.</p>
      </div>

      <div
        className={`drop-zone ${isDragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {file ? (
          <div className="file-info">
            <div className="file-icon">
              <svg viewBox="0 0 24 24" width="48" height="48" fill="var(--dof-primary-gold)">
                <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
              </svg>
            </div>
            <div className="file-details">
              <span className="file-name">{file.name}</span>
              <span className="file-size">{formatFileSize(file.size)}</span>
            </div>
            <button className="btn-remove" onClick={() => setFile(null)}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          </div>
        ) : (
          <>
            <div className="drop-icon">
              <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
                <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" />
              </svg>
            </div>
            <p className="drop-text">Drag and drop your JSON file here</p>
            <p className="drop-subtext">or</p>
            <label className="btn-browse">
              Browse Files
              <input type="file" accept=".json,application/json" onChange={handleFileSelect} hidden />
            </label>
          </>
        )}
      </div>
    </div>
  );

  const renderPreviewStep = () => {
    // Parse file to get preview (we'll do this on validation, show loading state)
    return (
      <div className="import-step-content">
        <div className="step-header">
          <h3>File Preview</h3>
          <p>Click "Validate" to check the file contents before importing.</p>
        </div>

        <div className="preview-file-info">
          <div className="file-icon">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="var(--dof-primary-gold)">
              <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
            </svg>
          </div>
          <div className="file-details">
            <span className="file-name">{file?.name}</span>
            <span className="file-size">{file ? formatFileSize(file.size) : ''}</span>
          </div>
        </div>

        {loading && (
          <div className="validation-loading">
            <div className="spinner" />
            <p>Validating file contents...</p>
          </div>
        )}
      </div>
    );
  };

  const renderValidationStep = () => (
    <div className="import-step-content">
      <div className="step-header">
        <h3>Validation Results</h3>
        <p>
          {validationResult?.valid
            ? 'File is valid and ready for import.'
            : 'There are issues with the import file.'}
        </p>
      </div>

      <div className="validation-summary">
        <div className={`validation-status ${validationResult?.valid ? 'success' : 'error'}`}>
          {validationResult?.valid ? (
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          )}
          <span>{validationResult?.valid ? 'Validation Passed' : 'Validation Failed'}</span>
        </div>

        <div className="validation-counts">
          <div className="count-item">
            <span className="count-value">{validationResult?.total_to_import || 0}</span>
            <span className="count-label">To Import</span>
          </div>
          <div className="count-item">
            <span className="count-value">{validationResult?.total_to_skip || 0}</span>
            <span className="count-label">To Skip</span>
          </div>
        </div>
      </div>

      {validationResult?.missing_authors && validationResult.missing_authors.length > 0 && (
        <div className="validation-section">
          <h4>Author Mapping</h4>
          <p className="section-note">The following authors will be mapped to you:</p>
          <div className="author-mapping">
            {validationResult.missing_authors.map((author, idx) => (
              <div key={idx} className="mapping-item">
                <span className="original">{author.original_name}</span>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
                </svg>
                <span className="mapped">{author.mapped_to}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {validationResult?.domains && (
        <div className="validation-section">
          <h4>Domains to Import</h4>
          <div className="domain-list">
            {validationResult.domains.map((domain, idx) => (
              <div key={idx} className={`domain-item ${domain.exists ? 'existing' : ''}`}>
                <div className="domain-header">
                  <span className="domain-name">{domain.name}</span>
                  {domain.exists ? (
                    <span className="badge merge">Exists - Will Merge New</span>
                  ) : domain.has_errors ? (
                    <span className="badge error">Has Errors</span>
                  ) : (
                    <span className="badge success">Ready</span>
                  )}
                </div>
                {domain.entity_counts && (
                  <div className="entity-summary">
                    {Object.entries(domain.entity_counts).map(([key, counts]) => (
                      (counts.to_import > 0 || counts.to_skip > 0) && (
                        <span key={key} className="entity-count">
                          {key.replace(/_/g, ' ')}: {counts.to_import}
                          {counts.to_skip > 0 && <span className="skip-count"> (+{counts.to_skip} skip)</span>}
                        </span>
                      )
                    ))}
                  </div>
                )}
                {domain.validation_issues && domain.validation_issues.length > 0 && (
                  <div className="issues-list">
                    {domain.validation_issues.slice(0, 5).map((issue, i) => (
                      <div key={i} className={`issue-item ${issue.severity}`}>
                        <span className="issue-type">{issue.entity_type}</span>
                        <span className="issue-message">{issue.message}</span>
                      </div>
                    ))}
                    {domain.validation_issues.length > 5 && (
                      <div className="more-issues">+{domain.validation_issues.length - 5} more issues</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderImportingStep = () => (
    <div className="import-step-content importing">
      <div className="import-progress">
        <div className="progress-icon">
          <svg viewBox="0 0 24 24" width="48" height="48" className="spinning">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" strokeDasharray="40 60" />
          </svg>
        </div>
        <h3>Importing Data...</h3>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${importProgress}%` }} />
        </div>
        <p>{importProgress}% complete</p>
      </div>
    </div>
  );

  const renderCompleteStep = () => (
    <div className="import-step-content complete">
      <div className={`complete-icon ${importResult?.success ? 'success' : 'error'}`}>
        {importResult?.success ? (
          <svg viewBox="0 0 24 24" width="64" height="64" fill="#28a745">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="64" height="64" fill="#dc2626">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
          </svg>
        )}
      </div>
      <h3>{importResult?.success ? 'Import Complete!' : 'Import Completed with Issues'}</h3>
      <p>{importResult?.message}</p>

      {importResult?.success && importResult?.domains?.some(d => d.status === 'imported' || d.status === 'merged') && (
        <div className="switch-domain-hint">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
          </svg>
          <span>
            {importResult?.domains?.some(d => d.status === 'merged')
              ? 'New entities have been merged into existing domains. Refresh your view to see the changes.'
              : 'Switch to the imported domain using the domain selector in the header to view initiatives and agents.'}
          </span>
        </div>
      )}

      {importResult?.domains && (
        <div className="import-results">
          {importResult.domains.map((domain: ImportDomainResult, idx: number) => (
            <div key={idx} className={`result-domain ${domain.status}`}>
              <div className="result-header">
                <span className="domain-name">{domain.name}</span>
                <span className={`status-badge ${domain.status}`}>
                  {domain.status === 'imported' ? 'Imported' : domain.status === 'merged' ? 'Merged' : domain.status === 'skipped' ? 'Skipped' : 'Error'}
                </span>
              </div>
              {(domain.status === 'imported' || domain.status === 'merged') && domain.entities && (
                <div className="result-entities">
                  {Object.entries(domain.entities).map(([key, counts]) => (
                    (counts.imported > 0 || counts.skipped > 0) && (
                      <div key={key} className="entity-result">
                        <span className="entity-name">{key.replace(/_/g, ' ')}</span>
                        <span className="entity-counts">
                          <span className="imported">{counts.imported} imported</span>
                          {counts.skipped > 0 && <span className="skipped">{counts.skipped} skipped</span>}
                          {counts.errors > 0 && <span className="errors">{counts.errors} errors</span>}
                        </span>
                      </div>
                    )
                  ))}
                </div>
              )}
              {domain.error && <div className="domain-error">{domain.error}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="import-wizard">
      <Stepper steps={steps} currentStep={steps.findIndex(s => s.active)} />

      {error && <div className="error-banner">{error}</div>}

      {currentStep === 'upload' && renderUploadStep()}
      {currentStep === 'preview' && renderPreviewStep()}
      {currentStep === 'validation' && renderValidationStep()}
      {currentStep === 'importing' && renderImportingStep()}
      {currentStep === 'complete' && renderCompleteStep()}

      <div className="wizard-actions">
        {currentStep === 'upload' && (
          <>
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button
              className="btn-primary"
              onClick={() => setCurrentStep('preview')}
              disabled={!file}
            >
              Next
            </button>
          </>
        )}
        {currentStep === 'preview' && (
          <>
            <button className="btn-secondary" onClick={handleBack}>Back</button>
            <button className="btn-primary" onClick={handleValidate} disabled={loading}>
              {loading ? 'Validating...' : 'Validate'}
            </button>
          </>
        )}
        {currentStep === 'validation' && (
          <>
            <button className="btn-secondary" onClick={handleBack}>Back</button>
            <button
              className="btn-primary"
              onClick={handleImport}
              disabled={!validationResult?.valid}
            >
              Import Now
            </button>
          </>
        )}
        {currentStep === 'complete' && (
          <>
            <button className="btn-secondary" onClick={onClose}>Close</button>
            <button className="btn-primary" onClick={() => {
              setCurrentStep('upload');
              setFile(null);
              setValidationResult(null);
              setImportResult(null);
            }}>
              Import Another
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default ImportWizard;
