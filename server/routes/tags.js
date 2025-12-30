const express = require('express');
const router = express.Router();
const db = require('../config/database-mysql-compat');
const { verifyToken } = require('./auth');

// Get all tags
router.get('/', verifyToken, (req, res) => {
  const query = 'SELECT id, name FROM tags ORDER BY name ASC';

  db.query(query, [], (err, results) => {
    if (err) {
      console.error('Error fetching tags:', err);
      return res.status(500).json({ error: 'Failed to fetch tags' });
    }

    res.json(results);
  });
});

// Create a new tag
router.post('/', verifyToken, (req, res) => {
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Tag name is required' });
  }

  const query = 'INSERT INTO tags (name) VALUES (?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)';

  db.query(query, [name.trim()], (err, result) => {
    if (err) {
      console.error('Error creating tag:', err);
      return res.status(500).json({ error: 'Failed to create tag' });
    }

    res.status(201).json({
      id: result.insertId,
      name: name.trim()
    });
  });
});

// Delete a tag (only if not in use)
router.delete('/:id', verifyToken, (req, res) => {
  const { id } = req.params;

  // First, check if tag is in use
  const checkQuery = 'SELECT COUNT(*) as count FROM use_case_tags WHERE tag_id = ?';

  db.query(checkQuery, [id], (err, results) => {
    if (err) {
      console.error('Error checking tag usage:', err);
      return res.status(500).json({ error: 'Failed to check tag usage' });
    }

    if (results[0].count > 0) {
      return res.status(400).json({
        error: 'Cannot delete tag that is in use'
      });
    }

    // If not in use, delete it
    const deleteQuery = 'DELETE FROM tags WHERE id = ?';

    db.query(deleteQuery, [id], (err, result) => {
      if (err) {
        console.error('Error deleting tag:', err);
        return res.status(500).json({ error: 'Failed to delete tag' });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Tag not found' });
      }

      res.json({ message: 'Tag deleted successfully' });
    });
  });
});

module.exports = router;
