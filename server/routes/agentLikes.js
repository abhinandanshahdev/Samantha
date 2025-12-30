const express = require('express');
const router = express.Router();
const db = require('../config/database-mysql-compat');
const { verifyToken } = require('./auth');
const { requireConsumerOrAdmin } = require('../middleware/roleMiddleware');
const { createAuditLog } = require('../services/auditLogService');

// Get all likes for an agent
router.get('/agents/:agentId/likes', verifyToken, requireConsumerOrAdmin, async (req, res) => {
  try {
    const { agentId } = req.params;

    const query = `
      SELECT al.id, al.agent_id, al.user_id, al.created_date,
             u.name as user_name, u.email as user_email
      FROM agent_likes al
      JOIN users u ON al.user_id = u.id
      WHERE al.agent_id = ?
      ORDER BY al.created_date DESC
    `;

    const [likes] = await db.execute(query, [agentId]);
    res.json(likes);
  } catch (error) {
    console.error('Error fetching agent likes:', error);
    res.status(500).json({ error: 'Failed to fetch agent likes' });
  }
});

// Get like count for an agent
router.get('/agents/:agentId/likes/count', verifyToken, requireConsumerOrAdmin, async (req, res) => {
  try {
    const { agentId } = req.params;

    const query = 'SELECT COUNT(*) as count FROM agent_likes WHERE agent_id = ?';
    const [result] = await db.execute(query, [agentId]);

    res.json({ count: result[0].count });
  } catch (error) {
    console.error('Error fetching agent likes count:', error);
    res.status(500).json({ error: 'Failed to fetch agent likes count' });
  }
});

// Check if current user liked an agent
router.get('/agents/:agentId/likes/check', verifyToken, requireConsumerOrAdmin, async (req, res) => {
  try {
    const { agentId } = req.params;
    const userId = req.user.id;

    const query = 'SELECT id FROM agent_likes WHERE agent_id = ? AND user_id = ?';
    const [likes] = await db.execute(query, [agentId, userId]);

    res.json({ liked: likes.length > 0, likeId: likes.length > 0 ? likes[0].id : null });
  } catch (error) {
    console.error('Error checking agent like status:', error);
    res.status(500).json({ error: 'Failed to check agent like status' });
  }
});

// Batch check if current user liked multiple agents (fixes N+1 problem)
router.post('/agent-likes/batch-check', verifyToken, requireConsumerOrAdmin, async (req, res) => {
  try {
    const { agent_ids } = req.body;
    const userId = req.user.id;

    if (!agent_ids || !Array.isArray(agent_ids) || agent_ids.length === 0) {
      return res.json({ liked_ids: [] });
    }

    // Limit to reasonable batch size to prevent abuse
    const limitedIds = agent_ids.slice(0, 500);

    const placeholders = limitedIds.map(() => '?').join(',');
    const query = `SELECT agent_id FROM agent_likes WHERE agent_id IN (${placeholders}) AND user_id = ?`;
    const params = [...limitedIds, userId];

    const [likes] = await db.execute(query, params);

    const likedIds = likes.map(row => row.agent_id);
    res.json({ liked_ids: likedIds });
  } catch (error) {
    console.error('Error batch checking agent likes:', error);
    res.status(500).json({ error: 'Failed to batch check agent likes' });
  }
});

// Toggle like for an agent (add or remove)
router.post('/agent-likes/toggle', verifyToken, requireConsumerOrAdmin, async (req, res) => {
  try {
    const { agent_id } = req.body;
    const userId = req.user.id;

    if (!agent_id) {
      return res.status(400).json({ error: 'agent_id is required' });
    }

    // Check if already liked
    const checkQuery = 'SELECT id FROM agent_likes WHERE agent_id = ? AND user_id = ?';
    const [existing] = await db.execute(checkQuery, [agent_id, userId]);

    if (existing.length > 0) {
      // Unlike - remove the like
      const deleteQuery = 'DELETE FROM agent_likes WHERE id = ?';
      await db.execute(deleteQuery, [existing[0].id]);

      // Update agents.updated_date
      const updateAgentQuery = 'UPDATE agents SET updated_date = CURRENT_TIMESTAMP WHERE id = ?';
      await db.execute(updateAgentQuery, [agent_id]);

      // Get updated count
      const countQuery = 'SELECT COUNT(*) as count FROM agent_likes WHERE agent_id = ?';
      const [countResult] = await db.execute(countQuery, [agent_id]);

      res.json({
        liked: false,
        likeId: null,
        count: countResult[0].count
      });
    } else {
      // Like - add the like
      const insertQuery = `
        INSERT INTO agent_likes (agent_id, user_id, created_date)
        VALUES (?, ?, NOW())
      `;
      const result = await db.insert(insertQuery, [agent_id, userId]);

      // Update agents.updated_date
      const updateAgentQuery = 'UPDATE agents SET updated_date = CURRENT_TIMESTAMP WHERE id = ?';
      await db.execute(updateAgentQuery, [agent_id]);

      // Fetch agent title and create audit log
      const [agentResults] = await db.execute('SELECT title FROM agents WHERE id = ?', [agent_id]);
      const agentTitle = agentResults && agentResults.length > 0 ? agentResults[0].title : 'Unknown';

      createAuditLog({
        eventType: 'like_added',
        entityType: 'agent',
        entityId: agent_id,
        entityTitle: agentTitle,
        userId: req.user.id,
        userName: req.user.name
      }).catch(err => console.error('Failed to create audit log:', err));

      // Get updated count
      const countQuery = 'SELECT COUNT(*) as count FROM agent_likes WHERE agent_id = ?';
      const [countResult] = await db.execute(countQuery, [agent_id]);

      res.json({
        liked: true,
        likeId: result.insertId,
        count: countResult[0].count
      });
    }
  } catch (error) {
    console.error('Error toggling agent like:', error);
    res.status(500).json({ error: 'Failed to toggle agent like' });
  }
});

// Create a like for an agent (alternative to toggle)
router.post('/agent-likes', verifyToken, requireConsumerOrAdmin, async (req, res) => {
  try {
    const { agent_id } = req.body;
    const userId = req.user.id;

    if (!agent_id) {
      return res.status(400).json({ error: 'agent_id is required' });
    }

    // Check if already liked
    const checkQuery = 'SELECT id FROM agent_likes WHERE agent_id = ? AND user_id = ?';
    const [existing] = await db.execute(checkQuery, [agent_id, userId]);

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Already liked this agent' });
    }

    const insertQuery = `
      INSERT INTO agent_likes (agent_id, user_id, created_date)
      VALUES (?, ?, NOW())
    `;

    const result = await db.insert(insertQuery, [agent_id, userId]);

    res.status(201).json({
      id: result.insertId,
      agent_id,
      user_id: userId,
      created_date: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error creating agent like:', error);
    res.status(500).json({ error: 'Failed to create agent like' });
  }
});

// Delete an agent like
router.delete('/agent-likes/:id', verifyToken, requireConsumerOrAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if the like belongs to the current user
    const checkQuery = 'SELECT id FROM agent_likes WHERE id = ? AND user_id = ?';
    const [likes] = await db.execute(checkQuery, [id, userId]);

    if (likes.length === 0) {
      return res.status(404).json({ error: 'Agent like not found or unauthorized' });
    }

    const deleteQuery = 'DELETE FROM agent_likes WHERE id = ?';
    await db.execute(deleteQuery, [id]);

    res.json({ message: 'Agent like removed successfully' });
  } catch (error) {
    console.error('Error deleting agent like:', error);
    res.status(500).json({ error: 'Failed to delete agent like' });
  }
});

module.exports = router;
