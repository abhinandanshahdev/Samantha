const express = require('express');
const router = express.Router();
const db = require('../config/database-mysql-compat');
const { verifyToken } = require('./auth');
const { requireAdmin } = require('../middleware/roleMiddleware');

// Get all agent types
router.get('/', verifyToken, (req, res) => {
  const { domain_id } = req.query;

  let query = 'SELECT * FROM agent_types';
  const params = [];

  // Filter by domain if provided
  if (domain_id) {
    query += ' WHERE domain_id = ?';
    params.push(domain_id);
  }

  query += ' ORDER BY name';

  db.query(query, params, (err, results) => {
    if (err) {
      console.error('Error fetching agent types:', err);
      return res.status(500).json({ error: 'Failed to fetch agent types' });
    }

    res.json(results);
  });
});

// Create new agent type
router.post('/', verifyToken, requireAdmin, (req, res) => {
  const { name, description, domain_id } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Agent type name is required' });
  }

  if (!domain_id) {
    return res.status(400).json({ error: 'Domain ID is required' });
  }

  const query = 'INSERT INTO agent_types (name, description, domain_id) VALUES (?, ?, ?)';

  db.query(query, [name, description, domain_id], (err, result) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: 'Agent type already exists for this domain' });
      }
      console.error('Error creating agent type:', err);
      return res.status(500).json({ error: 'Failed to create agent type' });
    }

    res.status(201).json({
      id: result.insertId,
      name,
      description,
      domain_id,
      message: 'Agent type created successfully'
    });
  });
});

// Update agent type
router.put('/:id', verifyToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Agent type name is required' });
  }

  const query = 'UPDATE agent_types SET name = ?, description = ? WHERE id = ?';

  db.query(query, [name, description, id], (err, result) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: 'Agent type name already exists for this domain' });
      }
      console.error('Error updating agent type:', err);
      return res.status(500).json({ error: 'Failed to update agent type' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Agent type not found' });
    }

    res.json({ message: 'Agent type updated successfully' });
  });
});

// Delete agent type
router.delete('/:id', verifyToken, requireAdmin, (req, res) => {
  const { id } = req.params;

  // First check if any agents are using this type
  db.query('SELECT COUNT(*) as count FROM agents WHERE agent_type_id = ?', [id], (err, countResult) => {
    if (err) {
      console.error('Error checking agent type usage:', err);
      return res.status(500).json({ error: 'Failed to check agent type usage' });
    }

    if (countResult[0].count > 0) {
      return res.status(400).json({
        error: 'Cannot delete agent type that is in use',
        message: `This agent type is used by ${countResult[0].count} agent(s)`
      });
    }

    // If not in use, proceed with deletion
    db.query('DELETE FROM agent_types WHERE id = ?', [id], (err, result) => {
      if (err) {
        console.error('Error deleting agent type:', err);
        return res.status(500).json({ error: 'Failed to delete agent type' });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Agent type not found' });
      }

      res.json({ message: 'Agent type deleted successfully' });
    });
  });
});

module.exports = router;
