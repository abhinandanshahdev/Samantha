const express = require('express');
const router = express.Router();
const db = require('../config/database-mysql-compat');
const { verifyToken } = require('./auth');

// GET /api/outcomes - Get all outcomes
router.get('/', verifyToken, async (req, res) => {
  try {
    const { domain_id } = req.query;

    let query = 'SELECT * FROM outcomes WHERE is_active = 1';
    const params = [];

    // Filter by domain if provided
    if (domain_id) {
      query += ' AND domain_id = ?';
      params.push(domain_id);
    }

    query += ' ORDER BY display_order ASC';

    // Checkmarx Suppression: False positive - domain_id from req.query used with parameterized query
    const [rows] = await db.execute(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching outcomes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/outcomes - Create new outcome
router.post('/', verifyToken, async (req, res) => {
  try {
    const { domain_id, outcome_key, title, measure, progress, maturity, display_order } = req.body;

    console.log('DEBUG: POST /api/outcomes received:', { domain_id, outcome_key, title, measure, progress, maturity, display_order });

    // Validation
    if (!domain_id) {
      return res.status(400).json({ error: 'domain_id is required' });
    }
    if (!outcome_key) {
      return res.status(400).json({ error: 'outcome_key is required' });
    }
    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }
    if (!measure) {
      return res.status(400).json({ error: 'measure is required' });
    }

    // Validate progress and maturity ranges
    if (progress !== undefined && (progress < 0 || progress > 100)) {
      return res.status(400).json({ error: 'Progress must be between 0 and 100' });
    }

    if (maturity !== undefined && maturity !== null && (maturity < 1 || maturity > 5)) {
      return res.status(400).json({ error: 'Maturity must be between 1 and 5' });
    }

    // Check for duplicate outcome_key within the same domain
    // Checkmarx Suppression: False positive - outcome_key and domain_id from req.body (validated) used with parameterized query
    const [existing] = await db.execute(
      'SELECT id FROM outcomes WHERE outcome_key = ? AND domain_id = ?',
      [outcome_key, domain_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'An outcome with this key already exists in this domain' });
    }

    // Check if domain already has 6 outcomes (maximum allowed)
    const [countResult] = await db.execute(
      'SELECT COUNT(*) as count FROM outcomes WHERE domain_id = ? AND is_active = 1',
      [domain_id]
    );

    const currentCount = countResult[0].count;
    console.log(`DEBUG: Domain ${domain_id} currently has ${currentCount} active outcomes`);

    // Also fetch and log the existing outcomes for this domain
    const [existingOutcomes] = await db.execute(
      'SELECT id, outcome_key, title FROM outcomes WHERE domain_id = ? AND is_active = 1 ORDER BY display_order',
      [domain_id]
    );
    console.log(`DEBUG: Existing outcomes for domain ${domain_id}:`, existingOutcomes.map(o => `${o.id}: ${o.outcome_key}`));

    if (currentCount >= 6) {
      return res.status(400).json({
        error: 'Maximum of 6 outcomes allowed per domain. Please delete an existing outcome before adding a new one.',
        currentCount: currentCount,
        existingOutcomes: existingOutcomes.map(o => ({ id: o.id, key: o.outcome_key, title: o.title }))
      });
    }

    // Insert new outcome
    const [result] = await db.execute(
      `INSERT INTO outcomes (domain_id, outcome_key, title, measure, progress, maturity, display_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [domain_id, outcome_key, title, measure, progress || 0, maturity || null, display_order || 0]
    );

    // Fetch and return the created outcome
    const [rows] = await db.execute(
      'SELECT * FROM outcomes WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Error creating outcome:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/outcomes/:id - Get specific outcome
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    // Checkmarx Suppression: False positive - id from req.params used with parameterized query
    const [rows] = await db.execute(
      'SELECT * FROM outcomes WHERE id = ? AND is_active = 1',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Outcome not found' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching outcome:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/outcomes/:id - Update outcome
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { outcome_key, title, measure, progress, maturity, display_order } = req.body;
    
    // Validate input
    if (progress !== undefined && (progress < 0 || progress > 100)) {
      return res.status(400).json({ error: 'Progress must be between 0 and 100' });
    }
    
    if (maturity !== undefined && (maturity < 1 || maturity > 5)) {
      return res.status(400).json({ error: 'Maturity must be between 1 and 5' });
    }
    
    const updates = [];
    const values = [];

    if (outcome_key !== undefined) {
      updates.push('outcome_key = ?');
      values.push(outcome_key);
    }

    if (title !== undefined) {
      updates.push('title = ?');
      values.push(title);
    }

    if (measure !== undefined) {
      updates.push('measure = ?');
      values.push(measure);
    }

    if (progress !== undefined) {
      updates.push('progress = ?');
      values.push(progress);
    }

    if (maturity !== undefined) {
      updates.push('maturity = ?');
      values.push(maturity);
    }

    if (display_order !== undefined) {
      updates.push('display_order = ?');
      values.push(display_order);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    updates.push('updated_date = CURRENT_TIMESTAMP');
    values.push(id);
    
    const [result] = await db.execute(
      `UPDATE outcomes SET ${updates.join(', ')} WHERE id = ? AND is_active = 1`,
      values
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Outcome not found' });
    }
    
    // Fetch and return updated outcome
    const [rows] = await db.execute(
      'SELECT * FROM outcomes WHERE id = ? AND is_active = 1',
      [id]
    );
    
    res.json(rows[0]);
  } catch (error) {
    console.error('Error updating outcome:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/outcomes/:id/progress - Update just progress/maturity
router.patch('/:id/progress', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { progress, maturity } = req.body;

    // Validate input
    if (progress !== undefined && (progress < 0 || progress > 100)) {
      return res.status(400).json({ error: 'Progress must be between 0 and 100' });
    }

    if (maturity !== undefined && (maturity < 1 || maturity > 5)) {
      return res.status(400).json({ error: 'Maturity must be between 1 and 5' });
    }

    const updates = [];
    const values = [];

    if (progress !== undefined) {
      updates.push('progress = ?');
      values.push(progress);
    }

    if (maturity !== undefined) {
      updates.push('maturity = ?');
      values.push(maturity === 0 ? null : maturity); // Allow clearing maturity
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No progress or maturity value provided' });
    }

    updates.push('updated_date = CURRENT_TIMESTAMP');
    values.push(id);

    const [result] = await db.execute(
      `UPDATE outcomes SET ${updates.join(', ')} WHERE id = ? AND is_active = 1`,
      values
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Outcome not found' });
    }

    // Fetch and return updated outcome
    const [rows] = await db.execute(
      'SELECT * FROM outcomes WHERE id = ? AND is_active = 1',
      [id]
    );

    res.json(rows[0]);
  } catch (error) {
    console.error('Error updating outcome progress:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/outcomes/:id - Soft delete outcome
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if outcome exists
    const [existing] = await db.execute(
      'SELECT id FROM outcomes WHERE id = ? AND is_active = 1',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Outcome not found' });
    }

    // Soft delete by setting is_active to 0
    await db.execute(
      'UPDATE outcomes SET is_active = 0, updated_date = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );

    res.json({ message: 'Outcome deleted successfully' });
  } catch (error) {
    console.error('Error deleting outcome:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;