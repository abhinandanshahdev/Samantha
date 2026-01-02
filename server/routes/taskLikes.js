const express = require('express');
const router = express.Router();
const db = require('../config/database-mysql-compat');
const { verifyToken } = require('./auth');
const { requireConsumerOrAdmin } = require('../middleware/roleMiddleware');
const { createAuditLog } = require('../services/auditLogService');

// Get all likes for a task
router.get('/tasks/:taskId/likes', verifyToken, requireConsumerOrAdmin, async (req, res) => {
  try {
    const { taskId } = req.params;

    const query = `
      SELECT tl.id, tl.task_id, tl.user_id, tl.created_date,
             u.name as user_name, u.email as user_email
      FROM task_likes tl
      JOIN users u ON tl.user_id = u.id
      WHERE tl.task_id = ?
      ORDER BY tl.created_date DESC
    `;

    const [likes] = await db.execute(query, [taskId]);
    res.json(likes);
  } catch (error) {
    console.error('Error fetching task likes:', error);
    res.status(500).json({ error: 'Failed to fetch task likes' });
  }
});

// Get like count for a task
router.get('/tasks/:taskId/likes/count', verifyToken, requireConsumerOrAdmin, async (req, res) => {
  try {
    const { taskId } = req.params;

    const query = 'SELECT COUNT(*) as count FROM task_likes WHERE task_id = ?';
    const [result] = await db.execute(query, [taskId]);

    res.json({ count: result[0].count });
  } catch (error) {
    console.error('Error fetching task likes count:', error);
    res.status(500).json({ error: 'Failed to fetch task likes count' });
  }
});

// Check if current user liked a task
router.get('/tasks/:taskId/likes/check', verifyToken, requireConsumerOrAdmin, async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.user.id;

    const query = 'SELECT id FROM task_likes WHERE task_id = ? AND user_id = ?';
    const [likes] = await db.execute(query, [taskId, userId]);

    res.json({ liked: likes.length > 0, likeId: likes.length > 0 ? likes[0].id : null });
  } catch (error) {
    console.error('Error checking task like status:', error);
    res.status(500).json({ error: 'Failed to check task like status' });
  }
});

// Batch check if current user liked multiple tasks (fixes N+1 problem)
router.post('/task-likes/batch-check', verifyToken, requireConsumerOrAdmin, async (req, res) => {
  try {
    const { task_ids } = req.body;
    const userId = req.user.id;

    if (!task_ids || !Array.isArray(task_ids) || task_ids.length === 0) {
      return res.json({ liked_ids: [] });
    }

    // Limit to reasonable batch size to prevent abuse
    const limitedIds = task_ids.slice(0, 500);

    const placeholders = limitedIds.map(() => '?').join(',');
    const query = `SELECT task_id FROM task_likes WHERE task_id IN (${placeholders}) AND user_id = ?`;
    const params = [...limitedIds, userId];

    const [likes] = await db.execute(query, params);

    const likedIds = likes.map(row => row.task_id);
    res.json({ liked_ids: likedIds });
  } catch (error) {
    console.error('Error batch checking task likes:', error);
    res.status(500).json({ error: 'Failed to batch check task likes' });
  }
});

// Toggle like for a task (add or remove)
router.post('/task-likes/toggle', verifyToken, requireConsumerOrAdmin, async (req, res) => {
  try {
    const { task_id } = req.body;
    const userId = req.user.id;

    if (!task_id) {
      return res.status(400).json({ error: 'task_id is required' });
    }

    // Check if already liked
    const checkQuery = 'SELECT id FROM task_likes WHERE task_id = ? AND user_id = ?';
    const [existing] = await db.execute(checkQuery, [task_id, userId]);

    if (existing.length > 0) {
      // Unlike - remove the like
      const deleteQuery = 'DELETE FROM task_likes WHERE id = ?';
      await db.execute(deleteQuery, [existing[0].id]);

      // Update tasks.updated_date
      const updateTaskQuery = 'UPDATE tasks SET updated_date = CURRENT_TIMESTAMP WHERE id = ?';
      await db.execute(updateTaskQuery, [task_id]);

      // Get updated count
      const countQuery = 'SELECT COUNT(*) as count FROM task_likes WHERE task_id = ?';
      const [countResult] = await db.execute(countQuery, [task_id]);

      res.json({
        liked: false,
        likeId: null,
        count: countResult[0].count
      });
    } else {
      // Like - add the like
      const insertQuery = `
        INSERT INTO task_likes (task_id, user_id, created_date)
        VALUES (?, ?, NOW())
      `;
      const result = await db.insert(insertQuery, [task_id, userId]);

      // Update tasks.updated_date
      const updateTaskQuery = 'UPDATE tasks SET updated_date = CURRENT_TIMESTAMP WHERE id = ?';
      await db.execute(updateTaskQuery, [task_id]);

      // Fetch task title and create audit log
      const [taskResults] = await db.execute('SELECT title FROM tasks WHERE id = ?', [task_id]);
      const taskTitle = taskResults && taskResults.length > 0 ? taskResults[0].title : 'Unknown';

      createAuditLog({
        eventType: 'like_added',
        entityType: 'task',
        entityId: task_id,
        entityTitle: taskTitle,
        userId: req.user.id,
        userName: req.user.name
      }).catch(err => console.error('Failed to create audit log:', err));

      // Get updated count
      const countQuery = 'SELECT COUNT(*) as count FROM task_likes WHERE task_id = ?';
      const [countResult] = await db.execute(countQuery, [task_id]);

      res.json({
        liked: true,
        likeId: result.insertId,
        count: countResult[0].count
      });
    }
  } catch (error) {
    console.error('Error toggling task like:', error);
    res.status(500).json({ error: 'Failed to toggle task like' });
  }
});

// Create a like for a task (alternative to toggle)
router.post('/task-likes', verifyToken, requireConsumerOrAdmin, async (req, res) => {
  try {
    const { task_id } = req.body;
    const userId = req.user.id;

    if (!task_id) {
      return res.status(400).json({ error: 'task_id is required' });
    }

    // Check if already liked
    const checkQuery = 'SELECT id FROM task_likes WHERE task_id = ? AND user_id = ?';
    const [existing] = await db.execute(checkQuery, [task_id, userId]);

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Already liked this task' });
    }

    const insertQuery = `
      INSERT INTO task_likes (task_id, user_id, created_date)
      VALUES (?, ?, NOW())
    `;

    const result = await db.insert(insertQuery, [task_id, userId]);

    res.status(201).json({
      id: result.insertId,
      task_id,
      user_id: userId,
      created_date: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error creating task like:', error);
    res.status(500).json({ error: 'Failed to create task like' });
  }
});

// Delete a task like
router.delete('/task-likes/:id', verifyToken, requireConsumerOrAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if the like belongs to the current user
    const checkQuery = 'SELECT id FROM task_likes WHERE id = ? AND user_id = ?';
    const [likes] = await db.execute(checkQuery, [id, userId]);

    if (likes.length === 0) {
      return res.status(404).json({ error: 'Task like not found or unauthorized' });
    }

    const deleteQuery = 'DELETE FROM task_likes WHERE id = ?';
    await db.execute(deleteQuery, [id]);

    res.json({ message: 'Task like removed successfully' });
  } catch (error) {
    console.error('Error deleting task like:', error);
    res.status(500).json({ error: 'Failed to delete task like' });
  }
});

module.exports = router;
