const express = require('express');
const router = express.Router();
const db = require('../config/database-mysql-compat');
const { verifyToken } = require('./auth');
const { requireConsumerOrAdmin } = require('../middleware/roleMiddleware');

// GET /audit-logs - Fetch audit logs with pagination and search
router.get('/', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const {
    limit = 50,
    offset = 0,
    search = '',
    eventType,
    entityType,
    entityId,
    userId,
    startDate,
    endDate
  } = req.query;

  let query = `
    SELECT
      id,
      event_type,
      entity_type,
      entity_id,
      entity_title,
      user_id,
      user_name,
      old_value,
      new_value,
      metadata,
      created_date
    FROM audit_logs
    WHERE 1=1
  `;

  const params = [];

  // Search filter
  if (search) {
    query += ` AND (
      entity_title LIKE ? OR
      user_name LIKE ? OR
      old_value LIKE ? OR
      new_value LIKE ?
    )`;
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern, searchPattern, searchPattern);
  }

  // Event type filter
  if (eventType) {
    query += ` AND event_type = ?`;
    params.push(eventType);
  }

  // Entity type filter
  if (entityType) {
    query += ` AND entity_type = ?`;
    params.push(entityType);
  }

  // Entity ID filter
  if (entityId) {
    query += ` AND entity_id = ?`;
    params.push(entityId);
  }

  // User ID filter
  if (userId) {
    query += ` AND user_id = ?`;
    params.push(userId);
  }

  // Date range filters
  if (startDate) {
    query += ` AND created_date >= ?`;
    params.push(startDate);
  }

  if (endDate) {
    query += ` AND created_date <= ?`;
    params.push(endDate);
  }

  // Count total for pagination
  const countQuery = `SELECT COUNT(*) as total FROM (${query}) as filtered_logs`;

  db.query(countQuery, params, (err, countResults) => {
    if (err) {
      console.error('Error counting audit logs:', err);
      return res.status(500).json({ error: 'Failed to count audit logs' });
    }

    const total = countResults[0].total;

    // Add ordering and pagination
    query += ` ORDER BY created_date DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    db.query(query, params, (err, results) => {
      if (err) {
        console.error('Error fetching audit logs:', err);
        return res.status(500).json({ error: 'Failed to fetch audit logs' });
      }

      // Parse metadata JSON
      const logs = results.map(log => ({
        ...log,
        metadata: log.metadata ? JSON.parse(log.metadata) : null
      }));

      res.json({
        logs,
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    });
  });
});

// GET /audit-logs/stats - Get statistics for dashboard
router.get('/stats', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const query = `
    SELECT
      event_type,
      COUNT(*) as count
    FROM audit_logs
    WHERE created_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    GROUP BY event_type
    ORDER BY count DESC
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching audit log stats:', err);
      return res.status(500).json({ error: 'Failed to fetch stats' });
    }

    res.json(results);
  });
});

module.exports = router;
