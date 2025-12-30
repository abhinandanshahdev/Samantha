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

// Get all agents with filtering and pagination - Consumers and Admins
router.get('/', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const {
    search,
    agent_type,
    status,
    department,
    strategic_impact,
    kanban_pillar,
    expected_delivery_year,
    expected_delivery_month,
    data_sensitivity,
    domain_id,
    limit = 50,
    offset = 0
  } = req.query;

  // Handle multi-select filters
  const agentTypes = req.query.agent_types || req.query['agent_types[]'] || (agent_type ? [agent_type] : []);
  const departments = req.query.departments || req.query['departments[]'] || (department ? [department] : []);
  const statuses = req.query.statuses || req.query['statuses[]'] || (status ? [status] : []);
  const tags = req.query.tags || req.query['tags[]'] || [];
  const dataSensitivityLevels = req.query['data_sensitivity[]'] || req.query.data_sensitivity || [];
  const initiativeIds = req.query.initiative_ids || req.query['initiative_ids[]'] || [];

  // Ensure they're always arrays
  const agentTypesArray = Array.isArray(agentTypes) ? agentTypes : (agentTypes ? [agentTypes] : []);
  const departmentsArray = Array.isArray(departments) ? departments : (departments ? [departments] : []);
  const statusesArray = Array.isArray(statuses) ? statuses : (statuses ? [statuses] : []);
  const tagsArray = Array.isArray(tags) ? tags : (tags ? [tags] : []);
  const dataSensitivityArray = Array.isArray(dataSensitivityLevels) ? dataSensitivityLevels : (dataSensitivityLevels ? [dataSensitivityLevels] : []);
  const initiativeIdsArray = Array.isArray(initiativeIds) ? initiativeIds : (initiativeIds ? [initiativeIds] : []);

  let query = `
    SELECT DISTINCT
      a.*,
      at.name as agent_type_name,
      d.name as department_name,
      u.name as author_name,
      COALESCE(init_counts.initiative_count, 0) as initiative_count,
      COALESCE(likes_counts.likes_count, 0) as likes_count,
      COALESCE(comments_counts.comments_count, 0) as comments_count,
      a.kanban_pillar,
      a.expected_delivery_date
    FROM agents a
    LEFT JOIN agent_types at ON a.agent_type_id = at.id
    LEFT JOIN departments d ON a.department_id = d.id
    LEFT JOIN users u ON a.author_id = u.id
    LEFT JOIN (
      SELECT agent_id, COUNT(*) as initiative_count
      FROM agent_initiative_associations
      GROUP BY agent_id
    ) init_counts ON a.id = init_counts.agent_id
    LEFT JOIN (
      SELECT agent_id, COUNT(*) as likes_count
      FROM agent_likes
      GROUP BY agent_id
    ) likes_counts ON a.id = likes_counts.agent_id
    LEFT JOIN (
      SELECT agent_id, COUNT(*) as comments_count
      FROM comments
      WHERE agent_id IS NOT NULL
      GROUP BY agent_id
    ) comments_counts ON a.id = comments_counts.agent_id
    WHERE 1=1
  `;

  const params = [];

  // Filter by domain_id if provided
  if (domain_id) {
    query += ` AND a.domain_id = ?`;
    params.push(domain_id);
  }

  if (search) {
    query += ` AND (a.title LIKE ? OR a.description LIKE ? OR a.problem_statement LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  // Handle agent types filter (multi-select)
  if (agentTypesArray.length > 0) {
    const typePlaceholders = agentTypesArray.map(() => '?').join(',');
    query += ` AND at.name IN (${typePlaceholders})`;
    params.push(...agentTypesArray);
  }

  // Handle statuses filter (multi-select)
  if (statusesArray.length > 0) {
    const statusPlaceholders = statusesArray.map(() => '?').join(',');
    query += ` AND a.status IN (${statusPlaceholders})`;
    params.push(...statusesArray);
  }

  // Handle departments filter (multi-select)
  if (departmentsArray.length > 0) {
    const departmentPlaceholders = departmentsArray.map(() => '?').join(',');
    query += ` AND d.name IN (${departmentPlaceholders})`;
    params.push(...departmentsArray);
  }

  if (strategic_impact) {
    query += ` AND a.strategic_impact = ?`;
    params.push(strategic_impact);
  }

  if (kanban_pillar) {
    query += ` AND a.kanban_pillar = ?`;
    params.push(kanban_pillar);
  }

  if (expected_delivery_year) {
    query += ` AND YEAR(a.expected_delivery_date) = ?`;
    params.push(parseInt(expected_delivery_year));
  }

  if (expected_delivery_month) {
    if (expected_delivery_month === 'unplanned') {
      query += ` AND a.expected_delivery_date IS NULL`;
    } else if (expected_delivery_month === 'past') {
      query += ` AND a.expected_delivery_date IS NOT NULL AND a.expected_delivery_date < DATE_FORMAT(NOW(), '%Y-%m-01')`;
    } else {
      query += ` AND MONTH(a.expected_delivery_date) = ?`;
      params.push(parseInt(expected_delivery_month));
    }
  }

  // Handle data sensitivity filter - filter agents by their own data_sensitivity only
  if (dataSensitivityArray.length > 0) {
    query += ` AND a.data_sensitivity IN (${dataSensitivityArray.map(() => '?').join(',')})`;
    params.push(...dataSensitivityArray);
  }

  // Handle tags filter with AND logic (filter agents by their linked initiatives' tags)
  // Show agents that are linked to initiatives having ALL selected tags
  if (tagsArray.length > 0) {
    query += ` AND a.id IN (
      SELECT DISTINCT aia.agent_id
      FROM agent_initiative_associations aia
      WHERE aia.use_case_id IN (
        SELECT uct.use_case_id
        FROM use_case_tags uct
        INNER JOIN tags t ON uct.tag_id = t.id
        WHERE t.name IN (${tagsArray.map(() => '?').join(',')})
        GROUP BY uct.use_case_id
        HAVING COUNT(DISTINCT t.name) = ?
      )
    )`;
    params.push(...tagsArray, tagsArray.length);
  }

  // Handle initiative_ids filter - show agents linked to ANY of the selected initiatives
  if (initiativeIdsArray.length > 0) {
    query += ` AND a.id IN (
      SELECT DISTINCT aia.agent_id
      FROM agent_initiative_associations aia
      WHERE aia.use_case_id IN (${initiativeIdsArray.map(() => '?').join(',')})
    )`;
    params.push(...initiativeIdsArray);
  }

  query += ` ORDER BY a.created_date DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), parseInt(offset));

  db.query(query, params, (err, results) => {
    if (err) {
      console.error('Error fetching agents:', err);
      return res.status(500).json({ error: 'Failed to fetch agents' });
    }

    // Transform results to match frontend interface
    const agents = results.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      problem_statement: row.problem_statement,
      solution_overview: row.solution_overview,
      technical_implementation: row.technical_implementation,
      results_metrics: row.results_metrics,
      lessons_learned: row.lessons_learned,
      agent_type: row.agent_type_name,
      status: row.status,
      author_name: row.author_name,
      owner_name: row.owner_name,
      owner_email: row.owner_email,
      created_date: row.created_date,
      updated_date: row.updated_date,
      strategic_impact: row.strategic_impact,
      complexity: {
        data_complexity: row.data_complexity,
        integration_complexity: row.integration_complexity,
        intelligence_complexity: row.intelligence_complexity,
        functional_complexity: row.functional_complexity
      },
      department: row.department_name,
      justification: row.justification,
      initiative_count: parseInt(row.initiative_count) || 0,
      likes_count: parseInt(row.likes_count) || 0,
      comments_count: parseInt(row.comments_count) || 0,
      kanban_pillar: row.kanban_pillar,
      expected_delivery_date: formatDateField(row.expected_delivery_date),
      data_sensitivity: row.data_sensitivity,
      roadmap_link: row.roadmap_link,
      value_realisation_link: row.value_realisation_link
    }));

    res.json(agents);
  });
});

// Get agent stats with filtering (for pagination) - Consumers and Admins
// IMPORTANT: This route must be defined BEFORE /:id to avoid being caught by the param route
router.get('/stats', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const {
    search,
    agent_type,
    status,
    department,
    strategic_impact,
    kanban_pillar,
    expected_delivery_year,
    expected_delivery_month,
    data_sensitivity,
    domain_id
  } = req.query;

  // Handle multi-select filters
  const agentTypes = req.query.agent_types || req.query['agent_types[]'] || (agent_type ? [agent_type] : []);
  const departments = req.query.departments || req.query['departments[]'] || (department ? [department] : []);
  const statuses = req.query.statuses || req.query['statuses[]'] || (status ? [status] : []);
  const tags = req.query.tags || req.query['tags[]'] || [];
  const dataSensitivityLevels = req.query['data_sensitivity[]'] || req.query.data_sensitivity || [];
  const initiativeIds = req.query.initiative_ids || req.query['initiative_ids[]'] || [];

  // Ensure they're always arrays
  const agentTypesArray = Array.isArray(agentTypes) ? agentTypes : (agentTypes ? [agentTypes] : []);
  const departmentsArray = Array.isArray(departments) ? departments : (departments ? [departments] : []);
  const statusesArray = Array.isArray(statuses) ? statuses : (statuses ? [statuses] : []);
  const tagsArray = Array.isArray(tags) ? tags : (tags ? [tags] : []);
  const dataSensitivityArray = Array.isArray(dataSensitivityLevels) ? dataSensitivityLevels : (dataSensitivityLevels ? [dataSensitivityLevels] : []);
  const initiativeIdsArray = Array.isArray(initiativeIds) ? initiativeIds : (initiativeIds ? [initiativeIds] : []);

  // Build count query with same filters as main list
  let countQuery = `
    SELECT COUNT(DISTINCT a.id) as total_count
    FROM agents a
    LEFT JOIN agent_types at ON a.agent_type_id = at.id
    LEFT JOIN departments d ON a.department_id = d.id
    WHERE 1=1
  `;

  const params = [];

  // Apply same filters as main list endpoint
  if (domain_id) {
    countQuery += ` AND a.domain_id = ?`;
    params.push(domain_id);
  }

  if (search) {
    countQuery += ` AND (a.title LIKE ? OR a.description LIKE ? OR a.problem_statement LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (agentTypesArray.length > 0) {
    const typePlaceholders = agentTypesArray.map(() => '?').join(',');
    countQuery += ` AND at.name IN (${typePlaceholders})`;
    params.push(...agentTypesArray);
  }

  if (statusesArray.length > 0) {
    const statusPlaceholders = statusesArray.map(() => '?').join(',');
    countQuery += ` AND a.status IN (${statusPlaceholders})`;
    params.push(...statusesArray);
  }

  if (departmentsArray.length > 0) {
    const departmentPlaceholders = departmentsArray.map(() => '?').join(',');
    countQuery += ` AND d.name IN (${departmentPlaceholders})`;
    params.push(...departmentsArray);
  }

  if (strategic_impact) {
    countQuery += ` AND a.strategic_impact = ?`;
    params.push(strategic_impact);
  }

  if (kanban_pillar) {
    countQuery += ` AND a.kanban_pillar = ?`;
    params.push(kanban_pillar);
  }

  if (expected_delivery_year) {
    countQuery += ` AND YEAR(a.expected_delivery_date) = ?`;
    params.push(parseInt(expected_delivery_year));
  }

  if (expected_delivery_month) {
    if (expected_delivery_month === 'unplanned') {
      countQuery += ` AND a.expected_delivery_date IS NULL`;
    } else if (expected_delivery_month === 'past') {
      countQuery += ` AND a.expected_delivery_date IS NOT NULL AND a.expected_delivery_date < DATE_FORMAT(NOW(), '%Y-%m-01')`;
    } else {
      countQuery += ` AND MONTH(a.expected_delivery_date) = ?`;
      params.push(parseInt(expected_delivery_month));
    }
  }

  if (dataSensitivityArray.length > 0) {
    countQuery += ` AND a.data_sensitivity IN (${dataSensitivityArray.map(() => '?').join(',')})`;
    params.push(...dataSensitivityArray);
  }

  if (tagsArray.length > 0) {
    countQuery += ` AND a.id IN (
      SELECT DISTINCT aia.agent_id
      FROM agent_initiative_associations aia
      WHERE aia.use_case_id IN (
        SELECT uct.use_case_id
        FROM use_case_tags uct
        INNER JOIN tags t ON uct.tag_id = t.id
        WHERE t.name IN (${tagsArray.map(() => '?').join(',')})
        GROUP BY uct.use_case_id
        HAVING COUNT(DISTINCT t.name) = ?
      )
    )`;
    params.push(...tagsArray, tagsArray.length);
  }

  if (initiativeIdsArray.length > 0) {
    countQuery += ` AND a.id IN (
      SELECT DISTINCT aia.agent_id
      FROM agent_initiative_associations aia
      WHERE aia.use_case_id IN (${initiativeIdsArray.map(() => '?').join(',')})
    )`;
    params.push(...initiativeIdsArray);
  }

  // Execute count query
  db.query(countQuery, params, (err, countResults) => {
    if (err) {
      console.error('Error fetching agent count:', err);
      return res.status(500).json({ error: 'Failed to fetch agent statistics' });
    }

    const totalCount = countResults[0]?.total_count || 0;

    // Build status breakdown query
    let breakdownQuery = `
      SELECT a.status, COUNT(DISTINCT a.id) as count
      FROM agents a
      LEFT JOIN agent_types at ON a.agent_type_id = at.id
      LEFT JOIN departments d ON a.department_id = d.id
      WHERE 1=1
    `;

    // Re-apply same filters for breakdown
    const breakdownParams = [...params.slice(0, params.length)]; // Clone params
    let breakdownFilterSql = '';

    if (domain_id) {
      breakdownFilterSql += ` AND a.domain_id = ?`;
    }

    if (search) {
      breakdownFilterSql += ` AND (a.title LIKE ? OR a.description LIKE ? OR a.problem_statement LIKE ?)`;
    }

    if (agentTypesArray.length > 0) {
      const typePlaceholders = agentTypesArray.map(() => '?').join(',');
      breakdownFilterSql += ` AND at.name IN (${typePlaceholders})`;
    }

    if (statusesArray.length > 0) {
      const statusPlaceholders = statusesArray.map(() => '?').join(',');
      breakdownFilterSql += ` AND a.status IN (${statusPlaceholders})`;
    }

    if (departmentsArray.length > 0) {
      const departmentPlaceholders = departmentsArray.map(() => '?').join(',');
      breakdownFilterSql += ` AND d.name IN (${departmentPlaceholders})`;
    }

    if (strategic_impact) {
      breakdownFilterSql += ` AND a.strategic_impact = ?`;
    }

    if (kanban_pillar) {
      breakdownFilterSql += ` AND a.kanban_pillar = ?`;
    }

    if (expected_delivery_year) {
      breakdownFilterSql += ` AND YEAR(a.expected_delivery_date) = ?`;
    }

    if (expected_delivery_month) {
      if (expected_delivery_month === 'unplanned') {
        breakdownFilterSql += ` AND a.expected_delivery_date IS NULL`;
      } else if (expected_delivery_month === 'past') {
        breakdownFilterSql += ` AND a.expected_delivery_date IS NOT NULL AND a.expected_delivery_date < DATE_FORMAT(NOW(), '%Y-%m-01')`;
      } else {
        breakdownFilterSql += ` AND MONTH(a.expected_delivery_date) = ?`;
      }
    }

    if (dataSensitivityArray.length > 0) {
      breakdownFilterSql += ` AND a.data_sensitivity IN (${dataSensitivityArray.map(() => '?').join(',')})`;
    }

    if (tagsArray.length > 0) {
      breakdownFilterSql += ` AND a.id IN (
        SELECT DISTINCT aia.agent_id
        FROM agent_initiative_associations aia
        WHERE aia.use_case_id IN (
          SELECT uct.use_case_id
          FROM use_case_tags uct
          INNER JOIN tags t ON uct.tag_id = t.id
          WHERE t.name IN (${tagsArray.map(() => '?').join(',')})
          GROUP BY uct.use_case_id
          HAVING COUNT(DISTINCT t.name) = ?
        )
      )`;
    }

    if (initiativeIdsArray.length > 0) {
      breakdownFilterSql += ` AND a.id IN (
        SELECT DISTINCT aia.agent_id
        FROM agent_initiative_associations aia
        WHERE aia.use_case_id IN (${initiativeIdsArray.map(() => '?').join(',')})
      )`;
    }

    breakdownQuery += breakdownFilterSql + ` GROUP BY a.status`;

    db.query(breakdownQuery, params, (err, breakdownResults) => {
      if (err) {
        console.error('Error fetching agent status breakdown:', err);
        return res.status(500).json({ error: 'Failed to fetch agent statistics' });
      }

      // Convert breakdown to object
      const statusBreakdown = {};
      breakdownResults.forEach(row => {
        statusBreakdown[row.status] = row.count;
      });

      // Determine if filtered
      const hasFilters = search || agentTypesArray.length > 0 || statusesArray.length > 0 ||
        departmentsArray.length > 0 || strategic_impact || kanban_pillar ||
        expected_delivery_year || expected_delivery_month || dataSensitivityArray.length > 0 ||
        tagsArray.length > 0 || initiativeIdsArray.length > 0;

      res.json({
        total_count: totalCount,
        status_breakdown: statusBreakdown,
        filtered: !!hasFilters
      });
    });
  });
});

// Get agent statistics grouped by a field (for kanban/timeline views) - Consumers and Admins
// IMPORTANT: This route must be defined BEFORE /:id to avoid being caught by the param route
router.get('/stats/grouped', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { group_by, search, agent_type, status, department, strategic_impact, expected_delivery_year, expected_delivery_month, domain_id } = req.query;

  // Validate group_by parameter
  const validGroupFields = ['kanban_pillar', 'expected_delivery_month', 'status'];
  if (!group_by || !validGroupFields.includes(group_by)) {
    return res.status(400).json({ error: `group_by must be one of: ${validGroupFields.join(', ')}` });
  }

  // Handle multi-select filters
  const agentTypes = req.query.agent_types || req.query['agent_types[]'] || (agent_type ? [agent_type] : []);
  const departments = req.query.departments || req.query['departments[]'] || (department ? [department] : []);
  const statuses = req.query.statuses || req.query['statuses[]'] || (status ? [status] : []);
  const tags = req.query.tags || req.query['tags[]'] || [];
  const dataSensitivityLevels = req.query['data_sensitivity[]'] || req.query.data_sensitivity || [];
  const initiativeIds = req.query.initiative_ids || req.query['initiative_ids[]'] || [];

  // Ensure they're always arrays
  const agentTypesArray = Array.isArray(agentTypes) ? agentTypes : (agentTypes ? [agentTypes] : []);
  const departmentsArray = Array.isArray(departments) ? departments : (departments ? [departments] : []);
  const statusesArray = Array.isArray(statuses) ? statuses : (statuses ? [statuses] : []);
  const tagsArray = Array.isArray(tags) ? tags : (tags ? [tags] : []);
  const dataSensitivityArray = Array.isArray(dataSensitivityLevels) ? dataSensitivityLevels : (dataSensitivityLevels ? [dataSensitivityLevels] : []);
  const initiativeIdsArray = Array.isArray(initiativeIds) ? initiativeIds : (initiativeIds ? [initiativeIds] : []);

  // Determine the GROUP BY field
  let groupField;
  if (group_by === 'kanban_pillar') {
    groupField = 'a.kanban_pillar';
  } else if (group_by === 'expected_delivery_month') {
    // Return format YYYY-MM for frontend compatibility (e.g., "2025-01")
    // expected_delivery_date is a DATE column, so use DATE_FORMAT directly
    groupField = "DATE_FORMAT(a.expected_delivery_date, '%Y-%m')";
  } else {
    groupField = `a.${group_by}`;
  }

  let query = `
    SELECT ${groupField} as group_key, COUNT(DISTINCT a.id) as count
    FROM agents a
    LEFT JOIN agent_types at ON a.agent_type_id = at.id
    LEFT JOIN departments d ON a.department_id = d.id
    WHERE 1=1
  `;

  const params = [];

  // Apply domain filter
  if (domain_id) {
    query += ` AND a.domain_id = ?`;
    params.push(domain_id);
  }

  // Apply search filter
  if (search) {
    query += ` AND (a.title LIKE ? OR a.description LIKE ? OR a.problem_statement LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  // Apply agent types filter
  if (agentTypesArray.length > 0) {
    query += ` AND at.name IN (${agentTypesArray.map(() => '?').join(',')})`;
    params.push(...agentTypesArray);
  }

  // Apply status filter
  if (statusesArray.length > 0) {
    query += ` AND a.status IN (${statusesArray.map(() => '?').join(',')})`;
    params.push(...statusesArray);
  }

  // Apply department filter
  if (departmentsArray.length > 0) {
    query += ` AND d.name IN (${departmentsArray.map(() => '?').join(',')})`;
    params.push(...departmentsArray);
  }

  // Apply strategic impact filter
  if (strategic_impact) {
    query += ` AND a.strategic_impact = ?`;
    params.push(strategic_impact);
  }

  // Apply delivery year filter
  if (expected_delivery_year) {
    query += ` AND YEAR(a.expected_delivery_date) = ?`;
    params.push(parseInt(expected_delivery_year));
  }

  // Apply delivery month filter
  if (expected_delivery_month) {
    if (expected_delivery_month === 'unplanned') {
      query += ` AND a.expected_delivery_date IS NULL`;
    } else if (expected_delivery_month === 'past') {
      query += ` AND a.expected_delivery_date IS NOT NULL AND a.expected_delivery_date < DATE_FORMAT(NOW(), '%Y-%m-01')`;
    } else {
      query += ` AND MONTH(a.expected_delivery_date) = ?`;
      params.push(parseInt(expected_delivery_month));
    }
  }

  // Apply data sensitivity filter
  if (dataSensitivityArray.length > 0) {
    query += ` AND a.data_sensitivity IN (${dataSensitivityArray.map(() => '?').join(',')})`;
    params.push(...dataSensitivityArray);
  }

  // Apply tags filter (via initiatives)
  if (tagsArray.length > 0) {
    query += ` AND a.id IN (
      SELECT DISTINCT aia.agent_id
      FROM agent_initiative_associations aia
      WHERE aia.use_case_id IN (
        SELECT uct.use_case_id
        FROM use_case_tags uct
        INNER JOIN tags t ON uct.tag_id = t.id
        WHERE t.name IN (${tagsArray.map(() => '?').join(',')})
        GROUP BY uct.use_case_id
        HAVING COUNT(DISTINCT t.name) = ?
      )
    )`;
    params.push(...tagsArray, tagsArray.length);
  }

  // Apply initiative_ids filter
  if (initiativeIdsArray.length > 0) {
    query += ` AND a.id IN (
      SELECT DISTINCT aia.agent_id
      FROM agent_initiative_associations aia
      WHERE aia.use_case_id IN (${initiativeIdsArray.map(() => '?').join(',')})
    )`;
    params.push(...initiativeIdsArray);
  }

  // Group by and order
  query += ` GROUP BY ${groupField} ORDER BY ${groupField}`;

  db.query(query, params, (err, results) => {
    if (err) {
      console.error('Error fetching grouped agent stats:', err);
      return res.status(500).json({ error: 'Failed to fetch grouped statistics' });
    }

    // Convert to groups object
    const groups = {};
    let totalCount = 0;
    results.forEach(row => {
      // For expected_delivery_month grouping, NULL/empty dates should be "unplanned"
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

// Get agent stats summary - Consumers and Admins
// IMPORTANT: This route must be defined BEFORE /:id to avoid being caught by the param route
router.get('/stats/summary', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { domain_id } = req.query;

  const domainFilter = domain_id ? 'WHERE domain_id = ?' : '';
  const params = domain_id ? [domain_id, domain_id, domain_id, domain_id, domain_id] : [];

  const statsQuery = `
    SELECT
      (SELECT COUNT(*) FROM agents ${domainFilter}) as total_agents,
      (SELECT COUNT(*) FROM agents ${domainFilter} AND status = 'production') as production_agents,
      (SELECT COUNT(*) FROM agents ${domainFilter} AND status = 'pilot') as pilot_agents,
      (SELECT COUNT(*) FROM agents ${domainFilter} AND status = 'proof_of_concept') as poc_agents,
      (SELECT COUNT(*) FROM agents ${domainFilter} AND strategic_impact = 'High') as high_impact_agents
  `;

  db.query(statsQuery, params, (err, results) => {
    if (err) {
      console.error('Error fetching agent stats:', err);
      return res.status(500).json({ error: 'Failed to fetch agent stats' });
    }

    res.json(results[0]);
  });
});

// Get single agent by ID - Consumers and Admins
router.get('/:id', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { id } = req.params;

  const query = `
    SELECT
      a.*,
      at.name as agent_type_name,
      d.name as department_name,
      u.name as author_name,
      COALESCE(init_counts.initiative_count, 0) as initiative_count,
      COALESCE(likes_counts.likes_count, 0) as likes_count,
      COALESCE(comments_counts.comments_count, 0) as comments_count
    FROM agents a
    LEFT JOIN agent_types at ON a.agent_type_id = at.id
    LEFT JOIN departments d ON a.department_id = d.id
    LEFT JOIN users u ON a.author_id = u.id
    LEFT JOIN (
      SELECT agent_id, COUNT(*) as initiative_count
      FROM agent_initiative_associations
      GROUP BY agent_id
    ) init_counts ON a.id = init_counts.agent_id
    LEFT JOIN (
      SELECT agent_id, COUNT(*) as likes_count
      FROM agent_likes
      GROUP BY agent_id
    ) likes_counts ON a.id = likes_counts.agent_id
    LEFT JOIN (
      SELECT agent_id, COUNT(*) as comments_count
      FROM comments
      WHERE agent_id IS NOT NULL
      GROUP BY agent_id
    ) comments_counts ON a.id = comments_counts.agent_id
    WHERE a.id = ?
  `;

  db.query(query, [id], (err, results) => {
    if (err) {
      console.error('Error fetching agent:', err);
      return res.status(500).json({ error: 'Failed to fetch agent' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const row = results[0];
    const agent = {
      id: row.id,
      title: row.title,
      description: row.description,
      problem_statement: row.problem_statement,
      solution_overview: row.solution_overview,
      technical_implementation: row.technical_implementation,
      results_metrics: row.results_metrics,
      lessons_learned: row.lessons_learned,
      agent_type: row.agent_type_name,
      status: row.status,
      author_name: row.author_name,
      owner_name: row.owner_name,
      owner_email: row.owner_email,
      created_date: row.created_date,
      updated_date: row.updated_date,
      strategic_impact: row.strategic_impact,
      complexity: {
        data_complexity: row.data_complexity,
        integration_complexity: row.integration_complexity,
        intelligence_complexity: row.intelligence_complexity,
        functional_complexity: row.functional_complexity
      },
      department: row.department_name,
      justification: row.justification,
      initiative_count: parseInt(row.initiative_count) || 0,
      likes_count: parseInt(row.likes_count) || 0,
      comments_count: parseInt(row.comments_count) || 0,
      kanban_pillar: row.kanban_pillar,
      expected_delivery_date: formatDateField(row.expected_delivery_date),
      domain_id: row.domain_id
    };

    // Fetch linked initiatives
    db.query('SELECT use_case_id FROM agent_initiative_associations WHERE agent_id = ?', [id], (err, initiativeResults) => {
      if (err) {
        console.error('Error fetching linked initiatives:', err);
        return res.status(500).json({ error: 'Failed to fetch linked initiatives' });
      }

      agent.linked_initiatives = initiativeResults.map(row => row.use_case_id);
      res.json(agent);
    });
  });
});

// Create new agent - Admin only
router.post('/', verifyToken, requireAdmin, (req, res) => {
  console.log('=== CREATE AGENT REQUEST ===');
  console.log('Request body:', JSON.stringify(req.body, null, 2));
  console.log('User from token:', req.user);

  const {
    title,
    description,
    problem_statement,
    solution_overview,
    technical_implementation,
    results_metrics,
    lessons_learned,
    agent_type,
    status,
    owner_name,
    owner_email,
    department,
    strategic_impact,
    complexity,
    justification,
    kanban_pillar,
    expected_delivery_date,
    data_sensitivity,
    roadmap_link,
    value_realisation_link,
    domain_id,
    selectedInitiatives
  } = req.body;

  console.log('Parsed data:', {
    title,
    agent_type,
    department,
    strategic_impact,
    complexity,
    status,
    selectedInitiatives
  });

  // Validate required fields
  if (!title || !description || !agent_type || !department || !status) {
    console.error('❌ VALIDATION FAILED - Missing required fields:', {
      title: !title ? 'MISSING' : 'OK',
      description: !description ? 'MISSING' : 'OK',
      agent_type: !agent_type ? 'MISSING' : 'OK',
      department: !department ? 'MISSING' : 'OK',
      status: !status ? 'MISSING' : 'OK'
    });
    return res.status(400).json({
      error: 'Missing required fields',
      details: {
        title: !title ? 'Title is required' : null,
        description: !description ? 'Description is required' : null,
        agent_type: !agent_type ? 'Agent type is required' : null,
        department: !department ? 'Department is required' : null,
        status: !status ? 'Status is required' : null
      }
    });
  }

  // Validate that at least one initiative is selected
  if (!selectedInitiatives || selectedInitiatives.length === 0) {
    console.error('❌ VALIDATION FAILED - No initiatives selected');
    return res.status(400).json({
      error: 'At least one initiative must be linked to the agent'
    });
  }

  // Get agent type ID (filter by domain)
  db.query('SELECT id FROM agent_types WHERE name = ? AND domain_id = ?', [agent_type, domain_id], (err, agentTypeResult) => {
    if (err) {
      console.error('Error finding agent type:', err);
      return res.status(500).json({ error: 'Failed to find agent type' });
    }

    console.log('Agent type lookup result:', agentTypeResult);

    if (agentTypeResult.length === 0) {
      console.error('Agent type not found:', agent_type, 'for domain_id:', domain_id);
      return res.status(400).json({ error: `Agent type '${agent_type}' not found for this domain` });
    }

    const agentTypeId = agentTypeResult[0].id;

    // Get department ID
    db.query('SELECT id FROM departments WHERE name = ?', [department], (err, deptResult) => {
      if (err) {
        console.error('Error finding department:', err);
        return res.status(500).json({ error: 'Failed to find department' });
      }

      console.log('Department lookup result:', deptResult);

      if (deptResult.length === 0) {
        console.error('Department not found:', department);
        return res.status(400).json({ error: 'Invalid department' });
      }

      const departmentId = deptResult[0].id;

      // Use authenticated user's ID
      const userId = req.user.id;

      console.log('IDs resolved:', { agentTypeId, departmentId, userId });

      const insertQuery = `
        INSERT INTO agents (
          title, description, problem_statement, solution_overview,
          technical_implementation, results_metrics, lessons_learned,
          agent_type_id, status, author_id, owner_name, owner_email,
          department_id, strategic_impact, data_complexity,
          integration_complexity, intelligence_complexity,
          functional_complexity, justification, kanban_pillar, expected_delivery_date,
          data_sensitivity, roadmap_link, value_realisation_link, domain_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const values = [
        title, description, problem_statement, solution_overview,
        typeof technical_implementation === 'object' ? JSON.stringify(technical_implementation) : technical_implementation,
        Array.isArray(results_metrics) ? JSON.stringify(results_metrics) : results_metrics,
        lessons_learned,
        agentTypeId, status, userId, owner_name, owner_email,
        departmentId, strategic_impact,
        complexity.data_complexity, complexity.integration_complexity,
        complexity.intelligence_complexity, complexity.functional_complexity,
        justification, kanban_pillar || 'backlog', expected_delivery_date || null,
        data_sensitivity || 'Public', roadmap_link || null, value_realisation_link || null, domain_id
      ];

      console.log('Insert values:', values);

      db.query(insertQuery, values, (err, result) => {
        if (err) {
          console.error('Error creating agent:', err);
          return res.status(500).json({ error: 'Failed to create agent' });
        }

        console.log('Insert result:', result);

        // For UUID primary keys, we need to fetch the created record
        db.query('SELECT id FROM agents WHERE title = ? AND author_id = ? ORDER BY created_date DESC LIMIT 1', [title, userId], (err, newResult) => {
          if (err) {
            console.error('Error fetching created agent:', err);
            return res.status(500).json({ error: 'Failed to fetch created agent' });
          }

          console.log('Found new record:', newResult);

          if (newResult.length === 0) {
            console.error('No record found after insert!');
            return res.status(500).json({ error: 'Failed to find created agent' });
          }

          const agentId = newResult[0].id;

          // Audit log for agent creation
          createAuditLog({
            eventType: 'agent_created',
            entityType: 'agent',
            entityId: agentId,
            entityTitle: title,
            userId: req.user.id,
            userName: req.user.name,
            newValue: status
          }).catch(err => console.error('Failed to create audit log:', err));

          // Handle initiative associations if provided
          if (selectedInitiatives && selectedInitiatives.length > 0) {
            console.log('Creating initiative associations:', selectedInitiatives);

            const associationPromises = selectedInitiatives.map(initiativeId => {
              return new Promise((resolve, reject) => {
                const assocQuery = `
                  INSERT INTO agent_initiative_associations (agent_id, use_case_id, created_by)
                  VALUES (?, ?, ?)
                `;
                db.query(assocQuery, [agentId, initiativeId, userId], (err, result) => {
                  if (err) {
                    console.error('Error creating initiative association:', err);
                    reject(err);
                  } else {
                    resolve(result);
                  }
                });
              });
            });

            Promise.all(associationPromises)
              .then(() => {
                console.log('All initiative associations created successfully');
                res.status(201).json({
                  message: 'Agent created successfully',
                  id: agentId
                });
              })
              .catch(err => {
                console.error('Error creating initiative associations:', err);
                res.status(500).json({ error: 'Agent created but failed to link initiatives' });
              });
          } else {
            res.status(201).json({
              message: 'Agent created successfully',
              id: agentId
            });
          }
        });
      });
    });
  });
});

// Update agent - Admin only
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
    agent_type,
    status,
    owner_name,
    owner_email,
    department,
    strategic_impact,
    complexity,
    justification,
    kanban_pillar,
    expected_delivery_date,
    data_sensitivity,
    roadmap_link,
    value_realisation_link,
    domain_id,
    selectedInitiatives
  } = req.body;

  // Fetch old values for audit logging
  db.query('SELECT title, status FROM agents WHERE id = ?', [id], (err, oldResults) => {
    if (err) {
      console.error('Error fetching old agent values:', err);
      return res.status(500).json({ error: 'Failed to fetch agent' });
    }

    if (oldResults.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const oldAgent = oldResults[0];

  // Get agent type ID
  db.query('SELECT id FROM agent_types WHERE name = ? AND domain_id = ?', [agent_type, domain_id], (err, agentTypeResult) => {
    if (err) {
      console.error('Error finding agent type:', err);
      return res.status(500).json({ error: 'Failed to find agent type' });
    }

    if (agentTypeResult.length === 0) {
      return res.status(400).json({ error: `Agent type '${agent_type}' not found` });
    }

    const agentTypeId = agentTypeResult[0].id;

    // Get department ID
    db.query('SELECT id FROM departments WHERE name = ?', [department], (err, deptResult) => {
      if (err) {
        console.error('Error finding department:', err);
        return res.status(500).json({ error: 'Failed to find department' });
      }

      if (deptResult.length === 0) {
        return res.status(400).json({ error: 'Invalid department' });
      }

      const departmentId = deptResult[0].id;

      const updateQuery = `
        UPDATE agents SET
          title = ?,
          description = ?,
          problem_statement = ?,
          solution_overview = ?,
          technical_implementation = ?,
          results_metrics = ?,
          lessons_learned = ?,
          agent_type_id = ?,
          status = ?,
          owner_name = ?,
          owner_email = ?,
          department_id = ?,
          strategic_impact = ?,
          data_complexity = ?,
          integration_complexity = ?,
          intelligence_complexity = ?,
          functional_complexity = ?,
          justification = ?,
          kanban_pillar = ?,
          expected_delivery_date = ?,
          data_sensitivity = ?,
          roadmap_link = ?,
          value_realisation_link = ?,
          updated_date = NOW()
        WHERE id = ?
      `;

      const values = [
        title, description, problem_statement, solution_overview,
        technical_implementation, results_metrics, lessons_learned,
        agentTypeId, status, owner_name, owner_email,
        departmentId, strategic_impact,
        complexity.data_complexity, complexity.integration_complexity,
        complexity.intelligence_complexity, complexity.functional_complexity,
        justification, kanban_pillar, expected_delivery_date || null,
        data_sensitivity || 'Public', roadmap_link || null, value_realisation_link || null,
        id
      ];

      db.query(updateQuery, values, (err, result) => {
        if (err) {
          console.error('Error updating agent:', err);
          return res.status(500).json({ error: 'Failed to update agent' });
        }

        if (result.affectedRows === 0) {
          return res.status(404).json({ error: 'Agent not found' });
        }

        // Audit log for status change
        if (oldAgent.status !== status) {
          createAuditLog({
            eventType: 'status_change',
            entityType: 'agent',
            entityId: id,
            entityTitle: oldAgent.title,
            userId: req.user.id,
            userName: req.user.name,
            oldValue: oldAgent.status,
            newValue: status
          }).catch(err => console.error('Failed to create audit log:', err));
        }

        // Handle initiative associations if provided
        if (selectedInitiatives !== undefined) {
          console.log('Updating initiative associations for agent:', id);
          console.log('Selected initiatives:', selectedInitiatives);

          // First, remove all existing associations
          db.query('DELETE FROM agent_initiative_associations WHERE agent_id = ?', [id], (err) => {
            if (err) {
              console.error('Error removing existing associations:', err);
              return res.status(500).json({ error: 'Failed to update initiative associations' });
            }

            // If there are new associations to create
            if (selectedInitiatives && selectedInitiatives.length > 0) {
              console.log('Creating new initiative associations:', selectedInitiatives);

              const associationPromises = selectedInitiatives.map(useCaseId => {
                return new Promise((resolve, reject) => {
                  db.query(
                    'INSERT INTO agent_initiative_associations (agent_id, use_case_id, created_by) VALUES (?, ?, ?)',
                    [id, useCaseId, req.user.id],
                    (err, result) => {
                      if (err) {
                        console.error('Error creating initiative association:', err);
                        reject(err);
                      } else {
                        console.log('Created association for use case:', useCaseId);
                        resolve(result);
                      }
                    }
                  );
                });
              });

              Promise.all(associationPromises)
                .then(() => {
                  console.log('All initiative associations updated successfully');
                  res.json({ message: 'Agent updated successfully' });
                })
                .catch(err => {
                  console.error('Error creating initiative associations:', err);
                  res.status(500).json({ error: 'Agent updated but failed to update initiative associations' });
                });
            } else {
              // No associations to create
              res.json({ message: 'Agent updated successfully' });
            }
          });
        } else {
          // No association update requested
          res.json({ message: 'Agent updated successfully' });
        }
      });
    });
  });
  });
});

// Delete agent - Admin only
router.delete('/:id', verifyToken, requireAdmin, (req, res) => {
  const { id } = req.params;

  db.query('DELETE FROM agents WHERE id = ?', [id], (err, result) => {
    if (err) {
      console.error('Error deleting agent:', err);
      return res.status(500).json({ error: 'Failed to delete agent' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json({ message: 'Agent deleted successfully' });
  });
});

// Update agent kanban status - Consumers and Admins
router.put('/:id/kanban-status', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { id } = req.params;
  const { kanban_pillar } = req.body;

  const validPillars = ['backlog', 'prioritised', 'in_progress', 'completed', 'blocked', 'slow_burner', 'de_prioritised', 'on_hold'];

  if (!validPillars.includes(kanban_pillar)) {
    return res.status(400).json({ error: 'Invalid kanban pillar value' });
  }

  // Fetch old kanban_pillar for audit logging
  db.query('SELECT title, kanban_pillar FROM agents WHERE id = ?', [id], (err, oldResults) => {
    if (err) {
      console.error('Error fetching old agent kanban status:', err);
      return res.status(500).json({ error: 'Failed to fetch agent' });
    }

    if (oldResults.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const oldAgent = oldResults[0];

  const query = 'UPDATE agents SET kanban_pillar = ?, updated_date = NOW() WHERE id = ?';

  db.query(query, [kanban_pillar, id], (err, result) => {
    if (err) {
      console.error('Error updating agent kanban status:', err);
      return res.status(500).json({ error: 'Failed to update kanban status' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Audit log for kanban status change
    createAuditLog({
      eventType: 'kanban_change',
      entityType: 'agent',
      entityId: id,
      entityTitle: oldAgent.title,
      userId: req.user.id,
      userName: req.user.name,
      oldValue: oldAgent.kanban_pillar,
      newValue: kanban_pillar
    }).catch(err => console.error('Failed to create audit log:', err));

    res.json({ message: 'Agent kanban status updated successfully', kanban_pillar });
  });
  });
});

// Update agent delivery date - Consumers and Admins
router.put('/:id/delivery-date', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { id } = req.params;
  const { expected_delivery_date } = req.body;

  console.log(`=== UPDATE AGENT DELIVERY DATE ===`);
  console.log(`Agent ID: ${id}`);
  console.log(`New delivery date: ${expected_delivery_date}`);
  console.log(`User: ${req.user?.email || 'unknown'}`);

  // Fetch old delivery date for audit logging
  db.query('SELECT title, expected_delivery_date FROM agents WHERE id = ?', [id], (err, oldResults) => {
    if (err) {
      console.error('Error fetching old agent delivery date:', err);
      return res.status(500).json({ error: 'Failed to fetch agent' });
    }

    if (oldResults.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const oldAgent = oldResults[0];

  const query = 'UPDATE agents SET expected_delivery_date = ?, updated_date = NOW() WHERE id = ?';

  db.query(query, [expected_delivery_date || null, id], (err, result) => {
    if (err) {
      console.error('Database error updating agent delivery date:', err);
      return res.status(500).json({
        error: 'Failed to update delivery date',
        details: err.message
      });
    }

    console.log(`Database update result: ${result.affectedRows} rows affected`);

    if (result.affectedRows === 0) {
      console.error(`Agent not found: ${id}`);
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Audit log for delivery date change
    createAuditLog({
      eventType: 'roadmap_change',
      entityType: 'agent',
      entityId: id,
      entityTitle: oldAgent.title,
      userId: req.user.id,
      userName: req.user.name,
      oldValue: oldAgent.expected_delivery_date ? formatDateField(oldAgent.expected_delivery_date) : null,
      newValue: expected_delivery_date
    }).catch(err => console.error('Failed to create audit log:', err));

    console.log(`Agent delivery date updated successfully`);
    res.json({ message: 'Agent delivery date updated successfully', expected_delivery_date });
  });
  });
});

module.exports = router;
