import React, { useState, useCallback, useEffect } from 'react';
import { FaUpload, FaDownload, FaTrash, FaFile, FaFilePdf, FaFileImage, FaFileWord, FaFileExcel, FaFilePowerpoint, FaFileAlt, FaFileArchive, FaTimes, FaSpinner } from 'react-icons/fa';
import { attachmentAPI, Attachment } from '../../services/apiService';
import './FileAttachments.css';

interface FileAttachmentsProps {
  entityType: 'initiative' | 'task';
  entityId: string;
  canEdit: boolean;
}

const FileAttachments: React.FC<FileAttachmentsProps> = ({
  entityType,
  entityId,
  canEdit
}) => {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isServiceAvailable, setIsServiceAvailable] = useState(true);

  // Load attachments
  const loadAttachments = useCallback(async () => {
    try {
      setLoading(true);
      const data = await attachmentAPI.getAll(entityType, entityId);
      setAttachments(data);
      setError(null);
    } catch (err: any) {
      if (err.response?.status === 503) {
        setIsServiceAvailable(false);
      } else {
        setError('Failed to load attachments');
      }
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  // Check service availability and load attachments
  useEffect(() => {
    const checkAndLoad = async () => {
      try {
        const status = await attachmentAPI.getStatus();
        setIsServiceAvailable(status.configured);
        if (status.configured) {
          loadAttachments();
        } else {
          setLoading(false);
        }
      } catch (err) {
        setIsServiceAvailable(false);
        setLoading(false);
      }
    };
    checkAndLoad();
  }, [loadAttachments]);

  // Get file icon based on MIME type
  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes('pdf')) return <FaFilePdf />;
    if (mimeType.includes('image')) return <FaFileImage />;
    if (mimeType.includes('word') || mimeType.includes('document')) return <FaFileWord />;
    if (mimeType.includes('sheet') || mimeType.includes('excel')) return <FaFileExcel />;
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return <FaFilePowerpoint />;
    if (mimeType.includes('text')) return <FaFileAlt />;
    if (mimeType.includes('zip') || mimeType.includes('archive')) return <FaFileArchive />;
    return <FaFile />;
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Handle file upload
  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadProgress(0);
    setError(null);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress(Math.round(((i + 0.5) / files.length) * 100));

        const result = await attachmentAPI.upload(entityType, entityId, file);
        setAttachments(prev => [result.attachment, ...prev]);
        setUploadProgress(Math.round(((i + 1) / files.length) * 100));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // Handle download
  const handleDownload = async (attachment: Attachment) => {
    try {
      const { downloadUrl, filename } = await attachmentAPI.getDownloadUrl(attachment.id);

      // Open download URL in new tab
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      setError('Failed to download file');
    }
  };

  // Handle delete
  const handleDelete = async (attachmentId: number) => {
    if (!window.confirm('Are you sure you want to delete this file?')) return;

    try {
      await attachmentAPI.delete(attachmentId);
      setAttachments(prev => prev.filter(a => a.id !== attachmentId));
    } catch (err) {
      setError('Failed to delete file');
    }
  };

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (canEdit) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (canEdit && e.dataTransfer.files) {
      handleUpload(e.dataTransfer.files);
    }
  };

  // File input change handler
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleUpload(e.target.files);
    e.target.value = ''; // Reset input
  };

  // If service is not available, show message
  if (!isServiceAvailable) {
    return (
      <div className="file-attachments">
        <div className="file-attachments-header">
          <h3>Documents</h3>
        </div>
        <div className="file-attachments-unavailable">
          <FaFile className="unavailable-icon" />
          <p>File attachments are not configured.</p>
          <span>Contact your administrator to enable this feature.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="file-attachments">
      <div className="file-attachments-header">
        <h3>Documents</h3>
        {canEdit && (
          <label className="upload-button">
            <FaUpload />
            <span>Upload</span>
            <input
              type="file"
              multiple
              onChange={handleFileInputChange}
              disabled={uploading}
              style={{ display: 'none' }}
            />
          </label>
        )}
      </div>

      {error && (
        <div className="file-attachments-error">
          <span>{error}</span>
          <button onClick={() => setError(null)}><FaTimes /></button>
        </div>
      )}

      {uploading && (
        <div className="upload-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
          </div>
          <span>Uploading... {uploadProgress}%</span>
        </div>
      )}

      {loading ? (
        <div className="file-attachments-loading">
          <FaSpinner className="spinner" />
          <span>Loading attachments...</span>
        </div>
      ) : attachments.length > 0 ? (
        <div className="attachments-list">
          {attachments.map(attachment => (
            <div key={attachment.id} className="attachment-item">
              <div className="attachment-icon">
                {getFileIcon(attachment.mime_type)}
              </div>
              <div className="attachment-info">
                <span className="attachment-name">{attachment.filename}</span>
                <span className="attachment-size">{formatFileSize(attachment.file_size)}</span>
              </div>
              <div className="attachment-actions">
                <button
                  className="action-button download"
                  onClick={() => handleDownload(attachment)}
                  title="Download"
                >
                  <FaDownload />
                </button>
                {canEdit && (
                  <button
                    className="action-button delete"
                    onClick={() => handleDelete(attachment.id)}
                    title="Delete"
                  >
                    <FaTrash />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="attachments-empty">
          <p>No documents attached</p>
        </div>
      )}

      {canEdit && (
        <div
          className={`drop-zone ${isDragging ? 'dragging' : ''}`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <FaUpload className="drop-icon" />
          <span>Drop files here or click to upload</span>
        </div>
      )}
    </div>
  );
};

export default FileAttachments;
