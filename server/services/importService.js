const db = require('../config/database-mysql-compat');
const { v4: uuidv4 } = require('uuid');

/**
 * Import Service - Handles domain-based JSON imports
 * Supports idempotent imports with duplicate detection and skip behavior
 */

// Helper to execute a database query as a promise
const queryPromise = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.query(query, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
};

// Valid enum values
const VALID_STATUSES = ['concept', 'proof_of_concept', 'validation', 'pilot', 'production'];
const VALID_KANBAN_PILLARS = ['backlog', 'prioritised', 'in_progress', 'completed', 'blocked', 'slow_burner', 'de_prioritised', 'on_hold'];
const VALID_PRIORITIES = ['Low', 'Medium', 'High'];
const VALID_GOAL_STATUSES = ['draft', 'active', 'completed', 'cancelled'];
const VALID_COMPLEXITY_LEVELS = ['Low', 'Medium', 'High'];
const VALID_DATA_SENSITIVITY = ['Public', 'Restricted', 'Confidential', 'Secret'];

/**
 * Validate import JSON structure and content
 * Returns validation results with issues categorized by severity
 */
async function validateImportJson(jsonData, currentUser) {
  const validationResult = {
    valid: true,
    domains: [],
    total_to_import: 0,
    total_to_skip: 0,
    missing_authors: [],
    errors: [],
    warnings: []
  };

  // Validate top-level structure
  if (!jsonData || typeof jsonData !== 'object') {
    validationResult.valid = false;
    validationResult.errors.push({
      severity: 'error',
      domain: 'N/A',
      entity_type: 'file',
      entity_name: 'N/A',
      message: 'Invalid JSON structure: expected an object'
    });
    return validationResult;
  }

  if (!jsonData.export_metadata) {
    validationResult.warnings.push({
      severity: 'warning',
      domain: 'N/A',
      entity_type: 'metadata',
      entity_name: 'N/A',
      message: 'Missing export_metadata - file may not be from this system'
    });
  }

  if (!jsonData.domains || !Array.isArray(jsonData.domains)) {
    validationResult.valid = false;
    validationResult.errors.push({
      severity: 'error',
      domain: 'N/A',
      entity_type: 'file',
      entity_name: 'N/A',
      message: 'Invalid JSON structure: domains array is required'
    });
    return validationResult;
  }

  if (jsonData.domains.length === 0) {
    validationResult.valid = false;
    validationResult.errors.push({
      severity: 'error',
      domain: 'N/A',
      entity_type: 'file',
      entity_name: 'N/A',
      message: 'No domains found in import file'
    });
    return validationResult;
  }

  // Collect all author names for resolution
  const authorNames = new Set();
  const authorResolution = new Map();

  // Get all existing users for author mapping
  const existingUsers = await queryPromise('SELECT id, name, email FROM users');
  const usersByName = new Map();
  existingUsers.forEach(u => {
    usersByName.set(u.name.toLowerCase(), u);
  });

  // Validate each domain
  for (const domainData of jsonData.domains) {
    const domainValidation = await validateDomain(domainData, currentUser, usersByName, authorNames);
    validationResult.domains.push(domainValidation);

    if (domainValidation.has_errors) {
      validationResult.valid = false;
    }

    // Aggregate counts
    Object.values(domainValidation.entity_counts).forEach(count => {
      validationResult.total_to_import += count.to_import || 0;
      validationResult.total_to_skip += count.to_skip || 0;
    });
  }

  // Build missing authors list
  for (const authorName of authorNames) {
    if (!usersByName.has(authorName.toLowerCase())) {
      validationResult.missing_authors.push({
        original_name: authorName,
        mapped_to: currentUser.name
      });
    }
  }

  return validationResult;
}

/**
 * Validate a single domain's data
 */
async function validateDomain(domainData, currentUser, usersByName, authorNames) {
  const result = {
    name: domainData.domain?.name || 'Unknown',
    exists: false,
    will_skip: false,
    has_errors: false,
    entity_counts: {
      categories: { to_import: 0, to_skip: 0 },
      departments: { to_import: 0, to_skip: 0 },
      strategic_pillars: { to_import: 0, to_skip: 0 },
      strategic_goals: { to_import: 0, to_skip: 0 },
      agent_types: { to_import: 0, to_skip: 0 },
      outcomes: { to_import: 0, to_skip: 0 },
      tags: { to_import: 0, to_skip: 0 },
      initiatives: { to_import: 0, to_skip: 0 },
      agents: { to_import: 0, to_skip: 0 },
      goal_alignments: { to_import: 0, to_skip: 0 },
      initiative_associations: { to_import: 0, to_skip: 0 },
      agent_initiative_associations: { to_import: 0, to_skip: 0 },
      comments: { to_import: 0, to_skip: 0 },
      initiative_likes: { to_import: 0, to_skip: 0 },
      agent_likes: { to_import: 0, to_skip: 0 },
      initiative_tags: { to_import: 0, to_skip: 0 }
    },
    validation_issues: []
  };

  // Check if domain exists
  if (!domainData.domain || !domainData.domain.name) {
    result.has_errors = true;
    result.validation_issues.push({
      severity: 'error',
      entity_type: 'domain',
      entity_name: 'N/A',
      message: 'Domain name is required'
    });
    return result;
  }

  const existingDomain = await queryPromise(
    'SELECT id FROM domains WHERE name = ?',
    [domainData.domain.name]
  );

  // Track existing domain for merge functionality
  let existingDomainId = null;
  let existingCategories = new Set();
  let existingDepartments = new Set();
  let existingPillars = new Set();
  let existingGoals = new Set();
  let existingAgentTypes = new Set();
  let existingOutcomes = new Set();
  let existingInitiatives = new Set();
  let existingAgents = new Set();

  if (existingDomain.length > 0) {
    result.exists = true;
    result.will_skip = false; // Don't skip - we can merge new entities
    existingDomainId = existingDomain[0].id;
    result.validation_issues.push({
      severity: 'info',
      entity_type: 'domain',
      entity_name: domainData.domain.name,
      message: 'Domain already exists - new entities will be merged (existing data preserved)'
    });

    // Load existing entities to detect duplicates
    const [cats, pillars, goals, agentTypes, outcomes, initiatives, agents] = await Promise.all([
      queryPromise('SELECT name FROM categories WHERE domain_id = ?', [existingDomainId]),
      queryPromise('SELECT name FROM strategic_pillars WHERE domain_id = ?', [existingDomainId]),
      queryPromise(`SELECT sg.title FROM strategic_goals sg
                    INNER JOIN strategic_pillars sp ON sg.strategic_pillar_id = sp.id
                    WHERE sp.domain_id = ?`, [existingDomainId]),
      queryPromise('SELECT name FROM agent_types WHERE domain_id = ?', [existingDomainId]),
      queryPromise('SELECT outcome_key FROM outcomes WHERE domain_id = ?', [existingDomainId]),
      queryPromise('SELECT title FROM use_cases WHERE domain_id = ?', [existingDomainId]),
      queryPromise('SELECT title FROM agents WHERE domain_id = ?', [existingDomainId])
    ]);

    existingCategories = new Set(cats.map(c => c.name.toLowerCase()));
    existingPillars = new Set(pillars.map(p => p.name.toLowerCase()));
    existingGoals = new Set(goals.map(g => g.title.toLowerCase()));
    existingAgentTypes = new Set(agentTypes.map(at => at.name.toLowerCase()));
    existingOutcomes = new Set(outcomes.map(o => o.outcome_key.toLowerCase()));
    existingInitiatives = new Set(initiatives.map(i => i.title.toLowerCase()));
    existingAgents = new Set(agents.map(a => a.title.toLowerCase()));
  }

  // Validate reference data first (categories, departments, pillars, etc.)
  // These need to be validated before the entities that reference them

  // Collect author names from all entities
  collectAuthorNames(domainData, authorNames);

  // Validate categories
  if (domainData.categories) {
    for (const category of domainData.categories) {
      if (!category.name) {
        result.validation_issues.push({
          severity: 'error',
          entity_type: 'category',
          entity_name: 'N/A',
          message: 'Category name is required'
        });
        result.has_errors = true;
      } else if (existingCategories.has(category.name.toLowerCase())) {
        result.entity_counts.categories.to_skip++;
      } else {
        result.entity_counts.categories.to_import++;
      }
    }
  }

  // Validate departments
  if (domainData.departments) {
    for (const dept of domainData.departments) {
      if (!dept.name) {
        result.validation_issues.push({
          severity: 'error',
          entity_type: 'department',
          entity_name: 'N/A',
          message: 'Department name is required'
        });
        result.has_errors = true;
      } else {
        // Check if department already exists (global entity)
        const existing = await queryPromise('SELECT id FROM departments WHERE name = ?', [dept.name]);
        if (existing.length > 0) {
          result.entity_counts.departments.to_skip++;
        } else {
          result.entity_counts.departments.to_import++;
        }
      }
    }
  }

  // Validate strategic pillars
  const pillarNames = new Set();
  // Also add existing pillars to the reference set for goal validation
  existingPillars.forEach(p => pillarNames.add(p));
  if (domainData.strategic_pillars) {
    for (const pillar of domainData.strategic_pillars) {
      if (!pillar.name) {
        result.validation_issues.push({
          severity: 'error',
          entity_type: 'strategic_pillar',
          entity_name: 'N/A',
          message: 'Strategic pillar name is required'
        });
        result.has_errors = true;
      } else if (existingPillars.has(pillar.name.toLowerCase())) {
        pillarNames.add(pillar.name); // Still add for goal validation
        result.entity_counts.strategic_pillars.to_skip++;
        result.validation_issues.push({
          severity: 'info',
          entity_type: 'strategic_pillar',
          entity_name: pillar.name,
          message: 'Strategic pillar already exists in domain - will be skipped'
        });
      } else {
        pillarNames.add(pillar.name);
        result.entity_counts.strategic_pillars.to_import++;
      }
    }
  }

  // Validate strategic goals
  if (domainData.strategic_goals) {
    for (const goal of domainData.strategic_goals) {
      if (!goal.title) {
        result.validation_issues.push({
          severity: 'error',
          entity_type: 'strategic_goal',
          entity_name: 'N/A',
          message: 'Strategic goal title is required'
        });
        result.has_errors = true;
      } else if (!goal.strategic_pillar_name || !pillarNames.has(goal.strategic_pillar_name) && !pillarNames.has(goal.strategic_pillar_name.toLowerCase())) {
        result.validation_issues.push({
          severity: 'error',
          entity_type: 'strategic_goal',
          entity_name: goal.title,
          message: `Referenced strategic pillar '${goal.strategic_pillar_name}' not found in import or existing domain`
        });
        result.has_errors = true;
      } else if (existingGoals.has(goal.title.toLowerCase())) {
        result.entity_counts.strategic_goals.to_skip++;
        const importId = goal.id || 'none';
        result.validation_issues.push({
          severity: 'info',
          entity_type: 'strategic_goal',
          entity_name: goal.title,
          message: `Strategic goal already exists (import ID: ${importId}) - will be skipped to preserve existing data`
        });
      } else {
        if (goal.priority && !VALID_PRIORITIES.includes(goal.priority)) {
          result.validation_issues.push({
            severity: 'warning',
            entity_type: 'strategic_goal',
            entity_name: goal.title,
            message: `Invalid priority '${goal.priority}', will use 'Medium'`
          });
        }
        if (goal.status && !VALID_GOAL_STATUSES.includes(goal.status)) {
          result.validation_issues.push({
            severity: 'warning',
            entity_type: 'strategic_goal',
            entity_name: goal.title,
            message: `Invalid status '${goal.status}', will use 'active'`
          });
        }
        result.entity_counts.strategic_goals.to_import++;
      }
    }
  }

  // Validate agent types
  if (domainData.agent_types) {
    for (const agentType of domainData.agent_types) {
      if (!agentType.name) {
        result.validation_issues.push({
          severity: 'error',
          entity_type: 'agent_type',
          entity_name: 'N/A',
          message: 'Agent type name is required'
        });
        result.has_errors = true;
      } else if (existingAgentTypes.has(agentType.name.toLowerCase())) {
        result.entity_counts.agent_types.to_skip++;
      } else {
        result.entity_counts.agent_types.to_import++;
      }
    }
  }

  // Validate outcomes
  if (domainData.outcomes) {
    for (const outcome of domainData.outcomes) {
      if (!outcome.outcome_key || !outcome.title) {
        result.validation_issues.push({
          severity: 'error',
          entity_type: 'outcome',
          entity_name: outcome.outcome_key || 'N/A',
          message: 'Outcome key and title are required'
        });
        result.has_errors = true;
      } else if (existingOutcomes.has(outcome.outcome_key.toLowerCase())) {
        result.entity_counts.outcomes.to_skip++;
      } else {
        result.entity_counts.outcomes.to_import++;
      }
    }
  }

  // Validate tags
  if (domainData.tags) {
    for (const tag of domainData.tags) {
      if (!tag.name) {
        result.validation_issues.push({
          severity: 'error',
          entity_type: 'tag',
          entity_name: 'N/A',
          message: 'Tag name is required'
        });
        result.has_errors = true;
      } else {
        // Check if tag already exists (global entity)
        const existing = await queryPromise('SELECT id FROM tags WHERE name = ?', [tag.name]);
        if (existing.length > 0) {
          result.entity_counts.tags.to_skip++;
        } else {
          result.entity_counts.tags.to_import++;
        }
      }
    }
  }

  // Build reference sets for validation
  const categoryNames = new Set((domainData.categories || []).map(c => c.name).filter(Boolean));
  const departmentNames = new Set((domainData.departments || []).map(d => d.name).filter(Boolean));
  const agentTypeNames = new Set((domainData.agent_types || []).map(at => at.name).filter(Boolean));

  // Get existing departments and tags (they're global)
  const existingDepts = await queryPromise('SELECT name FROM departments');
  existingDepts.forEach(d => departmentNames.add(d.name));

  // Validate initiatives
  const initiativeTitles = new Set();
  // Add existing initiative titles for association validation
  existingInitiatives.forEach(t => initiativeTitles.add(t));
  if (domainData.initiatives) {
    for (const initiative of domainData.initiatives) {
      if (!initiative.title) {
        result.validation_issues.push({
          severity: 'error',
          entity_type: 'initiative',
          entity_name: 'N/A',
          message: 'Initiative title is required'
        });
        result.has_errors = true;
      } else if (existingInitiatives.has(initiative.title.toLowerCase())) {
        initiativeTitles.add(initiative.title); // Keep for association validation
        result.entity_counts.initiatives.to_skip++;
        // Add info message about duplicate - especially useful when ID differs
        const importId = initiative.id || 'none';
        result.validation_issues.push({
          severity: 'info',
          entity_type: 'initiative',
          entity_name: initiative.title,
          message: `Initiative already exists in domain (import ID: ${importId}) - will be skipped to preserve existing data`
        });
      } else {
        initiativeTitles.add(initiative.title);

        // Validate references
        if (initiative.category_name && !categoryNames.has(initiative.category_name)) {
          result.validation_issues.push({
            severity: 'warning',
            entity_type: 'initiative',
            entity_name: initiative.title,
            message: `Category '${initiative.category_name}' not found, will be set to null`
          });
        }

        if (initiative.department_name && !departmentNames.has(initiative.department_name)) {
          result.validation_issues.push({
            severity: 'warning',
            entity_type: 'initiative',
            entity_name: initiative.title,
            message: `Department '${initiative.department_name}' not found, will be set to null`
          });
        }

        // Validate enum values
        if (initiative.status && !VALID_STATUSES.includes(initiative.status)) {
          result.validation_issues.push({
            severity: 'warning',
            entity_type: 'initiative',
            entity_name: initiative.title,
            message: `Invalid status '${initiative.status}', will use 'concept'`
          });
        }

        if (initiative.kanban_pillar && !VALID_KANBAN_PILLARS.includes(initiative.kanban_pillar)) {
          result.validation_issues.push({
            severity: 'warning',
            entity_type: 'initiative',
            entity_name: initiative.title,
            message: `Invalid kanban_pillar '${initiative.kanban_pillar}', will be set to null`
          });
        }

        result.entity_counts.initiatives.to_import++;
      }
    }
  }

  // Validate agents
  const agentTitles = new Set();
  // Add existing agent titles for association validation
  existingAgents.forEach(t => agentTitles.add(t));
  if (domainData.agents) {
    for (const agent of domainData.agents) {
      if (!agent.title) {
        result.validation_issues.push({
          severity: 'error',
          entity_type: 'agent',
          entity_name: 'N/A',
          message: 'Agent title is required'
        });
        result.has_errors = true;
      } else if (existingAgents.has(agent.title.toLowerCase())) {
        agentTitles.add(agent.title); // Keep for association validation
        result.entity_counts.agents.to_skip++;
        // Add info message about duplicate - especially useful when ID differs
        const importId = agent.id || 'none';
        result.validation_issues.push({
          severity: 'info',
          entity_type: 'agent',
          entity_name: agent.title,
          message: `Agent already exists in domain (import ID: ${importId}) - will be skipped to preserve existing data`
        });
      } else {
        agentTitles.add(agent.title);

        // Validate references
        if (agent.agent_type_name && !agentTypeNames.has(agent.agent_type_name)) {
          result.validation_issues.push({
            severity: 'warning',
            entity_type: 'agent',
            entity_name: agent.title,
            message: `Agent type '${agent.agent_type_name}' not found, will be set to null`
          });
        }

        if (agent.department_name && !departmentNames.has(agent.department_name)) {
          result.validation_issues.push({
            severity: 'warning',
            entity_type: 'agent',
            entity_name: agent.title,
            message: `Department '${agent.department_name}' not found, will be set to null`
          });
        }

        result.entity_counts.agents.to_import++;
      }
    }
  }

  // Validate goal alignments
  const goalTitles = new Set((domainData.strategic_goals || []).map(g => g.title).filter(Boolean));
  if (domainData.initiative_goal_alignments) {
    for (const alignment of domainData.initiative_goal_alignments) {
      if (!alignment.initiative_title || !alignment.strategic_goal_title) {
        result.validation_issues.push({
          severity: 'warning',
          entity_type: 'goal_alignment',
          entity_name: 'N/A',
          message: 'Goal alignment missing initiative or goal title, will be skipped'
        });
        result.entity_counts.goal_alignments.to_skip++;
      } else if (!initiativeTitles.has(alignment.initiative_title)) {
        result.validation_issues.push({
          severity: 'warning',
          entity_type: 'goal_alignment',
          entity_name: `${alignment.initiative_title} -> ${alignment.strategic_goal_title}`,
          message: `Initiative '${alignment.initiative_title}' not found in import`
        });
        result.entity_counts.goal_alignments.to_skip++;
      } else if (!goalTitles.has(alignment.strategic_goal_title)) {
        result.validation_issues.push({
          severity: 'warning',
          entity_type: 'goal_alignment',
          entity_name: `${alignment.initiative_title} -> ${alignment.strategic_goal_title}`,
          message: `Strategic goal '${alignment.strategic_goal_title}' not found in import`
        });
        result.entity_counts.goal_alignments.to_skip++;
      } else {
        result.entity_counts.goal_alignments.to_import++;
      }
    }
  }

  // Validate initiative associations
  if (domainData.initiative_associations) {
    for (const assoc of domainData.initiative_associations) {
      if (!assoc.initiative_title || !assoc.related_initiative_title) {
        result.entity_counts.initiative_associations.to_skip++;
      } else if (!initiativeTitles.has(assoc.initiative_title) || !initiativeTitles.has(assoc.related_initiative_title)) {
        result.validation_issues.push({
          severity: 'warning',
          entity_type: 'initiative_association',
          entity_name: `${assoc.initiative_title} <-> ${assoc.related_initiative_title}`,
          message: 'One or both initiatives not found in import'
        });
        result.entity_counts.initiative_associations.to_skip++;
      } else {
        result.entity_counts.initiative_associations.to_import++;
      }
    }
  }

  // Validate agent-initiative associations
  if (domainData.agent_initiative_associations) {
    for (const assoc of domainData.agent_initiative_associations) {
      if (!assoc.agent_title || !assoc.initiative_title) {
        result.entity_counts.agent_initiative_associations.to_skip++;
      } else if (!agentTitles.has(assoc.agent_title)) {
        result.validation_issues.push({
          severity: 'warning',
          entity_type: 'agent_initiative_association',
          entity_name: `${assoc.agent_title} -> ${assoc.initiative_title}`,
          message: `Agent '${assoc.agent_title}' not found in import`
        });
        result.entity_counts.agent_initiative_associations.to_skip++;
      } else if (!initiativeTitles.has(assoc.initiative_title)) {
        result.validation_issues.push({
          severity: 'warning',
          entity_type: 'agent_initiative_association',
          entity_name: `${assoc.agent_title} -> ${assoc.initiative_title}`,
          message: `Initiative '${assoc.initiative_title}' not found in import`
        });
        result.entity_counts.agent_initiative_associations.to_skip++;
      } else {
        result.entity_counts.agent_initiative_associations.to_import++;
      }
    }
  }

  // Count other entities
  const entityTitles = new Set([...initiativeTitles, ...agentTitles]);
  if (domainData.comments) {
    for (const comment of domainData.comments) {
      if (!comment.entity_title || !entityTitles.has(comment.entity_title)) {
        result.entity_counts.comments.to_skip++;
      } else {
        result.entity_counts.comments.to_import++;
      }
    }
  }

  if (domainData.initiative_likes) {
    for (const like of domainData.initiative_likes) {
      if (!like.initiative_title || !initiativeTitles.has(like.initiative_title)) {
        result.entity_counts.initiative_likes.to_skip++;
      } else {
        result.entity_counts.initiative_likes.to_import++;
      }
    }
  }

  if (domainData.agent_likes) {
    for (const like of domainData.agent_likes) {
      if (!like.agent_title || !agentTitles.has(like.agent_title)) {
        result.entity_counts.agent_likes.to_skip++;
      } else {
        result.entity_counts.agent_likes.to_import++;
      }
    }
  }

  if (domainData.initiative_tags) {
    for (const tag of domainData.initiative_tags) {
      if (!tag.initiative_title || !initiativeTitles.has(tag.initiative_title)) {
        result.entity_counts.initiative_tags.to_skip++;
      } else {
        result.entity_counts.initiative_tags.to_import++;
      }
    }
  }

  return result;
}

/**
 * Collect author names from all entities
 */
function collectAuthorNames(domainData, authorNames) {
  if (domainData.strategic_goals) {
    domainData.strategic_goals.forEach(g => {
      if (g.author_name) authorNames.add(g.author_name);
    });
  }
  if (domainData.initiatives) {
    domainData.initiatives.forEach(i => {
      if (i.author_name) authorNames.add(i.author_name);
    });
  }
  if (domainData.agents) {
    domainData.agents.forEach(a => {
      if (a.author_name) authorNames.add(a.author_name);
    });
  }
  if (domainData.comments) {
    domainData.comments.forEach(c => {
      if (c.user_name) authorNames.add(c.user_name);
    });
  }
}

/**
 * Import domains from JSON data
 * Uses transactions per domain with rollback on failure
 */
async function importDomainsFromJson(jsonData, currentUser) {
  const results = {
    success: true,
    message: '',
    domains: [],
    errors: [],
    warnings: []
  };

  // Build user map for author resolution
  const existingUsers = await queryPromise('SELECT id, name, email FROM users');
  const usersByName = new Map();
  existingUsers.forEach(u => {
    usersByName.set(u.name.toLowerCase(), u);
  });

  for (const domainData of jsonData.domains) {
    const domainResult = await importSingleDomain(domainData, currentUser, usersByName);
    results.domains.push(domainResult);

    if (domainResult.status === 'error') {
      results.errors.push(`Domain '${domainResult.name}': ${domainResult.error}`);
    }

    // Collect warnings
    if (domainResult.warnings) {
      results.warnings.push(...domainResult.warnings.map(w => `${domainResult.name}: ${w}`));
    }
  }

  const importedCount = results.domains.filter(d => d.status === 'imported').length;
  const mergedCount = results.domains.filter(d => d.status === 'merged').length;
  const skippedCount = results.domains.filter(d => d.status === 'skipped').length;
  const errorCount = results.domains.filter(d => d.status === 'error').length;

  results.success = errorCount === 0;
  results.message = `Imported ${importedCount} domain(s), merged ${mergedCount}, skipped ${skippedCount}, errors: ${errorCount}`;

  return results;
}

/**
 * Load existing reference data for an existing domain to enable merge imports
 */
async function loadExistingReferenceData(domainId) {
  const [categories, departments, pillars, goals, agentTypes, outcomes, tags, initiatives, agents] = await Promise.all([
    queryPromise('SELECT id, name FROM categories WHERE domain_id = ?', [domainId]),
    queryPromise('SELECT id, name FROM departments WHERE domain_id = ?', [domainId]),
    queryPromise('SELECT id, name FROM strategic_pillars WHERE domain_id = ?', [domainId]),
    queryPromise(`SELECT sg.id, sg.title FROM strategic_goals sg
                  INNER JOIN strategic_pillars sp ON sg.strategic_pillar_id = sp.id
                  WHERE sp.domain_id = ?`, [domainId]),
    queryPromise('SELECT id, name FROM agent_types WHERE domain_id = ?', [domainId]),
    queryPromise('SELECT id, outcome_key FROM outcomes WHERE domain_id = ?', [domainId]),
    queryPromise('SELECT id, name FROM tags'),
    queryPromise('SELECT id, title FROM use_cases WHERE domain_id = ?', [domainId]),
    queryPromise('SELECT id, title FROM agents WHERE domain_id = ?', [domainId])
  ]);

  return {
    categoryMap: new Map(categories.map(c => [c.name.toLowerCase(), c.id])),
    departmentMap: new Map(departments.map(d => [d.name.toLowerCase(), d.id])),
    pillarMap: new Map(pillars.map(p => [p.name.toLowerCase(), p.id])),
    goalMap: new Map(goals.map(g => [g.title.toLowerCase(), g.id])),
    agentTypeMap: new Map(agentTypes.map(at => [at.name.toLowerCase(), at.id])),
    outcomeMap: new Map(outcomes.map(o => [o.outcome_key.toLowerCase(), o.id])),
    tagMap: new Map(tags.map(t => [t.name.toLowerCase(), t.id])),
    initiativeMap: new Map(initiatives.map(i => [i.title.toLowerCase(), i.id])),
    agentMap: new Map(agents.map(a => [a.title.toLowerCase(), a.id]))
  };
}

/**
 * Import a single domain with all its data (transactional)
 */
async function importSingleDomain(domainData, currentUser, usersByName) {
  const result = {
    name: domainData.domain?.name || 'Unknown',
    status: 'pending',
    entities: {
      categories: { imported: 0, skipped: 0, errors: 0 },
      departments: { imported: 0, skipped: 0, errors: 0 },
      strategic_pillars: { imported: 0, skipped: 0, errors: 0 },
      strategic_goals: { imported: 0, skipped: 0, errors: 0 },
      agent_types: { imported: 0, skipped: 0, errors: 0 },
      outcomes: { imported: 0, skipped: 0, errors: 0 },
      tags: { imported: 0, skipped: 0, errors: 0 },
      initiatives: { imported: 0, skipped: 0, errors: 0 },
      agents: { imported: 0, skipped: 0, errors: 0 },
      goal_alignments: { imported: 0, skipped: 0, errors: 0 },
      initiative_associations: { imported: 0, skipped: 0, errors: 0 },
      agent_initiative_associations: { imported: 0, skipped: 0, errors: 0 },
      comments: { imported: 0, skipped: 0, errors: 0 },
      initiative_likes: { imported: 0, skipped: 0, errors: 0 },
      agent_likes: { imported: 0, skipped: 0, errors: 0 },
      initiative_tags: { imported: 0, skipped: 0, errors: 0 }
    },
    warnings: [],
    error: null
  };

  // Check if domain already exists
  const existingDomain = await queryPromise(
    'SELECT id FROM domains WHERE name = ?',
    [domainData.domain.name]
  );

  const isExistingDomain = existingDomain.length > 0;
  let domainId;

  // Maps for resolving references
  let categoryMap = new Map(); // name -> id
  let departmentMap = new Map(); // name -> id
  let pillarMap = new Map(); // name -> id
  let goalMap = new Map(); // title -> id
  let agentTypeMap = new Map(); // name -> id
  let outcomeMap = new Map(); // outcome_key -> id
  let tagMap = new Map(); // name -> id
  let initiativeMap = new Map(); // title -> id
  let agentMap = new Map(); // title -> id
  const commentUuidMap = new Map(); // old uuid -> new id

  if (isExistingDomain) {
    domainId = existingDomain[0].id;
    result.warnings.push('Domain already exists - merging new entities (existing data preserved)');

    // Load existing reference data
    const existingData = await loadExistingReferenceData(domainId);
    categoryMap = existingData.categoryMap;
    departmentMap = existingData.departmentMap;
    pillarMap = existingData.pillarMap;
    goalMap = existingData.goalMap;
    agentTypeMap = existingData.agentTypeMap;
    outcomeMap = existingData.outcomeMap;
    tagMap = existingData.tagMap;
    initiativeMap = existingData.initiativeMap;
    agentMap = existingData.agentMap;
  }

  // Start transaction
  await queryPromise('START TRANSACTION');

  try {
    // 1. Create domain (only if new)
    if (!isExistingDomain) {
      domainId = await importDomain(domainData.domain);
    }

    // 2. Import categories (check for duplicates)
    if (domainData.categories) {
      for (const category of domainData.categories) {
        try {
          const existingId = categoryMap.get(category.name.toLowerCase());
          if (existingId) {
            result.entities.categories.skipped++;
          } else {
            const id = await importCategory(category, domainId);
            categoryMap.set(category.name.toLowerCase(), id);
            result.entities.categories.imported++;
          }
        } catch (err) {
          result.entities.categories.errors++;
          result.warnings.push(`Category '${category.name}': ${err.message}`);
        }
      }
    }

    // 3. Import departments (domain-specific, check for duplicates)
    if (domainData.departments) {
      for (const dept of domainData.departments) {
        try {
          const existingId = departmentMap.get(dept.name.toLowerCase());
          if (existingId) {
            result.entities.departments.skipped++;
          } else {
            const id = await importDepartment(dept, domainId);
            departmentMap.set(dept.name.toLowerCase(), id);
            result.entities.departments.imported++;
          }
        } catch (err) {
          result.entities.departments.errors++;
          result.warnings.push(`Department '${dept.name}': ${err.message}`);
        }
      }
    }

    // 4. Import strategic pillars (check for duplicates)
    if (domainData.strategic_pillars) {
      for (const pillar of domainData.strategic_pillars) {
        try {
          const existingId = pillarMap.get(pillar.name.toLowerCase());
          if (existingId) {
            result.entities.strategic_pillars.skipped++;
          } else {
            const id = await importStrategicPillar(pillar, domainId);
            pillarMap.set(pillar.name.toLowerCase(), id);
            result.entities.strategic_pillars.imported++;
          }
        } catch (err) {
          result.entities.strategic_pillars.errors++;
          result.warnings.push(`Strategic pillar '${pillar.name}': ${err.message}`);
        }
      }
    }

    // 5. Import agent types (check for duplicates)
    if (domainData.agent_types) {
      for (const agentType of domainData.agent_types) {
        try {
          const existingId = agentTypeMap.get(agentType.name.toLowerCase());
          if (existingId) {
            result.entities.agent_types.skipped++;
          } else {
            const id = await importAgentType(agentType, domainId);
            agentTypeMap.set(agentType.name.toLowerCase(), id);
            result.entities.agent_types.imported++;
          }
        } catch (err) {
          result.entities.agent_types.errors++;
          result.warnings.push(`Agent type '${agentType.name}': ${err.message}`);
        }
      }
    }

    // 6. Import outcomes (check for duplicates)
    if (domainData.outcomes) {
      for (const outcome of domainData.outcomes) {
        try {
          const existingId = outcomeMap.get(outcome.outcome_key.toLowerCase());
          if (existingId) {
            result.entities.outcomes.skipped++;
          } else {
            await importOutcome(outcome, domainId);
            outcomeMap.set(outcome.outcome_key.toLowerCase(), true);
            result.entities.outcomes.imported++;
          }
        } catch (err) {
          result.entities.outcomes.errors++;
          result.warnings.push(`Outcome '${outcome.outcome_key}': ${err.message}`);
        }
      }
    }

    // 7. Import tags (global, check for duplicates)
    if (domainData.tags) {
      for (const tag of domainData.tags) {
        try {
          const existingId = tagMap.get(tag.name.toLowerCase());
          if (existingId) {
            result.entities.tags.skipped++;
          } else {
            const id = await importTag(tag);
            tagMap.set(tag.name.toLowerCase(), id);
            result.entities.tags.imported++;
          }
        } catch (err) {
          result.entities.tags.errors++;
          result.warnings.push(`Tag '${tag.name}': ${err.message}`);
        }
      }
    }

    // 8. Import strategic goals (check for duplicates)
    if (domainData.strategic_goals) {
      for (const goal of domainData.strategic_goals) {
        try {
          // Check if goal already exists
          const existingId = goalMap.get(goal.title.toLowerCase());
          if (existingId) {
            result.entities.strategic_goals.skipped++;
            continue;
          }

          // Find pillar (check both original case and lowercase)
          let pillarId = pillarMap.get(goal.strategic_pillar_name.toLowerCase());
          if (!pillarId) {
            result.entities.strategic_goals.errors++;
            result.warnings.push(`Strategic goal '${goal.title}': pillar '${goal.strategic_pillar_name}' not found`);
            continue;
          }
          const authorId = resolveAuthorId(goal.author_name, currentUser.id, usersByName);
          const id = await importStrategicGoal(goal, pillarId, authorId);
          goalMap.set(goal.title.toLowerCase(), id);
          result.entities.strategic_goals.imported++;
        } catch (err) {
          result.entities.strategic_goals.errors++;
          result.warnings.push(`Strategic goal '${goal.title}': ${err.message}`);
        }
      }
    }

    // 9. Import initiatives (check for duplicates)
    if (domainData.initiatives) {
      for (const initiative of domainData.initiatives) {
        try {
          // Check if initiative already exists
          const existingId = initiativeMap.get(initiative.title.toLowerCase());
          if (existingId) {
            result.entities.initiatives.skipped++;
            continue;
          }

          const categoryId = initiative.category_name ? categoryMap.get(initiative.category_name.toLowerCase()) || null : null;
          const departmentId = initiative.department_name ? departmentMap.get(initiative.department_name.toLowerCase()) || null : null;
          const authorId = resolveAuthorId(initiative.author_name, currentUser.id, usersByName);
          const id = await importInitiative(initiative, domainId, categoryId, departmentId, authorId);
          initiativeMap.set(initiative.title.toLowerCase(), id);
          result.entities.initiatives.imported++;
        } catch (err) {
          result.entities.initiatives.errors++;
          result.warnings.push(`Initiative '${initiative.title}': ${err.message}`);
        }
      }
    }

    // 10. Import agents (check for duplicates)
    if (domainData.agents) {
      for (const agent of domainData.agents) {
        try {
          // Check if agent already exists
          const existingId = agentMap.get(agent.title.toLowerCase());
          if (existingId) {
            result.entities.agents.skipped++;
            continue;
          }

          const agentTypeId = agent.agent_type_name ? agentTypeMap.get(agent.agent_type_name.toLowerCase()) || null : null;
          const departmentId = agent.department_name ? departmentMap.get(agent.department_name.toLowerCase()) || null : null;
          const authorId = resolveAuthorId(agent.author_name, currentUser.id, usersByName);
          const id = await importAgent(agent, domainId, agentTypeId, departmentId, authorId);
          agentMap.set(agent.title.toLowerCase(), id);
          result.entities.agents.imported++;
        } catch (err) {
          result.entities.agents.errors++;
          result.warnings.push(`Agent '${agent.title}': ${err.message}`);
        }
      }
    }

    // 11. Import goal alignments
    if (domainData.initiative_goal_alignments) {
      for (const alignment of domainData.initiative_goal_alignments) {
        try {
          const initiativeId = initiativeMap.get(alignment.initiative_title.toLowerCase());
          const goalId = goalMap.get(alignment.strategic_goal_title.toLowerCase());
          if (!initiativeId || !goalId) {
            result.entities.goal_alignments.skipped++;
            continue;
          }
          await importGoalAlignment(alignment, initiativeId, goalId);
          result.entities.goal_alignments.imported++;
        } catch (err) {
          if (err.code === 'ER_DUP_ENTRY') {
            result.entities.goal_alignments.skipped++;
          } else {
            result.entities.goal_alignments.errors++;
          }
        }
      }
    }

    // 12. Import initiative associations
    if (domainData.initiative_associations) {
      for (const assoc of domainData.initiative_associations) {
        try {
          const initiativeId = initiativeMap.get(assoc.initiative_title.toLowerCase());
          const relatedId = initiativeMap.get(assoc.related_initiative_title.toLowerCase());
          if (!initiativeId || !relatedId) {
            result.entities.initiative_associations.skipped++;
            continue;
          }
          const createdById = resolveAuthorId(assoc.created_by_name, currentUser.id, usersByName);
          await importInitiativeAssociation(initiativeId, relatedId, createdById);
          result.entities.initiative_associations.imported++;
        } catch (err) {
          if (err.code === 'ER_DUP_ENTRY') {
            result.entities.initiative_associations.skipped++;
          } else {
            result.entities.initiative_associations.errors++;
          }
        }
      }
    }

    // 13. Import agent-initiative associations
    if (domainData.agent_initiative_associations) {
      for (const assoc of domainData.agent_initiative_associations) {
        try {
          const agentId = agentMap.get(assoc.agent_title.toLowerCase());
          const initiativeId = initiativeMap.get(assoc.initiative_title.toLowerCase());
          if (!agentId || !initiativeId) {
            result.entities.agent_initiative_associations.skipped++;
            continue;
          }
          const createdById = resolveAuthorId(assoc.created_by_name, currentUser.id, usersByName);
          await importAgentInitiativeAssociation(agentId, initiativeId, createdById);
          result.entities.agent_initiative_associations.imported++;
        } catch (err) {
          if (err.code === 'ER_DUP_ENTRY') {
            result.entities.agent_initiative_associations.skipped++;
          } else {
            result.entities.agent_initiative_associations.errors++;
          }
        }
      }
    }

    // 14. Import comments (need to handle threading)
    if (domainData.comments) {
      // First pass: import comments without parents
      const commentsWithParents = [];
      for (const comment of domainData.comments) {
        try {
          let entityId;
          if (comment.entity_type === 'initiative') {
            entityId = initiativeMap.get(comment.entity_title.toLowerCase());
          } else {
            entityId = agentMap.get(comment.entity_title.toLowerCase());
          }
          if (!entityId) {
            result.entities.comments.skipped++;
            continue;
          }

          const userId = resolveAuthorId(comment.user_name, currentUser.id, usersByName);

          if (comment.parent_comment_uuid) {
            commentsWithParents.push({ comment, entityId, userId });
          } else {
            const newId = await importComment(comment, entityId, userId, null);
            commentUuidMap.set(comment.uuid, newId);
            result.entities.comments.imported++;
          }
        } catch (err) {
          result.entities.comments.errors++;
        }
      }

      // Second pass: import comments with parents
      for (const { comment, entityId, userId } of commentsWithParents) {
        try {
          const parentId = commentUuidMap.get(comment.parent_comment_uuid) || null;
          const newId = await importComment(comment, entityId, userId, parentId);
          commentUuidMap.set(comment.uuid, newId);
          result.entities.comments.imported++;
        } catch (err) {
          result.entities.comments.errors++;
        }
      }
    }

    // 15. Import initiative likes
    if (domainData.initiative_likes) {
      for (const like of domainData.initiative_likes) {
        try {
          const initiativeId = initiativeMap.get(like.initiative_title.toLowerCase());
          if (!initiativeId) {
            result.entities.initiative_likes.skipped++;
            continue;
          }
          const userId = resolveAuthorId(like.user_name, currentUser.id, usersByName);
          await importInitiativeLike(initiativeId, userId);
          result.entities.initiative_likes.imported++;
        } catch (err) {
          if (err.code === 'ER_DUP_ENTRY') {
            result.entities.initiative_likes.skipped++;
          } else {
            result.entities.initiative_likes.errors++;
          }
        }
      }
    }

    // 16. Import agent likes
    if (domainData.agent_likes) {
      for (const like of domainData.agent_likes) {
        try {
          const agentId = agentMap.get(like.agent_title.toLowerCase());
          if (!agentId) {
            result.entities.agent_likes.skipped++;
            continue;
          }
          const userId = resolveAuthorId(like.user_name, currentUser.id, usersByName);
          await importAgentLike(agentId, userId);
          result.entities.agent_likes.imported++;
        } catch (err) {
          if (err.code === 'ER_DUP_ENTRY') {
            result.entities.agent_likes.skipped++;
          } else {
            result.entities.agent_likes.errors++;
          }
        }
      }
    }

    // 17. Import initiative tags
    if (domainData.initiative_tags) {
      for (const it of domainData.initiative_tags) {
        try {
          const initiativeId = initiativeMap.get(it.initiative_title.toLowerCase());
          const tagId = tagMap.get(it.tag_name.toLowerCase());
          if (!initiativeId || !tagId) {
            result.entities.initiative_tags.skipped++;
            continue;
          }
          await importInitiativeTag(initiativeId, tagId);
          result.entities.initiative_tags.imported++;
        } catch (err) {
          if (err.code === 'ER_DUP_ENTRY') {
            result.entities.initiative_tags.skipped++;
          } else {
            result.entities.initiative_tags.errors++;
          }
        }
      }
    }

    // Commit transaction
    await queryPromise('COMMIT');

    // Determine status based on whether this was a new domain or merge
    if (isExistingDomain) {
      const totalImported = Object.values(result.entities).reduce((sum, e) => sum + e.imported, 0);
      result.status = totalImported > 0 ? 'merged' : 'skipped';
      if (result.status === 'skipped') {
        result.warnings.push('All entities already exist - nothing new to import');
      }
    } else {
      result.status = 'imported';
    }

  } catch (error) {
    // Rollback on error
    await queryPromise('ROLLBACK');
    result.status = 'error';
    result.error = error.message;
  }

  return result;
}

// Helper function to resolve author ID from name
function resolveAuthorId(authorName, defaultUserId, usersByName) {
  if (!authorName) return defaultUserId;
  const user = usersByName.get(authorName.toLowerCase());
  return user ? user.id : defaultUserId;
}

// Import helper functions
async function importDomain(domainData) {
  const id = await queryPromise(
    `INSERT INTO domains (name, type, hero_message, subtitle, config_json, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      domainData.name,
      domainData.type || 'custom',
      domainData.hero_message,
      domainData.subtitle,
      domainData.config_json ? JSON.stringify(domainData.config_json) : null,
      domainData.is_active !== false
    ]
  );
  return id.insertId;
}

async function importCategory(category, domainId) {
  const result = await queryPromise(
    `INSERT INTO categories (domain_id, name, description, created_date, updated_date)
     VALUES (?, ?, ?, NOW(), NOW())`,
    [domainId, category.name, category.description]
  );
  return result.insertId;
}

async function importDepartment(dept, domainId) {
  const id = uuidv4();
  await queryPromise(
    `INSERT INTO departments (id, domain_id, name, created_date, updated_date)
     VALUES (?, ?, ?, NOW(), NOW())`,
    [id, domainId, dept.name]
  );
  return id;
}

async function importStrategicPillar(pillar, domainId) {
  const result = await queryPromise(
    `INSERT INTO strategic_pillars (domain_id, name, description, display_order, created_date, updated_date)
     VALUES (?, ?, ?, ?, NOW(), NOW())`,
    [domainId, pillar.name, pillar.description, pillar.display_order || 0]
  );
  return result.insertId;
}

async function importAgentType(agentType, domainId) {
  const result = await queryPromise(
    `INSERT INTO agent_types (domain_id, name, description, created_date, updated_date)
     VALUES (?, ?, ?, NOW(), NOW())`,
    [domainId, agentType.name, agentType.description]
  );
  return result.insertId;
}

async function importOutcome(outcome, domainId) {
  await queryPromise(
    `INSERT INTO outcomes (domain_id, outcome_key, title, measure, progress, maturity, display_order, is_active, created_date, updated_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      domainId,
      outcome.outcome_key,
      outcome.title,
      outcome.measure,
      outcome.progress || 0,
      outcome.maturity,
      outcome.display_order || 0,
      outcome.is_active !== false
    ]
  );
}

async function importTag(tag) {
  const result = await queryPromise(
    `INSERT INTO tags (name, created_date)
     VALUES (?, NOW())`,
    [tag.name]
  );
  return result.insertId;
}

async function importStrategicGoal(goal, pillarId, authorId) {
  const id = uuidv4();
  await queryPromise(
    `INSERT INTO strategic_goals (id, title, description, strategic_pillar_id, target_date, priority, status, completion_percentage, success_metrics, author_id, display_order, created_date, updated_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      id,
      goal.title,
      goal.description,
      pillarId,
      goal.target_date,
      VALID_PRIORITIES.includes(goal.priority) ? goal.priority : 'Medium',
      VALID_GOAL_STATUSES.includes(goal.status) ? goal.status : 'active',
      goal.completion_percentage || 0,
      goal.success_metrics,
      authorId,
      goal.display_order || 0
    ]
  );
  return id;
}

async function importInitiative(initiative, domainId, categoryId, departmentId, authorId) {
  const id = uuidv4();
  await queryPromise(
    `INSERT INTO use_cases (id, domain_id, title, description, problem_statement, solution_overview, technical_implementation, results_metrics, lessons_learned, category_id, department_id, status, kanban_pillar, expected_delivery_date, data_complexity, integration_complexity, intelligence_complexity, functional_complexity, strategic_impact, justification, author_id, owner_name, owner_email, data_sensitivity, roadmap_link, value_realisation_link, view_count, rating, created_date, updated_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      id,
      domainId,
      initiative.title,
      initiative.description,
      initiative.problem_statement,
      initiative.solution_overview,
      initiative.technical_implementation,
      initiative.results_metrics,
      initiative.lessons_learned,
      categoryId,
      departmentId,
      VALID_STATUSES.includes(initiative.status) ? initiative.status : 'concept',
      VALID_KANBAN_PILLARS.includes(initiative.kanban_pillar) ? initiative.kanban_pillar : null,
      initiative.expected_delivery_date,
      VALID_COMPLEXITY_LEVELS.includes(initiative.data_complexity) ? initiative.data_complexity : 'Low',
      VALID_COMPLEXITY_LEVELS.includes(initiative.integration_complexity) ? initiative.integration_complexity : 'Low',
      VALID_COMPLEXITY_LEVELS.includes(initiative.intelligence_complexity) ? initiative.intelligence_complexity : 'Low',
      VALID_COMPLEXITY_LEVELS.includes(initiative.functional_complexity) ? initiative.functional_complexity : 'Low',
      VALID_COMPLEXITY_LEVELS.includes(initiative.strategic_impact) ? initiative.strategic_impact : 'Low',
      initiative.justification,
      authorId,
      initiative.owner_name,
      initiative.owner_email,
      VALID_DATA_SENSITIVITY.includes(initiative.data_sensitivity) ? initiative.data_sensitivity : null,
      initiative.roadmap_link,
      initiative.value_realisation_link,
      initiative.view_count || 0,
      initiative.rating || 0
    ]
  );
  return id;
}

async function importAgent(agent, domainId, agentTypeId, departmentId, authorId) {
  const id = uuidv4();
  await queryPromise(
    `INSERT INTO agents (id, domain_id, title, description, problem_statement, solution_overview, technical_implementation, results_metrics, lessons_learned, agent_type_id, department_id, status, kanban_pillar, expected_delivery_date, data_complexity, integration_complexity, intelligence_complexity, functional_complexity, strategic_impact, justification, author_id, owner_name, owner_email, data_sensitivity, roadmap_link, value_realisation_link, created_date, updated_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      id,
      domainId,
      agent.title,
      agent.description,
      agent.problem_statement,
      agent.solution_overview,
      agent.technical_implementation,
      agent.results_metrics,
      agent.lessons_learned,
      agentTypeId,
      departmentId,
      VALID_STATUSES.includes(agent.status) ? agent.status : 'concept',
      VALID_KANBAN_PILLARS.includes(agent.kanban_pillar) ? agent.kanban_pillar : null,
      agent.expected_delivery_date,
      VALID_COMPLEXITY_LEVELS.includes(agent.data_complexity) ? agent.data_complexity : 'Low',
      VALID_COMPLEXITY_LEVELS.includes(agent.integration_complexity) ? agent.integration_complexity : 'Low',
      VALID_COMPLEXITY_LEVELS.includes(agent.intelligence_complexity) ? agent.intelligence_complexity : 'Low',
      VALID_COMPLEXITY_LEVELS.includes(agent.functional_complexity) ? agent.functional_complexity : 'Low',
      VALID_COMPLEXITY_LEVELS.includes(agent.strategic_impact) ? agent.strategic_impact : 'Low',
      agent.justification,
      authorId,
      agent.owner_name,
      agent.owner_email,
      VALID_DATA_SENSITIVITY.includes(agent.data_sensitivity) ? agent.data_sensitivity : null,
      agent.roadmap_link,
      agent.value_realisation_link
    ]
  );
  return id;
}

async function importGoalAlignment(alignment, initiativeId, goalId) {
  await queryPromise(
    `INSERT INTO use_case_goal_alignments (use_case_id, strategic_goal_id, alignment_strength, rationale, created_date)
     VALUES (?, ?, ?, ?, NOW())`,
    [
      initiativeId,
      goalId,
      alignment.alignment_strength || 'Medium',
      alignment.rationale
    ]
  );
}

async function importInitiativeAssociation(initiativeId, relatedId, createdById) {
  await queryPromise(
    `INSERT INTO use_case_associations (use_case_id, related_use_case_id, created_by, created_date)
     VALUES (?, ?, ?, NOW())`,
    [initiativeId, relatedId, createdById]
  );
}

async function importAgentInitiativeAssociation(agentId, initiativeId, createdById) {
  await queryPromise(
    `INSERT INTO agent_initiative_associations (agent_id, use_case_id, created_by, created_date)
     VALUES (?, ?, ?, NOW())`,
    [agentId, initiativeId, createdById]
  );
}

async function importComment(comment, entityId, userId, parentId) {
  const id = uuidv4();
  const isInitiative = comment.entity_type === 'initiative';
  await queryPromise(
    `INSERT INTO comments (id, use_case_id, agent_id, user_id, parent_comment_id, content, is_edited, created_date, updated_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      id,
      isInitiative ? entityId : null,
      isInitiative ? null : entityId,
      userId,
      parentId,
      comment.content,
      comment.is_edited ? 1 : 0
    ]
  );
  return id;
}

async function importInitiativeLike(initiativeId, userId) {
  await queryPromise(
    `INSERT INTO likes (use_case_id, user_id, created_date)
     VALUES (?, ?, NOW())`,
    [initiativeId, userId]
  );
}

async function importAgentLike(agentId, userId) {
  await queryPromise(
    `INSERT INTO agent_likes (agent_id, user_id, created_date)
     VALUES (?, ?, NOW())`,
    [agentId, userId]
  );
}

async function importInitiativeTag(initiativeId, tagId) {
  await queryPromise(
    `INSERT INTO use_case_tags (use_case_id, tag_id)
     VALUES (?, ?)`,
    [initiativeId, tagId]
  );
}

module.exports = {
  validateImportJson,
  importDomainsFromJson
};
