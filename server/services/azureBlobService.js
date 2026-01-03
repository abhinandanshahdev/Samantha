/**
 * Azure Blob Storage Service
 *
 * Handles file uploads, downloads, and management for attachments
 * stored in Azure Blob Storage. Generates SAS tokens for secure
 * temporary access to files.
 */

const { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } = require('@azure/storage-blob');
const path = require('path');
const crypto = require('crypto');

// Configuration from environment
const ACCOUNT_NAME = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const ACCOUNT_KEY = process.env.AZURE_STORAGE_ACCOUNT_KEY;
const CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER_NAME || 'samantha-attachments';

// SAS token expiry time (1 hour)
const SAS_EXPIRY_MINUTES = 60;

// Maximum file size (50MB)
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// Allowed MIME types
const ALLOWED_MIME_TYPES = [
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'text/markdown',
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  // Archives
  'application/zip',
  'application/x-zip-compressed'
];

class AzureBlobService {
  constructor() {
    this.isConfigured = false;
    this.blobServiceClient = null;
    this.containerClient = null;
    this.sharedKeyCredential = null;

    this.initialize();
  }

  /**
   * Initialize the Azure Blob Service client
   */
  initialize() {
    if (!ACCOUNT_NAME || !ACCOUNT_KEY) {
      console.warn('[AzureBlobService] Azure Storage not configured. File attachments will be disabled.');
      console.warn('[AzureBlobService] Set AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_ACCOUNT_KEY to enable.');
      return;
    }

    try {
      this.sharedKeyCredential = new StorageSharedKeyCredential(ACCOUNT_NAME, ACCOUNT_KEY);
      this.blobServiceClient = new BlobServiceClient(
        `https://${ACCOUNT_NAME}.blob.core.windows.net`,
        this.sharedKeyCredential
      );
      this.containerClient = this.blobServiceClient.getContainerClient(CONTAINER_NAME);
      this.isConfigured = true;
      console.log(`[AzureBlobService] Initialized with container: ${CONTAINER_NAME}`);
    } catch (error) {
      console.error('[AzureBlobService] Failed to initialize:', error.message);
    }
  }

  /**
   * Check if the service is configured and ready
   */
  isReady() {
    return this.isConfigured;
  }

  /**
   * Ensure the container exists
   */
  async ensureContainer() {
    if (!this.isConfigured) {
      throw new Error('Azure Blob Storage not configured');
    }

    try {
      // Private access - use SAS tokens for secure access
      await this.containerClient.createIfNotExists();
      console.log(`[AzureBlobService] Container '${CONTAINER_NAME}' ready`);
    } catch (error) {
      // Container might already exist, which is fine
      if (error.statusCode !== 409) {
        console.error('[AzureBlobService] Failed to create container:', error.message);
        throw error;
      }
    }
  }

  /**
   * Generate a unique blob name
   * @param {string} entityType - 'initiative' or 'task'
   * @param {string} entityId - ID of the entity
   * @param {string} originalFilename - Original filename
   * @returns {string} Unique blob name with path structure
   */
  generateBlobName(entityType, entityId, originalFilename) {
    const timestamp = Date.now();
    const randomId = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(originalFilename);
    const baseName = path.basename(originalFilename, ext)
      .replace(/[^a-zA-Z0-9-_]/g, '_') // Sanitize filename
      .substring(0, 50); // Limit length

    // Structure: entityType/entityId/timestamp_randomId_filename.ext
    return `${entityType}s/${entityId}/${timestamp}_${randomId}_${baseName}${ext}`;
  }

  /**
   * Validate file before upload
   * @param {Buffer} buffer - File buffer
   * @param {string} mimeType - MIME type
   * @param {string} filename - Original filename
   * @returns {Object} Validation result
   */
  validateFile(buffer, mimeType, filename) {
    const errors = [];

    // Check file size
    if (buffer.length > MAX_FILE_SIZE) {
      errors.push(`File size exceeds maximum of ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
    }

    // Check MIME type
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      errors.push(`File type '${mimeType}' is not allowed`);
    }

    // Check filename
    if (!filename || filename.length === 0) {
      errors.push('Filename is required');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Upload a file to Azure Blob Storage
   * @param {Buffer} buffer - File buffer
   * @param {string} entityType - 'initiative' or 'task'
   * @param {string} entityId - ID of the entity
   * @param {string} originalFilename - Original filename
   * @param {string} mimeType - MIME type
   * @returns {Object} Upload result with blob URL and metadata
   */
  async uploadFile(buffer, entityType, entityId, originalFilename, mimeType) {
    if (!this.isConfigured) {
      throw new Error('Azure Blob Storage not configured');
    }

    // Validate file
    const validation = this.validateFile(buffer, mimeType, originalFilename);
    if (!validation.valid) {
      throw new Error(`File validation failed: ${validation.errors.join(', ')}`);
    }

    await this.ensureContainer();

    const blobName = this.generateBlobName(entityType, entityId, originalFilename);
    const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);

    try {
      // Upload with content type
      await blockBlobClient.uploadData(buffer, {
        blobHTTPHeaders: {
          blobContentType: mimeType,
          blobContentDisposition: `attachment; filename="${encodeURIComponent(originalFilename)}"`
        },
        metadata: {
          originalFilename: encodeURIComponent(originalFilename),
          entityType,
          entityId,
          uploadedAt: new Date().toISOString()
        }
      });

      console.log(`[AzureBlobService] Uploaded: ${blobName}`);

      return {
        blobName,
        blobUrl: blockBlobClient.url,
        filename: originalFilename,
        fileSize: buffer.length,
        mimeType
      };
    } catch (error) {
      console.error('[AzureBlobService] Upload failed:', error.message);
      throw error;
    }
  }

  /**
   * Generate a SAS URL for downloading a blob
   * @param {string} blobName - The blob name/path
   * @param {number} expiryMinutes - Minutes until SAS expires
   * @returns {string} SAS URL for downloading
   */
  generateSasUrl(blobName, expiryMinutes = SAS_EXPIRY_MINUTES) {
    if (!this.isConfigured) {
      throw new Error('Azure Blob Storage not configured');
    }

    const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
    const startsOn = new Date();
    const expiresOn = new Date(startsOn.valueOf() + expiryMinutes * 60 * 1000);

    const permissions = new BlobSASPermissions();
    permissions.read = true;

    const sasToken = generateBlobSASQueryParameters({
      containerName: CONTAINER_NAME,
      blobName,
      permissions,
      startsOn,
      expiresOn
    }, this.sharedKeyCredential).toString();

    return `${blockBlobClient.url}?${sasToken}`;
  }

  /**
   * Download a blob to buffer
   * @param {string} blobName - The blob name/path
   * @returns {Buffer} File buffer
   */
  async downloadBlob(blobName) {
    if (!this.isConfigured) {
      throw new Error('Azure Blob Storage not configured');
    }

    const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);

    try {
      const downloadResponse = await blockBlobClient.download();
      const chunks = [];

      for await (const chunk of downloadResponse.readableStreamBody) {
        chunks.push(chunk);
      }

      return Buffer.concat(chunks);
    } catch (error) {
      console.error('[AzureBlobService] Download failed:', error.message);
      throw error;
    }
  }

  /**
   * Delete a blob
   * @param {string} blobName - The blob name/path
   */
  async deleteBlob(blobName) {
    if (!this.isConfigured) {
      throw new Error('Azure Blob Storage not configured');
    }

    const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);

    try {
      await blockBlobClient.deleteIfExists();
      console.log(`[AzureBlobService] Deleted: ${blobName}`);
    } catch (error) {
      console.error('[AzureBlobService] Delete failed:', error.message);
      throw error;
    }
  }

  /**
   * Check if a blob exists
   * @param {string} blobName - The blob name/path
   * @returns {boolean} True if exists
   */
  async blobExists(blobName) {
    if (!this.isConfigured) {
      return false;
    }

    const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
    return await blockBlobClient.exists();
  }

  /**
   * Get blob properties
   * @param {string} blobName - The blob name/path
   * @returns {Object} Blob properties
   */
  async getBlobProperties(blobName) {
    if (!this.isConfigured) {
      throw new Error('Azure Blob Storage not configured');
    }

    const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);

    try {
      const properties = await blockBlobClient.getProperties();
      return {
        contentType: properties.contentType,
        contentLength: properties.contentLength,
        lastModified: properties.lastModified,
        metadata: properties.metadata
      };
    } catch (error) {
      console.error('[AzureBlobService] Get properties failed:', error.message);
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new AzureBlobService();
