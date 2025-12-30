const db = require('../config/database-mysql-compat');
const OpenAI = require('openai');

// Helper to mask API key for logging
const maskApiKey = (key) => {
  if (!key) return 'NO_KEY';
  if (key.length <= 4) return 'KEY_TOO_SHORT';
  return `...${key.slice(-4)}`;
};

// Initialize COMPASS OpenAI client
// COMPASS endpoint structure: https://api.core42.ai/openai/deployments/{deployment-id}/chat/completions
const compassEndpoint = process.env.COMPASS_OPENAI_ENDPOINT || '';
// Remove /chat/completions if present, as OpenAI SDK adds it automatically
const baseURL = compassEndpoint.replace(/\/chat\/completions$/, '');

const azureOpenAI = new OpenAI({
  apiKey: process.env.COMPASS_OPENAI_API_KEY,
  baseURL: baseURL,
  defaultQuery: { 'api-version': process.env.COMPASS_OPENAI_API_VERSION },
  defaultHeaders: {
    'api-key': process.env.COMPASS_OPENAI_API_KEY,
  },
});

// Log COMPASS OpenAI configuration (masked)
console.log('🔧 COMPASS OpenAI Configuration:', {
  endpoint: compassEndpoint || 'NOT_SET',
  baseURL: baseURL,
  deployment: process.env.COMPASS_OPENAI_DEPLOYMENT_NAME || 'NOT_SET',
  apiVersion: process.env.COMPASS_OPENAI_API_VERSION || 'NOT_SET',
  apiKey: maskApiKey(process.env.COMPASS_OPENAI_API_KEY)
});

// Function definitions for OpenAI function calling
const AVAILABLE_FUNCTIONS = {
  get_use_cases_by_criteria: {
    name: "get_use_cases_by_criteria",
    description: "Get use cases filtered by various criteria like department, status, strategic impact, kanban status, and delivery date",
    parameters: {
      type: "object",
      properties: {
        department: { type: "string", description: "Filter by department name" },
        status: { type: "string", enum: ["concept", "proof_of_concept", "validation", "pilot", "production"], description: "Filter by development stage" },
        strategic_impact: { type: "string", enum: ["Low", "Medium", "High"], description: "Filter by strategic impact level" },
        kanban_pillar: { type: "string", enum: ["backlog", "prioritised", "in_progress", "completed", "blocked", "slow_burner", "de_prioritised", "on_hold"], description: "Filter by kanban/delivery status" },
        expected_delivery_date: { type: "string", description: "Filter by expected delivery date (format: MMM YYYY, e.g., 'Jan 2025')" },
        has_delivery_date: { type: "boolean", description: "Filter by whether initiative has a delivery date set. true = has date (scheduled/planned), false = no date (unplanned)" },
        limit: { type: "number", description: "Maximum number of results to return (default 10)" }
      },
      additionalProperties: false
    }
  },
  
  get_strategic_goals_by_pillar: {
    name: "get_strategic_goals_by_pillar",
    description: "Get strategic goals aligned to a specific strategic pillar",
    parameters: {
      type: "object",
      properties: {
        pillar_name: { type: "string", description: "Strategic pillar name" }
      },
      additionalProperties: false
    }
  },
  
  get_strategic_pillars: {
    name: "get_strategic_pillars",
    description: "Get all strategic pillars",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },

  get_use_cases_by_goal: {
    name: "get_use_cases_by_goal",
    description: "Get AI initiatives/use cases that are aligned to a specific strategic goal",
    parameters: {
      type: "object",
      properties: {
        goal_id: { type: "string", description: "The ID of the strategic goal" },
        goal_title: { type: "string", description: "The title/name of the strategic goal (alternative to goal_id)" },
        limit: { type: "number", description: "Maximum number of results to return (default 50)" }
      },
      additionalProperties: false
    }
  },
  
  get_use_case_statistics: {
    name: "get_use_case_statistics",
    description: "Get real-time statistics about use cases, departments, goals, etc.",
    parameters: {
      type: "object",
      properties: {
        group_by: { 
          type: "string", 
          enum: ["department", "status", "strategic_impact", "pillar", "kanban_pillar"],
          description: "How to group the statistics" 
        }
      },
      additionalProperties: false
    }
  },
  
  search_use_cases: {
    name: "search_use_cases",
    description: "Search for use cases by name, title, or description containing specific keywords",
    parameters: {
      type: "object",
      properties: {
        search_term: { type: "string", description: "The term to search for in use case titles and descriptions" },
        limit: { type: "number", description: "Maximum number of results to return (default 10)" }
      },
      required: ["search_term"],
      additionalProperties: false
    }
  },
  
  get_use_case_details: {
    name: "get_use_case_details",
    description: "Get detailed information about a specific use case including full description, technical details, complexity, status, and all user comments/discussion. Use this when user asks for details, updates, or what people are saying about an initiative.",
    parameters: {
      type: "object",
      properties: {
        use_case_id: { type: "string", description: "ID of the use case" },
        use_case_title: { type: "string", description: "Title or name of the use case (alternative to ID)" }
      },
      additionalProperties: false
    }
  },
  
  get_executive_brief: {
    name: "get_executive_brief",
    description: "Get executive summary of recent activity and changes in the organization",
    parameters: {
      type: "object",
      properties: {
        days: { type: "number", description: "Number of days to look back (default 7)" }
      },
      additionalProperties: false
    }
  },

  get_variance_report: {
    name: "get_variance_report",
    description: "Get variance/comparison report for initiatives and agents over a time period. Shows current vs previous period counts, daily trends, and breakdown by department/status/impact/category/kanban. Use this for portfolio analytics, trend analysis, or comparing activity across time periods.",
    parameters: {
      type: "object",
      properties: {
        days: { type: "number", enum: [7, 14, 30, 90], description: "Number of days for the analysis period (default 7). Compares this period vs the previous equivalent period." },
        breakdown: {
          type: "string",
          enum: ["department", "status", "impact", "category", "kanban"],
          description: "How to break down the data (default: department). 'department' groups by department, 'status' by development stage, 'impact' by strategic impact level, 'category' by initiative category/agent type, 'kanban' by kanban pillar status."
        }
      },
      additionalProperties: false
    }
  },

  ask_user_clarification: {
    name: "ask_user_clarification",
    description: "Ask the user for clarification when their query is ambiguous or needs more context",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "The clarifying question to ask the user" },
        context: { type: "string", description: "Brief context explaining why clarification is needed" }
      },
      required: ["question"],
      additionalProperties: false
    }
  },

  get_domain_metadata: {
    name: "get_domain_metadata",
    description: "Get all metadata for the current domain including departments, categories, agent types, tags, sensitivity levels, and strategic pillars. Use this to understand what filter values are available.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },

  search_agents: {
    name: "search_agents",
    description: "Search for AI agents by name, title, or description containing specific keywords",
    parameters: {
      type: "object",
      properties: {
        search_term: { type: "string", description: "The term to search for in agent titles and descriptions" },
        limit: { type: "number", description: "Maximum number of results to return (default 10)" }
      },
      required: ["search_term"],
      additionalProperties: false
    }
  },

  get_agents_by_criteria: {
    name: "get_agents_by_criteria",
    description: "Get AI agents filtered by various criteria like agent type, department, status, strategic impact, kanban status, and data sensitivity",
    parameters: {
      type: "object",
      properties: {
        agent_type: { type: "string", description: "Filter by agent type name" },
        department: { type: "string", description: "Filter by department name" },
        status: { type: "string", enum: ["concept", "proof_of_concept", "validation", "pilot", "production"], description: "Filter by development stage" },
        strategic_impact: { type: "string", enum: ["Low", "Medium", "High"], description: "Filter by strategic impact level" },
        kanban_pillar: { type: "string", enum: ["backlog", "prioritised", "in_progress", "completed", "blocked", "slow_burner", "de_prioritised", "on_hold"], description: "Filter by kanban/delivery status" },
        data_sensitivity: { type: "string", description: "Filter by data sensitivity level" },
        limit: { type: "number", description: "Maximum number of results to return (default 10)" }
      },
      additionalProperties: false
    }
  },

  get_agents_by_initiative: {
    name: "get_agents_by_initiative",
    description: "Get AI agents associated with a specific initiative or use case by searching for the initiative name",
    parameters: {
      type: "object",
      properties: {
        initiative_name: { type: "string", description: "The name of the initiative or use case to find associated agents for" },
        limit: { type: "number", description: "Maximum number of agents to return (default 10)" }
      },
      required: ["initiative_name"],
      additionalProperties: false
    }
  },

  get_agent_statistics: {
    name: "get_agent_statistics",
    description: "Get statistics about AI agents, grouped by status, agent type, department, strategic impact, or kanban status",
    parameters: {
      type: "object",
      properties: {
        group_by: {
          type: "string",
          enum: ["status", "agent_type", "department", "strategic_impact", "kanban_pillar"],
          description: "How to group the statistics (default: status)"
        }
      },
      additionalProperties: false
    }
  },

  get_agent_details: {
    name: "get_agent_details",
    description: "Get detailed information about a specific AI agent including full description, technical details, and linked initiatives",
    parameters: {
      type: "object",
      properties: {
        agent_id: { type: "string", description: "ID of the agent" },
        agent_title: { type: "string", description: "Title or name of the agent (alternative to ID)" }
      },
      additionalProperties: false
    }
  },

  get_use_cases_by_tag: {
    name: "get_use_cases_by_tag",
    description: "Get use cases/initiatives that have a specific tag (e.g., vendor names like Accenture, technology tags, etc.)",
    parameters: {
      type: "object",
      properties: {
        tag_name: { type: "string", description: "The tag name to filter by (e.g., 'Accenture', 'NLP', 'Computer Vision')" },
        limit: { type: "number", description: "Maximum number of results to return (default 20)" }
      },
      required: ["tag_name"],
      additionalProperties: false
    }
  }
};

// Function implementations
const FUNCTION_IMPLEMENTATIONS = {
  get_use_cases_by_criteria: async (params, domainId) => {
    console.log('📊 Backend: Getting use cases by criteria:', params, 'Domain:', domainId);

    let whereClause = 'WHERE 1=1';
    const queryParams = [];

    if (domainId) {
      whereClause += ' AND uc.domain_id = ?';
      queryParams.push(domainId);
    }
    if (params.department) {
      whereClause += ' AND d.name = ?';
      queryParams.push(params.department);
    }
    if (params.status) {
      whereClause += ' AND uc.status = ?';
      queryParams.push(params.status);
    }
    if (params.strategic_impact) {
      whereClause += ' AND uc.strategic_impact = ?';
      queryParams.push(params.strategic_impact);
    }
    if (params.kanban_pillar) {
      whereClause += ' AND uc.kanban_pillar = ?';
      queryParams.push(params.kanban_pillar);
    }
    if (params.expected_delivery_date) {
      // Convert "MMM YYYY" format to DATE format "YYYY-MM-01"
      // e.g., "Jan 2026" -> "2026-01-01"
      const monthMap = {
        'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
        'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
        'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
      };

      const parts = params.expected_delivery_date.split(' ');
      if (parts.length === 2) {
        const monthAbbr = parts[0];
        const year = parts[1];
        const monthNum = monthMap[monthAbbr];

        if (monthNum) {
          const dateValue = `${year}-${monthNum}-01`;
          whereClause += ' AND uc.expected_delivery_date = ?';
          queryParams.push(dateValue);
          console.log(`📅 Converted "${params.expected_delivery_date}" to "${dateValue}"`);
        } else {
          console.warn(`⚠️ Unknown month abbreviation: ${monthAbbr}`);
        }
      } else {
        console.warn(`⚠️ Invalid date format: ${params.expected_delivery_date}`);
      }
    }
    if (params.has_delivery_date !== undefined) {
      if (params.has_delivery_date === true) {
        whereClause += ' AND uc.expected_delivery_date IS NOT NULL';
        console.log(`📅 Filtering for initiatives WITH delivery date`);
      } else {
        whereClause += ' AND uc.expected_delivery_date IS NULL';
        console.log(`📅 Filtering for initiatives WITHOUT delivery date (unplanned)`);
      }
    }

    const limit = params.limit || 10;
    const useCaseQuery = `
      SELECT
        uc.id,
        uc.title,
        uc.description,
        uc.status,
        uc.strategic_impact,
        uc.kanban_pillar,
        uc.expected_delivery_date,
        d.name as department,
        u.name as author_name,
        uc.created_date
      FROM use_cases uc
      LEFT JOIN departments d ON uc.department_id = d.id
      LEFT JOIN users u ON uc.author_id = u.id
      ${whereClause}
      ORDER BY uc.created_date DESC
      LIMIT ?
    `;

    queryParams.push(limit);

    const results = await new Promise((resolve, reject) => {
      db.query(useCaseQuery, queryParams, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    console.log(`✅ Backend: Found ${results.length} use cases`);
    return results;
  },
  
  get_strategic_goals_by_pillar: async (params, domainId) => {
    console.log('🎯 Backend: Getting strategic goals by pillar:', params, 'Domain:', domainId);

    // First get pillars filtered by domain
    let pillarQuery = 'SELECT * FROM strategic_pillars';
    const pillarParams = [];

    if (domainId) {
      pillarQuery += ' WHERE domain_id = ?';
      pillarParams.push(domainId);
    }

    pillarQuery += ' ORDER BY name';

    const pillars = await new Promise((resolve, reject) => {
      db.query(pillarQuery, pillarParams, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    const pillar = pillars.find(p =>
      p.name.toLowerCase().includes(params.pillar_name.toLowerCase())
    );

    if (!pillar) {
      console.log('❌ Backend: Pillar not found');
      return { error: "Pillar not found" };
    }

    const goals = await new Promise((resolve, reject) => {
      db.query('SELECT * FROM strategic_goals WHERE strategic_pillar_id = ? ORDER BY priority, title', [pillar.id], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    const results = goals.map(g => ({
      id: g.id,
      title: g.title,
      description: g.description,
      strategic_pillar_name: pillar.name,
      priority: g.priority,
      status: g.status,
      target_date: g.target_date
    }));

    console.log(`✅ Backend: Found ${results.length} goals for pillar ${pillar.name}`);
    return results;
  },
  
  get_strategic_pillars: async (params, domainId) => {
    console.log('🏛️ Backend: Getting strategic pillars for domain:', domainId);

    let query = 'SELECT * FROM strategic_pillars';
    const queryParams = [];

    if (domainId) {
      query += ' WHERE domain_id = ?';
      queryParams.push(domainId);
    }

    query += ' ORDER BY name';

    const pillars = await new Promise((resolve, reject) => {
      db.query(query, queryParams, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    const results = pillars.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description
    }));

    console.log(`✅ Backend: Found ${results.length} strategic pillars`);
    return results;
  },

  get_use_cases_by_goal: async (params, domainId) => {
    console.log('🎯 Backend: Getting use cases by strategic goal:', params, 'Domain:', domainId);

    let goalId = params.goal_id;

    // If goal_title provided, look up the goal ID
    if (!goalId && params.goal_title) {
      const goals = await new Promise((resolve, reject) => {
        db.query(
          'SELECT id FROM strategic_goals WHERE title LIKE ?',
          [`%${params.goal_title}%`],
          (err, results) => {
            if (err) reject(err);
            else resolve(results);
          }
        );
      });
      if (goals.length > 0) {
        goalId = goals[0].id;
      } else {
        console.log(`⚠️ No goal found matching title: ${params.goal_title}`);
        return [];
      }
    }

    if (!goalId) {
      console.log('⚠️ No goal_id or goal_title provided');
      return [];
    }

    const limit = params.limit || 50;

    // Query use cases aligned to this goal
    let useCaseQuery = `
      SELECT DISTINCT
        uc.id,
        uc.title,
        uc.description,
        uc.status,
        uc.strategic_impact,
        uc.kanban_pillar,
        uc.expected_delivery_date,
        d.name as department,
        u.name as author_name,
        uc.created_date
      FROM use_cases uc
      INNER JOIN use_case_goal_alignments ucga ON uc.id = ucga.use_case_id
      LEFT JOIN departments d ON uc.department_id = d.id
      LEFT JOIN users u ON uc.author_id = u.id
      WHERE ucga.strategic_goal_id = ?`;

    const useCaseParams = [goalId];

    if (domainId) {
      useCaseQuery += ' AND uc.domain_id = ?';
      useCaseParams.push(domainId);
    }

    useCaseQuery += ' ORDER BY uc.created_date DESC LIMIT ?';
    useCaseParams.push(limit);

    const useCases = await new Promise((resolve, reject) => {
      db.query(useCaseQuery, useCaseParams, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    const results = useCases.map(uc => ({
      id: uc.id,
      title: uc.title,
      description: uc.description,
      status: uc.status,
      strategic_impact: uc.strategic_impact,
      kanban_pillar: uc.kanban_pillar,
      expected_delivery_date: uc.expected_delivery_date,
      department: uc.department,
      author_name: uc.author_name,
      created_date: uc.created_date
    }));

    console.log(`✅ Backend: Found ${results.length} use cases for goal ID ${goalId}`);
    return results;
  },
  
  get_use_case_statistics: async (params, domainId) => {
    console.log('📈 Backend: Getting use case statistics:', params, 'Domain:', domainId);

    // Get use cases with department names for proper grouping
    let useCaseQuery = `
      SELECT uc.*, d.name as department_name
      FROM use_cases uc
      LEFT JOIN departments d ON uc.department_id = d.id`;

    const queryParams = [];
    if (domainId) {
      useCaseQuery += ' WHERE uc.domain_id = ?';
      queryParams.push(domainId);
    }

    useCaseQuery += ' ORDER BY uc.created_date DESC';

    const useCases = await new Promise((resolve, reject) => {
      db.query(useCaseQuery, queryParams, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    // Get strategic goals through pillars filtered by domain
    let pillarQuery = 'SELECT id FROM strategic_pillars';
    const pillarParams = [];
    if (domainId) {
      pillarQuery += ' WHERE domain_id = ?';
      pillarParams.push(domainId);
    }

    const pillars = await new Promise((resolve, reject) => {
      db.query(pillarQuery, pillarParams, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    const pillarIds = pillars.map(p => p.id);
    let goalsQuery = 'SELECT * FROM strategic_goals';
    const goalsParams = [];

    if (pillarIds.length > 0) {
      goalsQuery += ` WHERE strategic_pillar_id IN (${pillarIds.map(() => '?').join(',')})`;
      goalsParams.push(...pillarIds);
    }

    goalsQuery += ' ORDER BY title';

    const goals = await new Promise((resolve, reject) => {
      db.query(goalsQuery, goalsParams, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    
    const stats = {
      total_use_cases: useCases.length,
      total_strategic_goals: goals.length,
      total_strategic_pillars: pillars.length
    };
    
    if (params.group_by === 'department') {
      const deptCounts = useCases.reduce((acc, uc) => {
        const deptName = uc.department_name || 'Unassigned';
        acc[deptName] = (acc[deptName] || 0) + 1;
        return acc;
      }, {});
      stats.by_department = deptCounts;
    }
    
    if (params.group_by === 'status') {
      const statusCounts = useCases.reduce((acc, uc) => {
        acc[uc.status] = (acc[uc.status] || 0) + 1;
        return acc;
      }, {});
      stats.by_status = statusCounts;
    }
    
    if (params.group_by === 'strategic_impact') {
      const impactCounts = useCases.reduce((acc, uc) => {
        acc[uc.strategic_impact] = (acc[uc.strategic_impact] || 0) + 1;
        return acc;
      }, {});
      stats.by_strategic_impact = impactCounts;
    }
    
    if (params.group_by === 'pillar' || params.group_by === 'kanban_pillar') {
      const pillarCounts = useCases.reduce((acc, uc) => {
        const pillar = uc.kanban_pillar || 'unspecified';
        acc[pillar] = (acc[pillar] || 0) + 1;
        return acc;
      }, {});
      stats.by_kanban_pillar = pillarCounts;
    }
    
    console.log(`✅ Backend: Generated statistics`);
    return stats;
  },
  
  search_use_cases: async (params, domainId) => {
    console.log('🔍 Backend: Searching use cases:', params, 'Domain:', domainId);

    const searchTerm = params.search_term.toLowerCase();
    const limit = params.limit || 10;

    // Get all use cases with search
    let searchQuery = `
      SELECT
        uc.id,
        uc.title,
        uc.description,
        uc.problem_statement,
        uc.solution_overview,
        uc.status,
        uc.strategic_impact,
        d.name as department,
        u.name as author_name,
        uc.created_date
      FROM use_cases uc
      LEFT JOIN departments d ON uc.department_id = d.id
      LEFT JOIN users u ON uc.author_id = u.id
      WHERE (LOWER(uc.title) LIKE ?
         OR LOWER(uc.description) LIKE ?
         OR LOWER(uc.problem_statement) LIKE ?
         OR LOWER(uc.solution_overview) LIKE ?)`;

    const searchParams = [
      `%${searchTerm}%`,
      `%${searchTerm}%`,
      `%${searchTerm}%`,
      `%${searchTerm}%`
    ];

    if (domainId) {
      searchQuery += ' AND uc.domain_id = ?';
      searchParams.push(domainId);
    }

    searchQuery += `
      ORDER BY
        CASE
          WHEN LOWER(uc.title) LIKE ? THEN 1
          WHEN LOWER(uc.description) LIKE ? THEN 2
          ELSE 3
        END,
        uc.created_date DESC
      LIMIT ?`;

    searchParams.push(`%${searchTerm}%`, `%${searchTerm}%`, limit);

    const useCases = await new Promise((resolve, reject) => {
      db.query(searchQuery, searchParams, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    const results = useCases.map(uc => ({
      id: uc.id,
      title: uc.title,
      description: uc.description,
      department: uc.department,
      status: uc.status,
      strategic_impact: uc.strategic_impact,
      author_name: uc.author_name,
      created_date: uc.created_date
    }));

    console.log(`✅ Backend: Found ${results.length} matching use cases for "${searchTerm}"`);
    return results;
  },
  
  get_use_case_details: async (params, domainId) => {
    console.log('🔎 Backend: Getting use case details:', params, 'Domain:', domainId);

    let useCase;

    if (params.use_case_id) {
      let detailQuery = `
        SELECT
          uc.id,
          uc.title,
          uc.description,
          uc.problem_statement,
          uc.solution_overview,
          uc.technical_implementation,
          uc.results_metrics,
          uc.status,
          uc.strategic_impact,
          uc.data_complexity,
          uc.integration_complexity,
          uc.intelligence_complexity,
          uc.functional_complexity,
          d.name as department,
          u.name as author_name,
          uc.created_date,
          uc.updated_date
        FROM use_cases uc
        LEFT JOIN departments d ON uc.department_id = d.id
        LEFT JOIN users u ON uc.author_id = u.id
        WHERE uc.id = ?`;

      const detailParams = [params.use_case_id];
      if (domainId) {
        detailQuery += ' AND uc.domain_id = ?';
        detailParams.push(domainId);
      }

      const results = await new Promise((resolve, reject) => {
        db.query(detailQuery, detailParams, (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      });
      useCase = results[0];
    } else if (params.use_case_title) {
      let detailQuery = `
        SELECT
          uc.id,
          uc.title,
          uc.description,
          uc.problem_statement,
          uc.solution_overview,
          uc.technical_implementation,
          uc.results_metrics,
          uc.status,
          uc.strategic_impact,
          uc.data_complexity,
          uc.integration_complexity,
          uc.intelligence_complexity,
          uc.functional_complexity,
          d.name as department,
          u.name as author_name,
          uc.created_date,
          uc.updated_date
        FROM use_cases uc
        LEFT JOIN departments d ON uc.department_id = d.id
        LEFT JOIN users u ON uc.author_id = u.id
        WHERE LOWER(uc.title) LIKE ?`;

      const detailParams = [`%${params.use_case_title.toLowerCase()}%`];
      if (domainId) {
        detailQuery += ' AND uc.domain_id = ?';
        detailParams.push(domainId);
      }

      detailQuery += ' LIMIT 1';

      const results = await new Promise((resolve, reject) => {
        db.query(detailQuery, detailParams, (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      });
      useCase = results[0];
    }

    if (!useCase) {
      console.log('❌ Backend: Use case not found');
      return { error: "Use case not found" };
    }

    // Fetch comments for this use case
    const commentsQuery = `
      SELECT
        c.content,
        c.created_date,
        c.is_edited,
        c.parent_comment_id,
        u.name as user_name,
        u.email as user_email
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.use_case_id = ?
      ORDER BY c.created_date ASC
    `;

    const comments = await new Promise((resolve, reject) => {
      db.query(commentsQuery, [useCase.id], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    console.log(`✅ Backend: Found use case: ${useCase.title} with ${comments.length} comments`);
    return {
      id: useCase.id,
      title: useCase.title,
      description: useCase.description,
      problem_statement: useCase.problem_statement,
      solution_overview: useCase.solution_overview,
      department: useCase.department,
      status: useCase.status,
      strategic_impact: useCase.strategic_impact,
      complexity: {
        data: useCase.data_complexity,
        integration: useCase.integration_complexity,
        intelligence: useCase.intelligence_complexity,
        functional: useCase.functional_complexity
      },
      author_name: useCase.author_name,
      created_date: useCase.created_date,
      updated_date: useCase.updated_date,
      technical_implementation: useCase.technical_implementation,
      results_metrics: useCase.results_metrics,
      comments: comments.map(c => ({
        content: c.content,
        user_name: c.user_name,
        user_email: c.user_email,
        created_date: c.created_date,
        is_edited: !!c.is_edited,
        parent_comment_id: c.parent_comment_id
      }))
    };
  },

  get_executive_brief: async (params, domainId) => {
    console.log('📋 Backend: Getting executive brief:', params, 'Domain:', domainId);

    const daysBack = params.days || 7;

    // Build domain filter clause
    let domainFilter = '';
    const domainParams = [];
    if (domainId) {
      domainFilter = ' AND uc.domain_id = ?';
      domainParams.push(domainId);
    }

    // Get recent use case changes (created and updated)
    const recentUseCases = await new Promise((resolve, reject) => {
      db.query(`
        SELECT
          'use_case' as item_type,
          'created' as action_type,
          uc.id,
          uc.title,
          uc.status,
          uc.strategic_impact,
          d.name as department,
          u.name as author_name,
          uc.created_date as action_date
        FROM use_cases uc
        LEFT JOIN departments d ON uc.department_id = d.id
        LEFT JOIN users u ON uc.author_id = u.id
        WHERE uc.created_date >= DATE_SUB(NOW(), INTERVAL ? DAY)${domainFilter}

        UNION ALL

        SELECT
          'use_case' as item_type,
          'updated' as action_type,
          uc.id,
          uc.title,
          uc.status,
          uc.strategic_impact,
          d.name as department,
          u.name as author_name,
          uc.updated_date as action_date
        FROM use_cases uc
        LEFT JOIN departments d ON uc.department_id = d.id
        LEFT JOIN users u ON uc.author_id = u.id
        WHERE uc.updated_date >= DATE_SUB(NOW(), INTERVAL ? DAY)
          AND uc.updated_date > uc.created_date${domainFilter}

        ORDER BY action_date DESC
      `, [daysBack, ...domainParams, daysBack, ...domainParams], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    // Get department activity summary
    let deptQuery = `
      SELECT
        d.name as department,
        COUNT(CASE WHEN uc.created_date >= DATE_SUB(NOW(), INTERVAL ? DAY) THEN 1 END) as new_use_cases,
        COUNT(CASE WHEN uc.updated_date >= DATE_SUB(NOW(), INTERVAL ? DAY) AND uc.updated_date > uc.created_date THEN 1 END) as updated_use_cases
      FROM departments d
      LEFT JOIN use_cases uc ON d.id = uc.department_id`;

    const deptQueryParams = [daysBack, daysBack];

    if (domainId) {
      deptQuery += ' WHERE uc.domain_id = ? OR uc.domain_id IS NULL';
      deptQueryParams.push(domainId);
    }

    deptQuery += `
      GROUP BY d.id, d.name
      HAVING new_use_cases > 0 OR updated_use_cases > 0
      ORDER BY (new_use_cases + updated_use_cases) DESC`;

    const departmentActivity = await new Promise((resolve, reject) => {
      db.query(deptQuery, deptQueryParams, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    // Get total active use cases
    let activeCountQuery = `
      SELECT COUNT(*) as count
      FROM use_cases
      WHERE status IN ('concept', 'proof_of_concept', 'validation', 'pilot', 'production')`;

    const activeCountParams = [];
    if (domainId) {
      activeCountQuery += ' AND domain_id = ?';
      activeCountParams.push(domainId);
    }

    const activeCount = await new Promise((resolve, reject) => {
      db.query(activeCountQuery, activeCountParams, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    // Get initiative status breakdown
    let statusBreakdownQuery = `
      SELECT status, COUNT(*) as count
      FROM use_cases
      WHERE 1=1`;
    const statusParams = [];
    if (domainId) {
      statusBreakdownQuery += ' AND domain_id = ?';
      statusParams.push(domainId);
    }
    statusBreakdownQuery += ' GROUP BY status';

    const initiativeStatusBreakdown = await new Promise((resolve, reject) => {
      db.query(statusBreakdownQuery, statusParams, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    // Get agent statistics
    let agentCountQuery = `SELECT COUNT(*) as count FROM agents WHERE 1=1`;
    const agentParams = [];
    if (domainId) {
      agentCountQuery += ' AND domain_id = ?';
      agentParams.push(domainId);
    }

    const totalAgents = await new Promise((resolve, reject) => {
      db.query(agentCountQuery, agentParams, (err, results) => {
        if (err) reject(err);
        else resolve(results[0].count);
      });
    });

    // Get agent status breakdown
    let agentStatusQuery = `
      SELECT status, COUNT(*) as count
      FROM agents
      WHERE 1=1`;
    if (domainId) {
      agentStatusQuery += ' AND domain_id = ?';
    }
    agentStatusQuery += ' GROUP BY status';

    const agentStatusBreakdown = await new Promise((resolve, reject) => {
      db.query(agentStatusQuery, domainId ? [domainId] : [], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    // Get agent type breakdown
    let agentTypeQuery = `
      SELECT at.name as agent_type, COUNT(*) as count
      FROM agents a
      LEFT JOIN agent_types at ON a.agent_type_id = at.id
      WHERE 1=1`;
    if (domainId) {
      agentTypeQuery += ' AND a.domain_id = ?';
    }
    agentTypeQuery += ' GROUP BY at.name';

    const agentTypeBreakdown = await new Promise((resolve, reject) => {
      db.query(agentTypeQuery, domainId ? [domainId] : [], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    // Get blocked and overdue counts
    let blockedQuery = `
      SELECT
        (SELECT COUNT(*) FROM use_cases WHERE kanban_pillar = 'blocked'${domainId ? ' AND domain_id = ?' : ''}) as blocked_initiatives,
        (SELECT COUNT(*) FROM agents WHERE kanban_pillar = 'blocked'${domainId ? ' AND domain_id = ?' : ''}) as blocked_agents
    `;
    const blockedParams = domainId ? [domainId, domainId] : [];

    const blockedCounts = await new Promise((resolve, reject) => {
      db.query(blockedQuery, blockedParams, (err, results) => {
        if (err) reject(err);
        else resolve(results[0]);
      });
    });

    // Convert status breakdowns to objects
    const initiativesByStatus = {};
    initiativeStatusBreakdown.forEach(row => {
      initiativesByStatus[row.status] = row.count;
    });

    const agentsByStatus = {};
    agentStatusBreakdown.forEach(row => {
      agentsByStatus[row.status] = row.count;
    });

    const agentsByType = {};
    agentTypeBreakdown.forEach(row => {
      if (row.agent_type) {
        agentsByType[row.agent_type] = row.count;
      }
    });

    // Construct executive summary
    const summary = {
      period: `Last ${daysBack} days`,
      portfolio_overview: {
        total_initiatives: activeCount[0].count,
        total_agents: totalAgents,
        initiatives_by_status: initiativesByStatus,
        agents_by_status: agentsByStatus,
        agents_by_type: agentsByType
      },
      activity_summary: {
        total_changes: recentUseCases.length,
        new_initiatives: recentUseCases.filter(uc => uc.action_type === 'created').length,
        updated_initiatives: recentUseCases.filter(uc => uc.action_type === 'updated').length,
        total_active_initiatives: activeCount[0].count
      },
      production_summary: {
        initiatives_in_production: initiativesByStatus.production || 0,
        agents_in_production: agentsByStatus.production || 0
      },
      health_indicators: {
        blocked_initiatives: blockedCounts.blocked_initiatives || 0,
        blocked_agents: blockedCounts.blocked_agents || 0,
        high_impact_count: recentUseCases.filter(uc => uc.strategic_impact === 'High').length
      },
      recent_initiatives: recentUseCases
        .filter(uc => uc.action_type === 'created')
        .slice(0, 5)
        .map(uc => ({
          id: uc.id,
          title: uc.title,
          department: uc.department,
          status: uc.status,
          strategic_impact: uc.strategic_impact,
          created_date: uc.action_date
        })),
      status_changes: recentUseCases
        .filter(uc => uc.action_type === 'updated')
        .slice(0, 5)
        .map(uc => ({
          id: uc.id,
          title: uc.title,
          department: uc.department,
          new_status: uc.status,
          updated_date: uc.action_date
        })),
      department_activity: departmentActivity.map(da => ({
        department: da.department,
        new_initiatives: da.new_use_cases,
        updated_initiatives: da.updated_use_cases,
        total_activity: da.new_use_cases + da.updated_use_cases
      })),
      highlights: {
        most_active_departments: departmentActivity.slice(0, 3).map(d => d.department),
        high_impact_count: recentUseCases.filter(uc => uc.strategic_impact === 'High').length,
        production_count: (initiativesByStatus.production || 0) + (agentsByStatus.production || 0)
      }
    };

    console.log(`✅ Backend: Generated executive brief for ${daysBack} days with ${summary.activity_summary.total_changes} total changes`);
    return summary;
  },

  get_variance_report: async (params, domainId) => {
    console.log('📊 Backend: Getting variance report:', params, 'Domain:', domainId);

    if (!domainId) {
      return { error: 'Domain ID is required for variance report' };
    }

    const days = params.days || 7;
    const breakdown = params.breakdown || 'department';

    // Calculate date ranges
    const now = new Date();
    const currentEnd = new Date(now);
    const currentStart = new Date(now);
    currentStart.setDate(currentStart.getDate() - days);
    const previousEnd = new Date(currentStart);
    previousEnd.setDate(previousEnd.getDate() - 1);
    const previousStart = new Date(previousEnd);
    previousStart.setDate(previousStart.getDate() - days);

    const formatDate = (d) => d.toISOString().split('T')[0];
    const currentStartStr = formatDate(currentStart);
    const currentEndStr = formatDate(currentEnd);
    const previousStartStr = formatDate(previousStart);
    const previousEndStr = formatDate(previousEnd);

    // Get summary counts
    const summaryQuery = `
      SELECT
        (SELECT COUNT(*) FROM use_cases WHERE domain_id = ? AND DATE(created_date) BETWEEN ? AND ?) as initiatives_current,
        (SELECT COUNT(*) FROM use_cases WHERE domain_id = ? AND DATE(created_date) BETWEEN ? AND ?) as initiatives_previous,
        (SELECT COUNT(*) FROM agents WHERE domain_id = ? AND DATE(created_date) BETWEEN ? AND ?) as agents_current,
        (SELECT COUNT(*) FROM agents WHERE domain_id = ? AND DATE(created_date) BETWEEN ? AND ?) as agents_previous
    `;

    const summaryParams = [
      domainId, currentStartStr, currentEndStr,
      domainId, previousStartStr, previousEndStr,
      domainId, currentStartStr, currentEndStr,
      domainId, previousStartStr, previousEndStr
    ];

    const summaryResults = await new Promise((resolve, reject) => {
      db.query(summaryQuery, summaryParams, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    // Get daily breakdown for trend chart
    const dailyQuery = `
      SELECT
        DATE(created_date) as date,
        'initiative' as type,
        COUNT(*) as count
      FROM use_cases
      WHERE domain_id = ? AND DATE(created_date) BETWEEN ? AND ?
      GROUP BY DATE(created_date)
      UNION ALL
      SELECT
        DATE(created_date) as date,
        'agent' as type,
        COUNT(*) as count
      FROM agents
      WHERE domain_id = ? AND DATE(created_date) BETWEEN ? AND ?
      GROUP BY DATE(created_date)
      ORDER BY date ASC
    `;

    const dailyParams = [
      domainId, currentStartStr, currentEndStr,
      domainId, currentStartStr, currentEndStr
    ];

    const dailyResults = await new Promise((resolve, reject) => {
      db.query(dailyQuery, dailyParams, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    // Build breakdown query based on breakdown type
    let breakdownQuery;
    let breakdownParams;

    switch (breakdown) {
      case 'department':
        breakdownQuery = `
          SELECT
            d.name as name,
            COALESCE(uc_current.count, 0) as initiatives_current,
            COALESCE(uc_previous.count, 0) as initiatives_previous,
            COALESCE(ag_current.count, 0) as agents_current,
            COALESCE(ag_previous.count, 0) as agents_previous
          FROM departments d
          LEFT JOIN (
            SELECT department_id, COUNT(*) as count
            FROM use_cases
            WHERE domain_id = ? AND DATE(created_date) BETWEEN ? AND ?
            GROUP BY department_id
          ) uc_current ON d.id = uc_current.department_id
          LEFT JOIN (
            SELECT department_id, COUNT(*) as count
            FROM use_cases
            WHERE domain_id = ? AND DATE(created_date) BETWEEN ? AND ?
            GROUP BY department_id
          ) uc_previous ON d.id = uc_previous.department_id
          LEFT JOIN (
            SELECT department_id, COUNT(*) as count
            FROM agents
            WHERE domain_id = ? AND DATE(created_date) BETWEEN ? AND ?
            GROUP BY department_id
          ) ag_current ON d.id = ag_current.department_id
          LEFT JOIN (
            SELECT department_id, COUNT(*) as count
            FROM agents
            WHERE domain_id = ? AND DATE(created_date) BETWEEN ? AND ?
            GROUP BY department_id
          ) ag_previous ON d.id = ag_previous.department_id
          WHERE d.domain_id = ?
          HAVING initiatives_current > 0 OR initiatives_previous > 0 OR agents_current > 0 OR agents_previous > 0
          ORDER BY (initiatives_current + agents_current) DESC
        `;
        breakdownParams = [
          domainId, currentStartStr, currentEndStr,
          domainId, previousStartStr, previousEndStr,
          domainId, currentStartStr, currentEndStr,
          domainId, previousStartStr, previousEndStr,
          domainId
        ];
        break;

      case 'status':
        breakdownQuery = `
          SELECT
            status as name,
            (SELECT COUNT(*) FROM use_cases WHERE domain_id = ? AND status = s.status AND DATE(created_date) BETWEEN ? AND ?) as initiatives_current,
            (SELECT COUNT(*) FROM use_cases WHERE domain_id = ? AND status = s.status AND DATE(created_date) BETWEEN ? AND ?) as initiatives_previous,
            (SELECT COUNT(*) FROM agents WHERE domain_id = ? AND status = s.status AND DATE(created_date) BETWEEN ? AND ?) as agents_current,
            (SELECT COUNT(*) FROM agents WHERE domain_id = ? AND status = s.status AND DATE(created_date) BETWEEN ? AND ?) as agents_previous
          FROM (
            SELECT DISTINCT status FROM use_cases WHERE domain_id = ?
            UNION
            SELECT DISTINCT status FROM agents WHERE domain_id = ?
          ) s
          ORDER BY FIELD(status, 'production', 'pilot', 'validation', 'proof_of_concept', 'concept')
        `;
        breakdownParams = [
          domainId, currentStartStr, currentEndStr,
          domainId, previousStartStr, previousEndStr,
          domainId, currentStartStr, currentEndStr,
          domainId, previousStartStr, previousEndStr,
          domainId, domainId
        ];
        break;

      case 'impact':
        breakdownQuery = `
          SELECT
            impact as name,
            (SELECT COUNT(*) FROM use_cases WHERE domain_id = ? AND strategic_impact = i.impact AND DATE(created_date) BETWEEN ? AND ?) as initiatives_current,
            (SELECT COUNT(*) FROM use_cases WHERE domain_id = ? AND strategic_impact = i.impact AND DATE(created_date) BETWEEN ? AND ?) as initiatives_previous,
            (SELECT COUNT(*) FROM agents WHERE domain_id = ? AND strategic_impact = i.impact AND DATE(created_date) BETWEEN ? AND ?) as agents_current,
            (SELECT COUNT(*) FROM agents WHERE domain_id = ? AND strategic_impact = i.impact AND DATE(created_date) BETWEEN ? AND ?) as agents_previous
          FROM (
            SELECT 'High' as impact UNION SELECT 'Medium' UNION SELECT 'Low'
          ) i
          ORDER BY FIELD(impact, 'High', 'Medium', 'Low')
        `;
        breakdownParams = [
          domainId, currentStartStr, currentEndStr,
          domainId, previousStartStr, previousEndStr,
          domainId, currentStartStr, currentEndStr,
          domainId, previousStartStr, previousEndStr
        ];
        break;

      case 'category':
        breakdownQuery = `
          SELECT
            COALESCE(c.name, at.name) as name,
            'category' as breakdown_type,
            COALESCE(uc_current.count, 0) as initiatives_current,
            COALESCE(uc_previous.count, 0) as initiatives_previous,
            0 as agents_current,
            0 as agents_previous
          FROM categories c
          LEFT JOIN (
            SELECT category_id, COUNT(*) as count
            FROM use_cases
            WHERE domain_id = ? AND DATE(created_date) BETWEEN ? AND ?
            GROUP BY category_id
          ) uc_current ON c.id = uc_current.category_id
          LEFT JOIN (
            SELECT category_id, COUNT(*) as count
            FROM use_cases
            WHERE domain_id = ? AND DATE(created_date) BETWEEN ? AND ?
            GROUP BY category_id
          ) uc_previous ON c.id = uc_previous.category_id
          WHERE c.domain_id = ?
          HAVING initiatives_current > 0 OR initiatives_previous > 0

          UNION ALL

          SELECT
            at.name as name,
            'agent_type' as breakdown_type,
            0 as initiatives_current,
            0 as initiatives_previous,
            COALESCE(ag_current.count, 0) as agents_current,
            COALESCE(ag_previous.count, 0) as agents_previous
          FROM agent_types at
          LEFT JOIN (
            SELECT agent_type_id, COUNT(*) as count
            FROM agents
            WHERE domain_id = ? AND DATE(created_date) BETWEEN ? AND ?
            GROUP BY agent_type_id
          ) ag_current ON at.id = ag_current.agent_type_id
          LEFT JOIN (
            SELECT agent_type_id, COUNT(*) as count
            FROM agents
            WHERE domain_id = ? AND DATE(created_date) BETWEEN ? AND ?
            GROUP BY agent_type_id
          ) ag_previous ON at.id = ag_previous.agent_type_id
          WHERE at.domain_id = ?
          HAVING agents_current > 0 OR agents_previous > 0

          ORDER BY (initiatives_current + agents_current) DESC
        `;
        breakdownParams = [
          domainId, currentStartStr, currentEndStr,
          domainId, previousStartStr, previousEndStr,
          domainId,
          domainId, currentStartStr, currentEndStr,
          domainId, previousStartStr, previousEndStr,
          domainId
        ];
        break;

      case 'kanban':
        breakdownQuery = `
          SELECT
            pillar as name,
            (SELECT COUNT(*) FROM use_cases WHERE domain_id = ? AND kanban_pillar = k.pillar AND DATE(created_date) BETWEEN ? AND ?) as initiatives_current,
            (SELECT COUNT(*) FROM use_cases WHERE domain_id = ? AND kanban_pillar = k.pillar AND DATE(created_date) BETWEEN ? AND ?) as initiatives_previous,
            (SELECT COUNT(*) FROM agents WHERE domain_id = ? AND kanban_pillar = k.pillar AND DATE(created_date) BETWEEN ? AND ?) as agents_current,
            (SELECT COUNT(*) FROM agents WHERE domain_id = ? AND kanban_pillar = k.pillar AND DATE(created_date) BETWEEN ? AND ?) as agents_previous
          FROM (
            SELECT 'backlog' as pillar UNION SELECT 'prioritised' UNION SELECT 'in_progress'
            UNION SELECT 'completed' UNION SELECT 'blocked' UNION SELECT 'slow_burner'
            UNION SELECT 'de_prioritised' UNION SELECT 'on_hold'
          ) k
          HAVING initiatives_current > 0 OR initiatives_previous > 0 OR agents_current > 0 OR agents_previous > 0
          ORDER BY FIELD(pillar, 'backlog', 'prioritised', 'in_progress', 'completed', 'blocked', 'slow_burner', 'de_prioritised', 'on_hold')
        `;
        breakdownParams = [
          domainId, currentStartStr, currentEndStr,
          domainId, previousStartStr, previousEndStr,
          domainId, currentStartStr, currentEndStr,
          domainId, previousStartStr, previousEndStr
        ];
        break;

      default:
        return { error: 'Invalid breakdown type' };
    }

    const breakdownResults = await new Promise((resolve, reject) => {
      db.query(breakdownQuery, breakdownParams, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    const summary = summaryResults[0];

    // Calculate variances
    const initiativesVariance = summary.initiatives_current - summary.initiatives_previous;
    const initiativesPercent = summary.initiatives_previous > 0
      ? ((initiativesVariance / summary.initiatives_previous) * 100).toFixed(1)
      : (summary.initiatives_current > 0 ? 100 : 0);

    const agentsVariance = summary.agents_current - summary.agents_previous;
    const agentsPercent = summary.agents_previous > 0
      ? ((agentsVariance / summary.agents_previous) * 100).toFixed(1)
      : (summary.agents_current > 0 ? 100 : 0);

    const ratio = summary.agents_current > 0
      ? (summary.initiatives_current / summary.agents_current).toFixed(1)
      : summary.initiatives_current;

    // Process daily data into a more usable format
    const dailyMap = {};
    dailyResults.forEach(row => {
      const dateStr = row.date instanceof Date
        ? row.date.toISOString().split('T')[0]
        : row.date;
      if (!dailyMap[dateStr]) {
        dailyMap[dateStr] = { date: dateStr, initiatives: 0, agents: 0 };
      }
      if (row.type === 'initiative') {
        dailyMap[dateStr].initiatives = row.count;
      } else {
        dailyMap[dateStr].agents = row.count;
      }
    });

    // Fill in missing dates with zeros
    const daily = [];
    const cursor = new Date(currentStart);
    while (cursor <= currentEnd) {
      const dateStr = formatDate(cursor);
      daily.push(dailyMap[dateStr] || { date: dateStr, initiatives: 0, agents: 0 });
      cursor.setDate(cursor.getDate() + 1);
    }

    // Process breakdown data
    const breakdownData = breakdownResults.map(row => ({
      name: row.name,
      breakdown_type: row.breakdown_type || breakdown,
      initiatives_current: row.initiatives_current || 0,
      initiatives_previous: row.initiatives_previous || 0,
      initiatives_variance: (row.initiatives_current || 0) - (row.initiatives_previous || 0),
      agents_current: row.agents_current || 0,
      agents_previous: row.agents_previous || 0,
      agents_variance: (row.agents_current || 0) - (row.agents_previous || 0)
    }));

    const result = {
      period: {
        start: currentStartStr,
        end: currentEndStr,
        days: days
      },
      previous_period: {
        start: previousStartStr,
        end: previousEndStr
      },
      summary: {
        initiatives: {
          current: summary.initiatives_current,
          previous: summary.initiatives_previous,
          variance: initiativesVariance,
          percent: parseFloat(initiativesPercent)
        },
        agents: {
          current: summary.agents_current,
          previous: summary.agents_previous,
          variance: agentsVariance,
          percent: parseFloat(agentsPercent)
        },
        ratio: parseFloat(ratio)
      },
      daily,
      breakdown: breakdownData
    };

    console.log(`✅ Backend: Generated variance report for ${days} days with ${breakdownData.length} breakdown items`);
    return result;
  },

  get_domain_metadata: async (params, domainId) => {
    console.log('📋 Backend: Getting domain metadata for domain:', domainId);

    if (!domainId) {
      return { error: 'Domain ID is required for metadata' };
    }

    // Get departments for this domain
    const departments = await new Promise((resolve, reject) => {
      db.query('SELECT name FROM departments WHERE domain_id = ? ORDER BY name', [domainId], (err, results) => {
        if (err) reject(err);
        else resolve(results.map(r => r.name));
      });
    });

    // Get categories for this domain
    const categories = await new Promise((resolve, reject) => {
      db.query('SELECT name FROM categories WHERE domain_id = ? ORDER BY name', [domainId], (err, results) => {
        if (err) reject(err);
        else resolve(results.map(r => r.name));
      });
    });

    // Get agent types for this domain
    const agentTypes = await new Promise((resolve, reject) => {
      db.query('SELECT name FROM agent_types WHERE domain_id = ? ORDER BY name', [domainId], (err, results) => {
        if (err) reject(err);
        else resolve(results.map(r => r.name));
      });
    });

    // Get all tags (global, not domain-scoped)
    const tags = await new Promise((resolve, reject) => {
      db.query('SELECT name FROM tags ORDER BY name', [], (err, results) => {
        if (err) reject(err);
        else resolve(results.map(r => r.name));
      });
    });

    // Get data sensitivity levels (global)
    const sensitivityLevels = await new Promise((resolve, reject) => {
      db.query('SELECT name FROM data_sensitivity_levels ORDER BY display_order', [], (err, results) => {
        if (err) reject(err);
        else resolve(results.map(r => r.name));
      });
    });

    // Get strategic pillars for this domain
    const pillars = await new Promise((resolve, reject) => {
      db.query('SELECT name FROM strategic_pillars WHERE domain_id = ? ORDER BY display_order', [domainId], (err, results) => {
        if (err) reject(err);
        else resolve(results.map(r => r.name));
      });
    });

    return {
      departments,
      categories,
      agent_types: agentTypes,
      tags,
      data_sensitivity_levels: sensitivityLevels,
      strategic_pillars: pillars,
      status_values: ['concept', 'proof_of_concept', 'validation', 'pilot', 'production'],
      kanban_values: ['backlog', 'prioritised', 'in_progress', 'completed', 'blocked', 'slow_burner', 'de_prioritised', 'on_hold'],
      strategic_impact_values: ['Low', 'Medium', 'High']
    };
  },

  search_agents: async (params, domainId) => {
    console.log('🔍 Backend: Searching agents:', params, 'Domain:', domainId);

    const searchTerm = params.search_term || '';
    const limit = params.limit || 10;

    let whereClause = 'WHERE 1=1';
    const queryParams = [];

    if (domainId) {
      whereClause += ' AND a.domain_id = ?';
      queryParams.push(domainId);
    }

    if (searchTerm) {
      whereClause += ' AND (a.title LIKE ? OR a.description LIKE ? OR a.problem_statement LIKE ?)';
      const searchPattern = `%${searchTerm}%`;
      queryParams.push(searchPattern, searchPattern, searchPattern);
    }

    const query = `
      SELECT
        a.id,
        a.title,
        a.description,
        a.status,
        a.strategic_impact,
        a.kanban_pillar,
        at.name as agent_type,
        d.name as department,
        a.created_date
      FROM agents a
      LEFT JOIN agent_types at ON a.agent_type_id = at.id
      LEFT JOIN departments d ON a.department_id = d.id
      ${whereClause}
      ORDER BY
        CASE WHEN a.title LIKE ? THEN 1 ELSE 2 END,
        a.created_date DESC
      LIMIT ?
    `;

    queryParams.push(`%${searchTerm}%`, limit);

    const results = await new Promise((resolve, reject) => {
      db.query(query, queryParams, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    console.log(`✅ Backend: Found ${results.length} agents matching "${searchTerm}"`);

    return {
      search_term: searchTerm,
      count: results.length,
      agents: results
    };
  },

  get_agents_by_criteria: async (params, domainId) => {
    console.log('📊 Backend: Getting agents by criteria:', params, 'Domain:', domainId);

    let whereClause = 'WHERE 1=1';
    const queryParams = [];

    if (domainId) {
      whereClause += ' AND a.domain_id = ?';
      queryParams.push(domainId);
    }
    if (params.agent_type) {
      whereClause += ' AND at.name = ?';
      queryParams.push(params.agent_type);
    }
    if (params.department) {
      whereClause += ' AND d.name = ?';
      queryParams.push(params.department);
    }
    if (params.status) {
      whereClause += ' AND a.status = ?';
      queryParams.push(params.status);
    }
    if (params.strategic_impact) {
      whereClause += ' AND a.strategic_impact = ?';
      queryParams.push(params.strategic_impact);
    }
    if (params.kanban_pillar) {
      whereClause += ' AND a.kanban_pillar = ?';
      queryParams.push(params.kanban_pillar);
    }
    if (params.data_sensitivity) {
      whereClause += ' AND a.data_sensitivity = ?';
      queryParams.push(params.data_sensitivity);
    }

    const limit = params.limit || 10;

    const query = `
      SELECT
        a.id,
        a.title,
        a.description,
        a.status,
        a.strategic_impact,
        a.kanban_pillar,
        a.data_sensitivity,
        at.name as agent_type,
        d.name as department,
        a.created_date
      FROM agents a
      LEFT JOIN agent_types at ON a.agent_type_id = at.id
      LEFT JOIN departments d ON a.department_id = d.id
      ${whereClause}
      ORDER BY a.created_date DESC
      LIMIT ?
    `;

    queryParams.push(limit);

    const results = await new Promise((resolve, reject) => {
      db.query(query, queryParams, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    return {
      criteria: params,
      count: results.length,
      agents: results
    };
  },

  get_agents_by_initiative: async (params, domainId) => {
    console.log('🎯 Backend: Getting agents by initiative:', params, 'Domain:', domainId);

    const initiativeName = params.initiative_name;
    const limit = params.limit || 10;

    // First, find the use case(s) matching the initiative name
    let whereClause = 'WHERE (uc.title LIKE ? OR uc.description LIKE ?)';
    const queryParams = [`%${initiativeName}%`, `%${initiativeName}%`];

    if (domainId) {
      whereClause += ' AND uc.domain_id = ?';
      queryParams.push(domainId);
    }

    const useCaseQuery = `
      SELECT id, title
      FROM use_cases uc
      ${whereClause}
      ORDER BY
        CASE WHEN uc.title LIKE ? THEN 1 ELSE 2 END
      LIMIT 10
    `;

    queryParams.push(`%${initiativeName}%`);

    const useCases = await new Promise((resolve, reject) => {
      db.query(useCaseQuery, queryParams, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    console.log(`✅ Backend: Found ${useCases.length} use cases matching "${initiativeName}"`);

    if (useCases.length === 0) {
      return {
        initiative_name: initiativeName,
        matched_use_cases: [],
        count: 0,
        agents: []
      };
    }

    // Get all use case IDs
    const useCaseIds = useCases.map(uc => uc.id);
    const placeholders = useCaseIds.map(() => '?').join(',');

    // Now find agents associated with these use cases
    let agentWhereClause = `WHERE aia.use_case_id IN (${placeholders})`;
    const agentQueryParams = [...useCaseIds];

    if (domainId) {
      agentWhereClause += ' AND a.domain_id = ?';
      agentQueryParams.push(domainId);
    }

    const agentQuery = `
      SELECT DISTINCT
        a.id,
        a.title,
        a.description,
        a.status,
        a.strategic_impact,
        a.kanban_pillar,
        a.data_sensitivity,
        at.name as agent_type,
        d.name as department,
        a.created_date
      FROM agents a
      INNER JOIN agent_initiative_associations aia ON a.id = aia.agent_id
      LEFT JOIN agent_types at ON a.agent_type_id = at.id
      LEFT JOIN departments d ON a.department_id = d.id
      ${agentWhereClause}
      ORDER BY a.created_date DESC
      LIMIT ?
    `;

    agentQueryParams.push(limit);

    const agents = await new Promise((resolve, reject) => {
      db.query(agentQuery, agentQueryParams, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    console.log(`✅ Backend: Found ${agents.length} agents associated with initiative "${initiativeName}"`);

    return {
      initiative_name: initiativeName,
      matched_use_cases: useCases.map(uc => ({ id: uc.id, title: uc.title })),
      count: agents.length,
      agents: agents
    };
  },

  get_agent_statistics: async (params, domainId) => {
    console.log('📈 Backend: Getting agent statistics:', params, 'Domain:', domainId);

    const groupBy = params.group_by || 'status';

    let groupColumn, groupJoin = '';

    switch (groupBy) {
      case 'department':
        groupColumn = 'd.name';
        groupJoin = 'LEFT JOIN departments d ON a.department_id = d.id';
        break;
      case 'agent_type':
        groupColumn = 'at.name';
        groupJoin = 'LEFT JOIN agent_types at ON a.agent_type_id = at.id';
        break;
      case 'strategic_impact':
        groupColumn = 'a.strategic_impact';
        break;
      case 'kanban_pillar':
        groupColumn = 'a.kanban_pillar';
        break;
      default: // status
        groupColumn = 'a.status';
    }

    let whereClause = 'WHERE 1=1';
    const queryParams = [];

    if (domainId) {
      whereClause += ' AND a.domain_id = ?';
      queryParams.push(domainId);
    }

    const query = `
      SELECT
        ${groupColumn} as category,
        COUNT(*) as count
      FROM agents a
      ${groupJoin}
      ${whereClause}
      GROUP BY ${groupColumn}
      ORDER BY count DESC
    `;

    const results = await new Promise((resolve, reject) => {
      db.query(query, queryParams, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    // Get total
    const totalQuery = `SELECT COUNT(*) as total FROM agents a ${whereClause}`;
    const totalResult = await new Promise((resolve, reject) => {
      db.query(totalQuery, queryParams, (err, results) => {
        if (err) reject(err);
        else resolve(results[0].total);
      });
    });

    return {
      group_by: groupBy,
      total_agents: totalResult,
      breakdown: results.map(r => ({
        [groupBy]: r.category || 'Unknown',
        count: r.count
      }))
    };
  },

  get_agent_details: async (params, domainId) => {
    console.log('🤖 Backend: Getting agent details:', params, 'Domain:', domainId);

    let whereClause = 'WHERE 1=1';
    const queryParams = [];

    if (domainId) {
      whereClause += ' AND a.domain_id = ?';
      queryParams.push(domainId);
    }

    if (params.agent_id) {
      whereClause += ' AND a.id = ?';
      queryParams.push(params.agent_id);
    } else if (params.agent_title) {
      whereClause += ' AND a.title LIKE ?';
      queryParams.push(`%${params.agent_title}%`);
    } else {
      return { error: 'Either agent_id or agent_title is required' };
    }

    const query = `
      SELECT
        a.*,
        at.name as agent_type,
        d.name as department,
        u.name as author_name
      FROM agents a
      LEFT JOIN agent_types at ON a.agent_type_id = at.id
      LEFT JOIN departments d ON a.department_id = d.id
      LEFT JOIN users u ON a.author_id = u.id
      ${whereClause}
      LIMIT 1
    `;

    const agent = await new Promise((resolve, reject) => {
      db.query(query, queryParams, (err, results) => {
        if (err) reject(err);
        else resolve(results[0] || null);
      });
    });

    if (!agent) {
      return { error: 'Agent not found' };
    }

    // Get linked initiatives
    const initiatives = await new Promise((resolve, reject) => {
      db.query(`
        SELECT uc.id, uc.title, uc.status, uc.strategic_impact
        FROM use_cases uc
        JOIN agent_initiative_associations aia ON uc.id = aia.use_case_id
        WHERE aia.agent_id = ?
        ORDER BY uc.title
      `, [agent.id], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    return {
      agent: {
        id: agent.id,
        title: agent.title,
        description: agent.description,
        problem_statement: agent.problem_statement,
        solution_overview: agent.solution_overview,
        technical_implementation: agent.technical_implementation,
        results_metrics: agent.results_metrics,
        status: agent.status,
        strategic_impact: agent.strategic_impact,
        kanban_pillar: agent.kanban_pillar,
        data_sensitivity: agent.data_sensitivity,
        agent_type: agent.agent_type,
        department: agent.department,
        author: agent.author_name,
        created_date: agent.created_date
      },
      linked_initiatives: initiatives,
      initiative_count: initiatives.length
    };
  },

  get_use_cases_by_tag: async (params, domainId) => {
    console.log('🏷️ Backend: Getting use cases by tag:', params, 'Domain:', domainId);

    const tagName = params.tag_name;
    const limit = params.limit || 20;

    // Find the tag first
    const tags = await new Promise((resolve, reject) => {
      db.query(
        'SELECT id, name FROM tags WHERE LOWER(name) LIKE ?',
        [`%${tagName.toLowerCase()}%`],
        (err, results) => {
          if (err) reject(err);
          else resolve(results);
        }
      );
    });

    if (tags.length === 0) {
      console.log(`⚠️ No tag found matching: ${tagName}`);
      return {
        tag_name: tagName,
        count: 0,
        use_cases: [],
        message: `No tag found matching "${tagName}"`
      };
    }

    const tagId = tags[0].id;
    const matchedTagName = tags[0].name;

    // Query use cases with this tag
    let useCaseQuery = `
      SELECT DISTINCT
        uc.id,
        uc.title,
        uc.description,
        uc.status,
        uc.strategic_impact,
        uc.kanban_pillar,
        uc.expected_delivery_date,
        d.name as department,
        u.name as author_name,
        uc.created_date
      FROM use_cases uc
      INNER JOIN use_case_tags uct ON uc.id = uct.use_case_id
      LEFT JOIN departments d ON uc.department_id = d.id
      LEFT JOIN users u ON uc.author_id = u.id
      WHERE uct.tag_id = ?`;

    const useCaseParams = [tagId];

    if (domainId) {
      useCaseQuery += ' AND uc.domain_id = ?';
      useCaseParams.push(domainId);
    }

    useCaseQuery += ' ORDER BY uc.created_date DESC LIMIT ?';
    useCaseParams.push(limit);

    const useCases = await new Promise((resolve, reject) => {
      db.query(useCaseQuery, useCaseParams, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    console.log(`✅ Backend: Found ${useCases.length} use cases with tag "${matchedTagName}"`);
    return {
      tag_name: matchedTagName,
      count: useCases.length,
      use_cases: useCases.map(uc => ({
        id: uc.id,
        title: uc.title,
        description: uc.description,
        status: uc.status,
        strategic_impact: uc.strategic_impact,
        kanban_pillar: uc.kanban_pillar,
        expected_delivery_date: uc.expected_delivery_date,
        department: uc.department,
        author_name: uc.author_name,
        created_date: uc.created_date
      }))
    };
  },

  ask_user_clarification: async (params) => {
    console.log('❓ Backend: Asking user for clarification');

    // This is a special function that returns a marker indicating
    // the agent needs user input. The response will be phrased as a question.
    return {
      requires_clarification: true,
      question: params.question,
      context: params.context || null
    };
  }
};

// Build intelligent system prompt with dynamic data
const buildIntelligentSystemPrompt = async (userName, domainId = null) => {
  console.log('🧠 Backend: Building system prompt for user:', userName, 'Domain ID:', domainId);

  // Get domain information
  let domainInfo = null;
  if (domainId) {
    domainInfo = await new Promise((resolve, reject) => {
      db.query('SELECT * FROM domains WHERE id = ?', [domainId], (err, results) => {
        if (err) reject(err);
        else resolve(results[0] || null);
      });
    });
  }

  const domainName = domainInfo?.name || 'Strategic Excellence';
  const domainType = domainInfo?.type || 'general';

  // Get domain-specific terminology
  let initiativeSingular = 'initiative';
  let initiativePlural = 'initiatives';

  if (domainInfo?.config_json) {
    try {
      const config = typeof domainInfo.config_json === 'string'
        ? JSON.parse(domainInfo.config_json)
        : domainInfo.config_json;

      if (config.terminology) {
        initiativeSingular = config.terminology.initiative_singular || initiativeSingular;
        initiativePlural = config.terminology.initiative_plural || initiativePlural;
      }
    } catch (e) {
      console.error('Error parsing domain config:', e);
    }
  }

  // Get strategic pillars for the prompt (filtered by domain if provided)
  const pillarsQuery = domainId
    ? 'SELECT * FROM strategic_pillars WHERE domain_id = ? ORDER BY name'
    : 'SELECT * FROM strategic_pillars ORDER BY name';
  const pillarsParams = domainId ? [domainId] : [];

  const pillars = await new Promise((resolve, reject) => {
    db.query(pillarsQuery, pillarsParams, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });

  // Get strategic goals for each pillar
  const pillarsWithGoals = await Promise.all(pillars.map(async (pillar) => {
    const goals = await new Promise((resolve, reject) => {
      db.query(
        'SELECT id, title, description FROM strategic_goals WHERE strategic_pillar_id = ? ORDER BY title',
        [pillar.id],
        (err, results) => {
          if (err) reject(err);
          else resolve(results);
        }
      );
    });
    return {
      ...pillar,
      goals: goals
    };
  }));

  // Get outcomes
  const outcomes = await new Promise((resolve, reject) => {
    const outcomesQuery = domainId
      ? 'SELECT * FROM outcomes WHERE domain_id = ? ORDER BY title'
      : 'SELECT * FROM outcomes ORDER BY title';
    const outcomesParams = domainId ? [domainId] : [];
    db.query(outcomesQuery, outcomesParams, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });

  // Get departments
  const departments = await new Promise((resolve, reject) => {
    const deptQuery = domainId
      ? 'SELECT * FROM departments WHERE domain_id = ? ORDER BY name'
      : 'SELECT * FROM departments ORDER BY name';
    const deptParams = domainId ? [domainId] : [];
    db.query(deptQuery, deptParams, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });

  // Get kanban statuses distribution
  const kanbanStatuses = await new Promise((resolve, reject) => {
    const statusQuery = domainId
      ? `SELECT kanban_pillar, COUNT(*) as count FROM use_cases WHERE domain_id = ? AND kanban_pillar IS NOT NULL GROUP BY kanban_pillar`
      : `SELECT kanban_pillar, COUNT(*) as count FROM use_cases WHERE kanban_pillar IS NOT NULL GROUP BY kanban_pillar`;
    const statusParams = domainId ? [domainId] : [];
    db.query(statusQuery, statusParams, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });

  // Get roadmap delivery dates overview (next 6 months)
  const roadmapDates = await new Promise((resolve, reject) => {
    const now = new Date();
    const sixMonthsLater = new Date(now);
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);

    const dateQuery = domainId
      ? `SELECT DATE_FORMAT(expected_delivery_date, '%b %Y') as delivery_month,
         COUNT(*) as count,
         MIN(expected_delivery_date) as min_date
         FROM use_cases
         WHERE domain_id = ?
         AND expected_delivery_date IS NOT NULL
         AND expected_delivery_date BETWEEN ? AND ?
         GROUP BY delivery_month
         ORDER BY min_date`
      : `SELECT DATE_FORMAT(expected_delivery_date, '%b %Y') as delivery_month,
         COUNT(*) as count,
         MIN(expected_delivery_date) as min_date
         FROM use_cases
         WHERE expected_delivery_date IS NOT NULL
         AND expected_delivery_date BETWEEN ? AND ?
         GROUP BY delivery_month
         ORDER BY min_date`;

    const dateParams = domainId
      ? [domainId, now.toISOString().split('T')[0], sixMonthsLater.toISOString().split('T')[0]]
      : [now.toISOString().split('T')[0], sixMonthsLater.toISOString().split('T')[0]];

    db.query(dateQuery, dateParams, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });

  // Build comprehensive context strings
  const pillarNames = pillars.map(p => p.name).join(', ');

  const pillarsWithGoalsContext = pillarsWithGoals.map(pillar => {
    const goalsList = pillar.goals.length > 0
      ? pillar.goals.map(g => `  - ${g.title}`).join('\n')
      : '  - (No goals defined yet)';
    return `${pillar.name}:\n${goalsList}`;
  }).join('\n\n');

  const outcomesContext = outcomes.length > 0
    ? outcomes.map(o => `- ${o.title}${o.measure ? ': ' + o.measure : ''}`).join('\n')
    : 'No outcomes defined yet';

  const departmentsContext = departments.map(d => d.name).join(', ');

  const kanbanContext = kanbanStatuses.length > 0
    ? kanbanStatuses.map(s => `${s.kanban_pillar}: ${s.count} initiatives`).join(', ')
    : 'No kanban data available';

  const roadmapContext = roadmapDates.length > 0
    ? roadmapDates.map(r => `${r.delivery_month}: ${r.count} initiatives`).join(', ')
    : 'No upcoming deliveries scheduled';
  
  const baseInstructions = `You are Hekmah, an intelligent ${domainName} assistant at Department of Finance, Abu Dhabi. You're having a conversation with ${userName}.

PERSONALITY: Be warm, conversational, and personable. Use ${userName}'s name occasionally but not excessively. Be professional yet friendly. Keep responses concise but informative.

CRITICAL: NEVER mention your training data cutoff date, knowledge limitations, or phrases like "My knowledge is current up to [date]" or "I am trained on data up to [date]". You have access to real-time data through functions - use them.

RESPONSE STYLE - CRITICAL FOR ALL RESPONSES:
Write like you're speaking to a colleague, not writing a report. All responses must sound natural when spoken aloud. Never use structured labels like "Objective:", "Solution:", "Technical:", "Comments:", or "Description:". Speak in flowing paragraphs, not bullet lists or formatted sections. Weave comments, status, and details into a natural narrative. Lead with what's most important (status, purpose, key updates). Don't mention technical complexity, dates, authors, or granular details unless specifically requested. When someone asks "Tell me about X" give a brief overview. "What's the status" means focus on current state and progress. "Give me details" means a conversational update with key points only. Prioritize what matters most - users can check the UI for comprehensive details.

FULL DOMAIN CONTEXT - YOUR COMPREHENSIVE KNOWLEDGE BASE:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 STRATEGIC FRAMEWORK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STRATEGIC PILLARS & GOALS:
The strategic pillars guiding all ${domainName} ${initiativePlural} are: ${pillarNames}.

Detailed Pillar-Goal Structure:
${pillarsWithGoalsContext}

EXPECTED OUTCOMES:
${outcomesContext}

DEPARTMENTS:
Active departments: ${departmentsContext}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 CURRENT STATE OVERVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

KANBAN STATUS DISTRIBUTION:
${kanbanContext}

ROADMAP - UPCOMING DELIVERIES (Next 6 Months):
${roadmapContext}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ORGANIZATIONAL CONTEXT:
Strategic goals are high-level organizational objectives aligned to these pillars. ${domainName} ${initiativePlural.charAt(0).toUpperCase() + initiativePlural.slice(1)} are specific projects aligned to one or more strategic goals. We prioritize ${initiativePlural} based on strategic alignment (40%), business impact (40%), and technical feasibility (20%). Development stages progress from concept → proof_of_concept → validation → pilot → production.

YOUR CAPABILITIES:
You can help ${userName} with questions about ${domainName} ${initiativePlural} at Department of Finance, including strategic pillars and goals, prioritization analysis, project status and progress, departmental activities, and technical implementation details.

DATA ACCESS:
You have real-time functions to query use cases by department, status, strategic goal, pillar, or impact level. You can also get strategic goals by pillar, current statistics and counts, and detailed use case information.

ANTI-HALLUCINATION RULES (CRITICAL):
Never make up or guess information about use cases, departments, goals, or statistics. If you don't have specific data, always use the available functions to get current information. If a function call fails or returns no data, say "I don't have that specific information available right now." Never provide numbers, names, or details unless they come from function calls. When asked about specific use cases, departments, or statistics, always call the appropriate function first. Do not respond with example data or hypothetical scenarios - only real data from functions. If asked "how many" or "what are the" or "show me" you must call a function. When someone mentions any proper noun that could be a use case name, search for it before responding. Never assume you know what something is - always search the database first.

BEHAVIORAL GUIDELINES:
If asked about topics outside ${domainName} at DoF, politely decline: "I apologize ${userName}, but I can only help with questions about ${domainName} ${initiativePlural} at Department of Finance. What would you like to know about our ${domainName} strategy?" Use the available functions to get current, accurate data rather than making assumptions. Be conversational but avoid repeating "Department of Finance" multiple times in one response. Reference specific data when available rather than speaking generally. Use natural speech patterns and avoid being overly formal.

FORMATTING:
Use markdown formatting to make responses clear and scannable:
- Use bullet points for lists of items (3+ items)
- Use numbered lists for sequential steps or ranked items
- Use markdown tables (| Column | Column |) for comparing data or showing structured information
- Use **bold** for emphasis on key terms
- Keep responses concise but well-structured
- Avoid excessive whitespace

MANDATORY: When users ask about priorities, specific use cases, departmental activities, or strategic alignments, you must use the available functions to provide accurate, current information.`;

  return baseInstructions;
};

// Main intelligent chat function with function calling
const generateIntelligentResponse = async (userQuery, conversationHistory = [], userName = 'unknown', domainId = null) => {
  console.log('🤖 Backend: Generating intelligent response for:', userName);
  console.log('💬 Backend: User query:', userQuery);
  console.log('🏢 Backend: Domain ID:', domainId);

  try {
    // Build system prompt
    const systemPrompt = await buildIntelligentSystemPrompt(userName, domainId);
    
    // Build messages array
    const messages = [{ role: 'system', content: systemPrompt }];
    
    // Add conversation history (excluding welcome messages)
    conversationHistory.forEach(msg => {
      if (!msg.text.includes('Welcome! I am Hekmah') && !msg.text.includes('Hello ' + userName)) {
        messages.push({
          role: msg.isUser ? 'user' : 'assistant',
          content: msg.text
        });
      }
    });
    
    // Add current user query
    messages.push({ role: 'user', content: userQuery });
    
    // Prepare function calling tools
    const tools = Object.values(AVAILABLE_FUNCTIONS).map(func => ({
      type: "function",
      function: func
    }));
    
    console.log('🔧 Backend: Calling Azure OpenAI with', tools.length, 'functions available');
    
    const response = await azureOpenAI.chat.completions.create({
      model: process.env.COMPASS_OPENAI_DEPLOYMENT_NAME,
      messages: messages,
      max_completion_tokens: 1000,
      tools: tools,
      tool_choice: "auto",
      reasoning_effort: process.env.COMPASS_OPENAI_REASONING_EFFORT || "minimal"
    });
    
    const responseMessage = response.choices[0].message;
    
    // Handle function calls if present
    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      console.log('🔄 Backend: Processing', responseMessage.tool_calls.length, 'function calls');
      
      const functionResults = [];
      
      for (const toolCall of responseMessage.tool_calls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);
        
        console.log(`🔍 Backend: Executing function: ${functionName}`, functionArgs);
        
        if (FUNCTION_IMPLEMENTATIONS[functionName]) {
          try {
            const result = await FUNCTION_IMPLEMENTATIONS[functionName](functionArgs);
            functionResults.push({
              tool_call_id: toolCall.id,
              role: "tool",
              content: JSON.stringify(result)
            });
          } catch (error) {
            console.error(`❌ Backend: Function ${functionName} error:`, error);
            functionResults.push({
              tool_call_id: toolCall.id,
              role: "tool",
              content: JSON.stringify({ error: "Function execution failed" })
            });
          }
        }
      }
      
      // Add function results to conversation and get final response
      if (functionResults.length > 0) {
        messages.push(responseMessage);
        messages.push(...functionResults);
        
        console.log('🔄 Backend: Getting final response after function calls');
        
        const finalResponse = await azureOpenAI.chat.completions.create({
          model: process.env.COMPASS_OPENAI_DEPLOYMENT_NAME,
          messages: messages,
          max_completion_tokens: 1000,
          reasoning_effort: process.env.COMPASS_OPENAI_REASONING_EFFORT || "minimal"
        });
        
        const finalContent = finalResponse.choices[0].message.content;
        console.log('✅ Backend: Generated intelligent response with function data');
        return finalContent || `I couldn't generate a response, ${userName}. Please try rephrasing your question.`;
      }
    }
    
    console.log('✅ Backend: Generated standard intelligent response');
    return responseMessage.content || `I couldn't generate a response, ${userName}. Please try rephrasing your question.`;
    
  } catch (error) {
    console.error('❌ Backend: Intelligent chat error details:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      code: error.code,
      apiKey: maskApiKey(process.env.COMPASS_OPENAI_API_KEY),
      endpoint: process.env.COMPASS_OPENAI_ENDPOINT || 'NOT_SET',
      deployment: process.env.COMPASS_OPENAI_DEPLOYMENT_NAME || 'NOT_SET'
    });
    
    // Log specific error scenarios
    if (error.response?.status === 403) {
      console.error('🚫 403 Forbidden - Check Azure OpenAI API key permissions and quota');
    } else if (error.response?.status === 404) {
      console.error('🔍 404 Not Found - Check Azure OpenAI endpoint and deployment name');
    } else if (error.response?.status === 401) {
      console.error('🔐 401 Unauthorized - Azure OpenAI API key may be invalid');
    } else if (error.response?.status === 429) {
      console.error('⏰ 429 Too Many Requests - Azure OpenAI rate limit exceeded');
    } else if (error.code === 'ENOTFOUND') {
      console.error('🌐 Network Error - Cannot reach Azure OpenAI endpoint');
    }
    
    console.error('Full error object:', error);
    return `I'm having trouble processing your request, ${userName}. Please try again.`;
  }
};

// Synthesis Agent: Converts any structured/bulleted responses into conversational, voice-ready format
const synthesizeConversationalResponse = async (originalResponse, userQuery) => {
  try {
    console.log('🎨 Backend: Running synthesis agent for conversational output');

    const synthesisPrompt = `Convert this response into natural conversational speech. Keep it brief (75-90 words) and preserve ALL facts.

Rules:
- Remove bullets, labels, and formatting
- Keep ALL names, numbers, dates exactly as written
- Flow naturally for voice
- Don't add new information

Query: "${userQuery}"

Response:
${originalResponse}`;

    const synthesisResponse = await azureOpenAI.chat.completions.create({
      model: process.env.COMPASS_OPENAI_DEPLOYMENT_NAME,
      messages: [
        { role: 'user', content: synthesisPrompt }
      ],
      max_completion_tokens: 250,
      reasoning_effort: process.env.COMPASS_OPENAI_REASONING_EFFORT || "minimal"
    });

    console.log('🔍 Backend: Synthesis response:', JSON.stringify(synthesisResponse, null, 2));

    const messageContent = synthesisResponse.choices?.[0]?.message?.content;
    console.log('🔍 Backend: Message content:', messageContent);

    if (!messageContent || messageContent.trim().length === 0) {
      console.warn('⚠️  Backend: Synthesis returned empty content, using original response');
      return originalResponse;
    }

    const synthesizedText = messageContent.trim();
    console.log('✅ Backend: Synthesis completed successfully');
    console.log(`   Original length: ${originalResponse.length} chars`);
    console.log(`   Synthesized length: ${synthesizedText.length} chars`);

    return synthesizedText;

  } catch (error) {
    console.error('❌ Backend: Synthesis agent failed:', error.message);
    console.log('⚠️  Backend: Falling back to original response');
    return originalResponse; // Fallback to original response on error
  }
};

// Export array of valid function names for validation
const FUNCTION_NAMES = Object.keys(AVAILABLE_FUNCTIONS);

module.exports = {
  generateIntelligentResponse,
  buildIntelligentSystemPrompt,
  synthesizeConversationalResponse,
  azureOpenAI,
  FUNCTION_IMPLEMENTATIONS,
  AVAILABLE_FUNCTIONS,
  FUNCTION_NAMES
};