const express = require('express');
const router = express.Router();
const db = require('../config/database-mysql-compat');
const { verifyToken } = require('./auth');
const { requireAdmin, requireConsumerOrAdmin } = require('../middleware/roleMiddleware');
const { createAuditLog } = require('../services/auditLogService');

// Helper function to format DATE fields as YYYY-MM-DD strings
const formatDateField = (dateValue) => {
  if (!dateValue) return null;
  if (typeof dateValue === 'string') return dateValue;
  const date = new Date(dateValue);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Get all tasks with filtering and pagination - Consumers and Admins
router.get('/', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const {
    search,
    strategic_impact,
    expected_delivery_year,
    expected_delivery_month,
    domain_id,
    limit = 50,
    offset = 0
  } = req.query;

  // Handle multi-select filters
  const statuses = req.query.statuses || req.query['statuses[]'] || (req.query.status ? [req.query.status] : []);
  const tags = req.query.tags || req.query['tags[]'] || [];
  const initiativeIds = req.query.initiative_ids || req.query['initiative_ids[]'] || [];

  // Ensure they're always arrays
  const statusesArray = Array.isArray(statuses) ? statuses : (statuses ? [statuses] : []);
  const tagsArray = Array.isArray(tags) ? tags : (tags ? [tags] : []);
  const initiativeIdsArray = Array.isArray(initiativeIds) ? initiativeIds : (initiativeIds ? [initiativeIds] : []);

  let query = `
    SELECT DISTINCT
      t.*,
      u.name as author_display_name,
      COALESCE(init_counts.initiative_count, 0) as initiative_count,
      COALESCE(likes_counts.likes_count, 0) as likes_count,
      COALESCE(comments_counts.comments_count, 0) as comments_count
    FROM tasks t
    LEFT JOIN users u ON t.author_id = u.id
    LEFT JOIN (
      SELECT task_id, COUNT(*) as initiative_count
      FROM task_initiative_associations
      GROUP BY task_id
    ) init_counts ON t.id = init_counts.task_id
    LEFT JOIN (
      SELECT task_id, COUNT(*) as likes_count
      FROM task_likes
      GROUP BY task_id
    ) likes_counts ON t.id = likes_counts.task_id
    LEFT JOIN (
      SELECT task_id, COUNT(*) as comments_count
      FROM comments
      WHERE task_id IS NOT NULL
      GROUP BY task_id
    ) comments_counts ON t.id = comments_counts.task_id
    WHERE 1=1
  `;

  const params = [];

  // Filter by domain_id if provided
  if (domain_id) {
    query += ` AND t.domain_id = ?`;
    params.push(domain_id);
  }

  if (search) {
    query += ` AND (t.title LIKE ? OR t.description LIKE ? OR t.problem_statement LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  // Handle statuses filter (multi-select) - now the only status field (8 kanban values)
  if (statusesArray.length > 0) {
    const statusPlaceholders = statusesArray.map(() => '?').join(',');
    query += ` AND t.status IN (${statusPlaceholders})`;
    params.push(...statusesArray);
  }

  if (strategic_impact) {
    query += ` AND t.strategic_impact = ?`;
    params.push(strategic_impact);
  }

  if (expected_delivery_year) {
    query += ` AND YEAR(t.expected_delivery_date) = ?`;
    params.push(parseInt(expected_delivery_year));
  }

  if (expected_delivery_month) {
    if (expected_delivery_month === 'unplanned') {
      query += ` AND t.expected_delivery_date IS NULL`;
    } else if (expected_delivery_month === 'past') {
      query += ` AND t.expected_delivery_date IS NOT NULL AND t.expected_delivery_date < DATE_FORMAT(NOW(), '%Y-%m-01')`;
    } else {
      query += ` AND MONTH(t.expected_delivery_date) = ?`;
      params.push(parseInt(expected_delivery_month));
    }
  }

  // Handle tags filter with AND logic (filter tasks by their linked initiatives' tags)
  if (tagsArray.length > 0) {
    query += ` AND t.id IN (
      SELECT DISTINCT tia.task_id
      FROM task_initiative_associations tia
      WHERE tia.use_case_id IN (
        SELECT uct.use_case_id
        FROM use_case_tags uct
        INNER JOIN tags tg ON uct.tag_id = tg.id
        WHERE tg.name IN (${tagsArray.map(() => '?').join(',')})
        GROUP BY uct.use_case_id
        HAVING COUNT(DISTINCT tg.name) = ?
      )
    )`;
    params.push(...tagsArray, tagsArray.length);
  }

  // Handle initiative_ids filter - show tasks linked to ANY of the selected initiatives
  if (initiativeIdsArray.length > 0) {
    query += ` AND t.id IN (
      SELECT DISTINCT tia.task_id
      FROM task_initiative_associations tia
      WHERE tia.use_case_id IN (${initiativeIdsArray.map(() => '?').join(',')})
    )`;
    params.push(...initiativeIdsArray);
  }

  query += ` ORDER BY t.created_date DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), parseInt(offset));

  db.query(query, params, (err, results) => {
    if (err) {
      console.error('Error fetching tasks:', err);
      return res.status(500).json({ error: 'Failed to fetch tasks' });
    }

    // Transform results to match frontend interface
    const tasks = results.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      problem_statement: row.problem_statement,
      solution_overview: row.solution_overview,
      technical_implementation: row.technical_implementation,
      results_metrics: row.results_metrics,
      lessons_learned: row.lessons_learned,
      status: row.status,
      author_name: row.author_name || row.author_display_name,
      owner_name: row.owner_name,
      owner_email: row.owner_email,
      created_date: row.created_date,
      updated_date: row.updated_date,
      strategic_impact: row.strategic_impact,
      effort_level: row.effort_level,
      justification: row.justification,
      initiative_count: parseInt(row.initiative_count) || 0,
      likes_count: parseInt(row.likes_count) || 0,
      comments_count: parseInt(row.comments_count) || 0,
      expected_delivery_date: formatDateField(row.expected_delivery_date),
      domain_id: row.domain_id
    }));

    res.json(tasks);
  });
});

// Get task stats with filtering (for pagination) - Consumers and Admins
router.get('/stats', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const {
    search,
    strategic_impact,
    expected_delivery_year,
    expected_delivery_month,
    domain_id
  } = req.query;

  // Handle multi-select filters
  const statuses = req.query.statuses || req.query['statuses[]'] || (req.query.status ? [req.query.status] : []);
  const tags = req.query.tags || req.query['tags[]'] || [];
  const initiativeIds = req.query.initiative_ids || req.query['initiative_ids[]'] || [];

  // Ensure they're always arrays
  const statusesArray = Array.isArray(statuses) ? statuses : (statuses ? [statuses] : []);
  const tagsArray = Array.isArray(tags) ? tags : (tags ? [tags] : []);
  const initiativeIdsArray = Array.isArray(initiativeIds) ? initiativeIds : (initiativeIds ? [initiativeIds] : []);

  // Build count query with same filters as main list
  let countQuery = `
    SELECT COUNT(DISTINCT t.id) as total_count
    FROM tasks t
    WHERE 1=1
  `;

  const params = [];

  // Apply same filters as main list endpoint
  if (domain_id) {
    countQuery += ` AND t.domain_id = ?`;
    params.push(domain_id);
  }

  if (search) {
    countQuery += ` AND (t.title LIKE ? OR t.description LIKE ? OR t.problem_statement LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (statusesArray.length > 0) {
    const statusPlaceholders = statusesArray.map(() => '?').join(',');
    countQuery += ` AND t.status IN (${statusPlaceholders})`;
    params.push(...statusesArray);
  }

  if (strategic_impact) {
    countQuery += ` AND t.strategic_impact = ?`;
    params.push(strategic_impact);
  }

  if (expected_delivery_year) {
    countQuery += ` AND YEAR(t.expected_delivery_date) = ?`;
    params.push(parseInt(expected_delivery_year));
  }

  if (expected_delivery_month) {
    if (expected_delivery_month === 'unplanned') {
      countQuery += ` AND t.expected_delivery_date IS NULL`;
    } else if (expected_delivery_month === 'past') {
      countQuery += ` AND t.expected_delivery_date IS NOT NULL AND t.expected_delivery_date < DATE_FORMAT(NOW(), '%Y-%m-01')`;
    } else {
      countQuery += ` AND MONTH(t.expected_delivery_date) = ?`;
      params.push(parseInt(expected_delivery_month));
    }
  }

  if (tagsArray.length > 0) {
    countQuery += ` AND t.id IN (
      SELECT DISTINCT tia.task_id
      FROM task_initiative_associations tia
      WHERE tia.use_case_id IN (
        SELECT uct.use_case_id
        FROM use_case_tags uct
        INNER JOIN tags tg ON uct.tag_id = tg.id
        WHERE tg.name IN (${tagsArray.map(() => '?').join(',')})
        GROUP BY uct.use_case_id
        HAVING COUNT(DISTINCT tg.name) = ?
      )
    )`;
    params.push(...tagsArray, tagsArray.length);
  }

  if (initiativeIdsArray.length > 0) {
    countQuery += ` AND t.id IN (
      SELECT DISTINCT tia.task_id
      FROM task_initiative_associations tia
      WHERE tia.use_case_id IN (${initiativeIdsArray.map(() => '?').join(',')})
    )`;
    params.push(...initiativeIdsArray);
  }

  // Execute count query
  db.query(countQuery, params, (err, countResults) => {
    if (err) {
      console.error('Error fetching task count:', err);
      return res.status(500).json({ error: 'Failed to fetch task statistics' });
    }

    const totalCount = countResults[0]?.total_count || 0;

    // Build status breakdown query
    let breakdownQuery = `
      SELECT t.status, COUNT(DISTINCT t.id) as count
      FROM tasks t
      WHERE 1=1
    `;

    // Re-apply same filters for breakdown (simplified version)
    let breakdownFilterSql = '';
    if (domain_id) breakdownFilterSql += ` AND t.domain_id = ?`;
    if (search) breakdownFilterSql += ` AND (t.title LIKE ? OR t.description LIKE ? OR t.problem_statement LIKE ?)`;
    if (statusesArray.length > 0) breakdownFilterSql += ` AND t.status IN (${statusesArray.map(() => '?').join(',')})`;
    if (strategic_impact) breakdownFilterSql += ` AND t.strategic_impact = ?`;

    breakdownQuery += breakdownFilterSql + ` GROUP BY t.status`;

    db.query(breakdownQuery, params, (err, breakdownResults) => {
      if (err) {
        console.error('Error fetching task status breakdown:', err);
        return res.status(500).json({ error: 'Failed to fetch task statistics' });
      }

      // Convert breakdown to object
      const statusBreakdown = {};
      breakdownResults.forEach(row => {
        statusBreakdown[row.status] = row.count;
      });

      // Determine if filtered
      const hasFilters = search || statusesArray.length > 0 || strategic_impact ||
        expected_delivery_year || expected_delivery_month || tagsArray.length > 0 || initiativeIdsArray.length > 0;

      res.json({
        total_count: totalCount,
        status_breakdown: statusBreakdown,
        filtered: !!hasFilters
      });
    });
  });
});

// Get task statistics grouped by a field (for kanban/timeline views)
router.get('/stats/grouped', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { group_by, search, strategic_impact, expected_delivery_year, expected_delivery_month, domain_id } = req.query;

  // Validate group_by parameter
  const validGroupFields = ['status', 'expected_delivery_month'];
  if (!group_by || !validGroupFields.includes(group_by)) {
    return res.status(400).json({ error: `group_by must be one of: ${validGroupFields.join(', ')}` });
  }

  // Handle multi-select filters
  const statuses = req.query.statuses || req.query['statuses[]'] || (req.query.status ? [req.query.status] : []);
  const tags = req.query.tags || req.query['tags[]'] || [];
  const initiativeIds = req.query.initiative_ids || req.query['initiative_ids[]'] || [];

  const statusesArray = Array.isArray(statuses) ? statuses : (statuses ? [statuses] : []);
  const tagsArray = Array.isArray(tags) ? tags : (tags ? [tags] : []);
  const initiativeIdsArray = Array.isArray(initiativeIds) ? initiativeIds : (initiativeIds ? [initiativeIds] : []);

  // Determine the GROUP BY field
  let groupField;
  if (group_by === 'expected_delivery_month') {
    groupField = "DATE_FORMAT(t.expected_delivery_date, '%Y-%m')";
  } else {
    groupField = `t.${group_by}`;
  }

  let query = `
    SELECT ${groupField} as group_key, COUNT(DISTINCT t.id) as count
    FROM tasks t
    WHERE 1=1
  `;

  const params = [];

  if (domain_id) {
    query += ` AND t.domain_id = ?`;
    params.push(domain_id);
  }

  if (search) {
    query += ` AND (t.title LIKE ? OR t.description LIKE ? OR t.problem_statement LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (statusesArray.length > 0) {
    query += ` AND t.status IN (${statusesArray.map(() => '?').join(',')})`;
    params.push(...statusesArray);
  }

  if (strategic_impact) {
    query += ` AND t.strategic_impact = ?`;
    params.push(strategic_impact);
  }

  if (expected_delivery_year) {
    query += ` AND YEAR(t.expected_delivery_date) = ?`;
    params.push(parseInt(expected_delivery_year));
  }

  if (expected_delivery_month) {
    if (expected_delivery_month === 'unplanned') {
      query += ` AND t.expected_delivery_date IS NULL`;
    } else if (expected_delivery_month === 'past') {
      query += ` AND t.expected_delivery_date IS NOT NULL AND t.expected_delivery_date < DATE_FORMAT(NOW(), '%Y-%m-01')`;
    } else {
      query += ` AND MONTH(t.expected_delivery_date) = ?`;
      params.push(parseInt(expected_delivery_month));
    }
  }

  if (tagsArray.length > 0) {
    query += ` AND t.id IN (
      SELECT DISTINCT tia.task_id
      FROM task_initiative_associations tia
      WHERE tia.use_case_id IN (
        SELECT uct.use_case_id
        FROM use_case_tags uct
        INNER JOIN tags tg ON uct.tag_id = tg.id
        WHERE tg.name IN (${tagsArray.map(() => '?').join(',')})
        GROUP BY uct.use_case_id
        HAVING COUNT(DISTINCT tg.name) = ?
      )
    )`;
    params.push(...tagsArray, tagsArray.length);
  }

  if (initiativeIdsArray.length > 0) {
    query += ` AND t.id IN (
      SELECT DISTINCT tia.task_id
      FROM task_initiative_associations tia
      WHERE tia.use_case_id IN (${initiativeIdsArray.map(() => '?').join(',')})
    )`;
    params.push(...initiativeIdsArray);
  }

  query += ` GROUP BY ${groupField} ORDER BY ${groupField}`;

  db.query(query, params, (err, results) => {
    if (err) {
      console.error('Error fetching grouped task stats:', err);
      return res.status(500).json({ error: 'Failed to fetch grouped statistics' });
    }

    const groups = {};
    let totalCount = 0;
    results.forEach(row => {
      let key;
      if (row.group_key === null || row.group_key === '' || row.group_key === undefined) {
        key = group_by === 'expected_delivery_month' ? 'unplanned' : 'unassigned';
      } else {
        key = row.group_key;
      }
      groups[key] = { count: row.count };
      totalCount += row.count;
    });

    res.json({
      groups,
      total_count: totalCount,
      group_by
    });
  });
});

// Get task stats summary
router.get('/stats/summary', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { domain_id } = req.query;

  const domainFilter = domain_id ? 'WHERE domain_id = ?' : '';
  const params = domain_id ? [domain_id, domain_id, domain_id, domain_id] : [];

  const statsQuery = `
    SELECT
      (SELECT COUNT(*) FROM tasks ${domainFilter}) as total_tasks,
      (SELECT COUNT(*) FROM tasks ${domainFilter ? domainFilter + ' AND' : 'WHERE'} status = 'integration') as completed_tasks,
      (SELECT COUNT(*) FROM tasks ${domainFilter ? domainFilter + ' AND' : 'WHERE'} status = 'implementation') as in_progress_tasks,
      (SELECT COUNT(*) FROM tasks ${domainFilter ? domainFilter + ' AND' : 'WHERE'} strategic_impact = 'High') as high_impact_tasks
  `;

  db.query(statsQuery, params, (err, results) => {
    if (err) {
      console.error('Error fetching task stats:', err);
      return res.status(500).json({ error: 'Failed to fetch task stats' });
    }

    res.json(results[0]);
  });
});

// Get single task by ID
router.get('/:id', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { id } = req.params;

  const query = `
    SELECT
      t.*,
      u.name as author_display_name,
      COALESCE(init_counts.initiative_count, 0) as initiative_count,
      COALESCE(likes_counts.likes_count, 0) as likes_count,
      COALESCE(comments_counts.comments_count, 0) as comments_count
    FROM tasks t
    LEFT JOIN users u ON t.author_id = u.id
    LEFT JOIN (
      SELECT task_id, COUNT(*) as initiative_count
      FROM task_initiative_associations
      GROUP BY task_id
    ) init_counts ON t.id = init_counts.task_id
    LEFT JOIN (
      SELECT task_id, COUNT(*) as likes_count
      FROM task_likes
      GROUP BY task_id
    ) likes_counts ON t.id = likes_counts.task_id
    LEFT JOIN (
      SELECT task_id, COUNT(*) as comments_count
      FROM comments
      WHERE task_id IS NOT NULL
      GROUP BY task_id
    ) comments_counts ON t.id = comments_counts.task_id
    WHERE t.id = ?
  `;

  db.query(query, [id], (err, results) => {
    if (err) {
      console.error('Error fetching task:', err);
      return res.status(500).json({ error: 'Failed to fetch task' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const row = results[0];
    const task = {
      id: row.id,
      title: row.title,
      description: row.description,
      problem_statement: row.problem_statement,
      solution_overview: row.solution_overview,
      technical_implementation: row.technical_implementation,
      results_metrics: row.results_metrics,
      lessons_learned: row.lessons_learned,
      status: row.status,
      author_name: row.author_name || row.author_display_name,
      owner_name: row.owner_name,
      owner_email: row.owner_email,
      created_date: row.created_date,
      updated_date: row.updated_date,
      strategic_impact: row.strategic_impact,
      effort_level: row.effort_level,
      justification: row.justification,
      initiative_count: parseInt(row.initiative_count) || 0,
      likes_count: parseInt(row.likes_count) || 0,
      comments_count: parseInt(row.comments_count) || 0,
      expected_delivery_date: formatDateField(row.expected_delivery_date),
      domain_id: row.domain_id
    };

    // Fetch linked initiatives
    db.query('SELECT use_case_id FROM task_initiative_associations WHERE task_id = ?', [id], (err, initiativeResults) => {
      if (err) {
        console.error('Error fetching linked initiatives:', err);
        return res.status(500).json({ error: 'Failed to fetch linked initiatives' });
      }

      task.linked_initiatives = initiativeResults.map(row => row.use_case_id);
      res.json(task);
    });
  });
});

// Create new task - Admin only
router.post('/', verifyToken, requireAdmin, (req, res) => {
  const {
    title,
    description,
    problem_statement,
    solution_overview,
    technical_implementation,
    results_metrics,
    lessons_learned,
    status,
    owner_name,
    owner_email,
    strategic_impact,
    effort_level,
    justification,
    expected_delivery_date,
    domain_id,
    selectedInitiatives
  } = req.body;

  // Validate required fields
  if (!title || !description || !status) {
    return res.status(400).json({
      error: 'Missing required fields',
      details: {
        title: !title ? 'Title is required' : null,
        description: !description ? 'Description is required' : null,
        status: !status ? 'Status is required' : null
      }
    });
  }

  // Validate that at least one initiative is selected
  if (!selectedInitiatives || selectedInitiatives.length === 0) {
    return res.status(400).json({
      error: 'At least one initiative must be linked to the task'
    });
  }

  const userId = req.user.id;

  const insertQuery = `
    INSERT INTO tasks (
      title, description, problem_statement, solution_overview,
      technical_implementation, results_metrics, lessons_learned,
      status, author_id, author_name, owner_name, owner_email,
      strategic_impact, effort_level, justification, expected_delivery_date, domain_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    title, description, problem_statement, solution_overview,
    typeof technical_implementation === 'object' ? JSON.stringify(technical_implementation) : technical_implementation,
    Array.isArray(results_metrics) ? JSON.stringify(results_metrics) : results_metrics,
    lessons_learned,
    status || 'intention', userId, req.user.name, owner_name, owner_email,
    strategic_impact || 'Medium', effort_level || 'Medium',
    justification, expected_delivery_date || null, domain_id
  ];

  db.query(insertQuery, values, (err, result) => {
    if (err) {
      console.error('Error creating task:', err);
      return res.status(500).json({ error: 'Failed to create task' });
    }

    // For UUID primary keys, we need to fetch the created record
    db.query('SELECT id FROM tasks WHERE title = ? AND author_id = ? ORDER BY created_date DESC LIMIT 1', [title, userId], (err, newResult) => {
      if (err) {
        console.error('Error fetching created task:', err);
        return res.status(500).json({ error: 'Failed to fetch created task' });
      }

      if (newResult.length === 0) {
        return res.status(500).json({ error: 'Failed to find created task' });
      }

      const taskId = newResult[0].id;

      // Audit log for task creation
      createAuditLog({
        eventType: 'task_created',
        entityType: 'task',
        entityId: taskId,
        entityTitle: title,
        userId: req.user.id,
        userName: req.user.name,
        newValue: status
      }).catch(err => console.error('Failed to create audit log:', err));

      // Handle initiative associations if provided
      if (selectedInitiatives && selectedInitiatives.length > 0) {
        const associationPromises = selectedInitiatives.map(initiativeId => {
          return new Promise((resolve, reject) => {
            const assocQuery = `
              INSERT INTO task_initiative_associations (task_id, use_case_id, created_by)
              VALUES (?, ?, ?)
            `;
            db.query(assocQuery, [taskId, initiativeId, userId], (err, result) => {
              if (err) {
                reject(err);
              } else {
                resolve(result);
              }
            });
          });
        });

        Promise.all(associationPromises)
          .then(() => {
            res.status(201).json({
              message: 'Task created successfully',
              id: taskId
            });
          })
          .catch(err => {
            console.error('Error creating initiative associations:', err);
            res.status(500).json({ error: 'Task created but failed to link initiatives' });
          });
      } else {
        res.status(201).json({
          message: 'Task created successfully',
          id: taskId
        });
      }
    });
  });
});

// Update task - Admin only
router.put('/:id', verifyToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const {
    title,
    description,
    problem_statement,
    solution_overview,
    technical_implementation,
    results_metrics,
    lessons_learned,
    status,
    owner_name,
    owner_email,
    strategic_impact,
    effort_level,
    justification,
    expected_delivery_date,
    selectedInitiatives
  } = req.body;

  // Fetch old values for audit logging
  db.query('SELECT title, status FROM tasks WHERE id = ?', [id], (err, oldResults) => {
    if (err) {
      console.error('Error fetching old task values:', err);
      return res.status(500).json({ error: 'Failed to fetch task' });
    }

    if (oldResults.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const oldTask = oldResults[0];

    const updateQuery = `
      UPDATE tasks SET
        title = ?,
        description = ?,
        problem_statement = ?,
        solution_overview = ?,
        technical_implementation = ?,
        results_metrics = ?,
        lessons_learned = ?,
        status = ?,
        owner_name = ?,
        owner_email = ?,
        strategic_impact = ?,
        effort_level = ?,
        justification = ?,
        expected_delivery_date = ?,
        updated_date = NOW()
      WHERE id = ?
    `;

    const values = [
      title, description, problem_statement, solution_overview,
      technical_implementation, results_metrics, lessons_learned,
      status, owner_name, owner_email,
      strategic_impact || 'Medium', effort_level || 'Medium',
      justification, expected_delivery_date || null,
      id
    ];

    db.query(updateQuery, values, (err, result) => {
      if (err) {
        console.error('Error updating task:', err);
        return res.status(500).json({ error: 'Failed to update task' });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }

      // Audit log for status change
      if (oldTask.status !== status) {
        createAuditLog({
          eventType: 'status_change',
          entityType: 'task',
          entityId: id,
          entityTitle: oldTask.title,
          userId: req.user.id,
          userName: req.user.name,
          oldValue: oldTask.status,
          newValue: status
        }).catch(err => console.error('Failed to create audit log:', err));
      }

      // Handle initiative associations if provided
      if (selectedInitiatives !== undefined) {
        // First, remove all existing associations
        db.query('DELETE FROM task_initiative_associations WHERE task_id = ?', [id], (err) => {
          if (err) {
            console.error('Error removing existing associations:', err);
            return res.status(500).json({ error: 'Failed to update initiative associations' });
          }

          // If there are new associations to create
          if (selectedInitiatives && selectedInitiatives.length > 0) {
            const associationPromises = selectedInitiatives.map(useCaseId => {
              return new Promise((resolve, reject) => {
                db.query(
                  'INSERT INTO task_initiative_associations (task_id, use_case_id, created_by) VALUES (?, ?, ?)',
                  [id, useCaseId, req.user.id],
                  (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                  }
                );
              });
            });

            Promise.all(associationPromises)
              .then(() => {
                res.json({ message: 'Task updated successfully' });
              })
              .catch(err => {
                console.error('Error creating initiative associations:', err);
                res.status(500).json({ error: 'Task updated but failed to update initiative associations' });
              });
          } else {
            res.json({ message: 'Task updated successfully' });
          }
        });
      } else {
        res.json({ message: 'Task updated successfully' });
      }
    });
  });
});

// Delete task - Admin only
router.delete('/:id', verifyToken, requireAdmin, (req, res) => {
  const { id } = req.params;

  db.query('DELETE FROM tasks WHERE id = ?', [id], (err, result) => {
    if (err) {
      console.error('Error deleting task:', err);
      return res.status(500).json({ error: 'Failed to delete task' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({ message: 'Task deleted successfully' });
  });
});

// Update task status (kanban drag-drop)
router.put('/:id/status', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['intention', 'experimentation', 'commitment', 'implementation', 'integration', 'blocked', 'slow_burner', 'de_prioritised', 'on_hold'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status value' });
  }

  // Fetch old status for audit logging
  db.query('SELECT title, status FROM tasks WHERE id = ?', [id], (err, oldResults) => {
    if (err) {
      console.error('Error fetching old task status:', err);
      return res.status(500).json({ error: 'Failed to fetch task' });
    }

    if (oldResults.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const oldTask = oldResults[0];

    const query = 'UPDATE tasks SET status = ?, updated_date = NOW() WHERE id = ?';

    db.query(query, [status, id], (err, result) => {
      if (err) {
        console.error('Error updating task status:', err);
        return res.status(500).json({ error: 'Failed to update status' });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }

      // Audit log for status change
      createAuditLog({
        eventType: 'status_change',
        entityType: 'task',
        entityId: id,
        entityTitle: oldTask.title,
        userId: req.user.id,
        userName: req.user.name,
        oldValue: oldTask.status,
        newValue: status
      }).catch(err => console.error('Failed to create audit log:', err));

      res.json({ message: 'Task status updated successfully', status });
    });
  });
});

// Update task delivery date
router.put('/:id/delivery-date', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { id } = req.params;
  const { expected_delivery_date } = req.body;

  // Fetch old delivery date for audit logging
  db.query('SELECT title, expected_delivery_date FROM tasks WHERE id = ?', [id], (err, oldResults) => {
    if (err) {
      console.error('Error fetching old task delivery date:', err);
      return res.status(500).json({ error: 'Failed to fetch task' });
    }

    if (oldResults.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const oldTask = oldResults[0];

    const query = 'UPDATE tasks SET expected_delivery_date = ?, updated_date = NOW() WHERE id = ?';

    db.query(query, [expected_delivery_date || null, id], (err, result) => {
      if (err) {
        console.error('Error updating task delivery date:', err);
        return res.status(500).json({ error: 'Failed to update delivery date' });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }

      // Audit log for delivery date change
      createAuditLog({
        eventType: 'roadmap_change',
        entityType: 'task',
        entityId: id,
        entityTitle: oldTask.title,
        userId: req.user.id,
        userName: req.user.name,
        oldValue: oldTask.expected_delivery_date ? formatDateField(oldTask.expected_delivery_date) : null,
        newValue: expected_delivery_date
      }).catch(err => console.error('Failed to create audit log:', err));

      res.json({ message: 'Task delivery date updated successfully', expected_delivery_date });
    });
  });
});

module.exports = router;
