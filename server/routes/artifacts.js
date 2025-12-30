/**
 * Artifacts Routes
 *
 * API endpoints for managing and downloading artifacts created by skills.
 */

const express = require('express');
const router = express.Router();
const artifactService = require('../services/artifactService');

/**
 * GET /api/artifacts
 * List all artifacts (for debugging/admin)
 */
router.get('/', async (req, res) => {
  try {
    const artifacts = artifactService.listArtifacts();
    res.json({
      success: true,
      artifacts: artifacts.map(a => ({
        id: a.id,
        type: a.type,
        title: a.title,
        fileName: a.fileName,
        mimeType: a.mimeType,
        createdAt: a.createdAt
      })),
      count: artifacts.length
    });
  } catch (error) {
    console.error('Error listing artifacts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list artifacts',
      message: error.message
    });
  }
});

/**
 * GET /api/artifacts/:id
 * Get artifact metadata
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const artifact = artifactService.getArtifact(id);

    if (!artifact) {
      return res.status(404).json({
        success: false,
        error: 'Artifact not found',
        message: `No artifact found with ID: ${id}`
      });
    }

    res.json({
      success: true,
      artifact: {
        id: artifact.id,
        type: artifact.type,
        title: artifact.title,
        fileName: artifact.fileName,
        mimeType: artifact.mimeType,
        createdAt: artifact.createdAt,
        downloadUrl: `/api/artifacts/${artifact.id}/download`
      }
    });
  } catch (error) {
    console.error('Error getting artifact:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get artifact',
      message: error.message
    });
  }
});

/**
 * GET /api/artifacts/:id/download
 * Download an artifact file
 */
router.get('/:id/download', async (req, res) => {
  try {
    const { id } = req.params;
    const { artifact, stream } = await artifactService.getArtifactStream(id);

    // Set headers for download
    res.setHeader('Content-Type', artifact.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${artifact.fileName}"`);

    // Pipe the file stream to response
    stream.pipe(res);

    stream.on('error', (err) => {
      console.error('Error streaming artifact:', err);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Failed to download artifact'
        });
      }
    });

  } catch (error) {
    console.error('Error downloading artifact:', error);

    if (error.message === 'Artifact not found' || error.message === 'Artifact file not found') {
      return res.status(404).json({
        success: false,
        error: 'Artifact not found',
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to download artifact',
      message: error.message
    });
  }
});

/**
 * POST /api/artifacts
 * Create a new artifact
 */
router.post('/', async (req, res) => {
  try {
    const { type, data, options } = req.body;

    if (!type) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field',
        message: 'Artifact type is required'
      });
    }

    if (!data) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field',
        message: 'Artifact data is required'
      });
    }

    const artifact = await artifactService.createArtifact(type, data, options);

    res.status(201).json({
      success: true,
      message: 'Artifact created successfully',
      artifact: {
        id: artifact.id,
        type: artifact.type,
        title: artifact.title,
        fileName: artifact.fileName,
        mimeType: artifact.mimeType,
        downloadUrl: `/api/artifacts/${artifact.id}/download`
      }
    });
  } catch (error) {
    console.error('Error creating artifact:', error);

    if (error.message.includes('Unsupported artifact type')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid artifact type',
        message: error.message,
        supportedTypes: Object.values(artifactService.ARTIFACT_TYPES)
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create artifact',
      message: error.message
    });
  }
});

/**
 * DELETE /api/artifacts/:id
 * Delete an artifact
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await artifactService.deleteArtifact(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Artifact not found',
        message: `No artifact found with ID: ${id}`
      });
    }

    res.json({
      success: true,
      message: 'Artifact deleted successfully',
      id
    });
  } catch (error) {
    console.error('Error deleting artifact:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete artifact',
      message: error.message
    });
  }
});

module.exports = router;
