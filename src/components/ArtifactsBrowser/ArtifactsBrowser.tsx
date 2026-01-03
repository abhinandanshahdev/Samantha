import React, { useState, useEffect } from 'react';
import { FaDownload, FaFilePowerpoint, FaFileExcel, FaFileWord, FaFileAlt, FaSync, FaFolder, FaTrash, FaUpload } from 'react-icons/fa';
import { X } from 'lucide-react';
import { listArtifacts, downloadArtifact, Artifact } from '../../services/artifactService';
import { attachmentAPI, Attachment } from '../../services/apiService';
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

type TabType = 'generated' | 'uploads';

const ArtifactsBrowser: React.FC<ArtifactsBrowserProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabType>('generated');
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [chatFiles, setChatFiles] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [activeTab]);

  const loadData = async () => {
    if (activeTab === 'generated') {
      await loadArtifacts();
    } else {
      await loadChatFiles();
    }
  };

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

  const loadChatFiles = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('[ArtifactsBrowser] Loading chat files...');
      const files = await attachmentAPI.listChatFiles();
      console.log('[ArtifactsBrowser] Chat files loaded:', files);
      setChatFiles(files);
    } catch (err: any) {
      console.error('[ArtifactsBrowser] Error loading chat files:', err);
      setError(err.message || 'Failed to load chat files');
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

  const handleChatFileDownload = async (file: Attachment) => {
    try {
      setDownloading(String(file.id));
      const result = await attachmentAPI.getDownloadUrl(file.id);
      // Open the download URL in a new tab
      window.open(result.downloadUrl, '_blank');
    } catch (err: any) {
      console.error('Download failed:', err);
      setError(`Failed to download ${file.filename}`);
    } finally {
      setDownloading(null);
    }
  };

  const handleDeleteChatFile = async (file: Attachment) => {
    if (!window.confirm(`Delete "${file.filename}"? This action cannot be undone.`)) {
      return;
    }
    try {
      setDeleting(file.id);
      await attachmentAPI.deleteChatFile(file.id);
      // Remove from local state
      setChatFiles(prev => prev.filter(f => f.id !== file.id));
    } catch (err: any) {
      console.error('Delete failed:', err);
      setError(`Failed to delete ${file.filename}`);
    } finally {
      setDeleting(null);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (!bytes) return '--';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getChatFileIcon = (mimeType: string) => {
    if (mimeType?.includes('presentation') || mimeType?.includes('powerpoint')) {
      return <FaFilePowerpoint className="file-icon pptx" />;
    }
    if (mimeType?.includes('spreadsheet') || mimeType?.includes('excel')) {
      return <FaFileExcel className="file-icon xlsx" />;
    }
    if (mimeType?.includes('word') || mimeType?.includes('document')) {
      return <FaFileWord className="file-icon docx" />;
    }
    return <FaFileAlt className="file-icon default" />;
  };

  if (!isOpen) return null;

  return (
    <div className="artifacts-overlay" onClick={onClose}>
      <div className="artifacts-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="artifacts-header">
          <div className="artifacts-header-left">
            <FaFolder className="artifacts-header-icon" />
            <h2>Files</h2>
          </div>
          <div className="artifacts-header-right">
            <button
              className="artifacts-refresh-btn"
              onClick={loadData}
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

        {/* Tabs */}
        <div className="artifacts-tabs">
          <button
            className={`artifacts-tab ${activeTab === 'generated' ? 'active' : ''}`}
            onClick={() => setActiveTab('generated')}
          >
            <FaFileAlt />
            <span>Generated</span>
          </button>
          <button
            className={`artifacts-tab ${activeTab === 'uploads' ? 'active' : ''}`}
            onClick={() => setActiveTab('uploads')}
          >
            <FaUpload />
            <span>Chat Uploads</span>
          </button>
        </div>

        {/* Toolbar / Info Bar */}
        <div className="artifacts-toolbar">
          <span className="artifacts-count">
            {loading ? 'Loading...' : activeTab === 'generated'
              ? `${artifacts.length} item${artifacts.length !== 1 ? 's' : ''}`
              : `${chatFiles.length} file${chatFiles.length !== 1 ? 's' : ''}`
            }
          </span>
          <span className="artifacts-notice">
            {activeTab === 'generated'
              ? 'Files are temporary and cleared on server restart'
              : 'Files uploaded during chat sessions'
            }
          </span>
        </div>

        {/* Content */}
        <div className="artifacts-content">
          {error && (
            <div className="artifacts-error">
              <span>{error}</span>
              <button onClick={loadData}>Retry</button>
            </div>
          )}

          {/* Generated Artifacts Tab */}
          {activeTab === 'generated' && (
            <>
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
            </>
          )}

          {/* Chat Uploads Tab */}
          {activeTab === 'uploads' && (
            <>
              {!loading && !error && chatFiles.length === 0 && (
                <div className="artifacts-empty">
                  <FaUpload className="empty-icon" />
                  <p>No files uploaded yet</p>
                  <span>Files you upload during chat will appear here</span>
                </div>
              )}

              {!loading && !error && chatFiles.length > 0 && (
                <table className="artifacts-table">
                  <thead>
                    <tr>
                      <th className="col-name">Name</th>
                      <th className="col-size">Size</th>
                      <th className="col-date">Uploaded</th>
                      <th className="col-action">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chatFiles.map(file => (
                      <tr key={file.id}>
                        <td className="col-name">
                          <div className="file-name-cell">
                            {getChatFileIcon(file.mime_type)}
                            <div className="file-name-info">
                              <span className="file-name">{file.filename}</span>
                              <span className="file-ext">{file.mime_type}</span>
                            </div>
                          </div>
                        </td>
                        <td className="col-size">
                          {formatFileSize(file.file_size)}
                        </td>
                        <td className="col-date">
                          {formatDateTime(file.created_date)}
                        </td>
                        <td className="col-action col-action-multi">
                          <button
                            className="download-btn"
                            onClick={() => handleChatFileDownload(file)}
                            disabled={downloading === String(file.id)}
                            title="Download"
                          >
                            {downloading === String(file.id) ? (
                              <FaSync className="spinning" />
                            ) : (
                              <FaDownload />
                            )}
                          </button>
                          <button
                            className="delete-btn"
                            onClick={() => handleDeleteChatFile(file)}
                            disabled={deleting === file.id}
                            title="Delete"
                          >
                            {deleting === file.id ? (
                              <FaSync className="spinning" />
                            ) : (
                              <FaTrash />
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
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
