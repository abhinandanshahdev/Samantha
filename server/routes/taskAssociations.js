const express = require('express');
const router = express.Router();
const db = require('../config/database-mysql-compat');
const { verifyToken } = require('./auth');
const { requireConsumerOrAdmin } = require('../middleware/roleMiddleware');

// Get all initiative associations for a task
router.get('/tasks/:taskId/initiatives', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { taskId } = req.params;

  const query = `
    SELECT DISTINCT
      tia.id as association_id,
      tia.use_case_id,
      uc.title,
      uc.description,
      uc.status,
      c.name as category_name,
      tia.created_date,
      u.name as created_by_name
    FROM task_initiative_associations tia
    JOIN use_cases uc ON tia.use_case_id = uc.id
    LEFT JOIN categories c ON uc.category_id = c.id
    LEFT JOIN users u ON tia.created_by = u.id
    WHERE tia.task_id = ?
    ORDER BY tia.created_date DESC
  `;

  db.query(query, [taskId], (err, results) => {
    if (err) {
      console.error('Error fetching task-initiative associations:', err);
      return res.status(500).json({ error: 'Failed to fetch initiative associations' });
    }

    const associations = results.map(row => ({
      association_id: row.association_id,
      use_case_id: row.use_case_id,
      title: row.title,
      description: row.description,
      status: row.status,
      category: row.category_name,
      created_date: row.created_date,
      created_by_name: row.created_by_name
    }));

    res.json(associations);
  });
});

// Get all task associations for an initiative (use case)
router.get('/use-cases/:useCaseId/tasks', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { useCaseId } = req.params;

  const query = `
    SELECT DISTINCT
      tia.id as association_id,
      tia.task_id,
      t.title,
      t.description,
      t.status,
      tia.created_date,
      u.name as created_by_name
    FROM task_initiative_associations tia
    JOIN tasks t ON tia.task_id = t.id
    LEFT JOIN users u ON tia.created_by = u.id
    WHERE tia.use_case_id = ?
    ORDER BY tia.created_date DESC
  `;

  db.query(query, [useCaseId], (err, results) => {
    if (err) {
      console.error('Error fetching initiative-task associations:', err);
      return res.status(500).json({ error: 'Failed to fetch task associations' });
    }

    const associations = results.map(row => ({
      association_id: row.association_id,
      task_id: row.task_id,
      title: row.title,
      description: row.description,
      status: row.status,
      created_date: row.created_date,
      created_by_name: row.created_by_name
    }));

    res.json(associations);
  });
});

// Create an association between a task and an initiative
router.post('/tasks/:taskId/initiatives', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { taskId } = req.params;
  const { use_case_id } = req.body;
  const created_by = req.user.id;

  if (!use_case_id) {
    return res.status(400).json({ error: 'use_case_id is required' });
  }

  // Verify both task and initiative exist
  const checkQuery = `
    SELECT 'task' as type, id FROM tasks WHERE id = ?
    UNION
    SELECT 'use_case' as type, id FROM use_cases WHERE id = ?
  `;

  db.query(checkQuery, [taskId, use_case_id], (err, results) => {
    if (err) {
      console.error('Error checking task and initiative:', err);
      return res.status(500).json({ error: 'Failed to verify task and initiative' });
    }

    if (results.length !== 2) {
      return res.status(404).json({ error: 'Task or initiative not found' });
    }

    // Check if association already exists
    const existsQuery = `
      SELECT id FROM task_initiative_associations
      WHERE task_id = ? AND use_case_id = ?
    `;

    db.query(existsQuery, [taskId, use_case_id], (err, existingResults) => {
      if (err) {
        console.error('Error checking existing association:', err);
        return res.status(500).json({ error: 'Failed to check existing association' });
      }

      if (existingResults.length > 0) {
        return res.status(400).json({ error: 'Association already exists' });
      }

      // Create the association
      const insertQuery = `
        INSERT INTO task_initiative_associations (task_id, use_case_id, created_by)
        VALUES (?, ?, ?)
      `;

      db.query(insertQuery, [taskId, use_case_id, created_by], (err, result) => {
        if (err) {
          console.error('Error creating association:', err);
          return res.status(500).json({ error: 'Failed to create association' });
        }

        const associationId = result.insertId;

        // Fetch the created association with full initiative details
        const selectQuery = `
          SELECT
            tia.id as association_id,
            tia.use_case_id,
            uc.title,
            uc.description,
            uc.status,
            c.name as category_name,
            tia.created_date,
            u.name as created_by_name
          FROM task_initiative_associations tia
          JOIN use_cases uc ON tia.use_case_id = uc.id
          LEFT JOIN categories c ON uc.category_id = c.id
          LEFT JOIN users u ON tia.created_by = u.id
          WHERE tia.id = ?
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
            created_date: row.created_date,
            created_by_name: row.created_by_name
          };

          res.status(201).json(association);
        });
      });
    });
  });
});

// Delete a task-initiative association
router.delete('/associations/:id', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { id } = req.params;

  // Check if association exists
  db.query('SELECT id FROM task_initiative_associations WHERE id = ?', [id], (err, results) => {
    if (err) {
      console.error('Error checking association:', err);
      return res.status(500).json({ error: 'Failed to check association' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'Association not found' });
    }

    // Delete the association
    db.query('DELETE FROM task_initiative_associations WHERE id = ?', [id], (err, result) => {
      if (err) {
        console.error('Error deleting association:', err);
        return res.status(500).json({ error: 'Failed to delete association' });
      }

      res.json({ message: 'Association deleted successfully' });
    });
  });
});

module.exports = router;
