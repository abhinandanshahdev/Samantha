const express = require('express');
const router = express.Router();
const db = require('../config/database-mysql-compat');
const { verifyToken } = require('./auth');

// Get user preferences
router.get('/', verifyToken, (req, res) => {
  const userId = req.user.id;

  const query = `
    SELECT preference_key, preference_value
    FROM user_preferences
    WHERE user_id = ?
  `;

  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error('Error fetching user preferences:', err);
      return res.status(500).json({ error: 'Failed to fetch preferences' });
    }

    // Convert array to object
    const preferences = {};
    results.forEach(row => {
      preferences[row.preference_key] = row.preference_value;
    });

    res.json(preferences);
  });
});

// Get specific preference
router.get('/:key', verifyToken, (req, res) => {
  const userId = req.user.id;
  const { key } = req.params;

  const query = `
    SELECT preference_value
    FROM user_preferences
    WHERE user_id = ? AND preference_key = ?
  `;

  db.query(query, [userId, key], (err, results) => {
    if (err) {
      console.error('Error fetching preference:', err);
      return res.status(500).json({ error: 'Failed to fetch preference' });
    }

    if (results.length === 0) {
      return res.json({ value: null });
    }

    res.json({ value: results[0].preference_value });
  });
});

// Set user preference
router.post('/', verifyToken, (req, res) => {
  const userId = req.user.id;
  const { preference_key, preference_value } = req.body;

  if (!preference_key) {
    return res.status(400).json({ error: 'preference_key is required' });
  }

  const query = `
    INSERT INTO user_preferences (user_id, preference_key, preference_value)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE
      preference_value = VALUES(preference_value),
      updated_at = CURRENT_TIMESTAMP
  `;

  db.query(query, [userId, preference_key, preference_value], (err, result) => {
    if (err) {
      console.error('Error saving preference:', err);
      return res.status(500).json({ error: 'Failed to save preference' });
    }

    res.json({
      success: true,
      preference_key,
      preference_value
    });
  });
});

// Set multiple preferences at once
router.post('/batch', verifyToken, (req, res) => {
  const userId = req.user.id;
  const { preferences } = req.body;

  if (!preferences || typeof preferences !== 'object') {
    return res.status(400).json({ error: 'preferences object is required' });
  }

  const entries = Object.entries(preferences);
  if (entries.length === 0) {
    return res.json({ success: true, updated: 0 });
  }

  // Build batch insert query
  const values = entries.map(([key, value]) => [userId, key, value]);
  const placeholders = values.map(() => '(?, ?, ?)').join(', ');

  const query = `
    INSERT INTO user_preferences (user_id, preference_key, preference_value)
    VALUES ${placeholders}
    ON DUPLICATE KEY UPDATE
      preference_value = VALUES(preference_value),
      updated_at = CURRENT_TIMESTAMP
  `;

  const flatValues = values.flat();

  db.query(query, flatValues, (err, result) => {
    if (err) {
      console.error('Error saving preferences:', err);
      return res.status(500).json({ error: 'Failed to save preferences' });
    }

    res.json({
      success: true,
      updated: entries.length
    });
  });
});

// Delete preference
router.delete('/:key', verifyToken, (req, res) => {
  const userId = req.user.id;
  const { key } = req.params;

  const query = 'DELETE FROM user_preferences WHERE user_id = ? AND preference_key = ?';

  db.query(query, [userId, key], (err, result) => {
    if (err) {
      console.error('Error deleting preference:', err);
      return res.status(500).json({ error: 'Failed to delete preference' });
    }

    res.json({ success: true });
  });
});

module.exports = router;
