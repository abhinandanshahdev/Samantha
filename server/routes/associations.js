const express = require('express');
const router = express.Router();
const db = require('../config/database-mysql-compat');
const { verifyToken } = require('./auth');
const { requireConsumerOrAdmin } = require('../middleware/roleMiddleware');

// Get all associations for a use case (bidirectional)
router.get('/use-cases/:useCaseId/associations', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { useCaseId } = req.params;

  // Query for bidirectional associations
  // Get use cases that are related TO this use case
  // OR where this use case is related TO them
  const query = `
    SELECT DISTINCT
      uca.id as association_id,
      CASE
        WHEN uca.use_case_id = ? THEN uca.related_use_case_id
        ELSE uca.use_case_id
      END as related_use_case_id,
      uc.title,
      uc.description,
      uc.status,
      c.name as category_name,
      d.name as department_name,
      uca.created_date,
      u.name as created_by_name
    FROM use_case_associations uca
    JOIN use_cases uc ON (
      (uca.use_case_id = ? AND uca.related_use_case_id = uc.id)
      OR (uca.related_use_case_id = ? AND uca.use_case_id = uc.id)
    )
    LEFT JOIN categories c ON uc.category_id = c.id
    LEFT JOIN departments d ON uc.department_id = d.id
    LEFT JOIN users u ON uca.created_by = u.id
    WHERE uca.use_case_id = ? OR uca.related_use_case_id = ?
    ORDER BY uca.created_date DESC
  `;

  db.query(query, [useCaseId, useCaseId, useCaseId, useCaseId, useCaseId], (err, results) => {
    if (err) {
      console.error('Error fetching associations:', err);
      return res.status(500).json({ error: 'Failed to fetch associations' });
    }

    const associations = results.map(row => ({
      association_id: row.association_id,
      use_case_id: row.related_use_case_id,
      title: row.title,
      description: row.description,
      status: row.status,
      category: row.category_name,
      department: row.department_name,
      created_date: row.created_date,
      created_by_name: row.created_by_name
    }));

    res.json(associations);
  });
});

// Create an association between two use cases
router.post('/use-cases/:useCaseId/associations', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { useCaseId } = req.params;
  const { related_use_case_id } = req.body;
  const created_by = req.user.id;

  if (!related_use_case_id) {
    return res.status(400).json({ error: 'related_use_case_id is required' });
  }

  // Check if trying to associate with itself
  if (useCaseId === related_use_case_id) {
    return res.status(400).json({ error: 'Cannot associate a use case with itself' });
  }

  // Verify both use cases exist
  const checkQuery = `
    SELECT id FROM use_cases WHERE id IN (?, ?)
  `;

  db.query(checkQuery, [useCaseId, related_use_case_id], (err, results) => {
    if (err) {
      console.error('Error checking use cases:', err);
      return res.status(500).json({ error: 'Failed to verify use cases' });
    }

    if (results.length !== 2) {
      return res.status(404).json({ error: 'One or both use cases not found' });
    }

    // Check if association already exists (in either direction)
    const existsQuery = `
      SELECT id FROM use_case_associations
      WHERE (use_case_id = ? AND related_use_case_id = ?)
         OR (use_case_id = ? AND related_use_case_id = ?)
    `;

    db.query(existsQuery, [useCaseId, related_use_case_id, related_use_case_id, useCaseId], (err, existingResults) => {
      if (err) {
        console.error('Error checking existing association:', err);
        return res.status(500).json({ error: 'Failed to check existing association' });
      }

      if (existingResults.length > 0) {
        return res.status(400).json({ error: 'Association already exists' });
      }

      // Create the association
      const insertQuery = `
        INSERT INTO use_case_associations (use_case_id, related_use_case_id, created_by)
        VALUES (?, ?, ?)
      `;

      db.query(insertQuery, [useCaseId, related_use_case_id, created_by], (err, result) => {
        if (err) {
          console.error('Error creating association:', err);
          return res.status(500).json({ error: 'Failed to create association' });
        }

        const associationId = result.insertId;

        // Fetch the created association with full use case details
        const selectQuery = `
          SELECT
            uca.id as association_id,
            uca.related_use_case_id as use_case_id,
            uc.title,
            uc.description,
            uc.status,
            c.name as category_name,
            d.name as department_name,
            uca.created_date,
            u.name as created_by_name
          FROM use_case_associations uca
          JOIN use_cases uc ON uca.related_use_case_id = uc.id
          LEFT JOIN categories c ON uc.category_id = c.id
          LEFT JOIN departments d ON uc.department_id = d.id
          LEFT JOIN users u ON uca.created_by = u.id
          WHERE uca.id = ?
        `;

        db.query(selectQuery, [associationId], (err, selectResults) => {
          if (err) {
            console.error('Error fetching created association:', err);
            return res.status(500).json({ error: 'Failed to fetch created association' });
          }

          const row = selectResults[0];
          const association = {
            association_id: row.association_id,
            use_case_id: row.use_case_id,
            title: row.title,
            description: row.description,
            status: row.status,
            category: row.category_name,
            department: row.department_name,
            created_date: row.created_date,
            created_by_name: row.created_by_name
          };

          res.status(201).json(association);
        });
      });
    });
  });
});

// Delete an association
router.delete('/associations/:id', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { id } = req.params;

  // Check if association exists
  db.query('SELECT id FROM use_case_associations WHERE id = ?', [id], (err, results) => {
    if (err) {
      console.error('Error checking association:', err);
      return res.status(500).json({ error: 'Failed to check association' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'Association not found' });
    }

    // Delete the association
    db.query('DELETE FROM use_case_associations WHERE id = ?', [id], (err, result) => {
      if (err) {
        console.error('Error deleting association:', err);
        return res.status(500).json({ error: 'Failed to delete association' });
      }

      res.json({ message: 'Association deleted successfully' });
    });
  });
});

module.exports = router;
