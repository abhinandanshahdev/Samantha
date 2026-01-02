const express = require('express');
const router = express.Router();
const db = require('../config/database-mysql-compat');
const { verifyToken } = require('./auth');
const { requireAdmin, requireConsumerOrAdmin } = require('../middleware/roleMiddleware');
const { createAuditLog } = require('../services/auditLogService');
const multer = require('multer');
const csv = require('csv-parser');
const { parse } = require('json2csv');
const fs = require('fs');
const path = require('path');

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

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

// Valid status values (9 kanban columns - Samantha family workflow)
const validStatuses = [
  'intention', 'experimentation', 'commitment', 'implementation', 'integration', 'blocked', 'slow_burner', 'de_prioritised', 'on_hold'
];

// Export all data to CSV - Admin only
router.get('/export', verifyToken, requireAdmin, async (req, res) => {
  const { type = 'all', domainId } = req.query;

  try {
    const exportData = {};

    if (type === 'all' || type === 'domains') {
      const domainFilter = domainId ? 'WHERE id = ?' : '';
      const domainsQuery = `
        SELECT
          'domain' as data_type,
          id, name, type, hero_message, subtitle, config_json, is_active,
          created_at, updated_at
        FROM domains
        ${domainFilter}
        ORDER BY name
      `;

      const domainsResults = await new Promise((resolve, reject) => {
        const queryParams = domainId ? [domainId] : [];
        db.query(domainsQuery, queryParams, (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      });

      exportData.domains = domainsResults;
    }

    if (type === 'all') {
      // Export categories
      const categoriesFilter = domainId ? 'WHERE domain_id = ?' : '';
      const categoriesQuery = `SELECT "category" as data_type, id, domain_id, name, description FROM categories ${categoriesFilter} ORDER BY name`;
      const categoriesResults = await new Promise((resolve, reject) => {
        const queryParams = domainId ? [domainId] : [];
        db.query(categoriesQuery, queryParams, (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      });
      exportData.categories = categoriesResults;

      // Export outcomes
      const outcomesFilter = domainId ? 'WHERE domain_id = ?' : '';
      const outcomesQuery = `SELECT "outcome" as data_type, id, domain_id, outcome_key as name, title, measure, progress, maturity, display_order FROM outcomes ${outcomesFilter} ORDER BY display_order, outcome_key`;
      const outcomesResults = await new Promise((resolve, reject) => {
        const queryParams = domainId ? [domainId] : [];
        db.query(outcomesQuery, queryParams, (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      });
      exportData.outcomes = outcomesResults;
    }

    if (type === 'all' || type === 'use_cases') {
      const domainFilter = domainId ? 'WHERE uc.domain_id = ?' : '';
      const useCaseQuery = `
        SELECT
          'use_case' as data_type,
          uc.id,
          uc.domain_id,
          dom.name as domain_name,
          uc.title,
          uc.description,
          uc.problem_statement,
          uc.solution_overview,
          uc.technical_implementation,
          uc.results_metrics,
          uc.lessons_learned,
          uc.status,
          uc.expected_delivery_date,
          uc.strategic_impact,
          uc.effort_level,
          uc.justification,
          c.name as category_name,
          u.name as author_name,
          uc.owner_name,
          uc.owner_email,
          GROUP_CONCAT(DISTINCT sg.id) as strategic_goal_ids,
          uc.created_date,
          uc.updated_date
        FROM use_cases uc
        LEFT JOIN domains dom ON uc.domain_id = dom.id
        LEFT JOIN categories c ON uc.category_id = c.id
        LEFT JOIN users u ON uc.author_id = u.id
        LEFT JOIN use_case_goal_alignments uga ON uc.id = uga.use_case_id
        LEFT JOIN strategic_goals sg ON uga.strategic_goal_id = sg.id
        ${domainFilter}
        GROUP BY uc.id
        ORDER BY uc.created_date DESC
      `;

      const useCaseResults = await new Promise((resolve, reject) => {
        const queryParams = domainId ? [domainId] : [];
        db.query(useCaseQuery, queryParams, (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      });

      exportData.use_cases = useCaseResults;
    }

    if (type === 'all' || type === 'strategic_goals') {
      const sgDomainFilter = domainId ? 'WHERE sp.domain_id = ?' : '';
      const strategicGoalQuery = `
        SELECT
          'strategic_goal' as data_type,
          sg.id,
          sp.domain_id,
          dom.name as domain_name,
          sg.title,
          sg.description,
          sg.strategic_pillar_id,
          sp.name as strategic_pillar_name,
          sg.target_date,
          sg.priority,
          sg.status,
          sg.completion_percentage,
          sg.display_order,
          sg.success_metrics,
          u.name as author_name,
          sg.created_date,
          sg.updated_date
        FROM strategic_goals sg
        LEFT JOIN strategic_pillars sp ON sg.strategic_pillar_id = sp.id
        LEFT JOIN domains dom ON sp.domain_id = dom.id
        LEFT JOIN users u ON sg.author_id = u.id
        ${sgDomainFilter}
        ORDER BY sp.display_order, sg.display_order, sg.created_date DESC
      `;

      const strategicGoalResults = await new Promise((resolve, reject) => {
        const queryParams = domainId ? [domainId] : [];
        db.query(strategicGoalQuery, queryParams, (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      });

      exportData.strategic_goals = strategicGoalResults;
    }

    if (type === 'all' || type === 'strategic_pillars') {
      const spDomainFilter = domainId ? 'WHERE sp.domain_id = ?' : '';
      const strategicPillarQuery = `
        SELECT
          'strategic_pillar' as data_type,
          sp.id,
          sp.domain_id,
          dom.name as domain_name,
          sp.name,
          sp.description,
          sp.display_order,
          sp.created_date,
          sp.updated_date
        FROM strategic_pillars sp
        LEFT JOIN domains dom ON sp.domain_id = dom.id
        ${spDomainFilter}
        ORDER BY sp.display_order, sp.name
      `;

      const strategicPillarResults = await new Promise((resolve, reject) => {
        const queryParams = domainId ? [domainId] : [];
        db.query(strategicPillarQuery, queryParams, (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      });

      exportData.strategic_pillars = strategicPillarResults;
    }

    if (type === 'all' || type === 'alignments') {
      const alignmentDomainFilter = domainId ? 'WHERE uc.domain_id = ?' : '';
      const alignmentsQuery = `
        SELECT
          'use_case_goal_alignment' as data_type,
          ucga.use_case_id,
          uc.title as use_case_title,
          uc.domain_id,
          dom.name as domain_name,
          ucga.strategic_goal_id,
          sg.title as strategic_goal_title,
          ucga.alignment_strength,
          ucga.rationale,
          ucga.created_date
        FROM use_case_goal_alignments ucga
        LEFT JOIN use_cases uc ON ucga.use_case_id = uc.id
        LEFT JOIN strategic_goals sg ON ucga.strategic_goal_id = sg.id
        LEFT JOIN domains dom ON uc.domain_id = dom.id
        ${alignmentDomainFilter}
        ORDER BY ucga.created_date DESC
      `;

      const alignmentsResults = await new Promise((resolve, reject) => {
        const queryParams = domainId ? [domainId] : [];
        db.query(alignmentsQuery, queryParams, (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      });

      exportData.alignments = alignmentsResults;
    }

    // Combine all data
    let allData = [];
    if (exportData.domains) allData = allData.concat(exportData.domains);
    if (exportData.categories) allData = allData.concat(exportData.categories);
    if (exportData.outcomes) allData = allData.concat(exportData.outcomes);
    if (exportData.strategic_pillars) allData = allData.concat(exportData.strategic_pillars);
    if (exportData.strategic_goals) allData = allData.concat(exportData.strategic_goals);
    if (exportData.use_cases) allData = allData.concat(exportData.use_cases);
    if (exportData.alignments) allData = allData.concat(exportData.alignments);

    const fields = [
      'data_type', 'id', 'domain_id', 'domain_name', 'title', 'name', 'description',
      'problem_statement', 'solution_overview', 'technical_implementation', 'results_metrics',
      'lessons_learned', 'status', 'expected_delivery_date',
      'strategic_impact', 'effort_level', 'justification', 'category_name', 'author_name',
      'owner_name', 'owner_email', 'strategic_goal_ids', 'strategic_pillar_id', 'strategic_pillar_name',
      'target_date', 'priority', 'success_metrics', 'completion_percentage', 'display_order',
      'use_case_id', 'use_case_title', 'strategic_goal_id', 'strategic_goal_title',
      'alignment_strength', 'rationale',
      'created_date', 'updated_date', 'created_at', 'updated_at'
    ];

    const csvData = parse(allData, { fields });

    res.setHeader('Content-Type', 'text/csv');
    const filename = type === 'all' ? 'complete-export' : type.replace('_', '-');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csvData);

  } catch (error) {
    console.error('Error exporting data:', error);
    return res.status(500).json({ error: 'Failed to export data' });
  }
});

// JSON Export/Import Endpoints
const { getExportPreview, exportDomainsToJson } = require('../services/exportService');

router.get('/export-preview', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { domainIds } = req.query;

    if (!domainIds) {
      return res.status(400).json({ error: 'domainIds parameter is required' });
    }

    const domainIdArray = domainIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));

    if (domainIdArray.length === 0) {
      return res.status(400).json({ error: 'At least one valid domain ID is required' });
    }

    const preview = await getExportPreview(domainIdArray);
    res.json(preview);
  } catch (error) {
    console.error('Error getting export preview:', error);
    res.status(500).json({ error: 'Failed to get export preview' });
  }
});

router.get('/export-json', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { domainIds } = req.query;

    if (!domainIds) {
      return res.status(400).json({ error: 'domainIds parameter is required' });
    }

    const domainIdArray = domainIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));

    if (domainIdArray.length === 0) {
      return res.status(400).json({ error: 'At least one valid domain ID is required' });
    }

    const exporterName = req.user?.name || 'Unknown';
    const exportData = await exportDomainsToJson(domainIdArray, exporterName);

    const filename = `domain-export-${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(JSON.stringify(exportData, null, 2));
  } catch (error) {
    console.error('Error exporting domains to JSON:', error);
    res.status(500).json({ error: 'Failed to export domains' });
  }
});

const { validateImportJson, importDomainsFromJson } = require('../services/importService');

router.post('/import-json/validate', verifyToken, requireAdmin, upload.single('jsonFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No JSON file provided' });
    }

    const filePath = req.file.path;
    const normalizedPath = path.normalize(filePath);
    const uploadsDir = path.resolve('uploads');

    if (!path.resolve(normalizedPath).startsWith(uploadsDir)) {
      return res.status(400).json({ error: 'Invalid file path' });
    }

    const fileContent = fs.readFileSync(normalizedPath, 'utf8');
    let jsonData;
    try {
      jsonData = JSON.parse(fileContent);
    } catch (parseError) {
      fs.unlinkSync(normalizedPath);
      return res.status(400).json({ error: 'Invalid JSON file: ' + parseError.message });
    }

    const validationResult = await validateImportJson(jsonData, req.user);
    fs.unlinkSync(normalizedPath);
    res.json(validationResult);
  } catch (error) {
    console.error('Error validating JSON import:', error);
    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    }
    res.status(500).json({ error: 'Failed to validate import file' });
  }
});

router.post('/import-json', verifyToken, requireAdmin, upload.single('jsonFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No JSON file provided' });
    }

    const filePath = req.file.path;
    const normalizedPath = path.normalize(filePath);
    const uploadsDir = path.resolve('uploads');

    if (!path.resolve(normalizedPath).startsWith(uploadsDir)) {
      return res.status(400).json({ error: 'Invalid file path' });
    }

    const fileContent = fs.readFileSync(normalizedPath, 'utf8');
    let jsonData;
    try {
      jsonData = JSON.parse(fileContent);
    } catch (parseError) {
      fs.unlinkSync(normalizedPath);
      return res.status(400).json({ error: 'Invalid JSON file: ' + parseError.message });
    }

    const validationResult = await validateImportJson(jsonData, req.user);
    if (!validationResult.valid) {
      fs.unlinkSync(normalizedPath);
      return res.status(400).json({
        error: 'Validation failed',
        validation: validationResult
      });
    }

    const importResult = await importDomainsFromJson(jsonData, req.user);
    fs.unlinkSync(normalizedPath);
    res.json(importResult);
  } catch (error) {
    console.error('Error importing JSON:', error);
    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    }
    res.status(500).json({ error: 'Failed to import domains: ' + error.message });
  }
});

// Get use case statistics
router.get('/stats', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { search, category, status, strategic_pillar_id, strategic_goal_id, strategic_impact, expected_delivery_year, expected_delivery_month, domain_id } = req.query;

  const categories = req.query.categories || req.query['categories[]'] || (category ? [category] : []);
  const statuses = req.query.statuses || req.query['statuses[]'] || (status ? [status] : []);
  const tags = req.query.tags || req.query['tags[]'] || [];

  const categoriesArray = Array.isArray(categories) ? categories : (categories ? [categories] : []);
  const statusesArray = Array.isArray(statuses) ? statuses : (statuses ? [statuses] : []);
  const tagsArray = Array.isArray(tags) ? tags : (tags ? [tags] : []);

  let countQuery = `
    SELECT COUNT(DISTINCT uc.id) as total_count
    FROM use_cases uc
    LEFT JOIN categories c ON uc.category_id = c.id
    LEFT JOIN use_case_goal_alignments uga ON uc.id = uga.use_case_id
    LEFT JOIN strategic_goals sg ON uga.strategic_goal_id = sg.id
    WHERE 1=1
  `;

  const params = [];

  if (domain_id) {
    countQuery += ` AND uc.domain_id = ?`;
    params.push(domain_id);
  }

  if (search) {
    countQuery += ` AND (uc.title LIKE ? OR uc.description LIKE ? OR uc.problem_statement LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (categoriesArray.length > 0) {
    const categoryPlaceholders = categoriesArray.map(() => '?').join(',');
    countQuery += ` AND c.name IN (${categoryPlaceholders})`;
    params.push(...categoriesArray);
  }

  if (statusesArray.length > 0) {
    const statusPlaceholders = statusesArray.map(() => '?').join(',');
    countQuery += ` AND uc.status IN (${statusPlaceholders})`;
    params.push(...statusesArray);
  }

  if (strategic_pillar_id) {
    countQuery += ` AND sg.strategic_pillar_id = ?`;
    params.push(strategic_pillar_id);
  }

  if (strategic_goal_id) {
    countQuery += ` AND sg.id = ?`;
    params.push(strategic_goal_id);
  }

  if (strategic_impact) {
    countQuery += ` AND uc.strategic_impact = ?`;
    params.push(strategic_impact);
  }

  if (expected_delivery_year) {
    countQuery += ` AND YEAR(uc.expected_delivery_date) = ?`;
    params.push(parseInt(expected_delivery_year));
  }

  if (expected_delivery_month) {
    if (expected_delivery_month === 'unplanned') {
      countQuery += ` AND uc.expected_delivery_date IS NULL`;
    } else if (expected_delivery_month === 'past') {
      countQuery += ` AND uc.expected_delivery_date IS NOT NULL AND uc.expected_delivery_date < DATE_FORMAT(NOW(), '%Y-%m-01')`;
    } else {
      countQuery += ` AND MONTH(uc.expected_delivery_date) = ?`;
      params.push(parseInt(expected_delivery_month));
    }
  }

  if (tagsArray.length > 0) {
    countQuery += ` AND uc.id IN (
      SELECT uct.use_case_id
      FROM use_case_tags uct
      INNER JOIN tags t ON uct.tag_id = t.id
      WHERE t.name IN (${tagsArray.map(() => '?').join(',')})
      GROUP BY uct.use_case_id
      HAVING COUNT(DISTINCT t.name) = ?
    )`;
    params.push(...tagsArray, tagsArray.length);
  }

  db.query(countQuery, params, (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error', details: err.message });
    }

    const totalCount = results[0]?.total_count || 0;

    let breakdownQuery = `
      SELECT
        status,
        COUNT(*) as count
      FROM use_cases uc
      LEFT JOIN categories c ON uc.category_id = c.id
      LEFT JOIN use_case_goal_alignments uga ON uc.id = uga.use_case_id
      LEFT JOIN strategic_goals sg ON uga.strategic_goal_id = sg.id
      WHERE 1=1
    `;

    if (domain_id) {
      breakdownQuery += ` AND uc.domain_id = ?`;
    }

    if (search) {
      breakdownQuery += ` AND (uc.title LIKE ? OR uc.description LIKE ? OR uc.problem_statement LIKE ?)`;
    }

    if (categoriesArray.length > 0) {
      const categoryPlaceholders = categoriesArray.map(() => '?').join(',');
      breakdownQuery += ` AND c.name IN (${categoryPlaceholders})`;
    }

    if (statusesArray.length > 0) {
      const statusPlaceholders = statusesArray.map(() => '?').join(',');
      breakdownQuery += ` AND uc.status IN (${statusPlaceholders})`;
    }

    if (strategic_pillar_id) breakdownQuery += ` AND sg.strategic_pillar_id = ?`;
    if (strategic_goal_id) breakdownQuery += ` AND sg.id = ?`;
    if (strategic_impact) breakdownQuery += ` AND uc.strategic_impact = ?`;
    if (expected_delivery_year) breakdownQuery += ` AND YEAR(uc.expected_delivery_date) = ?`;
    if (expected_delivery_month && expected_delivery_month !== 'unplanned' && expected_delivery_month !== 'past') {
      breakdownQuery += ` AND MONTH(uc.expected_delivery_date) = ?`;
    }

    if (tagsArray.length > 0) {
      breakdownQuery += ` AND uc.id IN (
        SELECT uct.use_case_id
        FROM use_case_tags uct
        INNER JOIN tags t ON uct.tag_id = t.id
        WHERE t.name IN (${tagsArray.map(() => '?').join(',')})
        GROUP BY uct.use_case_id
        HAVING COUNT(DISTINCT t.name) = ?
      )`;
    }

    breakdownQuery += ` GROUP BY status ORDER BY count DESC`;

    db.query(breakdownQuery, params, (err, breakdownResults) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error', details: err.message });
      }

      const statusBreakdown = {};
      breakdownResults.forEach(row => {
        statusBreakdown[row.status] = row.count;
      });

      res.json({
        total_count: totalCount,
        status_breakdown: statusBreakdown,
        filtered: !!(search || categoriesArray.length > 0 || statusesArray.length > 0 || tagsArray.length > 0 || strategic_pillar_id || strategic_goal_id || strategic_impact || expected_delivery_year || expected_delivery_month)
      });
    });
  });
});

// Get use case statistics grouped by a field (for kanban/timeline views)
router.get('/stats/grouped', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { group_by, search, category, status, strategic_pillar_id, strategic_goal_id, strategic_impact, expected_delivery_year, expected_delivery_month, domain_id } = req.query;

  const validGroupFields = ['status', 'expected_delivery_month'];
  if (!group_by || !validGroupFields.includes(group_by)) {
    return res.status(400).json({ error: `group_by must be one of: ${validGroupFields.join(', ')}` });
  }

  const categories = req.query.categories || req.query['categories[]'] || (category ? [category] : []);
  const statuses = req.query.statuses || req.query['statuses[]'] || (status ? [status] : []);
  const tags = req.query.tags || req.query['tags[]'] || [];

  const categoriesArray = Array.isArray(categories) ? categories : (categories ? [categories] : []);
  const statusesArray = Array.isArray(statuses) ? statuses : (statuses ? [statuses] : []);
  const tagsArray = Array.isArray(tags) ? tags : (tags ? [tags] : []);

  let groupField;
  if (group_by === 'expected_delivery_month') {
    groupField = "DATE_FORMAT(uc.expected_delivery_date, '%Y-%m')";
  } else {
    groupField = `uc.${group_by}`;
  }

  let query = `
    SELECT ${groupField} as group_key, COUNT(DISTINCT uc.id) as count
    FROM use_cases uc
    LEFT JOIN categories c ON uc.category_id = c.id
    LEFT JOIN use_case_goal_alignments uga ON uc.id = uga.use_case_id
    LEFT JOIN strategic_goals sg ON uga.strategic_goal_id = sg.id
    WHERE 1=1
  `;

  const params = [];

  if (domain_id) {
    query += ` AND uc.domain_id = ?`;
    params.push(domain_id);
  }

  if (search) {
    query += ` AND (uc.title LIKE ? OR uc.description LIKE ? OR uc.problem_statement LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (categoriesArray.length > 0) {
    query += ` AND c.name IN (${categoriesArray.map(() => '?').join(',')})`;
    params.push(...categoriesArray);
  }

  if (statusesArray.length > 0) {
    query += ` AND uc.status IN (${statusesArray.map(() => '?').join(',')})`;
    params.push(...statusesArray);
  }

  if (strategic_pillar_id) {
    query += ` AND sg.strategic_pillar_id = ?`;
    params.push(strategic_pillar_id);
  }

  if (strategic_goal_id) {
    query += ` AND sg.id = ?`;
    params.push(strategic_goal_id);
  }

  if (strategic_impact) {
    query += ` AND uc.strategic_impact = ?`;
    params.push(strategic_impact);
  }

  if (expected_delivery_year) {
    query += ` AND YEAR(uc.expected_delivery_date) = ?`;
    params.push(parseInt(expected_delivery_year));
  }

  if (expected_delivery_month) {
    if (expected_delivery_month === 'unplanned') {
      query += ` AND uc.expected_delivery_date IS NULL`;
    } else if (expected_delivery_month === 'past') {
      query += ` AND uc.expected_delivery_date IS NOT NULL AND uc.expected_delivery_date < DATE_FORMAT(NOW(), '%Y-%m-01')`;
    } else {
      query += ` AND MONTH(uc.expected_delivery_date) = ?`;
      params.push(parseInt(expected_delivery_month));
    }
  }

  if (tagsArray.length > 0) {
    query += ` AND uc.id IN (
      SELECT uct.use_case_id
      FROM use_case_tags uct
      INNER JOIN tags t ON uct.tag_id = t.id
      WHERE t.name IN (${tagsArray.map(() => '?').join(',')})
      GROUP BY uct.use_case_id
      HAVING COUNT(DISTINCT t.name) = ?
    )`;
    params.push(...tagsArray, tagsArray.length);
  }

  query += ` GROUP BY ${groupField} ORDER BY ${groupField}`;

  db.query(query, params, (err, results) => {
    if (err) {
      console.error('Error fetching grouped stats:', err);
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

// Get all use cases with filters
router.get('/', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { search, category, status, strategic_pillar_id, strategic_goal_id, strategic_impact, expected_delivery_year, expected_delivery_month, domain_id, limit = 50, offset = 0 } = req.query;

  const categories = req.query.categories || req.query['categories[]'] || (category ? [category] : []);
  const statuses = req.query.statuses || req.query['statuses[]'] || (status ? [status] : []);
  const tags = req.query.tags || req.query['tags[]'] || [];

  const categoriesArray = Array.isArray(categories) ? categories : (categories ? [categories] : []);
  const statusesArray = Array.isArray(statuses) ? statuses : (statuses ? [statuses] : []);
  const tagsArray = Array.isArray(tags) ? tags : (tags ? [tags] : []);

  let query = `
    SELECT
      uc.*,
      c.name as category_name,
      u.name as author_name,
      GROUP_CONCAT(DISTINCT t.name) as tags,
      GROUP_CONCAT(DISTINCT a.filename) as attachments,
      COALESCE(MAX(goal_counts.goal_count), 0) as goal_alignment_count,
      COALESCE(MAX(likes_counts.likes_count), 0) as likes_count,
      COALESCE(MAX(comments_counts.comments_count), 0) as comments_count,
      COALESCE(MAX(task_counts.task_count), 0) as task_count
    FROM use_cases uc
    LEFT JOIN categories c ON uc.category_id = c.id
    LEFT JOIN users u ON uc.author_id = u.id
    LEFT JOIN use_case_tags uct ON uc.id = uct.use_case_id
    LEFT JOIN tags t ON uct.tag_id = t.id
    LEFT JOIN attachments a ON uc.id = a.use_case_id
    LEFT JOIN use_case_goal_alignments uga ON uc.id = uga.use_case_id
    LEFT JOIN strategic_goals sg ON uga.strategic_goal_id = sg.id
    LEFT JOIN (
      SELECT use_case_id, COUNT(DISTINCT strategic_goal_id) as goal_count
      FROM use_case_goal_alignments
      GROUP BY use_case_id
    ) goal_counts ON uc.id = goal_counts.use_case_id
    LEFT JOIN (
      SELECT use_case_id, COUNT(*) as likes_count
      FROM likes
      GROUP BY use_case_id
    ) likes_counts ON uc.id = likes_counts.use_case_id
    LEFT JOIN (
      SELECT use_case_id, COUNT(*) as comments_count
      FROM comments
      WHERE use_case_id IS NOT NULL
      GROUP BY use_case_id
    ) comments_counts ON uc.id = comments_counts.use_case_id
    LEFT JOIN (
      SELECT use_case_id, COUNT(*) as task_count
      FROM task_initiative_associations
      GROUP BY use_case_id
    ) task_counts ON uc.id = task_counts.use_case_id
    WHERE 1=1
  `;

  const params = [];

  if (domain_id) {
    query += ` AND uc.domain_id = ?`;
    params.push(domain_id);
  }

  if (search) {
    query += ` AND (uc.title LIKE ? OR uc.description LIKE ? OR uc.problem_statement LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (categoriesArray.length > 0) {
    const categoryPlaceholders = categoriesArray.map(() => '?').join(',');
    query += ` AND c.name IN (${categoryPlaceholders})`;
    params.push(...categoriesArray);
  }

  if (statusesArray.length > 0) {
    const statusPlaceholders = statusesArray.map(() => '?').join(',');
    query += ` AND uc.status IN (${statusPlaceholders})`;
    params.push(...statusesArray);
  }

  if (strategic_pillar_id) {
    query += ` AND sg.strategic_pillar_id = ?`;
    params.push(strategic_pillar_id);
  }

  if (strategic_goal_id) {
    query += ` AND sg.id = ?`;
    params.push(strategic_goal_id);
  }

  if (strategic_impact) {
    query += ` AND uc.strategic_impact = ?`;
    params.push(strategic_impact);
  }

  if (expected_delivery_year) {
    query += ` AND YEAR(uc.expected_delivery_date) = ?`;
    params.push(parseInt(expected_delivery_year));
  }

  if (expected_delivery_month) {
    if (expected_delivery_month === 'unplanned') {
      query += ` AND uc.expected_delivery_date IS NULL`;
    } else if (expected_delivery_month === 'past') {
      query += ` AND uc.expected_delivery_date IS NOT NULL AND uc.expected_delivery_date < DATE_FORMAT(NOW(), '%Y-%m-01')`;
    } else {
      query += ` AND MONTH(uc.expected_delivery_date) = ?`;
      params.push(parseInt(expected_delivery_month));
    }
  }

  if (tagsArray.length > 0) {
    query += ` AND uc.id IN (
      SELECT uct.use_case_id
      FROM use_case_tags uct
      INNER JOIN tags t ON uct.tag_id = t.id
      WHERE t.name IN (${tagsArray.map(() => '?').join(',')})
      GROUP BY uct.use_case_id
      HAVING COUNT(DISTINCT t.name) = ?
    )`;
    params.push(...tagsArray, tagsArray.length);
  }

  query += ` GROUP BY uc.id ORDER BY uc.created_date DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), parseInt(offset));

  db.query(query, params, (err, results) => {
    if (err) {
      console.error('Error fetching use cases:', err);
      return res.status(500).json({ error: 'Failed to fetch use cases' });
    }

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
      tags: row.tags ? row.tags.split(',') : [],
      status: row.status,
      author_name: row.author_name,
      owner_name: row.owner_name,
      owner_email: row.owner_email,
      created_date: row.created_date,
      updated_date: row.updated_date,
      view_count: row.view_count,
      rating: parseFloat(row.rating),
      strategic_impact: row.strategic_impact,
      effort_level: row.effort_level,
      justification: row.justification,
      attachments: row.attachments ? row.attachments.split(',') : [],
      goal_alignment_count: parseInt(row.goal_alignment_count) || 0,
      likes_count: parseInt(row.likes_count) || 0,
      comments_count: parseInt(row.comments_count) || 0,
      task_count: parseInt(row.task_count) || 0,
      expected_delivery_date: formatDateField(row.expected_delivery_date),
      roadmap_link: row.roadmap_link
    }));

    res.json(useCases);
  });
});

// Get single use case by ID
router.get('/:id', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { id } = req.params;

  const query = `
    SELECT
      uc.*,
      c.name as category_name,
      u.name as author_name,
      GROUP_CONCAT(DISTINCT t.name) as tags,
      GROUP_CONCAT(DISTINCT a.filename) as attachments,
      COALESCE(MAX(goal_counts.goal_count), 0) as goal_alignment_count,
      COALESCE(MAX(likes_counts.likes_count), 0) as likes_count,
      COALESCE(MAX(comments_counts.comments_count), 0) as comments_count,
      COALESCE(MAX(task_counts.task_count), 0) as task_count
    FROM use_cases uc
    LEFT JOIN categories c ON uc.category_id = c.id
    LEFT JOIN users u ON uc.author_id = u.id
    LEFT JOIN use_case_tags uct ON uc.id = uct.use_case_id
    LEFT JOIN tags t ON uct.tag_id = t.id
    LEFT JOIN attachments a ON uc.id = a.use_case_id
    LEFT JOIN (
      SELECT use_case_id, COUNT(DISTINCT strategic_goal_id) as goal_count
      FROM use_case_goal_alignments
      GROUP BY use_case_id
    ) goal_counts ON uc.id = goal_counts.use_case_id
    LEFT JOIN (
      SELECT use_case_id, COUNT(*) as likes_count
      FROM likes
      GROUP BY use_case_id
    ) likes_counts ON uc.id = likes_counts.use_case_id
    LEFT JOIN (
      SELECT use_case_id, COUNT(*) as comments_count
      FROM comments
      WHERE use_case_id IS NOT NULL
      GROUP BY use_case_id
    ) comments_counts ON uc.id = comments_counts.use_case_id
    LEFT JOIN (
      SELECT use_case_id, COUNT(*) as task_count
      FROM task_initiative_associations
      GROUP BY use_case_id
    ) task_counts ON uc.id = task_counts.use_case_id
    WHERE uc.id = ?
    GROUP BY uc.id
  `;

  db.query(query, [id], (err, results) => {
    if (err) {
      console.error('Error fetching use case:', err);
      return res.status(500).json({ error: 'Failed to fetch use case' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'Use case not found' });
    }

    const row = results[0];
    const useCase = {
      id: row.id,
      title: row.title,
      description: row.description,
      problem_statement: row.problem_statement,
      solution_overview: row.solution_overview,
      technical_implementation: row.technical_implementation,
      results_metrics: row.results_metrics,
      lessons_learned: row.lessons_learned,
      category: row.category_name,
      tags: row.tags ? row.tags.split(',') : [],
      status: row.status,
      author_name: row.author_name,
      owner_name: row.owner_name,
      owner_email: row.owner_email,
      created_date: row.created_date,
      updated_date: row.updated_date,
      view_count: row.view_count,
      rating: parseFloat(row.rating),
      strategic_impact: row.strategic_impact,
      effort_level: row.effort_level,
      justification: row.justification,
      attachments: row.attachments ? row.attachments.split(',') : [],
      goal_alignment_count: parseInt(row.goal_alignment_count) || 0,
      likes_count: parseInt(row.likes_count) || 0,
      comments_count: parseInt(row.comments_count) || 0,
      task_count: parseInt(row.task_count) || 0,
      expected_delivery_date: formatDateField(row.expected_delivery_date),
      roadmap_link: row.roadmap_link
    };

    // Increment view count
    db.query('UPDATE use_cases SET view_count = view_count + 1 WHERE id = ?', [id]);

    res.json(useCase);
  });
});

// Create new use case - Admin only
router.post('/', verifyToken, requireAdmin, (req, res) => {
  const {
    title,
    description,
    problem_statement,
    solution_overview,
    technical_implementation,
    results_metrics,
    lessons_learned,
    category,
    tags,
    status,
    owner_name,
    owner_email,
    strategic_impact,
    effort_level,
    justification,
    selectedStrategicGoals,
    selectedTasks,
    expected_delivery_date,
    roadmap_link,
    domain_id
  } = req.body;

  // Validate required fields
  if (!title || !description || !category) {
    return res.status(400).json({
      error: 'Missing required fields',
      details: {
        title: !title ? 'Title is required' : null,
        description: !description ? 'Description is required' : null,
        category: !category ? 'Category is required' : null
      }
    });
  }

  // Validate status if provided
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  // Get category ID (filter by domain)
  db.query('SELECT id FROM categories WHERE name = ? AND domain_id = ?', [category, domain_id], (err, categoryResult) => {
    if (err) {
      console.error('Error finding category:', err);
      return res.status(500).json({ error: 'Failed to find category' });
    }

    if (categoryResult.length === 0) {
      return res.status(400).json({ error: `Category '${category}' not found for this domain` });
    }

    const categoryId = categoryResult[0].id;
    const userId = req.user.id;

    const insertQuery = `
      INSERT INTO use_cases (
        title, description, problem_statement, solution_overview,
        technical_implementation, results_metrics, lessons_learned,
        category_id, status, author_id, owner_name, owner_email,
        strategic_impact, effort_level, justification,
        expected_delivery_date, roadmap_link, domain_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      title, description, problem_statement || '', solution_overview || '',
      technical_implementation || '', results_metrics || '', lessons_learned || '',
      categoryId, status || 'intention', userId, owner_name || null, owner_email || null,
      strategic_impact || 'Medium', effort_level || 'Medium', justification || '',
      expected_delivery_date || null, roadmap_link || null, domain_id
    ];

    db.query(insertQuery, values, (err, result) => {
      if (err) {
        console.error('Error creating use case:', err);
        return res.status(500).json({ error: 'Failed to create use case' });
      }

      // Fetch the created use case
      db.query('SELECT id FROM use_cases WHERE title = ? AND author_id = ? ORDER BY created_date DESC LIMIT 1', [title, userId], (err, newResult) => {
        if (err || newResult.length === 0) {
          console.error('Error fetching created use case:', err);
          return res.status(500).json({ error: 'Failed to fetch created use case' });
        }

        const useCaseId = newResult[0].id;

        // Audit log
        createAuditLog({
          eventType: 'use_case_created',
          entityType: 'use_case',
          entityId: useCaseId,
          entityTitle: title,
          userId: req.user.id,
          userName: req.user.name,
          newValue: status || 'intention'
        }).catch(err => console.error('Failed to create audit log:', err));

        // Handle tags
        if (tags && tags.length > 0) {
          const tagPromises = tags.map(tagName => {
            return new Promise((resolve, reject) => {
              const tagQuery = 'INSERT INTO tags (name, domain_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)';
              db.query(tagQuery, [tagName.trim(), domain_id], (err, tagResult) => {
                if (err) {
                  reject(err);
                } else {
                  const tagId = tagResult.insertId;
                  const associationQuery = 'INSERT IGNORE INTO use_case_tags (use_case_id, tag_id) VALUES (?, ?)';
                  db.query(associationQuery, [useCaseId, tagId], (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                  });
                }
              });
            });
          });

          Promise.all(tagPromises).catch(err => console.error('Error creating tags:', err));
        }

        // Handle strategic goal alignments
        if (selectedStrategicGoals && selectedStrategicGoals.length > 0) {
          const alignmentPromises = selectedStrategicGoals.map(goalId => {
            return new Promise((resolve, reject) => {
              const alignmentQuery = `
                INSERT INTO use_case_goal_alignments
                (use_case_id, strategic_goal_id, alignment_strength, rationale)
                VALUES (?, ?, 'Medium', 'Alignment created during initiative creation')
              `;
              db.query(alignmentQuery, [useCaseId, goalId], (err, result) => {
                if (err) reject(err);
                else resolve(result);
              });
            });
          });

          Promise.all(alignmentPromises).catch(err => console.error('Error creating alignments:', err));
        }

        // Handle task associations
        if (selectedTasks && selectedTasks.length > 0) {
          const taskAssociationPromises = selectedTasks.map(taskId => {
            return new Promise((resolve, reject) => {
              const associationQuery = `
                INSERT INTO task_initiative_associations
                (task_id, use_case_id, created_by)
                VALUES (?, ?, ?)
              `;
              db.query(associationQuery, [taskId, useCaseId, req.user.id], (err, result) => {
                if (err) reject(err);
                else resolve(result);
              });
            });
          });

          Promise.all(taskAssociationPromises).catch(err => console.error('Error creating task associations:', err));
        }

        // Fetch and return complete use case
        const selectQuery = `
          SELECT
            uc.*,
            c.name as category_name,
            u.name as author_name,
            GROUP_CONCAT(DISTINCT t.name) as tags
          FROM use_cases uc
          LEFT JOIN categories c ON uc.category_id = c.id
          LEFT JOIN users u ON uc.author_id = u.id
          LEFT JOIN use_case_tags uct ON uc.id = uct.use_case_id
          LEFT JOIN tags t ON uct.tag_id = t.id
          WHERE uc.id = ?
          GROUP BY uc.id
        `;

        db.query(selectQuery, [useCaseId], (err, selectResult) => {
          if (err || selectResult.length === 0) {
            console.error('Error fetching complete use case:', err);
            return res.status(500).json({ error: 'Failed to fetch complete use case' });
          }

          const row = selectResult[0];
          const completeUseCase = {
            id: row.id,
            title: row.title,
            description: row.description,
            problem_statement: row.problem_statement,
            solution_overview: row.solution_overview,
            technical_implementation: row.technical_implementation,
            results_metrics: row.results_metrics,
            lessons_learned: row.lessons_learned,
            category: row.category_name,
            tags: row.tags ? row.tags.split(',') : [],
            status: row.status,
            author_name: row.author_name,
            owner_name: row.owner_name,
            owner_email: row.owner_email,
            created_date: row.created_date,
            updated_date: row.updated_date,
            view_count: row.view_count,
            rating: parseFloat(row.rating),
            strategic_impact: row.strategic_impact,
            effort_level: row.effort_level,
            justification: row.justification,
            expected_delivery_date: formatDateField(row.expected_delivery_date),
            roadmap_link: row.roadmap_link
          };

          res.status(201).json(completeUseCase);
        });
      });
    });
  });
});

// Update use case - Admin only
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
    category,
    status,
    owner_name,
    owner_email,
    strategic_impact,
    effort_level,
    justification,
    selectedStrategicGoals,
    selectedTasks,
    expected_delivery_date,
    roadmap_link,
    tags
  } = req.body;

  // Validate status if provided
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  // Fetch old values for audit logging
  db.query('SELECT title, status, domain_id FROM use_cases WHERE id = ?', [id], (err, oldResults) => {
    if (err) {
      console.error('Error fetching old use case values:', err);
      return res.status(500).json({ error: 'Failed to fetch use case' });
    }

    if (oldResults.length === 0) {
      return res.status(404).json({ error: 'Use case not found' });
    }

    const oldUseCase = oldResults[0];
    const domain_id = oldUseCase.domain_id;

    // Get category ID
    db.query('SELECT id FROM categories WHERE name = ? AND domain_id = ?', [category, domain_id], (err, categoryResult) => {
      if (err) {
        console.error('Error finding category:', err);
        return res.status(500).json({ error: 'Failed to find category' });
      }

      if (categoryResult.length === 0) {
        return res.status(400).json({ error: 'Invalid category for this domain' });
      }

      const categoryId = categoryResult[0].id;

      const updateQuery = `
        UPDATE use_cases SET
          title = ?, description = ?, problem_statement = ?, solution_overview = ?,
          technical_implementation = ?, results_metrics = ?, lessons_learned = ?,
          category_id = ?, status = ?, owner_name = ?, owner_email = ?,
          strategic_impact = ?, effort_level = ?, justification = ?,
          expected_delivery_date = ?, roadmap_link = ?,
          updated_date = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      const values = [
        title, description, problem_statement || '', solution_overview || '',
        technical_implementation || '', results_metrics || '', lessons_learned || '',
        categoryId, status || 'intention', owner_name || null, owner_email || null,
        strategic_impact || 'Medium', effort_level || 'Medium', justification || '',
        expected_delivery_date || null, roadmap_link || null,
        id
      ];

      db.query(updateQuery, values, (err, result) => {
        if (err) {
          console.error('Error updating use case:', err);
          return res.status(500).json({ error: 'Failed to update use case' });
        }

        if (result.affectedRows === 0) {
          return res.status(404).json({ error: 'Use case not found' });
        }

        // Audit log for status change
        if (oldUseCase.status !== status) {
          createAuditLog({
            eventType: 'status_change',
            entityType: 'use_case',
            entityId: id,
            entityTitle: oldUseCase.title,
            userId: req.user.id,
            userName: req.user.name,
            oldValue: oldUseCase.status,
            newValue: status
          }).catch(err => console.error('Failed to create audit log:', err));
        }

        // Handle tags update
        if (tags !== undefined) {
          db.query('DELETE FROM use_case_tags WHERE use_case_id = ?', [id], (err) => {
            if (err) {
              console.error('Error removing existing tags:', err);
            }

            if (tags && tags.length > 0) {
              const tagPromises = tags.map(tagName => {
                return new Promise((resolve, reject) => {
                  const tagQuery = 'INSERT INTO tags (name, domain_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)';
                  db.query(tagQuery, [tagName.trim(), domain_id], (err, tagResult) => {
                    if (err) {
                      reject(err);
                    } else {
                      const tagId = tagResult.insertId;
                      const associationQuery = 'INSERT IGNORE INTO use_case_tags (use_case_id, tag_id) VALUES (?, ?)';
                      db.query(associationQuery, [id, tagId], (err, result) => {
                        if (err) reject(err);
                        else resolve(result);
                      });
                    }
                  });
                });
              });

              Promise.all(tagPromises).catch(err => console.error('Error updating tags:', err));
            }
          });
        }

        // Handle task associations
        if (selectedTasks !== undefined) {
          db.query('DELETE FROM task_initiative_associations WHERE use_case_id = ?', [id], (err) => {
            if (err) {
              console.error('Error removing existing task associations:', err);
            }

            if (selectedTasks && selectedTasks.length > 0) {
              const taskAssociationPromises = selectedTasks.map(taskId => {
                return new Promise((resolve, reject) => {
                  const associationQuery = `
                    INSERT INTO task_initiative_associations
                    (task_id, use_case_id, created_by)
                    VALUES (?, ?, ?)
                  `;
                  db.query(associationQuery, [taskId, id, req.user.id], (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                  });
                });
              });

              Promise.all(taskAssociationPromises).catch(err => console.error('Error updating task associations:', err));
            }
          });
        }

        // Handle strategic goal alignments
        if (selectedStrategicGoals !== undefined) {
          db.query('DELETE FROM use_case_goal_alignments WHERE use_case_id = ?', [id], (err) => {
            if (err) {
              console.error('Error removing existing alignments:', err);
            }

            if (selectedStrategicGoals && selectedStrategicGoals.length > 0) {
              const alignmentPromises = selectedStrategicGoals.map(goalId => {
                return new Promise((resolve, reject) => {
                  const alignmentQuery = `
                    INSERT INTO use_case_goal_alignments
                    (use_case_id, strategic_goal_id, alignment_strength, rationale)
                    VALUES (?, ?, 'Medium', 'Alignment updated')
                  `;
                  db.query(alignmentQuery, [id, goalId], (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                  });
                });
              });

              Promise.all(alignmentPromises).catch(err => console.error('Error updating alignments:', err));
            }
          });
        }

        // Fetch and return updated use case
        const selectQuery = `
          SELECT
            uc.*,
            c.name as category_name,
            u.name as author_name,
            GROUP_CONCAT(DISTINCT t.name) as tags
          FROM use_cases uc
          LEFT JOIN categories c ON uc.category_id = c.id
          LEFT JOIN users u ON uc.author_id = u.id
          LEFT JOIN use_case_tags uct ON uc.id = uct.use_case_id
          LEFT JOIN tags t ON uct.tag_id = t.id
          WHERE uc.id = ?
          GROUP BY uc.id
        `;

        // Small delay to allow associations to complete
        setTimeout(() => {
          db.query(selectQuery, [id], (err, selectResult) => {
            if (err || selectResult.length === 0) {
              console.error('Error fetching updated use case:', err);
              return res.status(500).json({ error: 'Failed to fetch updated use case' });
            }

            const row = selectResult[0];
            const updatedUseCase = {
              id: row.id,
              title: row.title,
              description: row.description,
              problem_statement: row.problem_statement,
              solution_overview: row.solution_overview,
              technical_implementation: row.technical_implementation,
              results_metrics: row.results_metrics,
              lessons_learned: row.lessons_learned,
              category: row.category_name,
              tags: row.tags ? row.tags.split(',') : [],
              status: row.status,
              author_name: row.author_name,
              owner_name: row.owner_name,
              owner_email: row.owner_email,
              created_date: row.created_date,
              updated_date: row.updated_date,
              view_count: row.view_count,
              rating: parseFloat(row.rating),
              strategic_impact: row.strategic_impact,
              effort_level: row.effort_level,
              justification: row.justification,
              expected_delivery_date: formatDateField(row.expected_delivery_date),
              roadmap_link: row.roadmap_link
            };

            res.json(updatedUseCase);
          });
        }, 100);
      });
    });
  });
});

// Update use case status (quick update for kanban)
router.put('/:id/status', verifyToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'Status is required' });
  }

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  // Fetch old status for audit logging
  db.query('SELECT title, status FROM use_cases WHERE id = ?', [id], (err, results) => {
    if (err) {
      console.error('Error fetching use case:', err);
      return res.status(500).json({ error: 'Failed to fetch use case' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'Use case not found' });
    }

    const oldUseCase = results[0];

    db.query(
      'UPDATE use_cases SET status = ?, updated_date = CURRENT_TIMESTAMP WHERE id = ?',
      [status, id],
      (err, result) => {
        if (err) {
          console.error('Error updating use case status:', err);
          return res.status(500).json({ error: 'Failed to update use case status' });
        }

        if (result.affectedRows === 0) {
          return res.status(404).json({ error: 'Use case not found' });
        }

        // Audit log
        createAuditLog({
          eventType: 'status_change',
          entityType: 'use_case',
          entityId: id,
          entityTitle: oldUseCase.title,
          userId: req.user.id,
          userName: req.user.name,
          oldValue: oldUseCase.status,
          newValue: status
        }).catch(err => console.error('Failed to create audit log:', err));

        res.json({ message: 'Status updated successfully', status });
      }
    );
  });
});

// Update use case kanban status (for kanban drag/drop) - accepts kanban_pillar for backwards compatibility
router.put('/:id/kanban-status', verifyToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  // Accept both 'status' and 'kanban_pillar' for backwards compatibility
  const status = req.body.status || req.body.kanban_pillar;

  if (!status) {
    return res.status(400).json({ error: 'Status is required' });
  }

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  db.query(
    'UPDATE use_cases SET status = ?, updated_date = CURRENT_TIMESTAMP WHERE id = ?',
    [status, id],
    (err, result) => {
      if (err) {
        console.error('Error updating kanban status:', err);
        return res.status(500).json({ error: 'Failed to update status' });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Use case not found' });
      }

      // Return the updated use case
      db.query('SELECT * FROM use_cases WHERE id = ?', [id], (err, results) => {
        if (err || results.length === 0) {
          return res.json({ message: 'Status updated successfully', status });
        }
        res.json(results[0]);
      });
    }
  );
});

// Update use case delivery date (quick update for timeline)
router.put('/:id/delivery-date', verifyToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  let { expected_delivery_date } = req.body;

  // Convert full date (YYYY-MM-DD) to YYYY-MM format if needed (schema uses VARCHAR(7))
  if (expected_delivery_date && expected_delivery_date.length > 7) {
    expected_delivery_date = expected_delivery_date.substring(0, 7);
  }

  db.query(
    'UPDATE use_cases SET expected_delivery_date = ?, updated_date = CURRENT_TIMESTAMP WHERE id = ?',
    [expected_delivery_date || null, id],
    (err, result) => {
      if (err) {
        console.error('Error updating delivery date:', err);
        return res.status(500).json({ error: 'Failed to update delivery date' });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Use case not found' });
      }

      res.json({ message: 'Delivery date updated successfully', expected_delivery_date });
    }
  );
});

// Delete use case - Admin only
router.delete('/:id', verifyToken, requireAdmin, (req, res) => {
  const { id } = req.params;

  // First check if use case exists
  db.query('SELECT id, title FROM use_cases WHERE id = ?', [id], (err, results) => {
    if (err) {
      console.error('Error checking use case:', err);
      return res.status(500).json({ error: 'Failed to check use case' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'Use case not found' });
    }

    const useCase = results[0];

    // Delete related records first
    const deleteRelated = [
      'DELETE FROM use_case_tags WHERE use_case_id = ?',
      'DELETE FROM use_case_goal_alignments WHERE use_case_id = ?',
      'DELETE FROM task_initiative_associations WHERE use_case_id = ?',
      'DELETE FROM likes WHERE use_case_id = ?',
      'DELETE FROM comments WHERE use_case_id = ?',
      'DELETE FROM attachments WHERE use_case_id = ?',
      'DELETE FROM use_case_associations WHERE use_case_id = ? OR related_use_case_id = ?'
    ];

    const deletePromises = deleteRelated.map(query => {
      return new Promise((resolve, reject) => {
        const params = query.includes('OR') ? [id, id] : [id];
        db.query(query, params, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });

    Promise.all(deletePromises)
      .then(() => {
        // Delete the use case
        db.query('DELETE FROM use_cases WHERE id = ?', [id], (err, result) => {
          if (err) {
            console.error('Error deleting use case:', err);
            return res.status(500).json({ error: 'Failed to delete use case' });
          }

          // Audit log
          createAuditLog({
            eventType: 'use_case_deleted',
            entityType: 'use_case',
            entityId: id,
            entityTitle: useCase.title,
            userId: req.user.id,
            userName: req.user.name
          }).catch(err => console.error('Failed to create audit log:', err));

          res.json({ message: 'Use case deleted successfully' });
        });
      })
      .catch(err => {
        console.error('Error deleting related records:', err);
        res.status(500).json({ error: 'Failed to delete use case' });
      });
  });
});

// Get strategic goals aligned with a use case
router.get('/:id/strategic-goals', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { id } = req.params;

  const query = `
    SELECT
      sg.*,
      sp.name as pillar_name,
      ucga.alignment_strength,
      ucga.rationale
    FROM use_case_goal_alignments ucga
    JOIN strategic_goals sg ON ucga.strategic_goal_id = sg.id
    LEFT JOIN strategic_pillars sp ON sg.strategic_pillar_id = sp.id
    WHERE ucga.use_case_id = ?
    ORDER BY sp.display_order, sg.display_order
  `;

  db.query(query, [id], (err, results) => {
    if (err) {
      console.error('Error fetching aligned strategic goals:', err);
      return res.status(500).json({ error: 'Failed to fetch aligned strategic goals' });
    }

    res.json(results);
  });
});

// Get tasks associated with a use case
router.get('/:id/tasks', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { id } = req.params;

  const query = `
    SELECT
      t.*,
      tia.created_date as association_date
    FROM task_initiative_associations tia
    JOIN tasks t ON tia.task_id = t.id
    WHERE tia.use_case_id = ?
    ORDER BY tia.created_date DESC
  `;

  db.query(query, [id], (err, results) => {
    if (err) {
      console.error('Error fetching associated tasks:', err);
      return res.status(500).json({ error: 'Failed to fetch associated tasks' });
    }

    res.json(results);
  });
});

// Get related use cases
router.get('/:id/related', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { id } = req.params;

  const query = `
    SELECT
      uc.*,
      c.name as category_name,
      uca.created_date as association_date
    FROM use_case_associations uca
    JOIN use_cases uc ON (
      (uca.use_case_id = ? AND uca.related_use_case_id = uc.id) OR
      (uca.related_use_case_id = ? AND uca.use_case_id = uc.id)
    )
    LEFT JOIN categories c ON uc.category_id = c.id
    WHERE uc.id != ?
    ORDER BY uca.created_date DESC
  `;

  db.query(query, [id, id, id], (err, results) => {
    if (err) {
      console.error('Error fetching related use cases:', err);
      return res.status(500).json({ error: 'Failed to fetch related use cases' });
    }

    const relatedUseCases = results.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category_name,
      status: row.status,
      strategic_impact: row.strategic_impact,
      association_date: row.association_date
    }));

    res.json(relatedUseCases);
  });
});

// Add related use case association
router.post('/:id/related', verifyToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { related_use_case_id } = req.body;

  if (!related_use_case_id) {
    return res.status(400).json({ error: 'related_use_case_id is required' });
  }

  if (id === related_use_case_id) {
    return res.status(400).json({ error: 'Cannot associate a use case with itself' });
  }

  // Check if association already exists
  db.query(
    'SELECT id FROM use_case_associations WHERE (use_case_id = ? AND related_use_case_id = ?) OR (use_case_id = ? AND related_use_case_id = ?)',
    [id, related_use_case_id, related_use_case_id, id],
    (err, results) => {
      if (err) {
        console.error('Error checking existing association:', err);
        return res.status(500).json({ error: 'Failed to check existing association' });
      }

      if (results.length > 0) {
        return res.status(400).json({ error: 'Association already exists' });
      }

      db.query(
        'INSERT INTO use_case_associations (use_case_id, related_use_case_id, created_by) VALUES (?, ?, ?)',
        [id, related_use_case_id, req.user.id],
        (err, result) => {
          if (err) {
            console.error('Error creating association:', err);
            return res.status(500).json({ error: 'Failed to create association' });
          }

          res.status(201).json({ message: 'Association created successfully' });
        }
      );
    }
  );
});

// Remove related use case association
router.delete('/:id/related/:relatedId', verifyToken, requireAdmin, (req, res) => {
  const { id, relatedId } = req.params;

  db.query(
    'DELETE FROM use_case_associations WHERE (use_case_id = ? AND related_use_case_id = ?) OR (use_case_id = ? AND related_use_case_id = ?)',
    [id, relatedId, relatedId, id],
    (err, result) => {
      if (err) {
        console.error('Error deleting association:', err);
        return res.status(500).json({ error: 'Failed to delete association' });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Association not found' });
      }

      res.json({ message: 'Association deleted successfully' });
    }
  );
});

module.exports = router;
