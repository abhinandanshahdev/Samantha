const express = require('express');
const router = express.Router();
const db = require('../config/database-mysql-compat');
const { verifyToken } = require('./auth');
const { requireAdmin } = require('../middleware/roleMiddleware');

// Get all categories
router.get('/', verifyToken, (req, res) => {
  const { domain_id } = req.query;

  let query = 'SELECT * FROM categories';
  const params = [];

  // Filter by domain if provided
  if (domain_id) {
    query += ' WHERE domain_id = ?';
    params.push(domain_id);
  }

  query += ' ORDER BY name';

  db.query(query, params, (err, results) => {
    if (err) {
      console.error('Error fetching categories:', err);
      return res.status(500).json({ error: 'Failed to fetch categories' });
    }

    res.json(results);
  });
});

// Create new category
router.post('/', verifyToken, requireAdmin, (req, res) => {
  const { name, description, domain_id } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Category name is required' });
  }

  if (!domain_id) {
    return res.status(400).json({ error: 'Domain ID is required' });
  }

  const query = 'INSERT INTO categories (name, description, domain_id) VALUES (?, ?, ?)';

  db.query(query, [name, description, domain_id], (err, result) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: 'Category already exists' });
      }
      console.error('Error creating category:', err);
      return res.status(500).json({ error: 'Failed to create category' });
    }

    res.status(201).json({
      id: result.insertId,
      name,
      description,
      domain_id,
      message: 'Category created successfully'
    });
  });
});

// Update category
router.put('/:id', verifyToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Category name is required' });
  }
  
  const query = 'UPDATE categories SET name = ?, description = ? WHERE id = ?';
  
  db.query(query, [name, description, id], (err, result) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: 'Category name already exists' });
      }
      console.error('Error updating category:', err);
      return res.status(500).json({ error: 'Failed to update category' });
    }
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    res.json({ message: 'Category updated successfully' });
  });
});

// Delete category
router.delete('/:id', verifyToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  
  db.query('DELETE FROM categories WHERE id = ?', [id], (err, result) => {
    if (err) {
      console.error('Error deleting category:', err);
      return res.status(500).json({ error: 'Failed to delete category' });
    }
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    res.json({ message: 'Category deleted successfully' });
  });
});

module.exports = router;