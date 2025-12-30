const express = require('express');
const router = express.Router();
const db = require('../config/database-mysql-compat');
const { verifyToken } = require('./auth');
const { requireConsumerOrAdmin } = require('../middleware/roleMiddleware');

// Get all initiative associations for an agent
router.get('/agents/:agentId/initiatives', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { agentId } = req.params;

  const query = `
    SELECT DISTINCT
      aia.id as association_id,
      aia.use_case_id,
      uc.title,
      uc.description,
      uc.status,
      c.name as category_name,
      d.name as department_name,
      aia.created_date,
      u.name as created_by_name
    FROM agent_initiative_associations aia
    JOIN use_cases uc ON aia.use_case_id = uc.id
    LEFT JOIN categories c ON uc.category_id = c.id
    LEFT JOIN departments d ON uc.department_id = d.id
    LEFT JOIN users u ON aia.created_by = u.id
    WHERE aia.agent_id = ?
    ORDER BY aia.created_date DESC
  `;

  db.query(query, [agentId], (err, results) => {
    if (err) {
      console.error('Error fetching agent-initiative associations:', err);
      return res.status(500).json({ error: 'Failed to fetch initiative associations' });
    }

    const associations = results.map(row => ({
      association_id: row.association_id,
      use_case_id: row.use_case_id,
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

// Get all agent associations for an initiative (use case)
router.get('/use-cases/:useCaseId/agents', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { useCaseId } = req.params;

  const query = `
    SELECT DISTINCT
      aia.id as association_id,
      aia.agent_id,
      a.title,
      a.description,
      a.status,
      at.name as agent_type_name,
      d.name as department_name,
      aia.created_date,
      u.name as created_by_name
    FROM agent_initiative_associations aia
    JOIN agents a ON aia.agent_id = a.id
    LEFT JOIN agent_types at ON a.agent_type_id = at.id
    LEFT JOIN departments d ON a.department_id = d.id
    LEFT JOIN users u ON aia.created_by = u.id
    WHERE aia.use_case_id = ?
    ORDER BY aia.created_date DESC
  `;

  db.query(query, [useCaseId], (err, results) => {
    if (err) {
      console.error('Error fetching initiative-agent associations:', err);
      return res.status(500).json({ error: 'Failed to fetch agent associations' });
    }

    const associations = results.map(row => ({
      association_id: row.association_id,
      agent_id: row.agent_id,
      title: row.title,
      description: row.description,
      status: row.status,
      agent_type: row.agent_type_name,
      department: row.department_name,
      created_date: row.created_date,
      created_by_name: row.created_by_name
    }));

    res.json(associations);
  });
});

// Create an association between an agent and an initiative
router.post('/agents/:agentId/initiatives', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { agentId } = req.params;
  const { use_case_id } = req.body;
  const created_by = req.user.id;

  if (!use_case_id) {
    return res.status(400).json({ error: 'use_case_id is required' });
  }

  // Verify both agent and initiative exist
  const checkQuery = `
    SELECT 'agent' as type, id FROM agents WHERE id = ?
    UNION
    SELECT 'use_case' as type, id FROM use_cases WHERE id = ?
  `;

  db.query(checkQuery, [agentId, use_case_id], (err, results) => {
    if (err) {
      console.error('Error checking agent and initiative:', err);
      return res.status(500).json({ error: 'Failed to verify agent and initiative' });
    }

    if (results.length !== 2) {
      return res.status(404).json({ error: 'Agent or initiative not found' });
    }

    // Check if association already exists
    const existsQuery = `
      SELECT id FROM agent_initiative_associations
      WHERE agent_id = ? AND use_case_id = ?
    `;

    db.query(existsQuery, [agentId, use_case_id], (err, existingResults) => {
      if (err) {
        console.error('Error checking existing association:', err);
        return res.status(500).json({ error: 'Failed to check existing association' });
      }

      if (existingResults.length > 0) {
        return res.status(400).json({ error: 'Association already exists' });
      }

      // Create the association
      const insertQuery = `
        INSERT INTO agent_initiative_associations (agent_id, use_case_id, created_by)
        VALUES (?, ?, ?)
      `;

      db.query(insertQuery, [agentId, use_case_id, created_by], (err, result) => {
        if (err) {
          console.error('Error creating association:', err);
          return res.status(500).json({ error: 'Failed to create association' });
        }

        const associationId = result.insertId;

        // Fetch the created association with full initiative details
        const selectQuery = `
          SELECT
            aia.id as association_id,
            aia.use_case_id,
            uc.title,
            uc.description,
            uc.status,
            c.name as category_name,
            d.name as department_name,
            aia.created_date,
            u.name as created_by_name
          FROM agent_initiative_associations aia
          JOIN use_cases uc ON aia.use_case_id = uc.id
          LEFT JOIN categories c ON uc.category_id = c.id
          LEFT JOIN departments d ON uc.department_id = d.id
          LEFT JOIN users u ON aia.created_by = u.id
          WHERE aia.id = ?
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

// Delete an agent-initiative association
router.delete('/associations/:id', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { id } = req.params;

  // Check if association exists
  db.query('SELECT id FROM agent_initiative_associations WHERE id = ?', [id], (err, results) => {
    if (err) {
      console.error('Error checking association:', err);
      return res.status(500).json({ error: 'Failed to check association' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'Association not found' });
    }

    // Delete the association
    db.query('DELETE FROM agent_initiative_associations WHERE id = ?', [id], (err, result) => {
      if (err) {
        console.error('Error deleting association:', err);
        return res.status(500).json({ error: 'Failed to delete association' });
      }

      res.json({ message: 'Association deleted successfully' });
    });
  });
});

module.exports = router;
