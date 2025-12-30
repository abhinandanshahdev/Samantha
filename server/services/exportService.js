const db = require('../config/database-mysql-compat');
const { v4: uuidv4 } = require('uuid');

/**
 * Export Service - Handles domain-based JSON exports
 * Exports complete domain data including all entities, relationships, and social features
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

// Generate a deterministic UUID for an entity (for verification during import)
const generateExportUUID = (entityType, entityId) => {
  // Use the actual ID if it's already a UUID, otherwise generate one
  if (typeof entityId === 'string' && entityId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    return entityId;
  }
  // For numeric IDs, we'll use them as-is but still provide a UUID for new entities
  return uuidv4();
};

/**
 * Get export preview with counts for selected domains
 */
async function getExportPreview(domainIds) {
  const domains = [];
  let totalEntities = 0;

  for (const domainId of domainIds) {
    // Get domain info
    const domainInfo = await queryPromise(
      'SELECT id, name, type FROM domains WHERE id = ?',
      [domainId]
    );

    if (domainInfo.length === 0) continue;

    const domain = domainInfo[0];
    const counts = {};

    // Count initiatives
    const initiativeCount = await queryPromise(
      'SELECT COUNT(*) as count FROM use_cases WHERE domain_id = ?',
      [domainId]
    );
    counts.initiatives = initiativeCount[0].count;

    // Count agents
    const agentCount = await queryPromise(
      'SELECT COUNT(*) as count FROM agents WHERE domain_id = ?',
      [domainId]
    );
    counts.agents = agentCount[0].count;

    // Count strategic pillars
    const pillarCount = await queryPromise(
      'SELECT COUNT(*) as count FROM strategic_pillars WHERE domain_id = ?',
      [domainId]
    );
    counts.strategic_pillars = pillarCount[0].count;

    // Count strategic goals (through pillars)
    const goalCount = await queryPromise(
      `SELECT COUNT(*) as count FROM strategic_goals sg
       INNER JOIN strategic_pillars sp ON sg.strategic_pillar_id = sp.id
       WHERE sp.domain_id = ?`,
      [domainId]
    );
    counts.strategic_goals = goalCount[0].count;

    // Count categories
    const categoryCount = await queryPromise(
      'SELECT COUNT(*) as count FROM categories WHERE domain_id = ?',
      [domainId]
    );
    counts.categories = categoryCount[0].count;

    // Count departments (used by domain's initiatives)
    const departmentCount = await queryPromise(
      `SELECT COUNT(DISTINCT d.id) as count FROM departments d
       INNER JOIN use_cases uc ON d.id = uc.department_id
       WHERE uc.domain_id = ?`,
      [domainId]
    );
    counts.departments = departmentCount[0].count;

    // Count agent types
    const agentTypeCount = await queryPromise(
      'SELECT COUNT(*) as count FROM agent_types WHERE domain_id = ?',
      [domainId]
    );
    counts.agent_types = agentTypeCount[0].count;

    // Count outcomes
    const outcomeCount = await queryPromise(
      'SELECT COUNT(*) as count FROM outcomes WHERE domain_id = ?',
      [domainId]
    );
    counts.outcomes = outcomeCount[0].count;

    // Count tags (used by domain's initiatives)
    const tagCount = await queryPromise(
      `SELECT COUNT(DISTINCT t.id) as count FROM tags t
       INNER JOIN use_case_tags uct ON t.id = uct.tag_id
       INNER JOIN use_cases uc ON uct.use_case_id = uc.id
       WHERE uc.domain_id = ?`,
      [domainId]
    );
    counts.tags = tagCount[0].count;

    // Count comments (for both initiatives and agents in domain)
    const commentCount = await queryPromise(
      `SELECT COUNT(*) as count FROM comments c
       LEFT JOIN use_cases uc ON c.use_case_id = uc.id
       LEFT JOIN agents a ON c.agent_id = a.id
       WHERE uc.domain_id = ? OR a.domain_id = ?`,
      [domainId, domainId]
    );
    counts.comments = commentCount[0].count;

    // Count initiative likes
    const initiativeLikeCount = await queryPromise(
      `SELECT COUNT(*) as count FROM likes l
       INNER JOIN use_cases uc ON l.use_case_id = uc.id
       WHERE uc.domain_id = ?`,
      [domainId]
    );
    counts.initiative_likes = initiativeLikeCount[0].count;

    // Count agent likes
    const agentLikeCount = await queryPromise(
      `SELECT COUNT(*) as count FROM agent_likes al
       INNER JOIN agents a ON al.agent_id = a.id
       WHERE a.domain_id = ?`,
      [domainId]
    );
    counts.agent_likes = agentLikeCount[0].count;

    // Count initiative associations (within same domain)
    const associationCount = await queryPromise(
      `SELECT COUNT(*) as count FROM use_case_associations uca
       INNER JOIN use_cases uc1 ON uca.use_case_id = uc1.id
       INNER JOIN use_cases uc2 ON uca.related_use_case_id = uc2.id
       WHERE uc1.domain_id = ? AND uc2.domain_id = ?`,
      [domainId, domainId]
    );
    counts.initiative_associations = associationCount[0].count;

    // Count goal alignments
    const alignmentCount = await queryPromise(
      `SELECT COUNT(*) as count FROM use_case_goal_alignments ucga
       INNER JOIN use_cases uc ON ucga.use_case_id = uc.id
       WHERE uc.domain_id = ?`,
      [domainId]
    );
    counts.goal_alignments = alignmentCount[0].count;

    // Count agent-initiative associations (same domain only)
    const agentInitiativeCount = await queryPromise(
      `SELECT COUNT(*) as count FROM agent_initiative_associations aia
       INNER JOIN agents a ON aia.agent_id = a.id
       INNER JOIN use_cases uc ON aia.use_case_id = uc.id
       WHERE a.domain_id = ? AND uc.domain_id = ?`,
      [domainId, domainId]
    );
    counts.agent_initiative_associations = agentInitiativeCount[0].count;

    // Calculate total for this domain
    const domainTotal = Object.values(counts).reduce((sum, count) => sum + count, 0);
    totalEntities += domainTotal;

    domains.push({
      id: domain.id,
      name: domain.name,
      type: domain.type,
      counts,
      total: domainTotal
    });
  }

  // Estimate file size (rough estimate: ~500 bytes per entity on average)
  const estimatedSizeKb = Math.round((totalEntities * 500) / 1024);

  return {
    domains,
    total_entities: totalEntities,
    estimated_size_kb: estimatedSizeKb
  };
}

/**
 * Export complete domain data to JSON
 */
async function exportDomainsToJson(domainIds, exportedByName) {
  const exportData = {
    export_metadata: {
      version: '1.0.0',
      export_date: new Date().toISOString(),
      exported_by: exportedByName,
      source_system: 'AI Use Case Repository',
      domain_count: domainIds.length,
      total_entity_count: 0
    },
    domains: []
  };

  let totalCount = 0;

  for (const domainId of domainIds) {
    const domainExport = await exportSingleDomain(domainId);
    if (domainExport) {
      exportData.domains.push(domainExport);

      // Count entities
      totalCount += 1; // domain itself
      totalCount += domainExport.categories.length;
      totalCount += domainExport.departments.length;
      totalCount += domainExport.strategic_pillars.length;
      totalCount += domainExport.strategic_goals.length;
      totalCount += domainExport.agent_types.length;
      totalCount += domainExport.outcomes.length;
      totalCount += domainExport.tags.length;
      totalCount += domainExport.initiatives.length;
      totalCount += domainExport.agents.length;
      totalCount += domainExport.initiative_goal_alignments.length;
      totalCount += domainExport.initiative_associations.length;
      totalCount += domainExport.agent_initiative_associations.length;
      totalCount += domainExport.comments.length;
      totalCount += domainExport.initiative_likes.length;
      totalCount += domainExport.agent_likes.length;
      totalCount += domainExport.initiative_tags.length;
    }
  }

  exportData.export_metadata.total_entity_count = totalCount;

  return exportData;
}

/**
 * Export a single domain with all its data
 */
async function exportSingleDomain(domainId) {
  // Get domain info
  const domainInfo = await queryPromise(
    `SELECT id, name, type, hero_message, subtitle, config_json, is_active,
            created_at, updated_at
     FROM domains WHERE id = ?`,
    [domainId]
  );

  if (domainInfo.length === 0) return null;

  const domain = domainInfo[0];

  const domainExport = {
    domain: {
      id: domain.id,
      uuid: generateExportUUID('domain', domain.id),
      name: domain.name,
      type: domain.type,
      hero_message: domain.hero_message,
      subtitle: domain.subtitle,
      config_json: domain.config_json || null,
      is_active: domain.is_active === 1,
      created_at: domain.created_at,
      updated_at: domain.updated_at
    },
    categories: [],
    departments: [],
    strategic_pillars: [],
    strategic_goals: [],
    agent_types: [],
    outcomes: [],
    tags: [],
    initiatives: [],
    agents: [],
    initiative_goal_alignments: [],
    initiative_associations: [],
    agent_initiative_associations: [],
    comments: [],
    initiative_likes: [],
    agent_likes: [],
    initiative_tags: []
  };

  // Export categories
  domainExport.categories = await exportCategories(domainId);

  // Export departments (used by domain's initiatives and agents)
  domainExport.departments = await exportDepartments(domainId);

  // Export strategic pillars
  domainExport.strategic_pillars = await exportStrategicPillars(domainId);

  // Export strategic goals
  domainExport.strategic_goals = await exportStrategicGoals(domainId);

  // Export agent types
  domainExport.agent_types = await exportAgentTypes(domainId);

  // Export outcomes
  domainExport.outcomes = await exportOutcomes(domainId);

  // Export tags (used by domain's initiatives)
  domainExport.tags = await exportTags(domainId);

  // Export initiatives
  domainExport.initiatives = await exportInitiatives(domainId);

  // Export agents
  domainExport.agents = await exportAgents(domainId);

  // Export initiative goal alignments
  domainExport.initiative_goal_alignments = await exportGoalAlignments(domainId);

  // Export initiative associations (same domain only)
  domainExport.initiative_associations = await exportInitiativeAssociations(domainId);

  // Export agent-initiative associations (same domain only)
  domainExport.agent_initiative_associations = await exportAgentInitiativeAssociations(domainId);

  // Export comments
  domainExport.comments = await exportComments(domainId);

  // Export initiative likes
  domainExport.initiative_likes = await exportInitiativeLikes(domainId);

  // Export agent likes
  domainExport.agent_likes = await exportAgentLikes(domainId);

  // Export initiative tags
  domainExport.initiative_tags = await exportInitiativeTags(domainId);

  return domainExport;
}

async function exportCategories(domainId) {
  const categories = await queryPromise(
    `SELECT id, name, description, created_date, updated_date
     FROM categories WHERE domain_id = ?
     ORDER BY name`,
    [domainId]
  );

  return categories.map(c => ({
    uuid: generateExportUUID('category', c.id),
    name: c.name,
    description: c.description,
    created_date: c.created_date,
    updated_date: c.updated_date
  }));
}

async function exportDepartments(domainId) {
  // Get departments used by initiatives or agents in this domain
  const departments = await queryPromise(
    `SELECT DISTINCT d.id, d.name, d.created_date, d.updated_date
     FROM departments d
     WHERE d.id IN (
       SELECT department_id FROM use_cases WHERE domain_id = ?
       UNION
       SELECT department_id FROM agents WHERE domain_id = ?
     )
     ORDER BY d.name`,
    [domainId, domainId]
  );

  return departments.map(d => ({
    uuid: generateExportUUID('department', d.id),
    name: d.name,
    created_date: d.created_date,
    updated_date: d.updated_date
  }));
}

async function exportStrategicPillars(domainId) {
  const pillars = await queryPromise(
    `SELECT id, name, description, display_order, created_date, updated_date
     FROM strategic_pillars WHERE domain_id = ?
     ORDER BY display_order, name`,
    [domainId]
  );

  return pillars.map(p => ({
    uuid: generateExportUUID('pillar', p.id),
    name: p.name,
    description: p.description,
    display_order: p.display_order,
    created_date: p.created_date,
    updated_date: p.updated_date
  }));
}

async function exportStrategicGoals(domainId) {
  const goals = await queryPromise(
    `SELECT sg.id, sg.title, sg.description, sp.name as strategic_pillar_name,
            sg.target_date, sg.priority, sg.status, sg.completion_percentage,
            sg.success_metrics, u.name as author_name, sg.display_order,
            sg.created_date, sg.updated_date
     FROM strategic_goals sg
     INNER JOIN strategic_pillars sp ON sg.strategic_pillar_id = sp.id
     LEFT JOIN users u ON sg.author_id = u.id
     WHERE sp.domain_id = ?
     ORDER BY sp.display_order, sg.display_order, sg.title`,
    [domainId]
  );

  return goals.map(g => ({
    uuid: g.id, // Already a UUID
    title: g.title,
    description: g.description,
    strategic_pillar_name: g.strategic_pillar_name,
    target_date: g.target_date,
    priority: g.priority,
    status: g.status,
    completion_percentage: g.completion_percentage,
    success_metrics: g.success_metrics,
    author_name: g.author_name || 'Unknown',
    display_order: g.display_order,
    created_date: g.created_date,
    updated_date: g.updated_date
  }));
}

async function exportAgentTypes(domainId) {
  const agentTypes = await queryPromise(
    `SELECT id, name, description, created_date, updated_date
     FROM agent_types WHERE domain_id = ?
     ORDER BY name`,
    [domainId]
  );

  return agentTypes.map(at => ({
    uuid: generateExportUUID('agent_type', at.id),
    name: at.name,
    description: at.description,
    created_date: at.created_date,
    updated_date: at.updated_date
  }));
}

async function exportOutcomes(domainId) {
  const outcomes = await queryPromise(
    `SELECT id, outcome_key, title, measure, progress, maturity, display_order,
            is_active, created_date, updated_date
     FROM outcomes WHERE domain_id = ?
     ORDER BY display_order, outcome_key`,
    [domainId]
  );

  return outcomes.map(o => ({
    uuid: generateExportUUID('outcome', o.id),
    outcome_key: o.outcome_key,
    title: o.title,
    measure: o.measure,
    progress: o.progress,
    maturity: o.maturity,
    display_order: o.display_order,
    is_active: o.is_active === 1,
    created_date: o.created_date,
    updated_date: o.updated_date
  }));
}

async function exportTags(domainId) {
  // Get tags used by initiatives in this domain
  const tags = await queryPromise(
    `SELECT DISTINCT t.id, t.name, t.created_date
     FROM tags t
     INNER JOIN use_case_tags uct ON t.id = uct.tag_id
     INNER JOIN use_cases uc ON uct.use_case_id = uc.id
     WHERE uc.domain_id = ?
     ORDER BY t.name`,
    [domainId]
  );

  return tags.map(t => ({
    uuid: generateExportUUID('tag', t.id),
    name: t.name,
    created_date: t.created_date
  }));
}

async function exportInitiatives(domainId) {
  const initiatives = await queryPromise(
    `SELECT uc.id, uc.title, uc.description, uc.problem_statement, uc.solution_overview,
            uc.technical_implementation, uc.results_metrics, uc.lessons_learned,
            c.name as category_name, d.name as department_name,
            uc.status, uc.kanban_pillar, uc.expected_delivery_date,
            uc.data_complexity, uc.integration_complexity, uc.intelligence_complexity,
            uc.functional_complexity, uc.strategic_impact, uc.justification,
            u.name as author_name, uc.owner_name, uc.owner_email,
            uc.data_sensitivity, uc.roadmap_link, uc.value_realisation_link,
            uc.view_count, uc.rating, uc.created_date, uc.updated_date
     FROM use_cases uc
     LEFT JOIN categories c ON uc.category_id = c.id
     LEFT JOIN departments d ON uc.department_id = d.id
     LEFT JOIN users u ON uc.author_id = u.id
     WHERE uc.domain_id = ?
     ORDER BY uc.title`,
    [domainId]
  );

  return initiatives.map(i => ({
    uuid: i.id, // Already a UUID
    title: i.title,
    description: i.description,
    problem_statement: i.problem_statement,
    solution_overview: i.solution_overview,
    technical_implementation: i.technical_implementation,
    results_metrics: i.results_metrics,
    lessons_learned: i.lessons_learned,
    category_name: i.category_name,
    department_name: i.department_name,
    status: i.status,
    kanban_pillar: i.kanban_pillar,
    expected_delivery_date: i.expected_delivery_date,
    data_complexity: i.data_complexity,
    integration_complexity: i.integration_complexity,
    intelligence_complexity: i.intelligence_complexity,
    functional_complexity: i.functional_complexity,
    strategic_impact: i.strategic_impact,
    justification: i.justification,
    author_name: i.author_name || 'Unknown',
    owner_name: i.owner_name,
    owner_email: i.owner_email,
    data_sensitivity: i.data_sensitivity,
    roadmap_link: i.roadmap_link,
    value_realisation_link: i.value_realisation_link,
    view_count: i.view_count,
    rating: i.rating,
    created_date: i.created_date,
    updated_date: i.updated_date
  }));
}

async function exportAgents(domainId) {
  const agents = await queryPromise(
    `SELECT a.id, a.title, a.description, a.problem_statement, a.solution_overview,
            a.technical_implementation, a.results_metrics, a.lessons_learned,
            at.name as agent_type_name, d.name as department_name,
            a.status, a.kanban_pillar, a.expected_delivery_date,
            a.data_complexity, a.integration_complexity, a.intelligence_complexity,
            a.functional_complexity, a.strategic_impact, a.justification,
            u.name as author_name, a.owner_name, a.owner_email,
            a.data_sensitivity, a.roadmap_link, a.value_realisation_link,
            a.created_date, a.updated_date
     FROM agents a
     LEFT JOIN agent_types at ON a.agent_type_id = at.id
     LEFT JOIN departments d ON a.department_id = d.id
     LEFT JOIN users u ON a.author_id = u.id
     WHERE a.domain_id = ?
     ORDER BY a.title`,
    [domainId]
  );

  return agents.map(a => ({
    uuid: a.id, // Already a UUID
    title: a.title,
    description: a.description,
    problem_statement: a.problem_statement,
    solution_overview: a.solution_overview,
    technical_implementation: a.technical_implementation,
    results_metrics: a.results_metrics,
    lessons_learned: a.lessons_learned,
    agent_type_name: a.agent_type_name,
    department_name: a.department_name,
    status: a.status,
    kanban_pillar: a.kanban_pillar,
    expected_delivery_date: a.expected_delivery_date,
    data_complexity: a.data_complexity,
    integration_complexity: a.integration_complexity,
    intelligence_complexity: a.intelligence_complexity,
    functional_complexity: a.functional_complexity,
    strategic_impact: a.strategic_impact,
    justification: a.justification,
    author_name: a.author_name || 'Unknown',
    owner_name: a.owner_name,
    owner_email: a.owner_email,
    data_sensitivity: a.data_sensitivity,
    roadmap_link: a.roadmap_link,
    value_realisation_link: a.value_realisation_link,
    created_date: a.created_date,
    updated_date: a.updated_date
  }));
}

async function exportGoalAlignments(domainId) {
  const alignments = await queryPromise(
    `SELECT uc.title as initiative_title, sg.title as strategic_goal_title,
            sp.name as strategic_pillar_name, ucga.alignment_strength, ucga.rationale,
            ucga.created_date
     FROM use_case_goal_alignments ucga
     INNER JOIN use_cases uc ON ucga.use_case_id = uc.id
     INNER JOIN strategic_goals sg ON ucga.strategic_goal_id = sg.id
     INNER JOIN strategic_pillars sp ON sg.strategic_pillar_id = sp.id
     WHERE uc.domain_id = ?
     ORDER BY uc.title, sg.title`,
    [domainId]
  );

  return alignments.map(a => ({
    initiative_title: a.initiative_title,
    strategic_goal_title: a.strategic_goal_title,
    strategic_pillar_name: a.strategic_pillar_name,
    alignment_strength: a.alignment_strength,
    rationale: a.rationale,
    created_date: a.created_date
  }));
}

async function exportInitiativeAssociations(domainId) {
  // Only export associations where both initiatives are in the same domain
  const associations = await queryPromise(
    `SELECT uc1.title as initiative_title, uc2.title as related_initiative_title,
            u.name as created_by_name, uca.created_date
     FROM use_case_associations uca
     INNER JOIN use_cases uc1 ON uca.use_case_id = uc1.id
     INNER JOIN use_cases uc2 ON uca.related_use_case_id = uc2.id
     LEFT JOIN users u ON uca.created_by = u.id
     WHERE uc1.domain_id = ? AND uc2.domain_id = ?
     ORDER BY uc1.title, uc2.title`,
    [domainId, domainId]
  );

  return associations.map(a => ({
    initiative_title: a.initiative_title,
    related_initiative_title: a.related_initiative_title,
    created_by_name: a.created_by_name || 'Unknown',
    created_date: a.created_date
  }));
}

async function exportAgentInitiativeAssociations(domainId) {
  // Only export associations where both agent and initiative are in the same domain
  const associations = await queryPromise(
    `SELECT a.title as agent_title, uc.title as initiative_title,
            u.name as created_by_name, aia.created_date
     FROM agent_initiative_associations aia
     INNER JOIN agents a ON aia.agent_id = a.id
     INNER JOIN use_cases uc ON aia.use_case_id = uc.id
     LEFT JOIN users u ON aia.created_by = u.id
     WHERE a.domain_id = ? AND uc.domain_id = ?
     ORDER BY a.title, uc.title`,
    [domainId, domainId]
  );

  return associations.map(a => ({
    agent_title: a.agent_title,
    initiative_title: a.initiative_title,
    created_by_name: a.created_by_name || 'Unknown',
    created_date: a.created_date
  }));
}

async function exportComments(domainId) {
  // Export comments for both initiatives and agents in this domain
  const comments = await queryPromise(
    `SELECT c.id,
            CASE WHEN c.use_case_id IS NOT NULL THEN 'initiative' ELSE 'agent' END as entity_type,
            COALESCE(uc.title, a.title) as entity_title,
            u.name as user_name, u.email as user_email,
            c.parent_comment_id, c.content, c.is_edited,
            c.created_date, c.updated_date
     FROM comments c
     LEFT JOIN use_cases uc ON c.use_case_id = uc.id
     LEFT JOIN agents a ON c.agent_id = a.id
     LEFT JOIN users u ON c.user_id = u.id
     WHERE uc.domain_id = ? OR a.domain_id = ?
     ORDER BY c.created_date`,
    [domainId, domainId]
  );

  // Create a map to track comment UUIDs for parent references
  const commentUuidMap = new Map();
  comments.forEach(c => {
    commentUuidMap.set(c.id, c.id); // Comments already have UUID ids
  });

  return comments.map(c => ({
    uuid: c.id,
    entity_type: c.entity_type,
    entity_title: c.entity_title,
    user_name: c.user_name || 'Unknown',
    user_email: c.user_email || '',
    parent_comment_uuid: c.parent_comment_id ? commentUuidMap.get(c.parent_comment_id) : null,
    content: c.content,
    is_edited: c.is_edited === 1,
    created_date: c.created_date,
    updated_date: c.updated_date
  }));
}

async function exportInitiativeLikes(domainId) {
  const likes = await queryPromise(
    `SELECT uc.title as initiative_title, u.name as user_name, u.email as user_email,
            l.created_date
     FROM likes l
     INNER JOIN use_cases uc ON l.use_case_id = uc.id
     LEFT JOIN users u ON l.user_id = u.id
     WHERE uc.domain_id = ?
     ORDER BY l.created_date`,
    [domainId]
  );

  return likes.map(l => ({
    initiative_title: l.initiative_title,
    user_name: l.user_name || 'Unknown',
    user_email: l.user_email || '',
    created_date: l.created_date
  }));
}

async function exportAgentLikes(domainId) {
  const likes = await queryPromise(
    `SELECT a.title as agent_title, u.name as user_name, u.email as user_email,
            al.created_date
     FROM agent_likes al
     INNER JOIN agents a ON al.agent_id = a.id
     LEFT JOIN users u ON al.user_id = u.id
     WHERE a.domain_id = ?
     ORDER BY al.created_date`,
    [domainId]
  );

  return likes.map(l => ({
    agent_title: l.agent_title,
    user_name: l.user_name || 'Unknown',
    user_email: l.user_email || '',
    created_date: l.created_date
  }));
}

async function exportInitiativeTags(domainId) {
  const tags = await queryPromise(
    `SELECT uc.title as initiative_title, t.name as tag_name
     FROM use_case_tags uct
     INNER JOIN use_cases uc ON uct.use_case_id = uc.id
     INNER JOIN tags t ON uct.tag_id = t.id
     WHERE uc.domain_id = ?
     ORDER BY uc.title, t.name`,
    [domainId]
  );

  return tags.map(t => ({
    initiative_title: t.initiative_title,
    tag_name: t.tag_name
  }));
}

module.exports = {
  getExportPreview,
  exportDomainsToJson
};
