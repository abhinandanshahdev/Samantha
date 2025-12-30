const express = require('express');
const router = express.Router();
const db = require('../config/database-mysql-compat');
const { verifyToken } = require('./auth');
const { requireAdmin } = require('../middleware/roleMiddleware');
const { seedDomainDefaults } = require('../utils/seedDomainDefaults');

// Get all domains (accessible to all authenticated users)
router.get('/', verifyToken, async (req, res) => {
  try {
    const query = `
      SELECT
        d.id,
        d.name,
        d.type,
        d.hero_message,
        d.subtitle,
        d.config_json,
        d.is_active,
        d.created_at,
        d.updated_at,
        COUNT(DISTINCT uc.id) as initiative_count,
        COUNT(DISTINCT sp.id) as pillar_count,
        COUNT(DISTINCT sg.id) as goal_count
      FROM domains d
      LEFT JOIN use_cases uc ON d.id = uc.domain_id
      LEFT JOIN strategic_pillars sp ON d.id = sp.domain_id
      LEFT JOIN strategic_goals sg ON sp.id = sg.strategic_pillar_id AND sp.domain_id = d.id
      WHERE d.is_active = 1
      GROUP BY d.id
      ORDER BY d.name
    `;

    db.query(query, [], (err, results) => {
      if (err) {
        console.error('Error fetching domains:', err);
        return res.status(500).json({ error: 'Failed to fetch domains' });
      }

      // Parse config_json for each domain
      const domains = results.map(domain => ({
        ...domain,
        config_json: typeof domain.config_json === 'string'
          ? JSON.parse(domain.config_json)
          : domain.config_json
      }));

      res.json(domains);
    });
  } catch (error) {
    console.error('Error in GET /domains:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get domain by ID
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT
        d.*,
        COUNT(DISTINCT uc.id) as initiative_count,
        COUNT(DISTINCT sp.id) as pillar_count,
        COUNT(DISTINCT sg.id) as goal_count,
        COUNT(DISTINCT c.id) as category_count
      FROM domains d
      LEFT JOIN use_cases uc ON d.id = uc.domain_id
      LEFT JOIN strategic_pillars sp ON d.id = sp.domain_id
      LEFT JOIN strategic_goals sg ON sp.id = sg.strategic_pillar_id
      LEFT JOIN categories c ON d.id = c.domain_id
      WHERE d.id = ?
      GROUP BY d.id
    `;

    db.query(query, [id], (err, results) => {
      if (err) {
        console.error('Error fetching domain:', err);
        return res.status(500).json({ error: 'Failed to fetch domain' });
      }

      if (results.length === 0) {
        return res.status(404).json({ error: 'Domain not found' });
      }

      const domain = {
        ...results[0],
        config_json: typeof results[0].config_json === 'string'
          ? JSON.parse(results[0].config_json)
          : results[0].config_json
      };

      res.json(domain);
    });
  } catch (error) {
    console.error('Error in GET /domains/:id:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get domain configuration (lightweight endpoint for active domain)
router.get('/:id/config', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const query = 'SELECT id, name, type, hero_message, subtitle, config_json FROM domains WHERE id = ? AND is_active = 1';

    db.query(query, [id], (err, results) => {
      if (err) {
        console.error('Error fetching domain config:', err);
        return res.status(500).json({ error: 'Failed to fetch domain configuration' });
      }

      if (results.length === 0) {
        return res.status(404).json({ error: 'Domain not found or inactive' });
      }

      const config = {
        ...results[0],
        config_json: typeof results[0].config_json === 'string'
          ? JSON.parse(results[0].config_json)
          : results[0].config_json
      };

      res.json(config);
    });
  } catch (error) {
    console.error('Error in GET /domains/:id/config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new domain (admin only)
router.post('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { name, type, hero_message, subtitle, config_json, is_active } = req.body;

    // Validation
    if (!name || !type) {
      return res.status(400).json({ error: 'Name and type are required' });
    }

    const validTypes = ['ai', 'data', 'infosec', 'infrastructure', 'custom'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `Type must be one of: ${validTypes.join(', ')}` });
    }

    const query = `
      INSERT INTO domains (name, type, hero_message, subtitle, config_json, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    const configStr = config_json ? JSON.stringify(config_json) : JSON.stringify({
      terminology: {
        initiative_singular: 'Initiative',
        initiative_plural: 'Initiatives'
      },
      features: {
        complexity_fields: true,
        ai_autocomplete: type === 'ai'
      }
    });

    db.query(
      query,
      [
        name,
        type,
        hero_message || null,
        subtitle || 'Strategic Initiatives @ DoF',
        configStr,
        is_active !== undefined ? is_active : true
      ],
      (err, result) => {
        if (err) {
          if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Domain with this name already exists' });
          }
          console.error('Error creating domain:', err);
          return res.status(500).json({ error: 'Failed to create domain' });
        }

        // Fetch the created domain
        db.query('SELECT * FROM domains WHERE id = ?', [result.insertId], async (err, results) => {
          if (err) {
            console.error('Error fetching created domain:', err);
            return res.status(500).json({ error: 'Domain created but failed to fetch' });
          }

          const domain = {
            ...results[0],
            config_json: typeof results[0].config_json === 'string'
              ? JSON.parse(results[0].config_json)
              : results[0].config_json
          };

          // Seed default categories and departments for the new domain
          try {
            const seedResult = await seedDomainDefaults(result.insertId);
            console.log(`Seeded defaults for new domain ${result.insertId}:`, seedResult);

            // Add seeding info to response
            domain.seeding = {
              categories_created: seedResult.categories.created,
              departments_created: seedResult.departments.created,
              errors: [
                ...seedResult.categories.errors,
                ...seedResult.departments.errors
              ]
            };
          } catch (seedErr) {
            console.error('Error seeding domain defaults:', seedErr);
            // Don't fail the request, just log the error
            domain.seeding = {
              error: 'Failed to seed default categories and departments',
              details: seedErr.message
            };
          }

          res.status(201).json(domain);
        });
      }
    );
  } catch (error) {
    console.error('Error in POST /domains:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update domain (admin only)
router.put('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, hero_message, subtitle, config_json, is_active } = req.body;

    // Build dynamic update query
    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (type !== undefined) {
      const validTypes = ['ai', 'data', 'infosec', 'infrastructure', 'custom'];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ error: `Type must be one of: ${validTypes.join(', ')}` });
      }
      updates.push('type = ?');
      values.push(type);
    }
    if (hero_message !== undefined) {
      updates.push('hero_message = ?');
      values.push(hero_message);
    }
    if (subtitle !== undefined) {
      updates.push('subtitle = ?');
      values.push(subtitle);
    }
    if (config_json !== undefined) {
      updates.push('config_json = ?');
      values.push(JSON.stringify(config_json));
    }
    if (is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(is_active);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const query = `UPDATE domains SET ${updates.join(', ')} WHERE id = ?`;

    db.query(query, values, (err, result) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({ error: 'Domain with this name already exists' });
        }
        console.error('Error updating domain:', err);
        return res.status(500).json({ error: 'Failed to update domain' });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Domain not found' });
      }

      // Fetch updated domain
      db.query('SELECT * FROM domains WHERE id = ?', [id], (err, results) => {
        if (err) {
          console.error('Error fetching updated domain:', err);
          return res.status(500).json({ error: 'Domain updated but failed to fetch' });
        }

        const domain = {
          ...results[0],
          config_json: typeof results[0].config_json === 'string'
            ? JSON.parse(results[0].config_json)
            : results[0].config_json
        };

        res.json(domain);
      });
    });
  } catch (error) {
    console.error('Error in PUT /domains/:id:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get domain deletion preview - shows what will be deleted
router.get('/:id/deletion-preview', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Get domain name first
    db.query('SELECT name FROM domains WHERE id = ?', [id], (err, domainResults) => {
      if (err) {
        console.error('Error fetching domain:', err);
        return res.status(500).json({ error: 'Failed to fetch domain' });
      }

      if (domainResults.length === 0) {
        return res.status(404).json({ error: 'Domain not found' });
      }

      const domainName = domainResults[0].name;

      // Count all related entities
      const checkQuery = `
        SELECT
          (SELECT COUNT(*) FROM use_cases WHERE domain_id = ?) as initiatives,
          (SELECT COUNT(*) FROM agents WHERE domain_id = ?) as agents,
          (SELECT COUNT(*) FROM strategic_pillars WHERE domain_id = ?) as pillars,
          (SELECT COUNT(*) FROM strategic_goals sg JOIN strategic_pillars sp ON sg.strategic_pillar_id = sp.id WHERE sp.domain_id = ?) as goals,
          (SELECT COUNT(*) FROM categories WHERE domain_id = ?) as categories,
          (SELECT COUNT(*) FROM departments WHERE domain_id = ?) as departments,
          (SELECT COUNT(*) FROM agent_types WHERE domain_id = ?) as agent_types,
          (SELECT COUNT(*) FROM outcomes WHERE domain_id = ?) as outcomes
      `;

      db.query(checkQuery, [id, id, id, id, id, id, id, id], (err, results) => {
        if (err) {
          console.error('Error checking domain usage:', err);
          return res.status(500).json({ error: 'Failed to check domain usage' });
        }

        const counts = results[0];
        const totalItems = Object.values(counts).reduce((sum, val) => sum + val, 0);

        res.json({
          domain_id: id,
          domain_name: domainName,
          counts,
          total_items: totalItems,
          warning: totalItems > 0
            ? `This will permanently delete ${totalItems} items. This action will be logged in the audit trail.`
            : 'This domain has no associated data and can be safely deleted.'
        });
      });
    });
  } catch (error) {
    console.error('Error in GET /domains/:id/deletion-preview:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete domain (admin only) - with comprehensive safety checks
router.delete('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { forceDelete, confirmationCode } = req.body || {};

    // Get domain info for audit logging
    db.query('SELECT name FROM domains WHERE id = ?', [id], (err, domainResults) => {
      if (err || domainResults.length === 0) {
        return res.status(404).json({ error: 'Domain not found' });
      }

      const domainName = domainResults[0].name;

      // Check all related entities
      const checkQuery = `
        SELECT
          (SELECT COUNT(*) FROM use_cases WHERE domain_id = ?) as initiatives,
          (SELECT COUNT(*) FROM agents WHERE domain_id = ?) as agents,
          (SELECT COUNT(*) FROM strategic_pillars WHERE domain_id = ?) as pillars,
          (SELECT COUNT(*) FROM categories WHERE domain_id = ?) as categories,
          (SELECT COUNT(*) FROM departments WHERE domain_id = ?) as departments,
          (SELECT COUNT(*) FROM agent_types WHERE domain_id = ?) as agent_types,
          (SELECT COUNT(*) FROM outcomes WHERE domain_id = ?) as outcomes
      `;

      db.query(checkQuery, [id, id, id, id, id, id, id], (err, results) => {
        if (err) {
          console.error('Error checking domain usage:', err);
          return res.status(500).json({ error: 'Failed to check domain usage' });
        }

        const counts = results[0];
        const hasData = Object.values(counts).some(v => v > 0);

        // If domain has data and forceDelete is not enabled, return error with counts
        if (hasData && !forceDelete) {
          const blockers = [];
          if (counts.initiatives > 0) blockers.push(`${counts.initiatives} initiative(s)`);
          if (counts.agents > 0) blockers.push(`${counts.agents} agent(s)`);
          if (counts.pillars > 0) blockers.push(`${counts.pillars} strategic pillar(s)`);
          if (counts.categories > 0) blockers.push(`${counts.categories} category(ies)`);
          if (counts.departments > 0) blockers.push(`${counts.departments} department(s)`);
          if (counts.agent_types > 0) blockers.push(`${counts.agent_types} agent type(s)`);
          if (counts.outcomes > 0) blockers.push(`${counts.outcomes} outcome(s)`);

          return res.status(409).json({
            error: `Cannot delete domain. It contains: ${blockers.join(', ')}.`,
            details: counts,
            requiresForceDelete: true
          });
        }

        // If forceDelete, verify confirmation code matches domain name
        if (forceDelete && hasData) {
          if (confirmationCode !== domainName) {
            return res.status(400).json({
              error: 'Confirmation code does not match domain name. Deletion cancelled.'
            });
          }
        }

        // Perform deletion (cascading deletes handled by foreign keys or manual deletion)
        const deleteOperations = [];

        // Delete in correct order to respect foreign key constraints
        // 1. Delete agent_use_case_links first (junction table)
        deleteOperations.push(new Promise((resolve, reject) => {
          db.query(`DELETE FROM agent_use_case_links WHERE agent_id IN (SELECT id FROM agents WHERE domain_id = ?)`, [id], (err) => {
            if (err) reject(err); else resolve(true);
          });
        }));

        // 2. Delete use_case_tags
        deleteOperations.push(new Promise((resolve, reject) => {
          db.query(`DELETE FROM use_case_tags WHERE use_case_id IN (SELECT id FROM use_cases WHERE domain_id = ?)`, [id], (err) => {
            if (err) reject(err); else resolve(true);
          });
        }));

        // 3. Delete agents
        deleteOperations.push(new Promise((resolve, reject) => {
          db.query(`DELETE FROM agents WHERE domain_id = ?`, [id], (err) => {
            if (err) reject(err); else resolve(true);
          });
        }));

        // 4. Delete use_cases
        deleteOperations.push(new Promise((resolve, reject) => {
          db.query(`DELETE FROM use_cases WHERE domain_id = ?`, [id], (err) => {
            if (err) reject(err); else resolve(true);
          });
        }));

        // 5. Delete strategic_goals (via pillars)
        deleteOperations.push(new Promise((resolve, reject) => {
          db.query(`DELETE FROM strategic_goals WHERE strategic_pillar_id IN (SELECT id FROM strategic_pillars WHERE domain_id = ?)`, [id], (err) => {
            if (err) reject(err); else resolve(true);
          });
        }));

        // 6. Delete strategic_pillars
        deleteOperations.push(new Promise((resolve, reject) => {
          db.query(`DELETE FROM strategic_pillars WHERE domain_id = ?`, [id], (err) => {
            if (err) reject(err); else resolve(true);
          });
        }));

        // 7. Delete categories
        deleteOperations.push(new Promise((resolve, reject) => {
          db.query(`DELETE FROM categories WHERE domain_id = ?`, [id], (err) => {
            if (err) reject(err); else resolve(true);
          });
        }));

        // 8. Delete departments
        deleteOperations.push(new Promise((resolve, reject) => {
          db.query(`DELETE FROM departments WHERE domain_id = ?`, [id], (err) => {
            if (err) reject(err); else resolve(true);
          });
        }));

        // 9. Delete agent_types
        deleteOperations.push(new Promise((resolve, reject) => {
          db.query(`DELETE FROM agent_types WHERE domain_id = ?`, [id], (err) => {
            if (err) reject(err); else resolve(true);
          });
        }));

        // 10. Delete outcomes
        deleteOperations.push(new Promise((resolve, reject) => {
          db.query(`DELETE FROM outcomes WHERE domain_id = ?`, [id], (err) => {
            if (err) reject(err); else resolve(true);
          });
        }));

        Promise.all(deleteOperations)
          .then(() => {
            // Finally delete the domain itself
            db.query('DELETE FROM domains WHERE id = ?', [id], (err, result) => {
              if (err) {
                console.error('Error deleting domain:', err);
                return res.status(500).json({ error: 'Failed to delete domain' });
              }

              if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Domain not found' });
              }

              // Log to audit trail
              const auditQuery = `
                INSERT INTO audit_log (action, entity_type, entity_id, entity_name, details, user_id, user_email, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
              `;
              const auditDetails = JSON.stringify({
                deleted_counts: counts,
                force_delete: forceDelete || false,
                ip_address: req.ip
              });

              db.query(
                auditQuery,
                ['DELETE_DOMAIN', 'domain', id, domainName, auditDetails, req.user?.id || null, req.user?.email || 'unknown'],
                (auditErr) => {
                  if (auditErr) {
                    console.error('Failed to log domain deletion to audit:', auditErr);
                    // Don't fail the request, just log the error
                  }
                }
              );

              res.json({
                message: `Domain "${domainName}" and all associated data deleted successfully`,
                deleted_counts: counts,
                audited: true
              });
            });
          })
          .catch((deleteErr) => {
            console.error('Error during cascading delete:', deleteErr);
            res.status(500).json({ error: 'Failed to delete domain data. Some data may remain.' });
          });
      });
    });
  } catch (error) {
    console.error('Error in DELETE /domains/:id:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get domain statistics
router.get('/:id/stats', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Get detailed statistics for a domain
    const statsQuery = `
      SELECT
        (SELECT COUNT(*) FROM use_cases WHERE domain_id = ?) as total_initiatives,
        (SELECT COUNT(*) FROM use_cases WHERE domain_id = ? AND status = 'production') as production_count,
        (SELECT COUNT(*) FROM use_cases WHERE domain_id = ? AND status = 'pilot') as pilot_count,
        (SELECT COUNT(*) FROM strategic_pillars WHERE domain_id = ?) as pillar_count,
        (SELECT COUNT(*) FROM strategic_goals sg
         JOIN strategic_pillars sp ON sg.strategic_pillar_id = sp.id
         WHERE sp.domain_id = ?) as goal_count,
        (SELECT COUNT(*) FROM categories WHERE domain_id = ?) as category_count
    `;

    db.query(statsQuery, [id, id, id, id, id, id], (err, results) => {
      if (err) {
        console.error('Error fetching domain stats:', err);
        return res.status(500).json({ error: 'Failed to fetch domain statistics' });
      }

      res.json(results[0]);
    });
  } catch (error) {
    console.error('Error in GET /domains/:id/stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
