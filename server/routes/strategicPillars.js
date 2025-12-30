const express = require('express');
const router = express.Router();
const db = require('../config/database-mysql-compat');
const { verifyToken } = require('./auth');

// Get all strategic pillars
router.get('/', verifyToken, (req, res) => {
  const { domain_id } = req.query;

  let query = `
    SELECT
      sp.*,
      COUNT(sg.id) as goals_count
    FROM strategic_pillars sp
    LEFT JOIN strategic_goals sg ON sp.id = sg.strategic_pillar_id
  `;

  const params = [];

  // Filter by domain if provided
  if (domain_id) {
    query += ` WHERE sp.domain_id = ?`;
    params.push(domain_id);
  }

  query += ` GROUP BY sp.id ORDER BY sp.display_order ASC`;

  db.query(query, params, (err, results) => {
    if (err) {
      console.error('Error fetching strategic pillars:', err);
      return res.status(500).json({ error: 'Failed to fetch strategic pillars' });
    }

    res.json(results);
  });
});

// Get single strategic pillar
router.get('/:id', verifyToken, (req, res) => {
  const { id } = req.params;
  
  const query = `
    SELECT 
      sp.*,
      COUNT(sg.id) as goals_count
    FROM strategic_pillars sp
    LEFT JOIN strategic_goals sg ON sp.id = sg.strategic_pillar_id
    WHERE sp.id = ?
    GROUP BY sp.id
  `;
  
  db.query(query, [id], (err, results) => {
    if (err) {
      console.error('Error fetching strategic pillar:', err);
      return res.status(500).json({ error: 'Failed to fetch strategic pillar' });
    }
    
    if (results.length === 0) {
      return res.status(404).json({ error: 'Strategic pillar not found' });
    }
    
    res.json(results[0]);
  });
});

// Create new strategic pillar (admin only)
router.post('/', verifyToken, (req, res) => {
  const { name, description, domain_id, display_order } = req.body;

  // Basic validation
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  if (!domain_id) {
    return res.status(400).json({ error: 'Domain ID is required' });
  }

  // Check if domain already has 6 pillars (maximum allowed)
  const countQuery = 'SELECT COUNT(*) as count FROM strategic_pillars WHERE domain_id = ?';

  db.query(countQuery, [domain_id], (countErr, countResults) => {
    if (countErr) {
      console.error('Error counting pillars:', countErr);
      return res.status(500).json({ error: 'Failed to validate pillar count' });
    }

    if (countResults[0].count >= 6) {
      return res.status(400).json({ error: 'Maximum of 6 strategic pillars allowed per domain. Please delete an existing pillar before adding a new one.' });
    }

    const query = `
      INSERT INTO strategic_pillars (name, description, domain_id, display_order)
      VALUES (?, ?, ?, ?)
    `;

    db.query(query, [name, description, domain_id, display_order || 0], (err, result) => {
      if (err) {
        console.error('Error creating strategic pillar:', err);
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(400).json({ error: 'Strategic pillar with this name already exists' });
        }
        return res.status(500).json({ error: 'Failed to create strategic pillar' });
      }

      res.status(201).json({
        id: result.insertId,
        name,
        description,
        domain_id,
        goals_count: 0
      });
    });
  });
});

// Update strategic pillar (admin only)
router.put('/:id', verifyToken, (req, res) => {
  const { id } = req.params;
  const { name, description, display_order } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const query = `
    UPDATE strategic_pillars
    SET name = ?, description = ?, display_order = ?, updated_date = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

  db.query(query, [name, description, display_order || 0, id], (err, result) => {
    if (err) {
      console.error('Error updating strategic pillar:', err);
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: 'Strategic pillar with this name already exists' });
      }
      return res.status(500).json({ error: 'Failed to update strategic pillar' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Strategic pillar not found' });
    }

    res.json({ message: 'Strategic pillar updated successfully' });
  });
});

// Delete strategic pillar (admin only)
router.delete('/:id', verifyToken, (req, res) => {
  const { id } = req.params;
  
  // Check if there are any goals associated with this pillar
  db.query('SELECT COUNT(*) as count FROM strategic_goals WHERE strategic_pillar_id = ?', [id], (err, results) => {
    if (err) {
      console.error('Error checking strategic goals:', err);
      return res.status(500).json({ error: 'Failed to check strategic goals' });
    }
    
    if (results[0].count > 0) {
      return res.status(400).json({ error: 'Cannot delete strategic pillar with associated goals' });
    }
    
    const query = 'DELETE FROM strategic_pillars WHERE id = ?';
    
    db.query(query, [id], (err, result) => {
      if (err) {
        console.error('Error deleting strategic pillar:', err);
        return res.status(500).json({ error: 'Failed to delete strategic pillar' });
      }
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Strategic pillar not found' });
      }
      
      res.json({ message: 'Strategic pillar deleted successfully' });
    });
  });
});

module.exports = router; 