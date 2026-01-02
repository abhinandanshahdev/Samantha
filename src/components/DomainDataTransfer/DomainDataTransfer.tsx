import React, { useState } from 'react';
import ExportWizard from './components/ExportWizard/ExportWizard';
import ImportWizard from './components/ImportWizard/ImportWizard';
import './DomainDataTransfer.css';

type TabType = 'export' | 'import';

interface DomainDataTransferProps {
  onBack?: () => void;
}

const DomainDataTransfer: React.FC<DomainDataTransferProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<TabType>('export');

  const handleClose = () => {
    if (onBack) {
      onBack();
    }
  };

  return (
    <div className="domain-data-transfer">
      {onBack && (
        <button className="back-button" onClick={onBack}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </svg>
          Back to Family Goals
        </button>
      )}
      <div className="transfer-header">
        <h1>Domain Data Transfer</h1>
        <p>Export or import domain data including initiatives, agents, goals, and all related information.</p>
      </div>

      <div className="transfer-tabs">
        <button
          className={`tab-button ${activeTab === 'export' ? 'active' : ''}`}
          onClick={() => setActiveTab('export')}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
          </svg>
          Export
        </button>
        <button
          className={`tab-button ${activeTab === 'import' ? 'active' : ''}`}
          onClick={() => setActiveTab('import')}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z" />
          </svg>
          Import
        </button>
      </div>

      <div className="transfer-content">
        {activeTab === 'export' ? (
          <ExportWizard onClose={handleClose} />
        ) : (
          <ImportWizard onClose={handleClose} />
        )}
      </div>
    </div>
  );
};

export default DomainDataTransfer;
