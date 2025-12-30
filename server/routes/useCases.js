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
  // If it's a Date object, format it to YYYY-MM-DD
  const date = new Date(dateValue);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Export all data (use cases, strategic goals, strategic pillars) to CSV - Admin only
router.get('/export', verifyToken, requireAdmin, async (req, res) => {
  const { type = 'all', domainId } = req.query; // Support exporting specific types and domain filtering

  try {
    const exportData = {};

    // Export domains first (if type is 'all' or 'domains')
    if (type === 'all' || type === 'domains') {
      const domainFilter = domainId ? 'WHERE id = ?' : '';
      const domainsQuery = `
        SELECT
          'domain' as data_type,
          id,
          name,
          description,
          color,
          created_date,
          updated_date
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

    // Export reference tables (categories, departments, outcomes) - needed for imports
    if (type === 'all') {
      // Export categories (filter by domain if specified)
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

      // Export departments (only those used by use cases in the domain if domainId specified)
      let departmentsQuery;
      let departmentsParams = [];
      if (domainId) {
        // Only export departments that are actually used by use cases in this domain
        departmentsQuery = `
          SELECT DISTINCT "department" as data_type, d.id, d.name
          FROM departments d
          INNER JOIN use_cases uc ON d.name = uc.department_name
          WHERE uc.domain_id = ?
          ORDER BY d.name
        `;
        departmentsParams = [domainId];
      } else {
        departmentsQuery = 'SELECT "department" as data_type, id, name FROM departments ORDER BY name';
      }
      const departmentsResults = await new Promise((resolve, reject) => {
        db.query(departmentsQuery, departmentsParams, (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      });
      exportData.departments = departmentsResults;

      // Export outcomes (filter by domain if specified)
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
      // Export use cases
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
          uc.kanban_pillar,
          uc.expected_delivery_date,
          uc.data_complexity,
          uc.integration_complexity,
          uc.intelligence_complexity,
          uc.functional_complexity,
          uc.strategic_impact,
          uc.justification,
          c.name as category_name,
          d.name as department_name,
          u.name as author_name,
          uc.owner_name,
          uc.owner_email,
          GROUP_CONCAT(DISTINCT sg.id) as strategic_goal_ids,
          uc.created_date,
          uc.updated_date
        FROM use_cases uc
        LEFT JOIN domains dom ON uc.domain_id = dom.id
        LEFT JOIN categories c ON uc.category_id = c.id
        LEFT JOIN departments d ON uc.department_id = d.id
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
      // Export strategic goals
      // Note: strategic_goals don't have domain_id directly - they get it through strategic_pillars
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
      // Export strategic pillars
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

    // Export social features (likes, comments, associations)
    if (type === 'likes') {
      const likesDomainFilter = domainId ? 'WHERE uc.domain_id = ?' : '';
      const likesQuery = `
        SELECT
          'like' as data_type,
          l.id,
          l.use_case_id,
          uc.title as use_case_title,
          uc.domain_id,
          dom.name as domain_name,
          l.user_id,
          u.email as user_email,
          u.name as user_name,
          l.created_date
        FROM likes l
        LEFT JOIN use_cases uc ON l.use_case_id = uc.id
        LEFT JOIN domains dom ON uc.domain_id = dom.id
        LEFT JOIN users u ON l.user_id = u.id
        ${likesDomainFilter}
        ORDER BY l.created_date DESC
      `;

      const likesResults = await new Promise((resolve, reject) => {
        const queryParams = domainId ? [domainId] : [];
        db.query(likesQuery, queryParams, (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      });

      exportData.likes = likesResults;
    }

    if (type === 'comments') {
      const commentsDomainFilter = domainId ? 'WHERE uc.domain_id = ?' : '';
      const commentsQuery = `
        SELECT
          'comment' as data_type,
          c.id,
          c.use_case_id,
          uc.title as use_case_title,
          uc.domain_id,
          dom.name as domain_name,
          c.user_id,
          u.email as user_email,
          u.name as user_name,
          c.parent_comment_id,
          c.content,
          c.is_edited,
          c.created_date,
          c.updated_date
        FROM comments c
        LEFT JOIN use_cases uc ON c.use_case_id = uc.id
        LEFT JOIN domains dom ON uc.domain_id = dom.id
        LEFT JOIN users u ON c.user_id = u.id
        ${commentsDomainFilter}
        ORDER BY c.created_date DESC
      `;

      const commentsResults = await new Promise((resolve, reject) => {
        const queryParams = domainId ? [domainId] : [];
        db.query(commentsQuery, queryParams, (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      });

      exportData.comments = commentsResults;
    }

    if (type === 'associations') {
      const assocDomainFilter = domainId ? 'WHERE uc1.domain_id = ?' : '';
      const associationsQuery = `
        SELECT
          'association' as data_type,
          uca.id,
          uca.use_case_id,
          uc1.title as use_case_title,
          uc1.domain_id,
          dom.name as domain_name,
          uca.related_use_case_id,
          uc2.title as related_use_case_title,
          uca.created_by,
          u.email as created_by_email,
          u.name as created_by_name,
          uca.created_date
        FROM use_case_associations uca
        LEFT JOIN use_cases uc1 ON uca.use_case_id = uc1.id
        LEFT JOIN use_cases uc2 ON uca.related_use_case_id = uc2.id
        LEFT JOIN domains dom ON uc1.domain_id = dom.id
        LEFT JOIN users u ON uca.created_by = u.id
        ${assocDomainFilter}
        ORDER BY uca.created_date DESC
      `;

      const associationsResults = await new Promise((resolve, reject) => {
        const queryParams = domainId ? [domainId] : [];
        db.query(associationsQuery, queryParams, (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      });

      exportData.associations = associationsResults;
    }

    // Export use case goal alignments with relationship details
    if (type === 'all' || type === 'alignments') {
      const alignmentDomainFilter = domainId ? 'WHERE uc.domain_id = ?' : '';
      const alignmentsQuery = `
        SELECT
          'use_case_goal_alignment' as data_type,
          ucga.id,
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

    // Combine all data into a single CSV
    let allData = [];
    if (exportData.domains) allData = allData.concat(exportData.domains);
    if (exportData.categories) allData = allData.concat(exportData.categories);
    if (exportData.departments) allData = allData.concat(exportData.departments);
    if (exportData.outcomes) allData = allData.concat(exportData.outcomes);
    if (exportData.strategic_pillars) allData = allData.concat(exportData.strategic_pillars);
    if (exportData.strategic_goals) allData = allData.concat(exportData.strategic_goals);
    if (exportData.use_cases) allData = allData.concat(exportData.use_cases);
    if (exportData.alignments) allData = allData.concat(exportData.alignments);
    if (exportData.associations) allData = allData.concat(exportData.associations);
    if (exportData.likes) allData = allData.concat(exportData.likes);
    if (exportData.comments) allData = allData.concat(exportData.comments);
    
    // Define all possible fields
    const fields = [
      'data_type', 'id', 'domain_id', 'domain_name', 'title', 'name', 'description', 'color',
      'problem_statement', 'solution_overview', 'technical_implementation', 'results_metrics',
      'lessons_learned', 'status', 'kanban_pillar', 'expected_delivery_date',
      'data_complexity', 'integration_complexity', 'intelligence_complexity', 'functional_complexity',
      'strategic_impact', 'justification', 'category_name', 'department_name', 'author_name',
      'owner_name', 'owner_email', 'strategic_goal_ids', 'strategic_pillar_id', 'strategic_pillar_name',
      'target_date', 'priority', 'success_metrics', 'completion_percentage', 'display_order',
      // Social features fields
      'use_case_id', 'use_case_title', 'related_use_case_id', 'related_use_case_title',
      'user_id', 'user_email', 'user_name', 'parent_comment_id', 'content', 'is_edited',
      'created_by', 'created_by_email', 'created_by_name',
      // Alignment fields
      'strategic_goal_id', 'strategic_goal_title', 'alignment_strength', 'rationale',
      'created_date', 'updated_date'
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

// ============================================================================
// JSON Export/Import Endpoints (New Domain-Based System)
// ============================================================================

const { getExportPreview, exportDomainsToJson } = require('../services/exportService');

// Get export preview with entity counts for selected domains
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

// Export domains to JSON file
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

    // Get the exporter's name
    const exporterName = req.user?.name || 'Unknown';

    const exportData = await exportDomainsToJson(domainIdArray, exporterName);

    // Set headers for JSON file download
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

// Validate JSON import file without importing
router.post('/import-json/validate', verifyToken, requireAdmin, upload.single('jsonFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No JSON file provided' });
    }

    // Validate file path
    const filePath = req.file.path;
    const normalizedPath = path.normalize(filePath);
    const uploadsDir = path.resolve('uploads');

    if (!path.resolve(normalizedPath).startsWith(uploadsDir)) {
      return res.status(400).json({ error: 'Invalid file path' });
    }

    // Read and parse JSON file
    const fileContent = fs.readFileSync(normalizedPath, 'utf8');
    let jsonData;
    try {
      jsonData = JSON.parse(fileContent);
    } catch (parseError) {
      // Clean up uploaded file
      fs.unlinkSync(normalizedPath);
      return res.status(400).json({ error: 'Invalid JSON file: ' + parseError.message });
    }

    // Validate the import data
    const validationResult = await validateImportJson(jsonData, req.user);

    // Clean up uploaded file
    fs.unlinkSync(normalizedPath);

    res.json(validationResult);
  } catch (error) {
    console.error('Error validating JSON import:', error);
    // Clean up file if it exists
    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    }
    res.status(500).json({ error: 'Failed to validate import file' });
  }
});

// Import domains from JSON file
router.post('/import-json', verifyToken, requireAdmin, upload.single('jsonFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No JSON file provided' });
    }

    // Validate file path
    const filePath = req.file.path;
    const normalizedPath = path.normalize(filePath);
    const uploadsDir = path.resolve('uploads');

    if (!path.resolve(normalizedPath).startsWith(uploadsDir)) {
      return res.status(400).json({ error: 'Invalid file path' });
    }

    // Read and parse JSON file
    const fileContent = fs.readFileSync(normalizedPath, 'utf8');
    let jsonData;
    try {
      jsonData = JSON.parse(fileContent);
    } catch (parseError) {
      // Clean up uploaded file
      fs.unlinkSync(normalizedPath);
      return res.status(400).json({ error: 'Invalid JSON file: ' + parseError.message });
    }

    // First validate
    const validationResult = await validateImportJson(jsonData, req.user);
    if (!validationResult.valid) {
      fs.unlinkSync(normalizedPath);
      return res.status(400).json({
        error: 'Validation failed',
        validation: validationResult
      });
    }

    // Perform the import
    const importResult = await importDomainsFromJson(jsonData, req.user);

    // Clean up uploaded file
    fs.unlinkSync(normalizedPath);

    res.json(importResult);
  } catch (error) {
    console.error('Error importing JSON:', error);
    // Clean up file if it exists
    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    }
    res.status(500).json({ error: 'Failed to import domains: ' + error.message });
  }
});

// ============================================================================
// End JSON Export/Import Endpoints
// ============================================================================

// Import all data (use cases, strategic goals, strategic pillars) from CSV - Admin only
router.post('/import', verifyToken, requireAdmin, upload.single('csvFile'), async (req, res) => {

  if (!req.file) {
    return res.status(400).json({ error: 'No CSV file provided' });
  }

  // Checkmarx Suppression: False positive - filePath is controlled by multer, not user input
  // Multer restricts uploads to 'uploads/' directory with safe random filenames
  // Additional validation: ensure path is within uploads directory
  const filePath = req.file.path;
  const normalizedPath = path.normalize(filePath);
  const uploadsDir = path.resolve('uploads');

  if (!path.resolve(normalizedPath).startsWith(uploadsDir)) {
    return res.status(400).json({ error: 'Invalid file path' });
  }
  const results = {
    domains: [],
    categories: [],
    departments: [],
    outcomes: [],
    strategic_pillars: [],
    strategic_goals: [],
    use_cases: [],
    alignments: [],
    associations: [],
    likes: [],
    comments: []
  };
  const errors = [];

  // Helper function to resolve domain_id from either domain_id or domain_name
  const resolveDomainId = async (row) => {
    if (row.domain_id && row.domain_id !== '') {
      // Validate domain_id exists
      const domainResult = await new Promise((resolve, reject) => {
        db.query('SELECT id FROM domains WHERE id = ?', [row.domain_id], (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });
      if (domainResult.length === 0) {
        throw new Error(`Domain with ID ${row.domain_id} does not exist`);
      }
      return parseInt(row.domain_id);
    } else if (row.domain_name && row.domain_name !== '') {
      // Lookup domain by name
      const domainResult = await new Promise((resolve, reject) => {
        db.query('SELECT id FROM domains WHERE name = ?', [row.domain_name], (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });
      if (domainResult.length === 0) {
        throw new Error(`Domain '${row.domain_name}' does not exist`);
      }
      return domainResult[0].id;
    } else {
      throw new Error('domain_id or domain_name is required');
    }
  };

  // Valid kanban_pillar values
  const validKanbanPillars = [
    'backlog', 'prioritised', 'in_progress', 'completed', 'blocked', 'slow_burner', 'de_prioritised', 'on_hold'
  ];

  try {
    // Read and parse CSV file
    const csvData = await new Promise((resolve, reject) => {
      const data = [];
      // Checkmarx Suppression: False positive - filePath validated above, restricted to uploads directory
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => data.push(row))
        .on('end', () => resolve(data))
        .on('error', reject);
    });

    // Process each row based on data_type
    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];
      
      try {
        const dataType = row.data_type || 'use_case'; // Default to use_case for backward compatibility

        if (dataType === 'domain') {
          // Handle domain import
          if (!row.name) {
            errors.push(`Row ${i + 1}: Domain missing required field 'name'`);
            continue;
          }

          // Check if domain already exists
          const existingDomain = await new Promise((resolve, reject) => {
            db.query('SELECT id FROM domains WHERE name = ?', [row.name], (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });

          if (existingDomain.length > 0) {
            results.domains.push({ row: i + 1, name: row.name, status: 'skipped (already exists)' });
            continue;
          }

          // Insert domain
          await new Promise((resolve, reject) => {
            db.query(
              'INSERT INTO domains (name, description, color) VALUES (?, ?, ?)',
              [row.name, row.description || null, row.color || null],
              (err, result) => {
                if (err) reject(err);
                else resolve(result);
              }
            );
          });

          results.domains.push({ row: i + 1, name: row.name, status: 'imported' });

        } else if (dataType === 'category') {
          // Handle category import - skip if exists
          if (!row.name) {
            errors.push(`Row ${i + 1}: Category missing required field 'name'`);
            continue;
          }

          const existing = await new Promise((resolve, reject) => {
            db.query('SELECT id FROM categories WHERE name = ?', [row.name], (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });

          if (existing.length === 0) {
            await new Promise((resolve, reject) => {
              db.query(
                'INSERT INTO categories (name, description) VALUES (?, ?)',
                [row.name, row.description || null],
                (err, result) => {
                  if (err) reject(err);
                  else resolve(result);
                }
              );
            });
            results.categories.push({ row: i + 1, name: row.name, status: 'imported' });
          } else {
            results.categories.push({ row: i + 1, name: row.name, status: 'skipped (already exists)' });
          }

        } else if (dataType === 'department') {
          // Handle department import - skip if exists
          if (!row.name) {
            errors.push(`Row ${i + 1}: Department missing required field 'name'`);
            continue;
          }

          const existing = await new Promise((resolve, reject) => {
            db.query('SELECT id FROM departments WHERE name = ?', [row.name], (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });

          if (existing.length === 0) {
            await new Promise((resolve, reject) => {
              db.query(
                'INSERT INTO departments (name) VALUES (?)',
                [row.name],
                (err, result) => {
                  if (err) reject(err);
                  else resolve(result);
                }
              );
            });
            results.departments.push({ row: i + 1, name: row.name, status: 'imported' });
          } else {
            results.departments.push({ row: i + 1, name: row.name, status: 'skipped (already exists)' });
          }

        } else if (dataType === 'outcome') {
          // Handle outcome import - skip if exists
          if (!row.name) {
            errors.push(`Row ${i + 1}: Outcome missing required field 'name'`);
            continue;
          }

          const existing = await new Promise((resolve, reject) => {
            db.query('SELECT id FROM outcomes WHERE name = ?', [row.name], (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });

          if (existing.length === 0) {
            await new Promise((resolve, reject) => {
              db.query(
                'INSERT INTO outcomes (name) VALUES (?)',
                [row.name],
                (err, result) => {
                  if (err) reject(err);
                  else resolve(result);
                }
              );
            });
            results.outcomes.push({ row: i + 1, name: row.name, status: 'imported' });
          } else {
            results.outcomes.push({ row: i + 1, name: row.name, status: 'skipped (already exists)' });
          }

        } else if (dataType === 'strategic_pillar') {
          // Handle strategic pillar import
          if (!row.name) {
            errors.push(`Row ${i + 1}: Strategic pillar missing required field 'name'`);
            continue;
          }

          // Resolve domain_id
          let domainId;
          try {
            domainId = await resolveDomainId(row);
          } catch (error) {
            errors.push(`Row ${i + 1}: ${error.message}`);
            continue;
          }

          // First check if strategic pillar already exists in this domain
          const existingPillar = await new Promise((resolve, reject) => {
            db.query('SELECT id FROM strategic_pillars WHERE name = ? AND domain_id = ?', [row.name, domainId], (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });

          if (existingPillar.length > 0) {
            errors.push(`Row ${i + 1}: Strategic pillar '${row.name}' already exists in this domain (skipped)`);
            continue;
          }

          const insertQuery = `INSERT INTO strategic_pillars (name, description, domain_id, display_order) VALUES (?, ?, ?, ?)`;
          const values = [row.name, row.description || '', domainId, row.display_order || 0];
          
          await new Promise((resolve, reject) => {
            db.query(insertQuery, values, (err, result) => {
              if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                  errors.push(`Row ${i + 1}: Strategic pillar '${row.name}' already exists`);
                  resolve(null); // Resolve with null to indicate duplicate
                } else {
                  reject(err);
                }
              } else {
                resolve(result);
              }
            });
          }).then(result => {
            if (result) {
              results.strategic_pillars.push({ row: i + 1, name: row.name, status: 'imported' });
            }
          });
          
        } else if (dataType === 'strategic_goal') {
          // Handle strategic goal import
          if (!row.title || !row.description || !row.strategic_pillar_name) {
            errors.push(`Row ${i + 1}: Strategic goal missing required fields (title, description, strategic_pillar_name)`);
            continue;
          }

          // Resolve domain_id
          let domainId;
          try {
            domainId = await resolveDomainId(row);
          } catch (error) {
            errors.push(`Row ${i + 1}: ${error.message}`);
            continue;
          }

          // Get strategic pillar ID (must be in same domain)
          const pillarResult = await new Promise((resolve, reject) => {
            db.query('SELECT id FROM strategic_pillars WHERE name = ? AND domain_id = ?', [row.strategic_pillar_name, domainId], (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });

          if (pillarResult.length === 0) {
            errors.push(`Row ${i + 1}: Invalid strategic pillar '${row.strategic_pillar_name}' for this domain`);
            continue;
          }

          // Check if strategic goal with same title already exists for this pillar
          const existingGoal = await new Promise((resolve, reject) => {
            db.query('SELECT id FROM strategic_goals WHERE title = ? AND strategic_pillar_id = ?',
              [row.title, pillarResult[0].id], (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });

          if (existingGoal.length > 0) {
            errors.push(`Row ${i + 1}: Strategic goal '${row.title}' already exists for pillar '${row.strategic_pillar_name}' (skipped)`);
            continue;
          }

          // Get author ID (use current user if author_name not found)
          let authorId = req.user.id;
          if (row.author_name) {
            const authorResult = await new Promise((resolve, reject) => {
              db.query('SELECT id FROM users WHERE name = ?', [row.author_name], (err, result) => {
                if (err) reject(err);
                else resolve(result);
              });
            });
            if (authorResult.length > 0) {
              authorId = authorResult[0].id;
            }
          }

          const insertQuery = `
            INSERT INTO strategic_goals (
              title, description, strategic_pillar_id, target_date,
              priority, status, completion_percentage, display_order, success_metrics, author_id, domain_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;

          const values = [
            row.title,
            row.description,
            pillarResult[0].id,
            row.target_date || null,
            row.priority || 'Medium',
            row.status || 'active',
            row.completion_percentage || 0,
            row.display_order || 0,
            row.success_metrics || '',
            authorId,
            domainId
          ];
          
          await new Promise((resolve, reject) => {
            db.query(insertQuery, values, (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });
          
          results.strategic_goals.push({ row: i + 1, title: row.title, status: 'imported' });

        } else if (dataType === 'use_case_goal_alignment') {
          // Handle use case goal alignment import
          if (!row.use_case_title || !row.strategic_goal_title) {
            errors.push(`Row ${i + 1}: Alignment missing required fields (use_case_title, strategic_goal_title)`);
            continue;
          }

          // Find use case by title
          const useCaseResult = await new Promise((resolve, reject) => {
            db.query('SELECT id FROM use_cases WHERE title = ?', [row.use_case_title], (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });

          if (useCaseResult.length === 0) {
            errors.push(`Row ${i + 1}: Use case '${row.use_case_title}' not found`);
            continue;
          }

          // Find strategic goal by title
          const goalResult = await new Promise((resolve, reject) => {
            db.query('SELECT id FROM strategic_goals WHERE title = ?', [row.strategic_goal_title], (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });

          if (goalResult.length === 0) {
            errors.push(`Row ${i + 1}: Strategic goal '${row.strategic_goal_title}' not found`);
            continue;
          }

          // Check if alignment already exists
          const existingAlignment = await new Promise((resolve, reject) => {
            db.query('SELECT id FROM use_case_goal_alignments WHERE use_case_id = ? AND strategic_goal_id = ?',
              [useCaseResult[0].id, goalResult[0].id], (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });

          if (existingAlignment.length > 0) {
            results.alignments.push({ row: i + 1, use_case: row.use_case_title, goal: row.strategic_goal_title, status: 'skipped (already exists)' });
            continue;
          }

          // Insert alignment
          await new Promise((resolve, reject) => {
            db.query(
              'INSERT INTO use_case_goal_alignments (use_case_id, strategic_goal_id, alignment_strength, rationale) VALUES (?, ?, ?, ?)',
              [useCaseResult[0].id, goalResult[0].id, row.alignment_strength || 'Medium', row.rationale || ''],
              (err, result) => {
                if (err) reject(err);
                else resolve(result);
              }
            );
          });

          results.alignments.push({ row: i + 1, use_case: row.use_case_title, goal: row.strategic_goal_title, status: 'imported' });

        } else {
          // Handle use case import (default)
          if (!row.title || !row.description || !row.category_name || !row.department_name) {
            errors.push(`Row ${i + 1}: Use case missing required fields (title, description, category_name, department_name)`);
            continue;
          }

          // Resolve domain_id
          let domainId;
          try {
            domainId = await resolveDomainId(row);
          } catch (error) {
            errors.push(`Row ${i + 1}: ${error.message}`);
            continue;
          }

          // Validate kanban_pillar if provided
          if (row.kanban_pillar && row.kanban_pillar !== '' && !validKanbanPillars.includes(row.kanban_pillar)) {
            errors.push(`Row ${i + 1}: Invalid kanban_pillar '${row.kanban_pillar}'. Must be one of: ${validKanbanPillars.join(', ')}`);
            continue;
          }

          // Get category ID (must be in same domain)
          const categoryResult = await new Promise((resolve, reject) => {
            db.query('SELECT id FROM categories WHERE name = ? AND domain_id = ?', [row.category_name, domainId], (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });

          if (categoryResult.length === 0) {
            errors.push(`Row ${i + 1}: Invalid category '${row.category_name}' for this domain`);
            continue;
          }

          // Get department ID
          const departmentResult = await new Promise((resolve, reject) => {
            db.query('SELECT id FROM departments WHERE name = ?', [row.department_name], (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });

          if (departmentResult.length === 0) {
            errors.push(`Row ${i + 1}: Invalid department '${row.department_name}'`);
            continue;
          }

          // Check if use case with same title already exists in the same domain
          const existingUseCase = await new Promise((resolve, reject) => {
            db.query('SELECT id FROM use_cases WHERE title = ? AND domain_id = ?',
              [row.title, domainId], (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });

          if (existingUseCase.length > 0) {
            errors.push(`Row ${i + 1}: Use case '${row.title}' already exists in this domain (skipped)`);
            continue;
          }

          // Get author ID (use current user if author_name not found)
          let authorId = req.user.id;
          if (row.author_name) {
            const authorResult = await new Promise((resolve, reject) => {
              db.query('SELECT id FROM users WHERE name = ?', [row.author_name], (err, result) => {
                if (err) reject(err);
                else resolve(result);
              });
            });
            if (authorResult.length > 0) {
              authorId = authorResult[0].id;
            }
          }

          // Insert use case
          const insertQuery = `
            INSERT INTO use_cases (
              title, description, problem_statement, solution_overview,
              technical_implementation, results_metrics, lessons_learned,
              category_id, status, author_id, owner_name, owner_email,
              department_id, strategic_impact, data_complexity,
              integration_complexity, intelligence_complexity,
              functional_complexity, justification, domain_id,
              kanban_pillar, expected_delivery_date
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;

          const values = [
            row.title,
            row.description,
            row.problem_statement || '',
            row.solution_overview || '',
            row.technical_implementation || '',
            row.results_metrics || '',
            row.lessons_learned || '',
            categoryResult[0].id,
            row.status || 'concept',
            authorId,
            row.owner_name || null,
            row.owner_email || null,
            departmentResult[0].id,
            row.strategic_impact || 'Medium',
            row.data_complexity || 'Medium',
            row.integration_complexity || 'Medium',
            row.intelligence_complexity || 'Medium',
            row.functional_complexity || 'Medium',
            row.justification || '',
            domainId,
            row.kanban_pillar || null,
            row.expected_delivery_date || null
          ];

          await new Promise((resolve, reject) => {
            db.query(insertQuery, values, (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });

          // Get the created use case ID
          const useCaseResult = await new Promise((resolve, reject) => {
            db.query('SELECT id FROM use_cases WHERE title = ? AND author_id = ? ORDER BY created_date DESC LIMIT 1', 
              [row.title, authorId], (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });

          if (useCaseResult.length > 0) {
            const useCaseId = useCaseResult[0].id;

            // Handle strategic goal alignments
            if (row.strategic_goal_ids) {
              const goalIds = row.strategic_goal_ids.split(',').map(id => id.trim()).filter(id => id);
              
              for (const goalId of goalIds) {
                try {
                  await new Promise((resolve, reject) => {
                    const alignmentQuery = `
                      INSERT INTO use_case_goal_alignments 
                      (use_case_id, strategic_goal_id, alignment_strength, rationale)
                      VALUES (?, ?, 'Medium', 'Imported from CSV')
                    `;
                    
                    db.query(alignmentQuery, [useCaseId, goalId], (err, result) => {
                      if (err) reject(err);
                      else resolve(result);
                    });
                  });
                } catch (err) {
                  console.error(`Error creating strategic goal alignment for row ${i + 1}:`, err);
                }
              }
            }
          }

          results.use_cases.push({ row: i + 1, title: row.title, status: 'imported' });
        }
      } catch (err) {
        console.error(`Error processing row ${i + 1}:`, err);
        errors.push(`Row ${i + 1}: ${err.message}`);
      }
    }

    // Clean up uploaded file
    // Checkmarx Suppression: False positive - filePath validated above, restricted to uploads directory
    fs.unlinkSync(filePath);

    const totalImported = results.use_cases.length + results.strategic_goals.length + results.strategic_pillars.length;

    res.json({
      message: 'Import completed',
      imported: totalImported,
      errors: errors.length,
      results,
      errorDetails: errors
    });

  } catch (err) {
    console.error('Error importing CSV:', err);
    // Clean up uploaded file
    // Checkmarx Suppression: False positive - filePath validated above, restricted to uploads directory
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    res.status(500).json({ error: 'Failed to import CSV file' });
  }
});

// Get use case statistics - quick counts without data
router.get('/stats', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { search, category, status, department, strategic_pillar_id, strategic_goal_id, strategic_impact, kanban_pillar, expected_delivery_year, expected_delivery_month, domain_id } = req.query;

  // Handle multi-select filters - Express may parse 'categories[]' as 'categories'
  // Check both formats to be robust
  const categories = req.query.categories || req.query['categories[]'] || (category ? [category] : []);
  const departments = req.query.departments || req.query['departments[]'] || (department ? [department] : []);
  const statuses = req.query.statuses || req.query['statuses[]'] || (status ? [status] : []);
  const tags = req.query.tags || req.query['tags[]'] || [];

  // Ensure they're always arrays
  const categoriesArray = Array.isArray(categories) ? categories : (categories ? [categories] : []);
  const departmentsArray = Array.isArray(departments) ? departments : (departments ? [departments] : []);
  const statusesArray = Array.isArray(statuses) ? statuses : (statuses ? [statuses] : []);
  const tagsArray = Array.isArray(tags) ? tags : (tags ? [tags] : []);
  
  let countQuery = `
    SELECT COUNT(DISTINCT uc.id) as total_count
    FROM use_cases uc
    LEFT JOIN categories c ON uc.category_id = c.id
    LEFT JOIN departments d ON uc.department_id = d.id
    LEFT JOIN use_case_goal_alignments uga ON uc.id = uga.use_case_id
    LEFT JOIN strategic_goals sg ON uga.strategic_goal_id = sg.id
    WHERE 1=1
  `;

  const params = [];

  // IMPORTANT: Filter by domain_id if provided
  if (domain_id) {
    countQuery += ` AND uc.domain_id = ?`;
    params.push(domain_id);
  }

  if (search) {
    countQuery += ` AND (uc.title LIKE ? OR uc.description LIKE ? OR uc.problem_statement LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  
  // Handle categories filter (multi-select)
  if (categoriesArray.length > 0) {
    const categoryPlaceholders = categoriesArray.map(() => '?').join(',');
    countQuery += ` AND c.name IN (${categoryPlaceholders})`;
    params.push(...categoriesArray);
  }
  
  // Handle statuses filter (multi-select)
  if (statusesArray.length > 0) {
    const statusPlaceholders = statusesArray.map(() => '?').join(',');
    countQuery += ` AND uc.status IN (${statusPlaceholders})`;
    params.push(...statusesArray);
  }
  
  // Handle departments filter (multi-select)  
  if (departmentsArray.length > 0) {
    const departmentPlaceholders = departmentsArray.map(() => '?').join(',');
    countQuery += ` AND d.name IN (${departmentPlaceholders})`;
    params.push(...departmentsArray);
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

  if (kanban_pillar) {
    countQuery += ` AND uc.kanban_pillar = ?`;
    params.push(kanban_pillar);
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

  // Handle tags filter with AND logic (use case must have ALL selected tags)
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
    
    // Get additional breakdowns
    let breakdownQuery = `
      SELECT 
        status,
        COUNT(*) as count
      FROM use_cases uc
      LEFT JOIN categories c ON uc.category_id = c.id
      LEFT JOIN departments d ON uc.department_id = d.id
      LEFT JOIN use_case_goal_alignments uga ON uc.id = uga.use_case_id
      LEFT JOIN strategic_goals sg ON uga.strategic_goal_id = sg.id
      WHERE 1=1
    `;

    // Apply same filters for breakdown
    // IMPORTANT: Filter by domain_id if provided (must match countQuery)
    if (domain_id) {
      breakdownQuery += ` AND uc.domain_id = ?`;
    }

    if (search) {
      breakdownQuery += ` AND (uc.title LIKE ? OR uc.description LIKE ? OR uc.problem_statement LIKE ?)`;
    }
    
    // Handle categories filter (multi-select)
    if (categoriesArray.length > 0) {
      const categoryPlaceholders = categoriesArray.map(() => '?').join(',');
      breakdownQuery += ` AND c.name IN (${categoryPlaceholders})`;
    }
    
    // Handle departments filter (multi-select)
    if (departmentsArray.length > 0) {
      const departmentPlaceholders = departmentsArray.map(() => '?').join(',');
      breakdownQuery += ` AND d.name IN (${departmentPlaceholders})`;
    }
    
    // Handle statuses filter (multi-select) - note: this affects the breakdown results
    if (statusesArray.length > 0) {
      const statusPlaceholders = statusesArray.map(() => '?').join(',');
      breakdownQuery += ` AND uc.status IN (${statusPlaceholders})`;
    }
    if (strategic_pillar_id) breakdownQuery += ` AND sg.strategic_pillar_id = ?`;
    if (strategic_goal_id) breakdownQuery += ` AND sg.id = ?`;
    if (strategic_impact) breakdownQuery += ` AND uc.strategic_impact = ?`;
    if (kanban_pillar) breakdownQuery += ` AND uc.kanban_pillar = ?`;
    if (expected_delivery_year) breakdownQuery += ` AND YEAR(STR_TO_DATE(CONCAT('01 ', uc.expected_delivery_date), '%d %b %Y')) = ?`;
    if (expected_delivery_month) breakdownQuery += ` AND SUBSTRING_INDEX(uc.expected_delivery_date, ' ', 1) = ?`;

    // Handle tags filter with AND logic for breakdown query too
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
        filtered: !!(search || categoriesArray.length > 0 || statusesArray.length > 0 || departmentsArray.length > 0 || tagsArray.length > 0 || strategic_pillar_id || strategic_goal_id || strategic_impact || kanban_pillar || expected_delivery_year || expected_delivery_month)
      });
    });
  });
});

// Get use case statistics grouped by a field (for kanban/timeline views) - Consumers and Admins
router.get('/stats/grouped', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { group_by, search, category, status, department, strategic_pillar_id, strategic_goal_id, strategic_impact, expected_delivery_year, expected_delivery_month, domain_id } = req.query;

  // Validate group_by parameter
  const validGroupFields = ['kanban_pillar', 'expected_delivery_month', 'status'];
  if (!group_by || !validGroupFields.includes(group_by)) {
    return res.status(400).json({ error: `group_by must be one of: ${validGroupFields.join(', ')}` });
  }

  // Handle multi-select filters
  const categories = req.query.categories || req.query['categories[]'] || (category ? [category] : []);
  const departments = req.query.departments || req.query['departments[]'] || (department ? [department] : []);
  const statuses = req.query.statuses || req.query['statuses[]'] || (status ? [status] : []);
  const tags = req.query.tags || req.query['tags[]'] || [];
  const dataSensitivityLevels = req.query.data_sensitivity || req.query['data_sensitivity[]'] || [];
  const agentTypes = req.query.agent_types || req.query['agent_types[]'] || [];

  // Ensure they're always arrays
  const categoriesArray = Array.isArray(categories) ? categories : (categories ? [categories] : []);
  const departmentsArray = Array.isArray(departments) ? departments : (departments ? [departments] : []);
  const statusesArray = Array.isArray(statuses) ? statuses : (statuses ? [statuses] : []);
  const tagsArray = Array.isArray(tags) ? tags : (tags ? [tags] : []);
  const dataSensitivityArray = Array.isArray(dataSensitivityLevels) ? dataSensitivityLevels : (dataSensitivityLevels ? [dataSensitivityLevels] : []);
  const agentTypesArray = Array.isArray(agentTypes) ? agentTypes : (agentTypes ? [agentTypes] : []);

  // Determine the GROUP BY field
  let groupField;
  if (group_by === 'kanban_pillar') {
    groupField = 'uc.kanban_pillar';
  } else if (group_by === 'expected_delivery_month') {
    // Return format YYYY-MM for frontend compatibility (e.g., "2025-01")
    // expected_delivery_date is a DATE column, so use DATE_FORMAT directly
    groupField = "DATE_FORMAT(uc.expected_delivery_date, '%Y-%m')";
  } else {
    groupField = `uc.${group_by}`;
  }

  let query = `
    SELECT ${groupField} as group_key, COUNT(DISTINCT uc.id) as count
    FROM use_cases uc
    LEFT JOIN categories c ON uc.category_id = c.id
    LEFT JOIN departments d ON uc.department_id = d.id
    LEFT JOIN use_case_goal_alignments uga ON uc.id = uga.use_case_id
    LEFT JOIN strategic_goals sg ON uga.strategic_goal_id = sg.id
    WHERE 1=1
  `;

  const params = [];

  // Apply domain filter
  if (domain_id) {
    query += ` AND uc.domain_id = ?`;
    params.push(domain_id);
  }

  // Apply search filter
  if (search) {
    query += ` AND (uc.title LIKE ? OR uc.description LIKE ? OR uc.problem_statement LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  // Apply category filter
  if (categoriesArray.length > 0) {
    query += ` AND c.name IN (${categoriesArray.map(() => '?').join(',')})`;
    params.push(...categoriesArray);
  }

  // Apply status filter
  if (statusesArray.length > 0) {
    query += ` AND uc.status IN (${statusesArray.map(() => '?').join(',')})`;
    params.push(...statusesArray);
  }

  // Apply department filter
  if (departmentsArray.length > 0) {
    query += ` AND d.name IN (${departmentsArray.map(() => '?').join(',')})`;
    params.push(...departmentsArray);
  }

  // Apply strategic pillar filter
  if (strategic_pillar_id) {
    query += ` AND sg.strategic_pillar_id = ?`;
    params.push(strategic_pillar_id);
  }

  // Apply strategic goal filter
  if (strategic_goal_id) {
    query += ` AND sg.id = ?`;
    params.push(strategic_goal_id);
  }

  // Apply strategic impact filter
  if (strategic_impact) {
    query += ` AND uc.strategic_impact = ?`;
    params.push(strategic_impact);
  }

  // Apply delivery year filter
  if (expected_delivery_year) {
    query += ` AND YEAR(STR_TO_DATE(CONCAT('01 ', uc.expected_delivery_date), '%d %b %Y')) = ?`;
    params.push(parseInt(expected_delivery_year));
  }

  // Apply delivery month filter
  if (expected_delivery_month) {
    query += ` AND SUBSTRING_INDEX(uc.expected_delivery_date, ' ', 1) = ?`;
    params.push(expected_delivery_month);
  }

  // Apply tags filter (AND logic)
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

  // Apply data sensitivity filter
  if (dataSensitivityArray.length > 0) {
    query += ` AND uc.data_sensitivity IN (${dataSensitivityArray.map(() => '?').join(',')})`;
    params.push(...dataSensitivityArray);
  }

  // Apply agent types filter
  if (agentTypesArray.length > 0) {
    query += ` AND uc.id IN (
      SELECT DISTINCT aia.use_case_id
      FROM agent_initiative_associations aia
      JOIN agents a ON aia.agent_id = a.id
      JOIN agent_types at ON a.agent_type_id = at.id
      WHERE at.name IN (${agentTypesArray.map(() => '?').join(',')})
    )`;
    params.push(...agentTypesArray);
  }

  // Group by and order
  query += ` GROUP BY ${groupField} ORDER BY ${groupField}`;

  db.query(query, params, (err, results) => {
    if (err) {
      console.error('Error fetching grouped stats:', err);
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

// Get all use cases with filters - Consumers and Admins
router.get('/', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { search, category, status, department, strategic_pillar_id, strategic_goal_id, strategic_impact, kanban_pillar, expected_delivery_year, expected_delivery_month, data_sensitivity, domain_id, limit = 50, offset = 0 } = req.query;

  // Handle multi-select filters - Express may parse 'categories[]' as 'categories'
  // Check both formats to be robust
  const categories = req.query.categories || req.query['categories[]'] || (category ? [category] : []);
  const departments = req.query.departments || req.query['departments[]'] || (department ? [department] : []);
  const statuses = req.query.statuses || req.query['statuses[]'] || (status ? [status] : []);
  const tags = req.query.tags || req.query['tags[]'] || [];
  const dataSensitivityLevels = req.query.data_sensitivity || req.query['data_sensitivity[]'] || [];
  const agentTypes = req.query.agent_types || req.query['agent_types[]'] || [];

  // Ensure they're always arrays
  const categoriesArray = Array.isArray(categories) ? categories : (categories ? [categories] : []);
  const departmentsArray = Array.isArray(departments) ? departments : (departments ? [departments] : []);
  const statusesArray = Array.isArray(statuses) ? statuses : (statuses ? [statuses] : []);
  const tagsArray = Array.isArray(tags) ? tags : (tags ? [tags] : []);
  const dataSensitivityArray = Array.isArray(dataSensitivityLevels) ? dataSensitivityLevels : (dataSensitivityLevels ? [dataSensitivityLevels] : []);
  const agentTypesArray = Array.isArray(agentTypes) ? agentTypes : (agentTypes ? [agentTypes] : []);
  
  let query = `
    SELECT
      uc.*,
      c.name as category_name,
      d.name as department_name,
      u.name as author_name,
      GROUP_CONCAT(DISTINCT t.name) as tags,
      GROUP_CONCAT(DISTINCT a.filename) as attachments,
      COALESCE(MAX(goal_counts.goal_count), 0) as goal_alignment_count,
      COALESCE(MAX(likes_counts.likes_count), 0) as likes_count,
      COALESCE(MAX(comments_counts.comments_count), 0) as comments_count,
      COALESCE(MAX(agent_counts.agent_count), 0) as agent_count,
      uc.kanban_pillar,
      uc.expected_delivery_date
    FROM use_cases uc
    LEFT JOIN categories c ON uc.category_id = c.id
    LEFT JOIN departments d ON uc.department_id = d.id
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
      SELECT use_case_id, COUNT(*) as agent_count
      FROM agent_initiative_associations
      GROUP BY use_case_id
    ) agent_counts ON uc.id = agent_counts.use_case_id
    WHERE 1=1
  `;

  const params = [];

  // IMPORTANT: Filter by domain_id if provided
  if (domain_id) {
    query += ` AND uc.domain_id = ?`;
    params.push(domain_id);
  }

  if (search) {
    query += ` AND (uc.title LIKE ? OR uc.description LIKE ? OR uc.problem_statement LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  
  // Handle categories filter (multi-select)
  if (categoriesArray.length > 0) {
    const categoryPlaceholders = categoriesArray.map(() => '?').join(',');
    query += ` AND c.name IN (${categoryPlaceholders})`;
    params.push(...categoriesArray);
  }
  
  // Handle statuses filter (multi-select)
  if (statusesArray.length > 0) {
    const statusPlaceholders = statusesArray.map(() => '?').join(',');
    query += ` AND uc.status IN (${statusPlaceholders})`;
    params.push(...statusesArray);
  }
  
  // Handle departments filter (multi-select)
  if (departmentsArray.length > 0) {
    const departmentPlaceholders = departmentsArray.map(() => '?').join(',');
    query += ` AND d.name IN (${departmentPlaceholders})`;
    params.push(...departmentsArray);
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

  if (kanban_pillar) {
    query += ` AND uc.kanban_pillar = ?`;
    params.push(kanban_pillar);
  }

  if (expected_delivery_year) {
    query += ` AND YEAR(uc.expected_delivery_date) = ?`;
    params.push(parseInt(expected_delivery_year));
  }

  if (expected_delivery_month) {
    if (expected_delivery_month === 'unplanned') {
      // Filter for items with no delivery date
      query += ` AND uc.expected_delivery_date IS NULL`;
    } else if (expected_delivery_month === 'past') {
      // Filter for items with dates before current month
      query += ` AND uc.expected_delivery_date IS NOT NULL AND uc.expected_delivery_date < DATE_FORMAT(NOW(), '%Y-%m-01')`;
    } else {
      // Filter by numeric month (01-12)
      query += ` AND MONTH(uc.expected_delivery_date) = ?`;
      params.push(parseInt(expected_delivery_month));
    }
  }

  // Handle data sensitivity filter with AND logic (though typically only one level selected)
  // If multiple levels selected, use case must match at least one
  if (dataSensitivityArray.length > 0) {
    query += ` AND uc.data_sensitivity IN (${dataSensitivityArray.map(() => '?').join(',')})`;
    params.push(...dataSensitivityArray);
  }

  // Filter use cases by their linked agents' agent types
  if (agentTypesArray.length > 0) {
    query += ` AND uc.id IN (
      SELECT DISTINCT aia.use_case_id
      FROM agent_initiative_associations aia
      INNER JOIN agents a ON aia.agent_id = a.id
      INNER JOIN agent_types at ON a.agent_type_id = at.id
      WHERE at.name IN (${agentTypesArray.map(() => '?').join(',')})
    )`;
    params.push(...agentTypesArray);
  }

  // Handle tags filter with AND logic (use case must have ALL selected tags)
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
      complexity: {
        data_complexity: row.data_complexity,
        integration_complexity: row.integration_complexity,
        intelligence_complexity: row.intelligence_complexity,
        functional_complexity: row.functional_complexity
      },
      department: row.department_name,
      justification: row.justification,
      attachments: row.attachments ? row.attachments.split(',') : [],
      goal_alignment_count: parseInt(row.goal_alignment_count) || 0,
      likes_count: parseInt(row.likes_count) || 0,
      comments_count: parseInt(row.comments_count) || 0,
      agent_count: parseInt(row.agent_count) || 0,
      kanban_pillar: row.kanban_pillar,
      expected_delivery_date: formatDateField(row.expected_delivery_date),
      data_sensitivity: row.data_sensitivity,
      roadmap_link: row.roadmap_link,
      value_realisation_link: row.value_realisation_link
    }));

    res.json(useCases);
  });
});

// Get single use case by ID - Consumers and Admins
router.get('/:id', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { id } = req.params;
  
  const query = `
    SELECT
      uc.*,
      c.name as category_name,
      d.name as department_name,
      u.name as author_name,
      GROUP_CONCAT(DISTINCT t.name) as tags,
      GROUP_CONCAT(DISTINCT a.filename) as attachments,
      COALESCE(MAX(goal_counts.goal_count), 0) as goal_alignment_count,
      COALESCE(MAX(likes_counts.likes_count), 0) as likes_count,
      COALESCE(MAX(comments_counts.comments_count), 0) as comments_count
    FROM use_cases uc
    LEFT JOIN categories c ON uc.category_id = c.id
    LEFT JOIN departments d ON uc.department_id = d.id
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
    WHERE uc.id = ?
    GROUP BY uc.id, c.name, d.name, u.name
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
      complexity: {
        data_complexity: row.data_complexity,
        integration_complexity: row.integration_complexity,
        intelligence_complexity: row.intelligence_complexity,
        functional_complexity: row.functional_complexity
      },
      department: row.department_name,
      justification: row.justification,
      attachments: row.attachments ? row.attachments.split(',') : [],
      goal_alignment_count: parseInt(row.goal_alignment_count) || 0,
      likes_count: parseInt(row.likes_count) || 0,
      comments_count: parseInt(row.comments_count) || 0,
      kanban_pillar: row.kanban_pillar,
      expected_delivery_date: formatDateField(row.expected_delivery_date)
    };

    // Increment view count
    db.query('UPDATE use_cases SET view_count = view_count + 1 WHERE id = ?', [id]);
    
    res.json(useCase);
  });
});

// Create new use case - Admin only
router.post('/', verifyToken, requireAdmin, (req, res) => {
  console.log('=== CREATE USE CASE REQUEST ===');
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
    category,
    tags,
    status,
    author_name,
    owner_name,
    owner_email,
    department,
    strategic_impact,
    complexity,
    justification,
    attachments,
    selectedStrategicGoals,
    kanban_pillar,
    expected_delivery_date,
    data_sensitivity,
    roadmap_link,
    value_realisation_link,
    domain_id
  } = req.body;
  
  console.log('Parsed data:', {
    title,
    category,
    department,
    strategic_impact,
    complexity,
    status
  });
  
  // Validate required fields
  if (!title || !description || !category || !department || !status) {
    return res.status(400).json({
      error: 'Missing required fields',
      details: {
        title: !title ? 'Title is required' : null,
        description: !description ? 'Description is required' : null,
        category: !category ? 'Category is required' : null,
        department: !department ? 'Department is required' : null,
        status: !status ? 'Status is required' : null
      }
    });
  }

  // Get category ID (filter by domain)
  db.query('SELECT id FROM categories WHERE name = ? AND domain_id = ?', [category, domain_id], (err, categoryResult) => {
    if (err) {
      console.error('Error finding category:', err);
      return res.status(500).json({ error: 'Failed to find category' });
    }

    console.log('Category lookup result:', categoryResult);

    if (categoryResult.length === 0) {
      console.error('Category not found:', category, 'for domain_id:', domain_id);
      return res.status(400).json({ error: `Category '${category}' not found for this domain` });
    }

    const categoryId = categoryResult[0].id;

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
      
      console.log('IDs resolved:', { categoryId, departmentId, userId });
      
      const insertQuery = `
        INSERT INTO use_cases (
          title, description, problem_statement, solution_overview,
          technical_implementation, results_metrics, lessons_learned,
          category_id, status, author_id, owner_name, owner_email,
          department_id, strategic_impact, data_complexity,
          integration_complexity, intelligence_complexity,
          functional_complexity, justification, kanban_pillar, expected_delivery_date,
          data_sensitivity, roadmap_link, value_realisation_link, domain_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const values = [
        title, description, problem_statement, solution_overview,
        technical_implementation, results_metrics, lessons_learned,
        categoryId, status, userId, owner_name, owner_email,
        departmentId, strategic_impact,
        complexity.data_complexity, complexity.integration_complexity,
        complexity.intelligence_complexity, complexity.functional_complexity,
        justification, kanban_pillar || 'backlog', expected_delivery_date || null,
        data_sensitivity || 'Public', roadmap_link || null, value_realisation_link || null, domain_id
      ];
      
      console.log('Insert values:', values);
      
      db.query(insertQuery, values, (err, result) => {
        if (err) {
          console.error('Error creating use case:', err);
          return res.status(500).json({ error: 'Failed to create use case' });
        }
        
        console.log('Insert result:', result);
        
        // For UUID primary keys, we need to fetch the created record
        db.query('SELECT id FROM use_cases WHERE title = ? AND author_id = ? ORDER BY created_date DESC LIMIT 1', [title, userId], (err, newResult) => {
          if (err) {
            console.error('Error fetching created use case:', err);
            return res.status(500).json({ error: 'Failed to fetch created use case' });
          }
          
          console.log('Found new record:', newResult);
          
          if (newResult.length === 0) {
            console.error('No record found after insert!');
            return res.status(500).json({ error: 'Failed to find created use case' });
          }
          
          const useCaseId = newResult[0].id;

        // Audit log for use case creation
        createAuditLog({
          eventType: 'use_case_created',
          entityType: 'use_case',
          entityId: useCaseId,
          entityTitle: title,
          userId: req.user.id,
          userName: req.user.name,
          newValue: status
        }).catch(err => console.error('Failed to create audit log:', err));

        // Handle tags if provided
        if (tags && tags.length > 0) {
          console.log('Creating tags:', tags);

          // Create tag records for each tag
          const tagPromises = tags.map(tagName => {
            return new Promise((resolve, reject) => {
              // First, insert or get tag ID
              const tagQuery = 'INSERT INTO tags (name) VALUES (?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)';

              db.query(tagQuery, [tagName.trim()], (err, tagResult) => {
                if (err) {
                  console.error('Error creating tag:', err);
                  reject(err);
                } else {
                  const tagId = tagResult.insertId;
                  console.log('Created/found tag:', tagName, 'with ID:', tagId);

                  // Then associate tag with use case
                  const associationQuery = 'INSERT IGNORE INTO use_case_tags (use_case_id, tag_id) VALUES (?, ?)';

                  db.query(associationQuery, [useCaseId, tagId], (err, result) => {
                    if (err) {
                      console.error('Error associating tag:', err);
                      reject(err);
                    } else {
                      console.log('Associated tag with use case');
                      resolve(result);
                    }
                  });
                }
              });
            });
          });

          // Wait for all tags to be created
          Promise.all(tagPromises)
            .then(() => {
              console.log('All tags created successfully');
            })
            .catch(err => {
              console.error('Error creating some tags:', err);
              // Continue even if some tags fail
            });
        }
        
        // Handle attachments if provided
        if (attachments && attachments.length > 0) {
          // Implementation for attachments would go here
        }
        
        // Handle strategic goal alignments if provided
        if (selectedStrategicGoals && selectedStrategicGoals.length > 0) {
          console.log('Creating strategic goal alignments:', selectedStrategicGoals);

          // Create alignment records for each selected goal
          const alignmentPromises = selectedStrategicGoals.map(goalId => {
            return new Promise((resolve, reject) => {
              const alignmentQuery = `
                INSERT INTO use_case_goal_alignments
                (use_case_id, strategic_goal_id, alignment_strength, rationale)
                VALUES (?, ?, 'Medium', 'Alignment created during use case creation')
              `;

              db.query(alignmentQuery, [useCaseId, goalId], (err, result) => {
                if (err) {
                  console.error('Error creating goal alignment:', err);
                  reject(err);
                } else {
                  console.log('Created alignment for goal:', goalId);
                  resolve(result);
                }
              });
            });
          });

          // Wait for all alignments to be created
          Promise.all(alignmentPromises)
            .then(() => {
              console.log('All strategic goal alignments created successfully');
            })
            .catch(err => {
              console.error('Error creating some alignments:', err);
              // Continue even if some alignments fail
            });
        }

        // Handle agent-initiative associations if provided
        const { selectedAgents } = req.body;
        if (selectedAgents && selectedAgents.length > 0) {
          console.log('Creating agent-initiative associations:', selectedAgents);

          // Create association records for each selected agent
          const agentAssociationPromises = selectedAgents.map(agentId => {
            return new Promise((resolve, reject) => {
              const associationQuery = `
                INSERT INTO agent_initiative_associations
                (agent_id, use_case_id, created_by)
                VALUES (?, ?, ?)
              `;

              db.query(associationQuery, [agentId, useCaseId, req.user.id], (err, result) => {
                if (err) {
                  console.error('Error creating agent association:', err);
                  reject(err);
                } else {
                  console.log('Created association for agent:', agentId);
                  resolve(result);
                }
              });
            });
          });

          // Wait for all associations to be created
          Promise.all(agentAssociationPromises)
            .then(() => {
              console.log('All agent-initiative associations created successfully');
            })
            .catch(err => {
              console.error('Error creating some agent associations:', err);
              // Continue even if some associations fail
            });
        }
        
          // Fetch the complete use case with all joined data
          const selectQuery = `
            SELECT 
              uc.*,
              c.name as category_name,
              d.name as department_name,
              u.name as author_name,
              GROUP_CONCAT(DISTINCT t.name) as tags,
              GROUP_CONCAT(DISTINCT a.filename) as attachments
            FROM use_cases uc
            LEFT JOIN categories c ON uc.category_id = c.id
            LEFT JOIN departments d ON uc.department_id = d.id
            LEFT JOIN users u ON uc.author_id = u.id
            LEFT JOIN use_case_tags uct ON uc.id = uct.use_case_id
            LEFT JOIN tags t ON uct.tag_id = t.id
            LEFT JOIN attachments a ON uc.id = a.use_case_id
            WHERE uc.id = ?
            GROUP BY uc.id
          `;
          
          db.query(selectQuery, [useCaseId], (err, selectResult) => {
            if (err) {
              console.error('Error fetching complete use case:', err);
              return res.status(500).json({ error: 'Failed to fetch complete use case' });
            }
            
            console.log('Complete use case result:', selectResult);
            
            if (selectResult.length === 0) {
              console.error('No complete record found!');
              return res.status(500).json({ error: 'Failed to find complete use case' });
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
              complexity: {
                data_complexity: row.data_complexity,
                integration_complexity: row.integration_complexity,
                intelligence_complexity: row.intelligence_complexity,
                functional_complexity: row.functional_complexity
              },
              department: row.department_name,
              justification: row.justification,
              attachments: row.attachments ? row.attachments.split(',') : []
            };
            
            console.log('Sending response:', completeUseCase);
            res.status(201).json(completeUseCase);
          });
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
    department,
    strategic_impact,
    complexity,
    justification,
    selectedStrategicGoals,
    selectedAgents,
    kanban_pillar,
    expected_delivery_date,
    data_sensitivity,
    roadmap_link,
    value_realisation_link,
    tags
  } = req.body;
  
  console.log('=== UPDATE USE CASE REQUEST ===');
  console.log('Use case ID:', id);
  console.log('User from token:', req.user);

  // Fetch old values for audit logging
  db.query('SELECT title, status FROM use_cases WHERE id = ?', [id], (err, oldResults) => {
    if (err) {
      console.error('Error fetching old use case values:', err);
      return res.status(500).json({ error: 'Failed to fetch use case' });
    }

    if (oldResults.length === 0) {
      return res.status(404).json({ error: 'Use case not found' });
    }

    const oldUseCase = oldResults[0];

  // Get category ID
  db.query('SELECT id FROM categories WHERE name = ?', [category], (err, categoryResult) => {
    if (err) {
      console.error('Error finding category:', err);
      return res.status(500).json({ error: 'Failed to find category' });
    }

    if (categoryResult.length === 0) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    
    const categoryId = categoryResult[0].id;
    
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
      
      // SIMPLIFIED: Allow any authenticated user to update any use case
      console.log('Proceeding with update (auth check bypassed)');
      
      const updateQuery = `
        UPDATE use_cases SET
          title = ?, description = ?, problem_statement = ?, solution_overview = ?,
          technical_implementation = ?, results_metrics = ?, lessons_learned = ?,
          category_id = ?, status = ?, owner_name = ?, owner_email = ?,
          department_id = ?, strategic_impact = ?,
          data_complexity = ?, integration_complexity = ?, intelligence_complexity = ?,
          functional_complexity = ?, justification = ?,
          kanban_pillar = ?, expected_delivery_date = ?,
          data_sensitivity = ?, roadmap_link = ?, value_realisation_link = ?,
          updated_date = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      const values = [
        title, description, problem_statement, solution_overview,
        technical_implementation, results_metrics, lessons_learned,
        categoryId, status, owner_name, owner_email, departmentId, strategic_impact,
        complexity.data_complexity, complexity.integration_complexity,
        complexity.intelligence_complexity, complexity.functional_complexity,
        justification,
        kanban_pillar || 'backlog', expected_delivery_date || null,
        data_sensitivity || 'Public', roadmap_link || null, value_realisation_link || null,
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
        const handleTagsUpdate = (callback) => {
          if (tags !== undefined) {
            // First, remove existing tags
            db.query('DELETE FROM use_case_tags WHERE use_case_id = ?', [id], (err) => {
              if (err) {
                console.error('Error removing existing tags:', err);
                return callback(err);
              }

              // Add new tags if provided
              if (tags && tags.length > 0) {
                console.log('Updating tags:', tags);

                const tagPromises = tags.map(tagName => {
                  return new Promise((resolve, reject) => {
                    // First, insert or get tag ID
                    const tagQuery = 'INSERT INTO tags (name) VALUES (?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)';

                    db.query(tagQuery, [tagName.trim()], (err, tagResult) => {
                      if (err) {
                        console.error('Error creating tag:', err);
                        reject(err);
                      } else {
                        const tagId = tagResult.insertId;

                        // Then associate tag with use case
                        const associationQuery = 'INSERT IGNORE INTO use_case_tags (use_case_id, tag_id) VALUES (?, ?)';

                        db.query(associationQuery, [id, tagId], (err, result) => {
                          if (err) {
                            console.error('Error associating tag:', err);
                            reject(err);
                          } else {
                            resolve(result);
                          }
                        });
                      }
                    });
                  });
                });

                Promise.all(tagPromises)
                  .then(() => {
                    console.log('All tags updated successfully');
                    callback(null);
                  })
                  .catch(err => {
                    console.error('Error updating some tags:', err);
                    callback(err);
                  });
              } else {
                callback(null);
              }
            });
          } else {
            callback(null);
          }
        };

        // Handle agent-initiative associations if provided
        const handleAgentAssociations = (callback) => {
          if (selectedAgents !== undefined) {
            console.log('Updating agent-initiative associations:', selectedAgents);

            // First, remove all existing associations for this use case
            db.query('DELETE FROM agent_initiative_associations WHERE use_case_id = ?', [id], (err) => {
              if (err) {
                console.error('Error removing existing agent associations:', err);
                return callback(err);
              }

              // If there are new associations to create
              if (selectedAgents && selectedAgents.length > 0) {
                console.log('Creating new agent-initiative associations:', selectedAgents);

                // Create association records for each selected agent
                const agentAssociationPromises = selectedAgents.map(agentId => {
                  return new Promise((resolve, reject) => {
                    const associationQuery = `
                      INSERT INTO agent_initiative_associations
                      (agent_id, use_case_id, created_by)
                      VALUES (?, ?, ?)
                    `;

                    db.query(associationQuery, [agentId, id, req.user.id], (err, result) => {
                      if (err) {
                        console.error('Error creating agent association:', err);
                        reject(err);
                      } else {
                        console.log('Created association for agent:', agentId);
                        resolve(result);
                      }
                    });
                  });
                });

                // Wait for all associations to be created
                Promise.all(agentAssociationPromises)
                  .then(() => {
                    console.log('All agent-initiative associations updated successfully');
                    callback(null);
                  })
                  .catch(err => {
                    console.error('Error creating some agent associations:', err);
                    callback(err);
                  });
              } else {
                console.log('No agent-initiative associations to create');
                callback(null);
              }
            });
          } else {
            callback(null);
          }
        };

        // Handle strategic goal alignments if provided
        if (selectedStrategicGoals !== undefined) {
          console.log('Updating strategic goal alignments:', selectedStrategicGoals);

          // First, remove all existing alignments for this use case
          db.query('DELETE FROM use_case_goal_alignments WHERE use_case_id = ?', [id], (err) => {
            if (err) {
              console.error('Error removing existing alignments:', err);
              return res.status(500).json({ error: 'Failed to update strategic goal alignments' });
            }

            // If there are new alignments to create
            if (selectedStrategicGoals && selectedStrategicGoals.length > 0) {
              console.log('Creating new strategic goal alignments:', selectedStrategicGoals);

              // Create alignment records for each selected goal
              const alignmentPromises = selectedStrategicGoals.map(goalId => {
                return new Promise((resolve, reject) => {
                  const alignmentQuery = `
                    INSERT INTO use_case_goal_alignments
                    (use_case_id, strategic_goal_id, alignment_strength, rationale)
                    VALUES (?, ?, 'Medium', 'Alignment updated during use case modification')
                  `;

                  db.query(alignmentQuery, [id, goalId], (err, result) => {
                    if (err) {
                      console.error('Error creating goal alignment:', err);
                      reject(err);
                    } else {
                      console.log('Created alignment for goal:', goalId);
                      resolve(result);
                    }
                  });
                });
              });

              // Wait for all alignments to be created
              Promise.all(alignmentPromises)
                .then(() => {
                  console.log('All strategic goal alignments updated successfully');
                  handleAgentAssociations((err) => {
                    if (err) {
                      return res.status(500).json({ error: 'Failed to update agent associations' });
                    }
                    handleTagsUpdate((err) => {
                      if (err) {
                        return res.status(500).json({ error: 'Failed to update tags' });
                      }
                      fetchUpdatedUseCase();
                    });
                  });
                })
                .catch(err => {
                  console.error('Error creating some alignments:', err);
                  return res.status(500).json({ error: 'Failed to update strategic goal alignments' });
                });
            } else {
              console.log('No strategic goal alignments to create');
              handleAgentAssociations((err) => {
                if (err) {
                  return res.status(500).json({ error: 'Failed to update agent associations' });
                }
                handleTagsUpdate((err) => {
                  if (err) {
                    return res.status(500).json({ error: 'Failed to update tags' });
                  }
                  fetchUpdatedUseCase();
                });
              });
            }
          });
        } else {
          handleAgentAssociations((err) => {
            if (err) {
              return res.status(500).json({ error: 'Failed to update agent associations' });
            }
            handleTagsUpdate((err) => {
              if (err) {
                return res.status(500).json({ error: 'Failed to update tags' });
              }
              fetchUpdatedUseCase();
            });
          });
        }
        
        function fetchUpdatedUseCase() {
        // Fetch the complete updated use case with all joined data
        const selectQuery = `
          SELECT 
            uc.*,
            c.name as category_name,
            d.name as department_name,
            u.name as author_name,
            GROUP_CONCAT(DISTINCT t.name) as tags,
            GROUP_CONCAT(DISTINCT a.filename) as attachments,
            COUNT(DISTINCT ucga.strategic_goal_id) as goal_alignment_count
          FROM use_cases uc
          LEFT JOIN categories c ON uc.category_id = c.id
          LEFT JOIN departments d ON uc.department_id = d.id
          LEFT JOIN users u ON uc.author_id = u.id
          LEFT JOIN use_case_tags uct ON uc.id = uct.use_case_id
          LEFT JOIN tags t ON uct.tag_id = t.id
          LEFT JOIN attachments a ON uc.id = a.use_case_id
          LEFT JOIN use_case_goal_alignments ucga ON uc.id = ucga.use_case_id
          WHERE uc.id = ?
          GROUP BY uc.id
        `;
        
        db.query(selectQuery, [id], (err, selectResult) => {
          if (err) {
            console.error('Error fetching updated use case:', err);
            return res.status(500).json({ error: 'Failed to fetch updated use case' });
          }
          
          if (selectResult.length === 0) {
            return res.status(404).json({ error: 'Use case not found after update' });
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
            complexity: {
              data_complexity: row.data_complexity,
              integration_complexity: row.integration_complexity,
              intelligence_complexity: row.intelligence_complexity,
              functional_complexity: row.functional_complexity
            },
            department: row.department_name,
            justification: row.justification,
            attachments: row.attachments ? row.attachments.split(',') : [],
            goal_alignment_count: parseInt(row.goal_alignment_count) || 0
          };
          
          console.log('Use case updated successfully');
          res.json(updatedUseCase);
        });
        }
      });
    });
  });
  });
});

// Delete use case - Admin only
router.delete('/:id', verifyToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  
  console.log('=== DELETE USE CASE REQUEST ===');
  console.log('Use case ID:', id);
  console.log('User from token:', req.user);
  
  // First check if the use case exists
  db.query('SELECT id, author_id, title FROM use_cases WHERE id = ?', [id], (err, checkResults) => {
    if (err) {
      console.error('Error checking use case:', err);
      return res.status(500).json({ error: 'Failed to check use case' });
    }
    
    console.log('Use case check results:', checkResults);
    
    if (checkResults.length === 0) {
      console.log('Use case not found with ID:', id);
      return res.status(404).json({ error: 'Use case not found' });
    }
    
    const useCase = checkResults[0];
    console.log('Found use case:', useCase);
    console.log('Use case author_id:', useCase.author_id);
    console.log('Token user id:', req.user.id);
    
    // SIMPLIFIED: Allow any authenticated user to delete any use case
    console.log('Proceeding with deletion (auth check bypassed)');
    
    // Delete the use case (removed author_id restriction)
    db.query('DELETE FROM use_cases WHERE id = ?', [id], (err, result) => {
      if (err) {
        console.error('Error deleting use case:', err);
        return res.status(500).json({ error: 'Failed to delete use case' });
      }
      
      console.log('Delete result:', result);
      
      if (result.affectedRows === 0) {
        console.log('No rows affected during delete');
        return res.status(404).json({ error: 'Use case not found' });
      }
      
      console.log('Use case deleted successfully');
      res.json({ message: 'Use case deleted successfully' });
    });
  });
});

// Get strategic goal alignments for a use case - Consumers and Admins
router.get('/:id/alignments', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { id } = req.params;
  
  const query = `
    SELECT 
      uga.strategic_goal_id,
      uga.alignment_strength,
      uga.rationale,
      sg.title as goal_title,
      sg.description as goal_description
    FROM use_case_goal_alignments uga
    JOIN strategic_goals sg ON uga.strategic_goal_id = sg.id
    WHERE uga.use_case_id = ?
  `;
  
  db.query(query, [id], (err, results) => {
    if (err) {
      console.error('Error fetching use case alignments:', err);
      return res.status(500).json({ error: 'Failed to fetch use case alignments' });
    }

    res.json(results);
  });
});

// Update kanban status only (for drag-and-drop) - Consumers and Admins
router.put('/:id/kanban-status', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { id } = req.params;
  const { kanban_pillar } = req.body;

  console.log(`=== UPDATE KANBAN STATUS ===`);
  console.log(`Use case ID: ${id}`);
  console.log(`New kanban pillar: ${kanban_pillar}`);
  console.log(`User: ${req.user?.email || 'unknown'}`);

  // Validate kanban_pillar value
  const validKanbanStatuses = ['backlog', 'prioritised', 'in_progress', 'completed', 'blocked', 'slow_burner', 'de_prioritised', 'on_hold'];

  if (!kanban_pillar || !validKanbanStatuses.includes(kanban_pillar)) {
    console.error(`Invalid kanban_pillar: ${kanban_pillar}`);
    return res.status(400).json({
      error: 'Invalid kanban_pillar value',
      validValues: validKanbanStatuses,
      received: kanban_pillar
    });
  }

  // Fetch old kanban_pillar for audit logging
  db.query('SELECT title, kanban_pillar FROM use_cases WHERE id = ?', [id], (err, oldResults) => {
    if (err) {
      console.error('Error fetching old kanban status:', err);
      return res.status(500).json({ error: 'Failed to fetch use case' });
    }

    if (oldResults.length === 0) {
      return res.status(404).json({ error: 'Use case not found' });
    }

    const oldUseCase = oldResults[0];

  const updateQuery = `
    UPDATE use_cases SET
      kanban_pillar = ?,
      updated_date = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

  db.query(updateQuery, [kanban_pillar, id], (err, result) => {
    if (err) {
      console.error('Database error updating kanban status:', err);
      return res.status(500).json({
        error: 'Failed to update kanban status',
        details: err.message
      });
    }

    console.log(`Database update result: ${result.affectedRows} rows affected`);

    if (result.affectedRows === 0) {
      console.error(`Use case not found: ${id}`);
      return res.status(404).json({ error: 'Use case not found' });
    }

    // Audit log for kanban status change
    createAuditLog({
      eventType: 'kanban_change',
      entityType: 'use_case',
      entityId: id,
      entityTitle: oldUseCase.title,
      userId: req.user.id,
      userName: req.user.name,
      oldValue: oldUseCase.kanban_pillar,
      newValue: kanban_pillar
    }).catch(err => console.error('Failed to create audit log:', err));

    // Fetch and return the updated use case
    const selectQuery = `
      SELECT
        uc.*,
        c.name as category_name,
        d.name as department_name,
        u.name as author_name,
        COALESCE(likes_counts.likes_count, 0) as likes_count,
        COALESCE(comments_counts.comments_count, 0) as comments_count
      FROM use_cases uc
      LEFT JOIN categories c ON uc.category_id = c.id
      LEFT JOIN departments d ON uc.department_id = d.id
      LEFT JOIN users u ON uc.author_id = u.id
      LEFT JOIN (
        SELECT use_case_id, COUNT(*) as likes_count
        FROM likes
        GROUP BY use_case_id
      ) likes_counts ON uc.id = likes_counts.use_case_id
      LEFT JOIN (
        SELECT use_case_id, COUNT(*) as comments_count
        FROM comments
        GROUP BY use_case_id
      ) comments_counts ON uc.id = comments_counts.use_case_id
      WHERE uc.id = ?
    `;

    db.query(selectQuery, [id], (err, selectResult) => {
      if (err) {
        console.error('Error fetching updated use case:', err);
        return res.status(500).json({ error: 'Failed to fetch updated use case' });
      }

      if (selectResult.length === 0) {
        return res.status(404).json({ error: 'Use case not found after update' });
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
        status: row.status,
        author_name: row.author_name,
        owner_name: row.owner_name,
        owner_email: row.owner_email,
        department: row.department_name,
        strategic_impact: row.strategic_impact,
        kanban_pillar: row.kanban_pillar,
        expected_delivery_date: formatDateField(row.expected_delivery_date),
        likes_count: parseInt(row.likes_count) || 0,
        comments_count: parseInt(row.comments_count) || 0,
        created_date: row.created_date,
        updated_date: row.updated_date
      };

      console.log(`Successfully updated kanban status for use case ${id} to ${kanban_pillar}`);
      res.json(updatedUseCase);
    });
  });
  });
});

// Update delivery date only (for roadmap timeline drag-and-drop) - Consumers and Admins
router.put('/:id/delivery-date', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { id } = req.params;
  const { expected_delivery_date } = req.body;

  console.log(`=== UPDATE DELIVERY DATE ===`);
  console.log(`Use case ID: ${id}`);
  console.log(`New delivery date: ${expected_delivery_date}`);
  console.log(`User: ${req.user?.email || 'unknown'}`);

  // Fetch old delivery date for audit logging
  db.query('SELECT title, expected_delivery_date FROM use_cases WHERE id = ?', [id], (err, oldResults) => {
    if (err) {
      console.error('Error fetching old delivery date:', err);
      return res.status(500).json({ error: 'Failed to fetch use case' });
    }

    if (oldResults.length === 0) {
      return res.status(404).json({ error: 'Use case not found' });
    }

    const oldUseCase = oldResults[0];

  const updateQuery = `
    UPDATE use_cases SET
      expected_delivery_date = ?,
      updated_date = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

  db.query(updateQuery, [expected_delivery_date || null, id], (err, result) => {
    if (err) {
      console.error('Database error updating delivery date:', err);
      return res.status(500).json({
        error: 'Failed to update delivery date',
        details: err.message
      });
    }

    console.log(`Database update result: ${result.affectedRows} rows affected`);

    if (result.affectedRows === 0) {
      console.error(`Use case not found: ${id}`);
      return res.status(404).json({ error: 'Use case not found' });
    }

    // Audit log for delivery date change
    createAuditLog({
      eventType: 'roadmap_change',
      entityType: 'use_case',
      entityId: id,
      entityTitle: oldUseCase.title,
      userId: req.user.id,
      userName: req.user.name,
      oldValue: oldUseCase.expected_delivery_date ? formatDateField(oldUseCase.expected_delivery_date) : null,
      newValue: expected_delivery_date
    }).catch(err => console.error('Failed to create audit log:', err));

    // Fetch and return the updated use case
    const selectQuery = `
      SELECT
        uc.*,
        c.name as category_name,
        d.name as department_name,
        u.name as author_name,
        COALESCE(likes_counts.likes_count, 0) as likes_count,
        COALESCE(comments_counts.comments_count, 0) as comments_count
      FROM use_cases uc
      LEFT JOIN categories c ON uc.category_id = c.id
      LEFT JOIN departments d ON uc.department_id = d.id
      LEFT JOIN users u ON uc.author_id = u.id
      LEFT JOIN (
        SELECT use_case_id, COUNT(*) as likes_count
        FROM likes
        GROUP BY use_case_id
      ) likes_counts ON uc.id = likes_counts.use_case_id
      LEFT JOIN (
        SELECT use_case_id, COUNT(*) as comments_count
        FROM comments
        GROUP BY use_case_id
      ) comments_counts ON uc.id = comments_counts.use_case_id
      WHERE uc.id = ?
    `;

    db.query(selectQuery, [id], (err, selectResult) => {
      if (err) {
        console.error('Error fetching updated use case:', err);
        return res.status(500).json({ error: 'Failed to fetch updated use case' });
      }

      if (selectResult.length === 0) {
        return res.status(404).json({ error: 'Use case not found after update' });
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
        status: row.status,
        author_name: row.author_name,
        owner_name: row.owner_name,
        owner_email: row.owner_email,
        department: row.department_name,
        strategic_impact: row.strategic_impact,
        kanban_pillar: row.kanban_pillar,
        expected_delivery_date: formatDateField(row.expected_delivery_date),
        likes_count: parseInt(row.likes_count) || 0,
        comments_count: parseInt(row.comments_count) || 0,
        created_date: row.created_date,
        updated_date: row.updated_date
      };

      console.log(`Successfully updated delivery date for use case ${id}`);
      res.json(updatedUseCase);
    });
  });
  });
});

module.exports = router;