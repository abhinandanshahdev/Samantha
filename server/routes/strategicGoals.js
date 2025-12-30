const express = require('express');
const router = express.Router();
const db = require('../config/database-mysql-compat');
const { verifyToken } = require('./auth');

// Get all strategic goals with filters
router.get('/', verifyToken, (req, res) => {
  const { search, strategic_pillar_id, status, priority, domain_id, limit = 50, offset = 0 } = req.query;

  let query = `
    SELECT
      sg.*,
      sp.name as strategic_pillar_name,
      u.name as author_name,
      COUNT(DISTINCT ucga.use_case_id) as aligned_use_cases_count
    FROM strategic_goals sg
    LEFT JOIN strategic_pillars sp ON sg.strategic_pillar_id = sp.id
    LEFT JOIN users u ON sg.author_id = u.id
    LEFT JOIN use_case_goal_alignments ucga ON sg.id = ucga.strategic_goal_id
    WHERE 1=1
  `;

  const params = [];

  // Filter by domain via strategic_pillars
  if (domain_id) {
    query += ` AND sp.domain_id = ?`;
    params.push(domain_id);
  }

  if (search) {
    query += ` AND (sg.title LIKE ? OR sg.description LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }

  if (strategic_pillar_id) {
    query += ` AND sg.strategic_pillar_id = ?`;
    params.push(strategic_pillar_id);
  }

  if (status) {
    query += ` AND sg.status = ?`;
    params.push(status);
  }

  if (priority) {
    query += ` AND sg.priority = ?`;
    params.push(priority);
  }

  query += ` GROUP BY sg.id ORDER BY sp.display_order ASC, sg.display_order ASC LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), parseInt(offset));

  db.query(query, params, (err, results) => {
    if (err) {
      console.error('Error fetching strategic goals:', err);
      return res.status(500).json({ error: 'Failed to fetch strategic goals' });
    }

    res.json(results);
  });
});

// Get single strategic goal
router.get('/:id', verifyToken, (req, res) => {
  const { id } = req.params;
  
  const query = `
    SELECT 
      sg.*,
      sp.name as strategic_pillar_name,
      u.name as author_name,
      COUNT(DISTINCT ucga.use_case_id) as aligned_use_cases_count
    FROM strategic_goals sg
    LEFT JOIN strategic_pillars sp ON sg.strategic_pillar_id = sp.id
    LEFT JOIN users u ON sg.author_id = u.id
    LEFT JOIN use_case_goal_alignments ucga ON sg.id = ucga.strategic_goal_id
    WHERE sg.id = ?
    GROUP BY sg.id
  `;
  
  db.query(query, [id], (err, results) => {
    if (err) {
      console.error('Error fetching strategic goal:', err);
      return res.status(500).json({ error: 'Failed to fetch strategic goal' });
    }
    
    if (results.length === 0) {
      return res.status(404).json({ error: 'Strategic goal not found' });
    }
    
    res.json(results[0]);
  });
});

// Create new strategic goal
router.post('/', verifyToken, (req, res) => {
  const {
    title,
    description,
    strategic_pillar_id,
    target_date,
    priority,
    status,
    success_metrics,
    completion_percentage,
    display_order
  } = req.body;

  // Basic validation
  if (!title || !description || !strategic_pillar_id) {
    return res.status(400).json({ error: 'Title, description, and strategic pillar are required' });
  }

  // Use authenticated user's ID
  const userId = req.user.id;

  const query = `
    INSERT INTO strategic_goals (
      title, description, strategic_pillar_id, target_date,
      priority, status, completion_percentage, success_metrics,
      author_id, display_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    title,
    description,
    strategic_pillar_id,
    target_date || null,
    priority || 'Medium',
    status || 'active',
    completion_percentage || 0,
    success_metrics,
    userId,
    display_order || 0
  ];
  
  db.query(query, values, (err, result) => {
    if (err) {
      console.error('Error creating strategic goal:', err);
      return res.status(500).json({ error: 'Failed to create strategic goal' });
    }
    
    // Fetch the created goal with joined data
    const fetchQuery = `
      SELECT 
        sg.*,
        sp.name as strategic_pillar_name,
        u.name as author_name
      FROM strategic_goals sg
      LEFT JOIN strategic_pillars sp ON sg.strategic_pillar_id = sp.id
      LEFT JOIN users u ON sg.author_id = u.id
      WHERE sg.title = ? AND sg.author_id = ?
      ORDER BY sg.created_date DESC
      LIMIT 1
    `;
    
    db.query(fetchQuery, [title, userId], (err, results) => {
      if (err) {
        console.error('Error fetching created strategic goal:', err);
        return res.status(500).json({ error: 'Failed to fetch created strategic goal' });
      }
      
      if (results.length === 0) {
        console.error('No record found after insert!');
        return res.status(500).json({ error: 'Failed to find created strategic goal' });
      }
      
      const createdGoal = results[0];
      createdGoal.aligned_use_cases_count = 0;
      
      res.status(201).json(createdGoal);
    });
  });
});

// Update strategic goal
router.put('/:id', verifyToken, (req, res) => {
  const { id } = req.params;
  const {
    title,
    description,
    strategic_pillar_id,
    target_date,
    priority,
    status,
    success_metrics,
    completion_percentage,
    display_order
  } = req.body;

  if (!title || !description || !strategic_pillar_id) {
    return res.status(400).json({ error: 'Title, description, and strategic pillar are required' });
  }

  const query = `
    UPDATE strategic_goals SET
      title = ?, description = ?, strategic_pillar_id = ?, target_date = ?,
      priority = ?, status = ?, completion_percentage = ?, success_metrics = ?,
      display_order = ?, updated_date = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

  const values = [
    title,
    description,
    strategic_pillar_id,
    target_date || null,
    priority,
    status,
    completion_percentage || 0,
    success_metrics,
    display_order || 0,
    id
  ];
  
  db.query(query, values, (err, result) => {
    if (err) {
      console.error('Error updating strategic goal:', err);
      return res.status(500).json({ error: 'Failed to update strategic goal' });
    }
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Strategic goal not found' });
    }
    
    res.json({ message: 'Strategic goal updated successfully' });
  });
});

// Delete strategic goal
router.delete('/:id', verifyToken, (req, res) => {
  const { id } = req.params;
  
  const query = 'DELETE FROM strategic_goals WHERE id = ?';
  
  db.query(query, [id], (err, result) => {
    if (err) {
      console.error('Error deleting strategic goal:', err);
      return res.status(500).json({ error: 'Failed to delete strategic goal' });
    }
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Strategic goal not found' });
    }
    
    res.json({ message: 'Strategic goal deleted successfully' });
  });
});

// Get use cases aligned to a strategic goal
router.get('/:id/aligned-use-cases', verifyToken, (req, res) => {
  const { id } = req.params;
  
  const query = `
    SELECT 
      uc.*,
      c.name as category_name,
      d.name as department_name,
      u.name as author_name,
      ucga.alignment_strength,
      ucga.rationale,
      ucga.created_date as alignment_date
    FROM use_case_goal_alignments ucga
    JOIN use_cases uc ON ucga.use_case_id = uc.id
    LEFT JOIN categories c ON uc.category_id = c.id
    LEFT JOIN departments d ON uc.department_id = d.id
    LEFT JOIN users u ON uc.author_id = u.id
    WHERE ucga.strategic_goal_id = ?
    ORDER BY ucga.alignment_strength DESC, uc.created_date DESC
  `;
  
  db.query(query, [id], (err, results) => {
    if (err) {
      console.error('Error fetching aligned use cases:', err);
      return res.status(500).json({ error: 'Failed to fetch aligned use cases' });
    }
    
    // Transform results to match frontend interface
    const useCases = results.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      problem_statement: row.problem_statement,
      solution_overview: row.solution_overview,
      technical_implementation: row.technical_implementation,
      results_metrics: row.results_metrics,
      lessons_learned: row.lessons_learned,
      category: row.category_name,
      status: row.status,
      author_name: row.author_name,
      created_date: row.created_date,
      updated_date: row.updated_date,
      view_count: row.view_count,
      rating: parseFloat(row.rating),
      strategic_impact: row.strategic_impact,
      complexity: {
        data_complexity: row.data_complexity,
        integration_complexity: row.integration_complexity,
        intelligence_complexity: row.intelligence_complexity,
        functional_complexity: row.functional_complexity
      },
      department: row.department_name,
      justification: row.justification,
      alignment_strength: row.alignment_strength,
      alignment_rationale: row.rationale,
      alignment_date: row.alignment_date
    }));
    
    res.json(useCases);
  });
});

// Add or update use case alignment to strategic goal
router.post('/:id/align-use-case', verifyToken, (req, res) => {
  const { id } = req.params;
  const { use_case_id, alignment_strength, rationale } = req.body;
  
  if (!use_case_id || !alignment_strength) {
    return res.status(400).json({ error: 'Use case ID and alignment strength are required' });
  }
  
  const query = `
    INSERT INTO use_case_goal_alignments (use_case_id, strategic_goal_id, alignment_strength, rationale)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      alignment_strength = VALUES(alignment_strength),
      rationale = VALUES(rationale)
  `;
  
  db.query(query, [use_case_id, id, alignment_strength, rationale], (err, result) => {
    if (err) {
      console.error('Error aligning use case to strategic goal:', err);
      return res.status(500).json({ error: 'Failed to align use case to strategic goal' });
    }
    
    res.json({ message: 'Use case aligned to strategic goal successfully' });
  });
});

// Remove use case alignment from strategic goal
router.delete('/:id/align-use-case/:useCaseId', verifyToken, (req, res) => {
  const { id, useCaseId } = req.params;
  
  const query = 'DELETE FROM use_case_goal_alignments WHERE strategic_goal_id = ? AND use_case_id = ?';
  
  db.query(query, [id, useCaseId], (err, result) => {
    if (err) {
      console.error('Error removing use case alignment:', err);
      return res.status(500).json({ error: 'Failed to remove use case alignment' });
    }
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Use case alignment not found' });
    }
    
    res.json({ message: 'Use case alignment removed successfully' });
  });
});

module.exports = router; 