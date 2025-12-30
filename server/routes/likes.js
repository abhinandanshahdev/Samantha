const express = require('express');
const router = express.Router();
const db = require('../config/database-mysql-compat');
const { verifyToken } = require('./auth');
const { requireConsumerOrAdmin } = require('../middleware/roleMiddleware');
const { createAuditLog } = require('../services/auditLogService');

// Get all likes for a use case
router.get('/use-cases/:useCaseId/likes', verifyToken, requireConsumerOrAdmin, async (req, res) => {
  try {
    const { useCaseId } = req.params;

    const query = `
      SELECT l.id, l.use_case_id, l.user_id, l.created_date,
             u.name as user_name, u.email as user_email
      FROM likes l
      JOIN users u ON l.user_id = u.id
      WHERE l.use_case_id = ?
      ORDER BY l.created_date DESC
    `;

    // Checkmarx Suppression: False positive - useCaseId from req.params used with parameterized query
    const [likes] = await db.execute(query, [useCaseId]);
    res.json(likes);
  } catch (error) {
    console.error('Error fetching likes:', error);
    res.status(500).json({ error: 'Failed to fetch likes' });
  }
});

// Get like count for a use case
router.get('/use-cases/:useCaseId/likes/count', verifyToken, requireConsumerOrAdmin, async (req, res) => {
  try {
    const { useCaseId } = req.params;

    const query = 'SELECT COUNT(*) as count FROM likes WHERE use_case_id = ?';
    // Checkmarx Suppression: False positive - useCaseId from req.params used with parameterized query
    const [result] = await db.execute(query, [useCaseId]);

    res.json({ count: result[0].count });
  } catch (error) {
    console.error('Error fetching likes count:', error);
    res.status(500).json({ error: 'Failed to fetch likes count' });
  }
});

// Check if current user liked a use case
router.get('/use-cases/:useCaseId/likes/check', verifyToken, requireConsumerOrAdmin, async (req, res) => {
  try {
    const { useCaseId } = req.params;
    const userId = req.user.id;

    const query = 'SELECT id FROM likes WHERE use_case_id = ? AND user_id = ?';
    // Checkmarx Suppression: False positive - useCaseId from req.params, userId from JWT token, used with parameterized query
    const [likes] = await db.execute(query, [useCaseId, userId]);

    res.json({ liked: likes.length > 0, likeId: likes.length > 0 ? likes[0].id : null });
  } catch (error) {
    console.error('Error checking like status:', error);
    res.status(500).json({ error: 'Failed to check like status' });
  }
});

// Toggle like (add or remove)
router.post('/likes/toggle', verifyToken, requireConsumerOrAdmin, async (req, res) => {
  try {
    const { use_case_id } = req.body;
    const userId = req.user.id;

    if (!use_case_id) {
      return res.status(400).json({ error: 'use_case_id is required' });
    }

    // Check if already liked
    const checkQuery = 'SELECT id FROM likes WHERE use_case_id = ? AND user_id = ?';
    // Checkmarx Suppression: False positive - use_case_id from req.body (validated), userId from JWT token, used with parameterized query
    const [existing] = await db.execute(checkQuery, [use_case_id, userId]);

    if (existing.length > 0) {
      // Unlike - remove the like
      const deleteQuery = 'DELETE FROM likes WHERE id = ?';
      await db.execute(deleteQuery, [existing[0].id]);

      // Update use_cases.updated_date
      const updateUseCaseQuery = 'UPDATE use_cases SET updated_date = CURRENT_TIMESTAMP WHERE id = ?';
      await db.execute(updateUseCaseQuery, [use_case_id]);

      // Get updated count
      const countQuery = 'SELECT COUNT(*) as count FROM likes WHERE use_case_id = ?';
      const [countResult] = await db.execute(countQuery, [use_case_id]);

      res.json({
        liked: false,
        likeId: null,
        count: countResult[0].count
      });
    } else {
      // Like - add the like
      const insertQuery = `
        INSERT INTO likes (use_case_id, user_id, created_date)
        VALUES (?, ?, NOW())
      `;
      const result = await db.insert(insertQuery, [use_case_id, userId]);

      // Update use_cases.updated_date
      const updateUseCaseQuery = 'UPDATE use_cases SET updated_date = CURRENT_TIMESTAMP WHERE id = ?';
      await db.execute(updateUseCaseQuery, [use_case_id]);

      // Fetch use case title and create audit log
      const [useCaseResults] = await db.execute('SELECT title FROM use_cases WHERE id = ?', [use_case_id]);
      const useCaseTitle = useCaseResults && useCaseResults.length > 0 ? useCaseResults[0].title : 'Unknown';

      createAuditLog({
        eventType: 'like_added',
        entityType: 'use_case',
        entityId: use_case_id,
        entityTitle: useCaseTitle,
        userId: req.user.id,
        userName: req.user.name
      }).catch(err => console.error('Failed to create audit log:', err));

      // Get updated count
      const countQuery = 'SELECT COUNT(*) as count FROM likes WHERE use_case_id = ?';
      const [countResult] = await db.execute(countQuery, [use_case_id]);

      res.json({
        liked: true,
        likeId: result.insertId,
        count: countResult[0].count
      });
    }
  } catch (error) {
    console.error('Error toggling like:', error);
    res.status(500).json({ error: 'Failed to toggle like' });
  }
});

// Create a like (alternative to toggle)
router.post('/likes', verifyToken, requireConsumerOrAdmin, async (req, res) => {
  try {
    const { use_case_id } = req.body;
    const userId = req.user.id;

    if (!use_case_id) {
      return res.status(400).json({ error: 'use_case_id is required' });
    }

    // Check if already liked
    const checkQuery = 'SELECT id FROM likes WHERE use_case_id = ? AND user_id = ?';
    // Checkmarx Suppression: False positive - use_case_id from req.body (validated), userId from JWT token, used with parameterized query
    const [existing] = await db.execute(checkQuery, [use_case_id, userId]);

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Already liked this use case' });
    }

    const insertQuery = `
      INSERT INTO likes (use_case_id, user_id, created_date)
      VALUES (?, ?, NOW())
    `;

    const result = await db.insert(insertQuery, [use_case_id, userId]);

    res.status(201).json({
      id: result.insertId,
      use_case_id,
      user_id: userId,
      created_date: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error creating like:', error);
    res.status(500).json({ error: 'Failed to create like' });
  }
});

// Delete a like
router.delete('/likes/:id', verifyToken, requireConsumerOrAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if the like belongs to the current user
    const checkQuery = 'SELECT id FROM likes WHERE id = ? AND user_id = ?';
    // Checkmarx Suppression: False positive - id from req.params, userId from JWT token, used with parameterized query
    const [likes] = await db.execute(checkQuery, [id, userId]);

    if (likes.length === 0) {
      return res.status(404).json({ error: 'Like not found or unauthorized' });
    }

    const deleteQuery = 'DELETE FROM likes WHERE id = ?';
    await db.execute(deleteQuery, [id]);

    res.json({ message: 'Like removed successfully' });
  } catch (error) {
    console.error('Error deleting like:', error);
    res.status(500).json({ error: 'Failed to delete like' });
  }
});

module.exports = router;
