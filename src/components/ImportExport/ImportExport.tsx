import React, { useState, useEffect } from 'react';
import { useCaseAPI } from '../../services/apiService';
import { FaDownload, FaUpload, FaFileExcel, FaSpinner, FaCheckCircle, FaExclamationTriangle, FaInfoCircle, FaArrowLeft, FaFilter } from 'react-icons/fa';
import './ImportExport.css';

interface ImportResult {
  message: string;
  imported: number;
  errors: number;
  results: {
    domains?: Array<{ row: number; name: string; status: string; }>;
    categories?: Array<{ row: number; name: string; status: string; }>;
    departments?: Array<{ row: number; name: string; status: string; }>;
    outcomes?: Array<{ row: number; name: string; status: string; }>;
    strategic_pillars?: Array<{ row: number; name: string; status: string; }>;
    strategic_goals?: Array<{ row: number; title: string; status: string; }>;
    use_cases?: Array<{ row: number; title: string; status: string; }>;
    alignments?: Array<{ row: number; use_case: string; goal: string; status: string; }>;
    associations?: Array<{ row: number; status: string; }>;
    likes?: Array<{ row: number; status: string; }>;
    comments?: Array<{ row: number; status: string; }>;
  };
  errorDetails: string[];
}

interface Domain {
  id: number;
  name: string;
  type: string;
}

type ExportType = 'domains' | 'use_cases' | 'strategic_goals' | 'strategic_pillars' | 'likes' | 'comments' | 'associations' | 'alignments' | 'all';
type ExportFormat = 'csv' | 'json';

interface ImportExportProps {
  onBackToDashboard?: () => void;
}

const ImportExport: React.FC<ImportExportProps> = ({ onBackToDashboard }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [exportType, setExportType] = useState<ExportType>('use_cases');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');
  const [importType, setImportType] = useState<ExportType>('use_cases');
  const [showExportFilters, setShowExportFilters] = useState(false);
  const [selectedDomainId, setSelectedDomainId] = useState<string>('');
  const [domains, setDomains] = useState<Domain[]>([]);

  // Load domains on component mount
  useEffect(() => {
    const loadDomains = async () => {
      try {
        const response = await fetch('/api/domains');
        const data = await response.json();
        setDomains(data);
      } catch (error) {
        console.error('Failed to load domains:', error);
      }
    };
    loadDomains();
  }, []);

  const handleExport = async () => {
    try {
      setIsExporting(true);
      if (exportFormat === 'csv') {
        await useCaseAPI.exportToCsv(exportType, selectedDomainId || undefined);
      } else {
        // JSON export would be implemented here if backend supports it
        alert('JSON export not yet implemented.');
      }
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
        alert('Please select a CSV file.');
        return;
      }
      setSelectedFile(file);
      setImportResult(null);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) {
      alert('Please select a CSV file first.');
      return;
    }

    try {
      setIsImporting(true);
      const result = await useCaseAPI.importFromCsv(selectedFile);
      setImportResult(result);
    } catch (error: any) {
      console.error('Import failed:', error);
      const errorMessage = error.response?.data?.error || 'Import failed. Please try again.';
      alert(errorMessage);
    } finally {
      setIsImporting(false);
    }
  };

  const downloadTemplate = () => {
    let csvContent = '';
    let filename = '';

    if (importType === 'use_cases') {
      csvContent = `data_type,domain_id,domain_name,title,description,problem_statement,solution_overview,technical_implementation,results_metrics,lessons_learned,status,kanban_pillar,expected_delivery_date,data_complexity,integration_complexity,intelligence_complexity,functional_complexity,strategic_impact,justification,category_name,department_name,author_name,owner_name,owner_email,strategic_goal_ids
use_case,1,"AI & Data Science","AI-Powered Invoice Processing","Automated invoice processing using OCR and machine learning","Manual invoice processing is time-consuming and error-prone","Implement OCR and ML models to automatically extract and validate invoice data","Python-based OCR with TensorFlow models deployed on Azure","Reduced processing time by 70%, 95% accuracy rate","Need robust error handling for edge cases","production","in_progress","Jan 2025","High","Medium","High","Medium","High","Automation improved efficiency","Internally deploy LLMs","Government Financial Affairs","John Smith","john.smith@example.com","jane.doe@example.com","1,2"`;
      filename = 'ai-initiatives-template.csv';
    } else if (importType === 'strategic_goals') {
      csvContent = `data_type,domain_id,domain_name,title,description,strategic_pillar_name,target_date,priority,status,success_metrics,author_name
strategic_goal,1,"AI & Data Science","Digital Transformation Initiative","Modernize government services through digital solutions","Technology Innovation","2024-12-31","High","active","50% of services digitized","Jane Smith"`;
      filename = 'strategic-goals-template.csv';
    } else if (importType === 'strategic_pillars') {
      csvContent = `data_type,domain_id,domain_name,name,description
strategic_pillar,1,"AI & Data Science","Technology Innovation","Focus on innovative technology solutions to improve efficiency"`;
      filename = 'strategic-pillars-template.csv';
    } else {
      csvContent = `data_type,domain_id,domain_name,title,name,description,problem_statement,solution_overview,technical_implementation,results_metrics,lessons_learned,status,kanban_pillar,expected_delivery_date,data_complexity,integration_complexity,intelligence_complexity,functional_complexity,strategic_impact,justification,category_name,department_name,author_name,owner_name,owner_email,strategic_goal_ids,strategic_pillar_name,target_date,priority,success_metrics
use_case,1,"AI & Data Science","AI-Powered Invoice Processing","","Automated invoice processing using OCR and machine learning","Manual invoice processing is time-consuming and error-prone","Implement OCR and ML models to automatically extract and validate invoice data","Python-based OCR with TensorFlow models deployed on Azure","Reduced processing time by 70%, 95% accuracy rate","Need robust error handling for edge cases","production","in_progress","Jan 2025","High","Medium","High","Medium","High","Automation improved efficiency","Internally deploy LLMs","Government Financial Affairs","John Smith","john.smith@example.com","jane.doe@example.com","1,2","","","",""
strategic_goal,1,"AI & Data Science","Digital Transformation Initiative","","Modernize government services through digital solutions","","","","","","active","","","","","","","","","","","Jane Smith","","","","Technology Innovation","2024-12-31","High","50% of services digitized"
strategic_pillar,1,"AI & Data Science","","Technology Innovation","Focus on innovative technology solutions to improve efficiency","","","","","","","","","","","","","","","","","","","","","","","",""`;
      filename = 'all-entities-template.csv';
    }

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="import-export-dashboard">
      <div className="import-export-header">
        <div className="header-title">
          {onBackToDashboard && (
            <button
              onClick={onBackToDashboard}
              className="back-button"
            >
              <FaArrowLeft />
              Back to Family Goals
            </button>
          )}
          <h1>Import/Export Management</h1>
          <p className="header-subtitle">Manage initiatives data through CSV import and export</p>
        </div>
      </div>
      <div className="import-export-content">

        <div className="import-export-sections">
          {/* Export Section */}
          <div className="section-card export-section">
            <div className="section-header">
              <div className="section-icon-wrapper export-icon">
                <FaDownload className="section-icon" />
              </div>
              <div className="section-title">
                <h3>Export Data</h3>
                <p>Export data to CSV files for backup or external analysis</p>
              </div>
            </div>
            <div className="section-content">
              <div className="export-options">
                <div className="option-group">
                  <label>Export Type:</label>
                  <select
                    value={exportType}
                    onChange={(e) => setExportType(e.target.value as ExportType)}
                    className="select-input"
                  >
                    <option value="all">All Data (Complete Export)</option>
                    <option value="domains">Domains Only</option>
                    <option value="use_cases">Initiatives Only</option>
                    <option value="strategic_goals">Strategic Goals Only</option>
                    <option value="strategic_pillars">Strategic Pillars Only</option>
                    <option value="alignments">Use Case-Goal Alignments Only</option>
                    <option value="associations">Use Case Associations Only</option>
                    <option value="likes">Likes Only</option>
                    <option value="comments">Comments Only</option>
                  </select>
                </div>
                
                <div className="option-group">
                  <label>Format:</label>
                  <select 
                    value={exportFormat} 
                    onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
                    className="select-input"
                  >
                    <option value="csv">CSV</option>
                    <option value="json" disabled>JSON (Coming Soon)</option>
                  </select>
                </div>
                
                <button 
                  onClick={() => setShowExportFilters(!showExportFilters)}
                  className="secondary-button filter-toggle"
                >
                  <FaFilter />
                  {showExportFilters ? 'Hide' : 'Show'} Filters
                </button>
              </div>
              
              {showExportFilters && (
                <div className="export-filters">
                  <div className="option-group">
                    <label>Filter by Domain (Optional):</label>
                    <select
                      value={selectedDomainId}
                      onChange={(e) => setSelectedDomainId(e.target.value)}
                      className="select-input"
                    >
                      <option value="">All Domains</option>
                      {domains.map((domain) => (
                        <option key={domain.id} value={domain.id}>
                          {domain.name}
                        </option>
                      ))}
                    </select>
                    <p className="filter-note">
                      <FaInfoCircle /> When "All Data" is selected: exports the domain and ALL its related data (pillars, goals, initiatives, alignments, etc.)
                    </p>
                  </div>
                </div>
              )}
              
              <button 
                onClick={handleExport}
                disabled={isExporting}
                className="primary-button export-button"
              >
                {isExporting ? (
                  <>
                    <FaSpinner className="spinner" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <FaDownload />
                    Export {exportFormat.toUpperCase()}
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Import Section */}
          <div className="section-card import-section">
            <div className="section-header">
              <div className="section-icon-wrapper import-icon">
                <FaUpload className="section-icon" />
              </div>
              <div className="section-title">
                <h3>Import Data</h3>
                <p>Import data from CSV files. Select the entity type and download the corresponding template</p>
              </div>
            </div>
            <div className="section-content">
              <div className="import-options">
                <div className="option-group">
                  <label>Import Type:</label>
                  <select 
                    value={importType} 
                    onChange={(e) => setImportType(e.target.value as ExportType)}
                    className="select-input"
                  >
                    <option value="use_cases">Use Cases</option>
                    <option value="strategic_goals">Strategic Goals</option>
                    <option value="strategic_pillars">Strategic Pillars</option>
                    <option value="all">Multi-Entity (All Types)</option>
                  </select>
                </div>
              </div>
              
              <div className="import-actions">
                <button 
                  onClick={downloadTemplate}
                  className="secondary-button template-button"
                >
                  <FaFileExcel />
                  Download {importType === 'all' ? 'Multi-Entity' : importType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())} Template
                </button>

                <div className="file-upload-container">
                  <div className="file-upload">
                    <label htmlFor="csv-file" className="file-input-label">
                      <FaUpload />
                      Choose CSV File
                    </label>
                    <input
                      id="csv-file"
                      type="file"
                      accept=".csv"
                      onChange={handleFileSelect}
                      className="file-input"
                    />
                  </div>
                  {selectedFile && (
                    <div className="selected-file">
                      <FaFileExcel className="file-icon" />
                      <span>{selectedFile.name}</span>
                    </div>
                  )}
                </div>

                <button 
                  onClick={handleImport}
                  disabled={isImporting || !selectedFile}
                  className="primary-button import-button"
                >
                  {isImporting ? (
                    <>
                      <FaSpinner className="spinner" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <FaUpload />
                      Import CSV
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Import Results */}
        {importResult && (
          <div className="section-card results-section">
            <div className="section-header">
              <div className="section-icon-wrapper results-icon">
                <FaInfoCircle className="section-icon" />
              </div>
              <div className="section-title">
                <h3>Import Results</h3>
                <p>Summary of the import operation</p>
              </div>
            </div>
            <div className="section-content">
              <div className="results-summary">
                <div className="result-stat success">
                  <FaCheckCircle className="stat-icon" />
                  <div className="stat-content">
                    <strong>{importResult.imported}</strong>
                    <span>Successfully Imported</span>
                  </div>
                </div>
                <div className="result-stat error">
                  <FaExclamationTriangle className="stat-icon" />
                  <div className="stat-content">
                    <strong>{importResult.errors}</strong>
                    <span>Errors</span>
                  </div>
                </div>
              </div>

              {((importResult.results.domains && importResult.results.domains.length > 0) ||
                (importResult.results.categories && importResult.results.categories.length > 0) ||
                (importResult.results.departments && importResult.results.departments.length > 0) ||
                (importResult.results.outcomes && importResult.results.outcomes.length > 0) ||
                (importResult.results.strategic_pillars && importResult.results.strategic_pillars.length > 0) ||
                (importResult.results.strategic_goals && importResult.results.strategic_goals.length > 0) ||
                (importResult.results.use_cases && importResult.results.use_cases.length > 0) ||
                (importResult.results.alignments && importResult.results.alignments.length > 0)) && (
                <div className="imported-items">
                  <h4>Successfully Imported Items</h4>
                  
                  {importResult.results.domains && importResult.results.domains.length > 0 && (
                    <div className="entity-group">
                      <h5>Domains ({importResult.results.domains.length})</h5>
                      <div className="items-list">
                        {importResult.results.domains.map((item, index) => (
                          <div key={`dom-${index}`} className="import-item">
                            <FaCheckCircle className="item-icon success" />
                            <div className="item-content">
                              <strong>Row {item.row}:</strong> {item.name}
                              <span className="item-status">{item.status}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {importResult.results.categories && importResult.results.categories.length > 0 && (
                    <div className="entity-group">
                      <h5>Categories ({importResult.results.categories.length})</h5>
                      <div className="items-list">
                        {importResult.results.categories.map((item, index) => (
                          <div key={`cat-${index}`} className="import-item">
                            <FaCheckCircle className="item-icon success" />
                            <div className="item-content">
                              <strong>Row {item.row}:</strong> {item.name}
                              <span className="item-status">{item.status}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {importResult.results.departments && importResult.results.departments.length > 0 && (
                    <div className="entity-group">
                      <h5>Departments ({importResult.results.departments.length})</h5>
                      <div className="items-list">
                        {importResult.results.departments.map((item, index) => (
                          <div key={`dept-${index}`} className="import-item">
                            <FaCheckCircle className="item-icon success" />
                            <div className="item-content">
                              <strong>Row {item.row}:</strong> {item.name}
                              <span className="item-status">{item.status}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {importResult.results.outcomes && importResult.results.outcomes.length > 0 && (
                    <div className="entity-group">
                      <h5>Outcomes ({importResult.results.outcomes.length})</h5>
                      <div className="items-list">
                        {importResult.results.outcomes.map((item, index) => (
                          <div key={`out-${index}`} className="import-item">
                            <FaCheckCircle className="item-icon success" />
                            <div className="item-content">
                              <strong>Row {item.row}:</strong> {item.name}
                              <span className="item-status">{item.status}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {importResult.results.use_cases && importResult.results.use_cases.length > 0 && (
                    <div className="entity-group">
                      <h5>Use Cases ({importResult.results.use_cases.length})</h5>
                      <div className="items-list">
                        {importResult.results.use_cases.map((item, index) => (
                          <div key={`uc-${index}`} className="import-item">
                            <FaCheckCircle className="item-icon success" />
                            <div className="item-content">
                              <strong>Row {item.row}:</strong> {item.title}
                              <span className="item-status">{item.status}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {importResult.results.strategic_goals && importResult.results.strategic_goals.length > 0 && (
                    <div className="entity-group">
                      <h5>Strategic Goals ({importResult.results.strategic_goals.length})</h5>
                      <div className="items-list">
                        {importResult.results.strategic_goals.map((item, index) => (
                          <div key={`sg-${index}`} className="import-item">
                            <FaCheckCircle className="item-icon success" />
                            <div className="item-content">
                              <strong>Row {item.row}:</strong> {item.title}
                              <span className="item-status">{item.status}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {importResult.results.strategic_pillars && importResult.results.strategic_pillars.length > 0 && (
                    <div className="entity-group">
                      <h5>Strategic Pillars ({importResult.results.strategic_pillars.length})</h5>
                      <div className="items-list">
                        {importResult.results.strategic_pillars.map((item, index) => (
                          <div key={`sp-${index}`} className="import-item">
                            <FaCheckCircle className="item-icon success" />
                            <div className="item-content">
                              <strong>Row {item.row}:</strong> {item.name}
                              <span className="item-status">{item.status}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {importResult.results.alignments && importResult.results.alignments.length > 0 && (
                    <div className="entity-group">
                      <h5>Use Case-Goal Alignments ({importResult.results.alignments.length})</h5>
                      <div className="items-list">
                        {importResult.results.alignments.map((item, index) => (
                          <div key={`align-${index}`} className="import-item">
                            <FaCheckCircle className="item-icon success" />
                            <div className="item-content">
                              <strong>Row {item.row}:</strong> {item.use_case} → {item.goal}
                              <span className="item-status">{item.status}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {importResult.errorDetails.length > 0 && (
                <div className="import-errors">
                  <h4>Errors</h4>
                  <div className="errors-list">
                    {importResult.errorDetails.map((error: string, index: number) => (
                      <div key={index} className="error-item">
                        <FaExclamationTriangle className="item-icon error" />
                        <span>{error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CSV Format Info */}
        <div className="section-card format-info">
          <div className="section-header">
            <div className="section-icon-wrapper info-icon">
              <FaInfoCircle className="section-icon" />
            </div>
            <div className="section-title">
              <h3>CSV Format Requirements</h3>
              <p>Important information about the CSV format and field requirements for each entity type</p>
            </div>
          </div>
          <div className="section-content">
            <div className="format-requirements">
              <div className="requirement-group">
                <h4>Multi-Entity Import</h4>
                <p>Use the <strong>data_type</strong> column to specify entity type:</p>
                <ul>
                  <li><strong>use_case:</strong> For use cases</li>
                  <li><strong>strategic_goal:</strong> For strategic goals</li>
                  <li><strong>strategic_pillar:</strong> For strategic pillars</li>
                </ul>
              </div>
              
              <div className="requirement-group">
                <h4>Use Cases - Required Fields</h4>
                <ul>
                  <li>data_type: "use_case"</li>
                  <li>title, description, category_name, department_name</li>
                </ul>
              </div>
              
              <div className="requirement-group">
                <h4>Strategic Goals - Required Fields</h4>
                <ul>
                  <li>data_type: "strategic_goal"</li>
                  <li>title, description, strategic_pillar_name</li>
                </ul>
              </div>
              
              <div className="requirement-group">
                <h4>Strategic Pillars - Required Fields</h4>
                <ul>
                  <li>data_type: "strategic_pillar"</li>
                  <li>name, description</li>
                </ul>
              </div>
              
              <div className="requirement-group">
                <h4>Valid Values</h4>
                <ul>
                  <li><strong>Status (Use Cases):</strong> concept, proof_of_concept, validation, pilot, production</li>
                  <li><strong>Status (Strategic Goals):</strong> active, completed, on_hold</li>
                  <li><strong>Priority:</strong> High, Medium, Low</li>
                  <li><strong>Complexity:</strong> High, Medium, Low</li>
                  <li><strong>Strategic impact:</strong> High, Medium, Low</li>
                </ul>
              </div>
              
              <div className="requirement-group">
                <h4>Available Categories</h4>
                <ul>
                  <li>Internally deploy LLMs</li>
                  <li>Leverage Vendor embedded solutions</li>
                  <li>Leverage Copilot</li>
                  <li>Leverage DGE</li>
                  <li>Build ML</li>
                </ul>
              </div>
              
              <div className="requirement-group">
                <h4>Available Departments</h4>
                <ul>
                  <li>Government Financial Affairs</li>
                  <li>Executive Financial Affairs</li>
                  <li>Investment and Economic Affairs</li>
                  <li>Legal and Compliance Affairs</li>
                  <li>Corporate Affairs</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImportExport;