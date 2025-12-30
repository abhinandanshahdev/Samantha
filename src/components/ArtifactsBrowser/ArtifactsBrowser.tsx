import React, { useState, useEffect } from 'react';
import { FaDownload, FaFilePowerpoint, FaFileExcel, FaFileWord, FaFileAlt, FaSync, FaFolder } from 'react-icons/fa';
import { X } from 'lucide-react';
import { listArtifacts, downloadArtifact, Artifact } from '../../services/artifactService';
import './ArtifactsBrowser.css';

interface ArtifactsBrowserProps {
  isOpen: boolean;
  onClose: () => void;
}

const getFileIcon = (type: string) => {
  switch (type) {
    case 'presentation':
      return <FaFilePowerpoint className="file-icon pptx" />;
    case 'spreadsheet':
      return <FaFileExcel className="file-icon xlsx" />;
    case 'document':
      return <FaFileWord className="file-icon docx" />;
    default:
      return <FaFileAlt className="file-icon default" />;
  }
};

const formatDateTime = (timestamp: string | number | undefined) => {
  if (!timestamp) return '--';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return '--';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  // Show relative time for recent files
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;

  // Show date for older files
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const getFileExtension = (type: string): string => {
  switch (type) {
    case 'presentation': return '.pptx';
    case 'spreadsheet': return '.xlsx';
    case 'document': return '.docx';
    default: return '';
  }
};

const ArtifactsBrowser: React.FC<ArtifactsBrowserProps> = ({ isOpen, onClose }) => {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadArtifacts();
    }
  }, [isOpen]);

  const loadArtifacts = async () => {
    try {
      setLoading(true);
      setError(null);
      const artifactList = await listArtifacts();
      // Sort by creation date, newest first
      const sorted = artifactList.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
      setArtifacts(sorted);
    } catch (err: any) {
      setError(err.message || 'Failed to load artifacts');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (artifact: Artifact) => {
    try {
      setDownloading(artifact.id);
      await downloadArtifact(artifact.id, artifact.fileName);
    } catch (err: any) {
      console.error('Download failed:', err);
      setError(`Failed to download ${artifact.fileName}`);
    } finally {
      setDownloading(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="artifacts-overlay" onClick={onClose}>
      <div className="artifacts-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="artifacts-header">
          <div className="artifacts-header-left">
            <FaFolder className="artifacts-header-icon" />
            <h2>Artifacts Browser</h2>
          </div>
          <div className="artifacts-header-right">
            <button
              className="artifacts-refresh-btn"
              onClick={loadArtifacts}
              disabled={loading}
              title="Refresh"
            >
              <FaSync className={loading ? 'spinning' : ''} />
            </button>
            <button className="artifacts-close-btn" onClick={onClose} title="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Toolbar / Info Bar */}
        <div className="artifacts-toolbar">
          <span className="artifacts-count">
            {loading ? 'Loading...' : `${artifacts.length} item${artifacts.length !== 1 ? 's' : ''}`}
          </span>
          <span className="artifacts-notice">
            Files are temporary and cleared on server restart
          </span>
        </div>

        {/* Content */}
        <div className="artifacts-content">
          {error && (
            <div className="artifacts-error">
              <span>{error}</span>
              <button onClick={loadArtifacts}>Retry</button>
            </div>
          )}

          {!loading && !error && artifacts.length === 0 && (
            <div className="artifacts-empty">
              <FaFolder className="empty-icon" />
              <p>No files generated yet</p>
              <span>Files created by AI will appear here</span>
            </div>
          )}

          {!loading && !error && artifacts.length > 0 && (
            <table className="artifacts-table">
              <thead>
                <tr>
                  <th className="col-name">Name</th>
                  <th className="col-date">Created</th>
                  <th className="col-action">Action</th>
                </tr>
              </thead>
              <tbody>
                {artifacts.map(artifact => (
                  <tr key={artifact.id}>
                    <td className="col-name">
                      <div className="file-name-cell">
                        {getFileIcon(artifact.type)}
                        <div className="file-name-info">
                          <span className="file-name">{artifact.title}</span>
                          <span className="file-ext">{artifact.fileName}</span>
                        </div>
                      </div>
                    </td>
                    <td className="col-date">
                      {formatDateTime(artifact.createdAt)}
                    </td>
                    <td className="col-action">
                      <button
                        className="download-btn"
                        onClick={() => handleDownload(artifact)}
                        disabled={downloading === artifact.id}
                      >
                        {downloading === artifact.id ? (
                          <FaSync className="spinning" />
                        ) : (
                          <>
                            <FaDownload />
                            <span>Download</span>
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {loading && (
            <div className="artifacts-loading">
              <FaSync className="spinning" />
              <span>Loading files...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export { ArtifactsBrowser };
