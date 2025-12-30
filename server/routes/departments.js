const express = require('express');
const router = express.Router();
const db = require('../config/database-mysql-compat');
const { verifyToken } = require('./auth');
const { requireAdmin } = require('../middleware/roleMiddleware');

// Get all departments (optionally filtered by domain)
router.get('/', verifyToken, (req, res) => {
  const { domain_id } = req.query;

  let query = 'SELECT * FROM departments';
  const params = [];

  if (domain_id) {
    query += ' WHERE domain_id = ?';
    params.push(domain_id);
  }

  query += ' ORDER BY name';

  db.query(query, params, (err, results) => {
    if (err) {
      console.error('Error fetching departments:', err);
      return res.status(500).json({ error: 'Failed to fetch departments' });
    }

    res.json(results);
  });
});

// Create new department
router.post('/', verifyToken, requireAdmin, (req, res) => {
  const { name, domain_id } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Department name is required' });
  }

  if (!domain_id) {
    return res.status(400).json({ error: 'Domain ID is required' });
  }

  const query = 'INSERT INTO departments (name, domain_id) VALUES (?, ?)';

  db.query(query, [name, domain_id], (err, result) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: 'Department already exists in this domain' });
      }
      console.error('Error creating department:', err);
      return res.status(500).json({ error: 'Failed to create department' });
    }

    res.status(201).json({
      id: result.insertId,
      name,
      domain_id,
      message: 'Department created successfully'
    });
  });
});

// Update department
router.put('/:id', verifyToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Department name is required' });
  }
  
  const query = 'UPDATE departments SET name = ? WHERE id = ?';
  
  db.query(query, [name, id], (err, result) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: 'Department name already exists' });
      }
      console.error('Error updating department:', err);
      return res.status(500).json({ error: 'Failed to update department' });
    }
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Department not found' });
    }
    
    res.json({ message: 'Department updated successfully' });
  });
});

// Delete department
router.delete('/:id', verifyToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  
  db.query('DELETE FROM departments WHERE id = ?', [id], (err, result) => {
    if (err) {
      console.error('Error deleting department:', err);
      return res.status(500).json({ error: 'Failed to delete department' });
    }
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Department not found' });
    }
    
    res.json({ message: 'Department deleted successfully' });
  });
});

module.exports = router;