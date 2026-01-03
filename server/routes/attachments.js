/**
 * Attachments Route
 *
 * Handles file attachment uploads, downloads, and management
 * for both initiatives and tasks.
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require('../config/database-mysql-compat');
const { verifyToken } = require('./auth');
const { requireAdmin, requireConsumerOrAdmin } = require('../middleware/roleMiddleware');
const { createAuditLog } = require('../services/auditLogService');
const azureBlobService = require('../services/azureBlobService');

// Configure multer for memory storage (we'll upload to Azure, not local disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Valid entity types
const VALID_ENTITY_TYPES = ['initiative', 'task', 'chat'];

// ============================================
// CHAT-SPECIFIC ROUTES (must come BEFORE generic /:entityType/:entityId)
// ============================================

/**
 * GET /api/attachments/chat/list
 * List all chat uploads for the current user
 */
router.get('/chat/list', verifyToken, async (req, res) => {
  const userId = req.user?.id;

  try {
    const attachments = await new Promise((resolve, reject) => {
      db.query(
        `SELECT id, entity_type, entity_id, filename, file_path, file_url, file_size, mime_type, created_by, created_date
         FROM attachments
         WHERE entity_type = 'chat' AND created_by = ?
         ORDER BY created_date DESC`,
        [userId],
        (err, results) => {
          if (err) reject(err);
          else resolve(results);
        }
      );
    });

    // Generate fresh SAS URLs for each attachment
    const attachmentsWithUrls = attachments.map(attachment => ({
      ...attachment,
      downloadUrl: azureBlobService.isReady() && attachment.file_path
        ? azureBlobService.generateSasUrl(attachment.file_path)
        : null
    }));

    res.json(attachmentsWithUrls);
  } catch (error) {
    console.error('[Attachments] Chat list error:', error);
    res.status(500).json({ error: 'Failed to retrieve chat uploads' });
  }
});

// ============================================
// GENERIC ENTITY ROUTES
// ============================================

/**
 * GET /api/attachments/:entityType/:entityId
 * List all attachments for an entity (initiative or task)
 */
router.get('/:entityType/:entityId', verifyToken, async (req, res) => {
  const { entityType, entityId } = req.params;

  // Validate entity type
  if (!VALID_ENTITY_TYPES.includes(entityType)) {
    return res.status(400).json({ error: `Invalid entity type. Must be one of: ${VALID_ENTITY_TYPES.join(', ')}` });
  }

  try {
    const attachments = await new Promise((resolve, reject) => {
      db.query(
        `SELECT id, entity_type, entity_id, filename, file_path, file_url, file_size, mime_type, created_by, created_date
         FROM attachments
         WHERE entity_type = ? AND entity_id = ?
         ORDER BY created_date DESC`,
        [entityType, entityId],
        (err, results) => {
          if (err) reject(err);
          else resolve(results);
        }
      );
    });

    // Generate fresh SAS URLs for each attachment
    const attachmentsWithUrls = attachments.map(attachment => ({
      ...attachment,
      downloadUrl: azureBlobService.isReady() && attachment.file_path
        ? azureBlobService.generateSasUrl(attachment.file_path)
        : null
    }));

    res.json(attachmentsWithUrls);
  } catch (error) {
    console.error('[Attachments] List error:', error);
    res.status(500).json({ error: 'Failed to retrieve attachments' });
  }
});

/**
 * POST /api/attachments/upload/:entityType/:entityId
 * Upload a file attachment
 */
router.post('/upload/:entityType/:entityId', verifyToken, upload.single('file'), async (req, res) => {
  const { entityType, entityId } = req.params;
  const file = req.file;
  const userId = req.user?.id;

  // Validate entity type
  if (!VALID_ENTITY_TYPES.includes(entityType)) {
    return res.status(400).json({ error: `Invalid entity type. Must be one of: ${VALID_ENTITY_TYPES.join(', ')}` });
  }

  // Validate file
  if (!file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  // Check if Azure Blob is configured
  if (!azureBlobService.isReady()) {
    return res.status(503).json({
      error: 'File storage not configured',
      message: 'Azure Blob Storage is not configured. Contact your administrator.'
    });
  }

  // Verify entity exists
  const entityTable = entityType === 'initiative' ? 'use_cases' : 'tasks';
  const entityExists = await new Promise((resolve, reject) => {
    db.query(
      `SELECT id, title FROM ${entityTable} WHERE id = ?`,
      [entityId],
      (err, results) => {
        if (err) reject(err);
        else resolve(results.length > 0 ? results[0] : null);
      }
    );
  });

  if (!entityExists) {
    return res.status(404).json({ error: `${entityType} not found` });
  }

  try {
    // Upload to Azure Blob Storage
    const uploadResult = await azureBlobService.uploadFile(
      file.buffer,
      entityType,
      entityId,
      file.originalname,
      file.mimetype
    );

    // Save attachment record to database
    const attachmentId = await new Promise((resolve, reject) => {
      db.query(
        `INSERT INTO attachments (entity_type, entity_id, filename, file_path, file_url, file_size, mime_type, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entityType,
          entityId,
          uploadResult.filename,
          uploadResult.blobName,
          uploadResult.blobUrl,
          uploadResult.fileSize,
          uploadResult.mimeType,
          userId
        ],
        (err, result) => {
          if (err) reject(err);
          else resolve(result.insertId);
        }
      );
    });

    // Create audit log
    await createAuditLog({
      eventType: 'attachment_uploaded',
      entityType,
      entityId,
      entityTitle: entityExists.title,
      userId,
      userName: req.user?.name,
      newValue: JSON.stringify({
        attachmentId,
        filename: uploadResult.filename,
        fileSize: uploadResult.fileSize,
        mimeType: uploadResult.mimeType
      })
    });

    res.status(201).json({
      success: true,
      attachment: {
        id: attachmentId,
        entity_type: entityType,
        entity_id: entityId,
        filename: uploadResult.filename,
        file_path: uploadResult.blobName,
        file_size: uploadResult.fileSize,
        mime_type: uploadResult.mimeType,
        downloadUrl: azureBlobService.generateSasUrl(uploadResult.blobName)
      }
    });
  } catch (error) {
    console.error('[Attachments] Upload error:', error);
    res.status(500).json({ error: 'Failed to upload file', message: error.message });
  }
});

/**
 * GET /api/attachments/:id/download
 * Get a signed download URL for an attachment
 */
router.get('/:id/download', verifyToken, async (req, res) => {
  const { id } = req.params;

  try {
    const attachment = await new Promise((resolve, reject) => {
      db.query(
        `SELECT id, entity_type, entity_id, filename, file_path, mime_type
         FROM attachments WHERE id = ?`,
        [id],
        (err, results) => {
          if (err) reject(err);
          else resolve(results[0]);
        }
      );
    });

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    if (!azureBlobService.isReady()) {
      return res.status(503).json({ error: 'File storage not configured' });
    }

    const downloadUrl = azureBlobService.generateSasUrl(attachment.file_path);

    res.json({
      id: attachment.id,
      filename: attachment.filename,
      mimeType: attachment.mime_type,
      downloadUrl
    });
  } catch (error) {
    console.error('[Attachments] Download URL error:', error);
    res.status(500).json({ error: 'Failed to generate download URL' });
  }
});

/**
 * DELETE /api/attachments/:id
 * Delete an attachment (admin only)
 */
router.delete('/:id', verifyToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;

  try {
    // Get attachment details
    const attachment = await new Promise((resolve, reject) => {
      db.query(
        `SELECT a.id, a.entity_type, a.entity_id, a.filename, a.file_path,
                CASE
                  WHEN a.entity_type = 'initiative' THEN u.title
                  ELSE t.title
                END as entity_title
         FROM attachments a
         LEFT JOIN use_cases u ON a.entity_type = 'initiative' AND a.entity_id = u.id
         LEFT JOIN tasks t ON a.entity_type = 'task' AND a.entity_id = t.id
         WHERE a.id = ?`,
        [id],
        (err, results) => {
          if (err) reject(err);
          else resolve(results[0]);
        }
      );
    });

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    // Delete from Azure Blob Storage
    if (azureBlobService.isReady() && attachment.file_path) {
      try {
        await azureBlobService.deleteBlob(attachment.file_path);
      } catch (blobError) {
        console.warn('[Attachments] Failed to delete blob:', blobError.message);
        // Continue with database deletion even if blob deletion fails
      }
    }

    // Delete from database
    await new Promise((resolve, reject) => {
      db.query('DELETE FROM attachments WHERE id = ?', [id], (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    // Create audit log
    await createAuditLog({
      eventType: 'attachment_deleted',
      entityType: attachment.entity_type,
      entityId: attachment.entity_id,
      entityTitle: attachment.entity_title,
      userId,
      userName: req.user?.name,
      oldValue: JSON.stringify({
        attachmentId: attachment.id,
        filename: attachment.filename
      })
    });

    res.json({ success: true, message: 'Attachment deleted successfully' });
  } catch (error) {
    console.error('[Attachments] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
});

/**
 * GET /api/attachments/status
 * Check if attachment service is available
 */
router.get('/status', verifyToken, (req, res) => {
  res.json({
    configured: azureBlobService.isReady(),
    message: azureBlobService.isReady()
      ? 'File attachment service is available'
      : 'Azure Blob Storage not configured'
  });
});

// ============================================
// CHAT FILE UPLOADS (misc folder)
// ============================================

/**
 * POST /api/attachments/chat/upload
 * Upload a file during chat session - stored in misc folder
 */
router.post('/chat/upload', verifyToken, upload.single('file'), async (req, res) => {
  const file = req.file;
  const userId = req.user?.id;
  const sessionId = req.body.sessionId || 'default';

  // Validate file
  if (!file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  // Check if Azure Blob is configured
  if (!azureBlobService.isReady()) {
    return res.status(503).json({
      error: 'File storage not configured',
      message: 'Azure Blob Storage is not configured. Contact your administrator.'
    });
  }

  try {
    // Generate unique entity ID for chat uploads (user_id + session)
    const chatEntityId = `${userId}_${sessionId}`;

    // Upload to Azure Blob Storage under "chat" entity type
    const uploadResult = await azureBlobService.uploadFile(
      file.buffer,
      'chat',
      chatEntityId,
      file.originalname,
      file.mimetype
    );

    // Save attachment record to database
    const attachmentId = await new Promise((resolve, reject) => {
      db.query(
        `INSERT INTO attachments (entity_type, entity_id, filename, file_path, file_url, file_size, mime_type, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'chat',
          chatEntityId,
          uploadResult.filename,
          uploadResult.blobName,
          uploadResult.blobUrl,
          uploadResult.fileSize,
          uploadResult.mimeType,
          userId
        ],
        (err, result) => {
          if (err) reject(err);
          else resolve(result.insertId);
        }
      );
    });

    // Create audit log
    await createAuditLog({
      eventType: 'chat_file_uploaded',
      entityType: 'chat',
      entityId: chatEntityId,
      entityTitle: file.originalname,
      userId,
      userName: req.user?.name,
      newValue: JSON.stringify({
        attachmentId,
        filename: uploadResult.filename,
        fileSize: uploadResult.fileSize,
        mimeType: uploadResult.mimeType
      })
    });

    res.status(201).json({
      success: true,
      attachment: {
        id: attachmentId,
        entity_type: 'chat',
        entity_id: chatEntityId,
        filename: uploadResult.filename,
        file_path: uploadResult.blobName,
        file_size: uploadResult.fileSize,
        mime_type: uploadResult.mimeType,
        downloadUrl: azureBlobService.generateSasUrl(uploadResult.blobName)
      }
    });
  } catch (error) {
    console.error('[Attachments] Chat upload error:', error);
    res.status(500).json({ error: 'Failed to upload file', message: error.message });
  }
});

/**
 * DELETE /api/attachments/chat/:id
 * Delete a chat upload (owner or admin)
 */
router.delete('/chat/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;
  const isAdmin = req.user?.role === 'admin';

  try {
    // Get attachment details
    const attachment = await new Promise((resolve, reject) => {
      db.query(
        `SELECT id, entity_type, entity_id, filename, file_path, created_by
         FROM attachments
         WHERE id = ? AND entity_type = 'chat'`,
        [id],
        (err, results) => {
          if (err) reject(err);
          else resolve(results[0]);
        }
      );
    });

    if (!attachment) {
      return res.status(404).json({ error: 'Chat attachment not found' });
    }

    // Check ownership (unless admin)
    if (!isAdmin && attachment.created_by !== userId) {
      return res.status(403).json({ error: 'You can only delete your own chat uploads' });
    }

    // Delete from Azure Blob Storage
    if (azureBlobService.isReady() && attachment.file_path) {
      try {
        await azureBlobService.deleteBlob(attachment.file_path);
      } catch (blobError) {
        console.warn('[Attachments] Failed to delete chat blob:', blobError.message);
      }
    }

    // Delete from database
    await new Promise((resolve, reject) => {
      db.query('DELETE FROM attachments WHERE id = ?', [id], (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    // Create audit log
    await createAuditLog({
      eventType: 'chat_file_deleted',
      entityType: 'chat',
      entityId: attachment.entity_id,
      entityTitle: attachment.filename,
      userId,
      userName: req.user?.name,
      oldValue: JSON.stringify({
        attachmentId: attachment.id,
        filename: attachment.filename
      })
    });

    res.json({ success: true, message: 'Chat upload deleted successfully' });
  } catch (error) {
    console.error('[Attachments] Chat delete error:', error);
    res.status(500).json({ error: 'Failed to delete chat upload' });
  }
});

module.exports = router;
