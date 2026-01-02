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
    description: "Get use cases filtered by various criteria like status, strategic impact, effort level, and delivery date",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["intention", "experimentation", "commitment", "implementation", "integration"], description: "Filter by status" },
        strategic_impact: { type: "string", enum: ["Low", "Medium", "High"], description: "Filter by strategic impact level" },
        effort_level: { type: "string", enum: ["Low", "Medium", "High"], description: "Filter by effort level" },
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
    description: "Get family initiatives that are aligned to a specific goal",
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
    description: "Get real-time statistics about use cases and goals",
    parameters: {
      type: "object",
      properties: {
        group_by: {
          type: "string",
          enum: ["status", "strategic_impact", "effort_level", "category"],
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
    description: "Get all metadata for the current domain including categories, tags, and strategic pillars. Use this to understand what filter values are available.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },

  search_tasks: {
    name: "search_tasks",
    description: "Search for tasks by name, title, or description containing specific keywords",
    parameters: {
      type: "object",
      properties: {
        search_term: { type: "string", description: "The term to search for in task titles and descriptions" },
        limit: { type: "number", description: "Maximum number of results to return (default 10)" }
      },
      required: ["search_term"],
      additionalProperties: false
    }
  },

  get_tasks_by_criteria: {
    name: "get_tasks_by_criteria",
    description: "Get tasks filtered by various criteria like status, strategic impact, and effort level",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["intention", "experimentation", "commitment", "implementation", "integration"], description: "Filter by status" },
        strategic_impact: { type: "string", enum: ["Low", "Medium", "High"], description: "Filter by strategic impact level" },
        effort_level: { type: "string", enum: ["Low", "Medium", "High"], description: "Filter by effort level" },
        limit: { type: "number", description: "Maximum number of results to return (default 10)" }
      },
      additionalProperties: false
    }
  },

  get_tasks_by_initiative: {
    name: "get_tasks_by_initiative",
    description: "Get tasks associated with a specific initiative or use case by searching for the initiative name",
    parameters: {
      type: "object",
      properties: {
        initiative_name: { type: "string", description: "The name of the initiative or use case to find associated tasks for" },
        limit: { type: "number", description: "Maximum number of tasks to return (default 10)" }
      },
      required: ["initiative_name"],
      additionalProperties: false
    }
  },

  get_task_statistics: {
    name: "get_task_statistics",
    description: "Get statistics about tasks, grouped by status, strategic impact, or effort level",
    parameters: {
      type: "object",
      properties: {
        group_by: {
          type: "string",
          enum: ["status", "strategic_impact", "effort_level"],
          description: "How to group the statistics (default: status)"
        }
      },
      additionalProperties: false
    }
  },

  get_task_details: {
    name: "get_task_details",
    description: "Get detailed information about a specific task including full description, technical details, and linked initiatives",
    parameters: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "ID of the task" },
        task_title: { type: "string", description: "Title or name of the task (alternative to ID)" }
      },
      additionalProperties: false
    }
  },

  get_use_cases_by_tag: {
    name: "get_use_cases_by_tag",
    description: "Get family initiatives that have a specific tag (e.g., 'vacation', 'home improvement', 'education')",
    parameters: {
      type: "object",
      properties: {
        tag_name: { type: "string", description: "The tag name to filter by (e.g., 'vacation', 'health', 'education')" },
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
    console.log('Backend: Getting use cases by criteria:', params, 'Domain:', domainId);

    let whereClause = 'WHERE 1=1';
    const queryParams = [];

    if (domainId) {
      whereClause += ' AND uc.domain_id = ?';
      queryParams.push(domainId);
    }
    if (params.status) {
      whereClause += ' AND uc.status = ?';
      queryParams.push(params.status);
    }
    if (params.strategic_impact) {
      whereClause += ' AND uc.strategic_impact = ?';
      queryParams.push(params.strategic_impact);
    }
    if (params.effort_level) {
      whereClause += ' AND uc.effort_level = ?';
      queryParams.push(params.effort_level);
    }
    if (params.expected_delivery_date) {
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
          const dateValue = `${year}-${monthNum}`;
          whereClause += ' AND uc.expected_delivery_date = ?';
          queryParams.push(dateValue);
        }
      }
    }
    if (params.has_delivery_date !== undefined) {
      if (params.has_delivery_date === true) {
        whereClause += ' AND uc.expected_delivery_date IS NOT NULL';
      } else {
        whereClause += ' AND uc.expected_delivery_date IS NULL';
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
        uc.effort_level,
        uc.expected_delivery_date,
        c.name as category,
        u.name as author_name,
        uc.created_date
      FROM use_cases uc
      LEFT JOIN categories c ON uc.category_id = c.id
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

    console.log(`Backend: Found ${results.length} use cases`);
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
        uc.effort_level,
        uc.expected_delivery_date,
        c.name as category,
        u.name as author_name,
        uc.created_date
      FROM use_cases uc
      INNER JOIN use_case_goal_alignments ucga ON uc.id = ucga.use_case_id
      LEFT JOIN categories c ON uc.category_id = c.id
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
      effort_level: uc.effort_level,
      expected_delivery_date: uc.expected_delivery_date,
      category: uc.category,
      author_name: uc.author_name,
      created_date: uc.created_date
    }));

    console.log(`✅ Backend: Found ${results.length} use cases for goal ID ${goalId}`);
    return results;
  },
  
  get_use_case_statistics: async (params, domainId) => {
    console.log('Backend: Getting use case statistics:', params, 'Domain:', domainId);

    // Get use cases with category names for proper grouping
    let useCaseQuery = `
      SELECT uc.*, c.name as category_name
      FROM use_cases uc
      LEFT JOIN categories c ON uc.category_id = c.id`;

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

    if (params.group_by === 'effort_level') {
      const effortCounts = useCases.reduce((acc, uc) => {
        acc[uc.effort_level || 'Medium'] = (acc[uc.effort_level || 'Medium'] || 0) + 1;
        return acc;
      }, {});
      stats.by_effort_level = effortCounts;
    }

    if (params.group_by === 'category') {
      const categoryCounts = useCases.reduce((acc, uc) => {
        const catName = uc.category_name || 'Uncategorized';
        acc[catName] = (acc[catName] || 0) + 1;
        return acc;
      }, {});
      stats.by_category = categoryCounts;
    }

    console.log(`Backend: Generated statistics`);
    return stats;
  },
  
  search_use_cases: async (params, domainId) => {
    console.log('Backend: Searching use cases:', params, 'Domain:', domainId);

    const searchTerm = params.search_term.toLowerCase();
    const limit = params.limit || 10;

    let searchQuery = `
      SELECT
        uc.id,
        uc.title,
        uc.description,
        uc.problem_statement,
        uc.solution_overview,
        uc.status,
        uc.strategic_impact,
        uc.effort_level,
        c.name as category,
        u.name as author_name,
        uc.created_date
      FROM use_cases uc
      LEFT JOIN categories c ON uc.category_id = c.id
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
      category: uc.category,
      status: uc.status,
      strategic_impact: uc.strategic_impact,
      effort_level: uc.effort_level,
      author_name: uc.author_name,
      created_date: uc.created_date
    }));

    console.log(`Backend: Found ${results.length} matching use cases for "${searchTerm}"`);
    return results;
  },
  
  get_use_case_details: async (params, domainId) => {
    console.log('Backend: Getting use case details:', params, 'Domain:', domainId);

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
          uc.effort_level,
          c.name as category,
          u.name as author_name,
          uc.created_date,
          uc.updated_date
        FROM use_cases uc
        LEFT JOIN categories c ON uc.category_id = c.id
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
          uc.effort_level,
          c.name as category,
          u.name as author_name,
          uc.created_date,
          uc.updated_date
        FROM use_cases uc
        LEFT JOIN categories c ON uc.category_id = c.id
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
      console.log('Backend: Use case not found');
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

    console.log(`Backend: Found use case: ${useCase.title} with ${comments.length} comments`);
    return {
      id: useCase.id,
      title: useCase.title,
      description: useCase.description,
      problem_statement: useCase.problem_statement,
      solution_overview: useCase.solution_overview,
      category: useCase.category,
      status: useCase.status,
      strategic_impact: useCase.strategic_impact,
      effort_level: useCase.effort_level,
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

  // Note: get_executive_brief and get_variance_report functions removed for Samantha

  get_domain_metadata_old: async (params, domainId) => {
    // Placeholder - using new simplified version below
    return { error: 'Deprecated' };
  },

  get_variance_report_old: async (params, domainId) => {
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
        (SELECT COUNT(*) FROM tasks WHERE domain_id = ? AND DATE(created_date) BETWEEN ? AND ?) as tasks_current,
        (SELECT COUNT(*) FROM tasks WHERE domain_id = ? AND DATE(created_date) BETWEEN ? AND ?) as tasks_previous
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
        'task' as type,
        COUNT(*) as count
      FROM tasks
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
      case 'status':
        breakdownQuery = `
          SELECT
            status as name,
            (SELECT COUNT(*) FROM use_cases WHERE domain_id = ? AND status = s.status AND DATE(created_date) BETWEEN ? AND ?) as initiatives_current,
            (SELECT COUNT(*) FROM use_cases WHERE domain_id = ? AND status = s.status AND DATE(created_date) BETWEEN ? AND ?) as initiatives_previous,
            (SELECT COUNT(*) FROM tasks WHERE domain_id = ? AND status = s.status AND DATE(created_date) BETWEEN ? AND ?) as tasks_current,
            (SELECT COUNT(*) FROM tasks WHERE domain_id = ? AND status = s.status AND DATE(created_date) BETWEEN ? AND ?) as tasks_previous
          FROM (
            SELECT DISTINCT status FROM use_cases WHERE domain_id = ?
            UNION
            SELECT DISTINCT status FROM tasks WHERE domain_id = ?
          ) s
          ORDER BY FIELD(status, 'intention', 'experimentation', 'commitment', 'implementation', 'integration', 'blocked', 'slow_burner', 'de_prioritised', 'on_hold')
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
            (SELECT COUNT(*) FROM tasks WHERE domain_id = ? AND strategic_impact = i.impact AND DATE(created_date) BETWEEN ? AND ?) as tasks_current,
            (SELECT COUNT(*) FROM tasks WHERE domain_id = ? AND strategic_impact = i.impact AND DATE(created_date) BETWEEN ? AND ?) as tasks_previous
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
            c.name as name,
            'category' as breakdown_type,
            COALESCE(uc_current.count, 0) as initiatives_current,
            COALESCE(uc_previous.count, 0) as initiatives_previous,
            0 as tasks_current,
            0 as tasks_previous
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
          ORDER BY initiatives_current DESC
        `;
        breakdownParams = [
          domainId, currentStartStr, currentEndStr,
          domainId, previousStartStr, previousEndStr,
          domainId
        ];
        break;

      default:
        return { error: 'Invalid breakdown type. Valid options: status, impact, category' };
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

    const tasksVariance = summary.tasks_current - summary.tasks_previous;
    const tasksPercent = summary.tasks_previous > 0
      ? ((tasksVariance / summary.tasks_previous) * 100).toFixed(1)
      : (summary.tasks_current > 0 ? 100 : 0);

    const ratio = summary.tasks_current > 0
      ? (summary.initiatives_current / summary.tasks_current).toFixed(1)
      : summary.initiatives_current;

    // Process daily data into a more usable format
    const dailyMap = {};
    dailyResults.forEach(row => {
      const dateStr = row.date instanceof Date
        ? row.date.toISOString().split('T')[0]
        : row.date;
      if (!dailyMap[dateStr]) {
        dailyMap[dateStr] = { date: dateStr, initiatives: 0, tasks: 0 };
      }
      if (row.type === 'initiative') {
        dailyMap[dateStr].initiatives = row.count;
      } else {
        dailyMap[dateStr].tasks = row.count;
      }
    });

    // Fill in missing dates with zeros
    const daily = [];
    const cursor = new Date(currentStart);
    while (cursor <= currentEnd) {
      const dateStr = formatDate(cursor);
      daily.push(dailyMap[dateStr] || { date: dateStr, initiatives: 0, tasks: 0 });
      cursor.setDate(cursor.getDate() + 1);
    }

    // Process breakdown data
    const breakdownData = breakdownResults.map(row => ({
      name: row.name,
      breakdown_type: row.breakdown_type || breakdown,
      initiatives_current: row.initiatives_current || 0,
      initiatives_previous: row.initiatives_previous || 0,
      initiatives_variance: (row.initiatives_current || 0) - (row.initiatives_previous || 0),
      tasks_current: row.tasks_current || 0,
      tasks_previous: row.tasks_previous || 0,
      tasks_variance: (row.tasks_current || 0) - (row.tasks_previous || 0)
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
        tasks: {
          current: summary.tasks_current,
          previous: summary.tasks_previous,
          variance: tasksVariance,
          percent: parseFloat(tasksPercent)
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
    console.log('Backend: Getting domain metadata for domain:', domainId);

    if (!domainId) {
      return { error: 'Domain ID is required for metadata' };
    }

    // Get categories for this domain
    const categories = await new Promise((resolve, reject) => {
      db.query('SELECT name FROM categories WHERE domain_id = ? ORDER BY name', [domainId], (err, results) => {
        if (err) reject(err);
        else resolve(results.map(r => r.name));
      });
    });

    // Get all tags
    const tags = await new Promise((resolve, reject) => {
      db.query('SELECT name FROM tags ORDER BY name', [], (err, results) => {
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
      categories,
      tags,
      strategic_pillars: pillars,
      status_values: ['intention', 'experimentation', 'commitment', 'implementation', 'integration', 'blocked', 'slow_burner', 'de_prioritised', 'on_hold'],
      strategic_impact_values: ['Low', 'Medium', 'High'],
      effort_level_values: ['Low', 'Medium', 'High']
    };
  },

  search_tasks: async (params, domainId) => {
    console.log('Backend: Searching tasks:', params, 'Domain:', domainId);

    const searchTerm = params.search_term || '';
    const limit = params.limit || 10;

    let whereClause = 'WHERE 1=1';
    const queryParams = [];

    if (domainId) {
      whereClause += ' AND t.domain_id = ?';
      queryParams.push(domainId);
    }

    if (searchTerm) {
      whereClause += ' AND (t.title LIKE ? OR t.description LIKE ? OR t.problem_statement LIKE ?)';
      const searchPattern = `%${searchTerm}%`;
      queryParams.push(searchPattern, searchPattern, searchPattern);
    }

    const query = `
      SELECT
        t.id,
        t.title,
        t.description,
        t.status,
        t.strategic_impact,
        t.effort_level,
        t.created_date
      FROM tasks t
      ${whereClause}
      ORDER BY
        CASE WHEN t.title LIKE ? THEN 1 ELSE 2 END,
        t.created_date DESC
      LIMIT ?
    `;

    queryParams.push(`%${searchTerm}%`, limit);

    const results = await new Promise((resolve, reject) => {
      db.query(query, queryParams, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    console.log(`Backend: Found ${results.length} tasks matching "${searchTerm}"`);

    return {
      search_term: searchTerm,
      count: results.length,
      tasks: results
    };
  },

  get_tasks_by_criteria: async (params, domainId) => {
    console.log('Backend: Getting tasks by criteria:', params, 'Domain:', domainId);

    let whereClause = 'WHERE 1=1';
    const queryParams = [];

    if (domainId) {
      whereClause += ' AND t.domain_id = ?';
      queryParams.push(domainId);
    }
    if (params.status) {
      whereClause += ' AND t.status = ?';
      queryParams.push(params.status);
    }
    if (params.strategic_impact) {
      whereClause += ' AND t.strategic_impact = ?';
      queryParams.push(params.strategic_impact);
    }
    if (params.effort_level) {
      whereClause += ' AND t.effort_level = ?';
      queryParams.push(params.effort_level);
    }

    const limit = params.limit || 10;

    const query = `
      SELECT
        t.id,
        t.title,
        t.description,
        t.status,
        t.strategic_impact,
        t.effort_level,
        t.created_date
      FROM tasks t
      ${whereClause}
      ORDER BY t.created_date DESC
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
      tasks: results
    };
  },

  get_tasks_by_initiative: async (params, domainId) => {
    console.log('Backend: Getting tasks by initiative:', params, 'Domain:', domainId);

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

    console.log(`Backend: Found ${useCases.length} use cases matching "${initiativeName}"`);

    if (useCases.length === 0) {
      return {
        initiative_name: initiativeName,
        matched_use_cases: [],
        count: 0,
        tasks: []
      };
    }

    // Get all use case IDs
    const useCaseIds = useCases.map(uc => uc.id);
    const placeholders = useCaseIds.map(() => '?').join(',');

    // Now find tasks associated with these use cases
    let taskWhereClause = `WHERE tia.use_case_id IN (${placeholders})`;
    const taskQueryParams = [...useCaseIds];

    if (domainId) {
      taskWhereClause += ' AND t.domain_id = ?';
      taskQueryParams.push(domainId);
    }

    const taskQuery = `
      SELECT DISTINCT
        t.id,
        t.title,
        t.description,
        t.status,
        t.strategic_impact,
        t.effort_level,
        t.created_date
      FROM tasks t
      INNER JOIN task_initiative_associations tia ON t.id = tia.task_id
      ${taskWhereClause}
      ORDER BY t.created_date DESC
      LIMIT ?
    `;

    taskQueryParams.push(limit);

    const tasks = await new Promise((resolve, reject) => {
      db.query(taskQuery, taskQueryParams, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    console.log(`Backend: Found ${tasks.length} tasks associated with initiative "${initiativeName}"`);

    return {
      initiative_name: initiativeName,
      matched_use_cases: useCases.map(uc => ({ id: uc.id, title: uc.title })),
      count: tasks.length,
      tasks: tasks
    };
  },

  get_task_statistics: async (params, domainId) => {
    console.log('Backend: Getting task statistics:', params, 'Domain:', domainId);

    const groupBy = params.group_by || 'status';

    let groupColumn;

    switch (groupBy) {
      case 'strategic_impact':
        groupColumn = 't.strategic_impact';
        break;
      case 'effort_level':
        groupColumn = 't.effort_level';
        break;
      default: // status
        groupColumn = 't.status';
    }

    let whereClause = 'WHERE 1=1';
    const queryParams = [];

    if (domainId) {
      whereClause += ' AND t.domain_id = ?';
      queryParams.push(domainId);
    }

    const query = `
      SELECT
        ${groupColumn} as category,
        COUNT(*) as count
      FROM tasks t
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
    const totalQuery = `SELECT COUNT(*) as total FROM tasks t ${whereClause}`;
    const totalResult = await new Promise((resolve, reject) => {
      db.query(totalQuery, queryParams, (err, results) => {
        if (err) reject(err);
        else resolve(results[0].total);
      });
    });

    return {
      group_by: groupBy,
      total_tasks: totalResult,
      breakdown: results.map(r => ({
        [groupBy]: r.category || 'Unknown',
        count: r.count
      }))
    };
  },

  get_task_details: async (params, domainId) => {
    console.log('Backend: Getting task details:', params, 'Domain:', domainId);

    let whereClause = 'WHERE 1=1';
    const queryParams = [];

    if (domainId) {
      whereClause += ' AND t.domain_id = ?';
      queryParams.push(domainId);
    }

    if (params.task_id) {
      whereClause += ' AND t.id = ?';
      queryParams.push(params.task_id);
    } else if (params.task_title) {
      whereClause += ' AND t.title LIKE ?';
      queryParams.push(`%${params.task_title}%`);
    } else {
      return { error: 'Either task_id or task_title is required' };
    }

    const query = `
      SELECT
        t.*,
        u.name as author_name
      FROM tasks t
      LEFT JOIN users u ON t.author_id = u.id
      ${whereClause}
      LIMIT 1
    `;

    const task = await new Promise((resolve, reject) => {
      db.query(query, queryParams, (err, results) => {
        if (err) reject(err);
        else resolve(results[0] || null);
      });
    });

    if (!task) {
      return { error: 'Task not found' };
    }

    // Get linked initiatives
    const initiatives = await new Promise((resolve, reject) => {
      db.query(`
        SELECT uc.id, uc.title, uc.status, uc.strategic_impact
        FROM use_cases uc
        JOIN task_initiative_associations tia ON uc.id = tia.use_case_id
        WHERE tia.task_id = ?
        ORDER BY uc.title
      `, [task.id], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    return {
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        problem_statement: task.problem_statement,
        solution_overview: task.solution_overview,
        technical_implementation: task.technical_implementation,
        results_metrics: task.results_metrics,
        status: task.status,
        strategic_impact: task.strategic_impact,
        effort_level: task.effort_level,
        author: task.author_name,
        created_date: task.created_date
      },
      linked_initiatives: initiatives,
      initiative_count: initiatives.length
    };
  },

  get_use_cases_by_tag: async (params, domainId) => {
    console.log('Backend: Getting use cases by tag:', params, 'Domain:', domainId);

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
        uc.effort_level,
        uc.expected_delivery_date,
        c.name as category,
        u.name as author_name,
        uc.created_date
      FROM use_cases uc
      INNER JOIN use_case_tags uct ON uc.id = uct.use_case_id
      LEFT JOIN categories c ON uc.category_id = c.id
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

    console.log(`Backend: Found ${useCases.length} use cases with tag "${matchedTagName}"`);
    return {
      tag_name: matchedTagName,
      count: useCases.length,
      use_cases: useCases.map(uc => ({
        id: uc.id,
        title: uc.title,
        description: uc.description,
        status: uc.status,
        strategic_impact: uc.strategic_impact,
        effort_level: uc.effort_level,
        expected_delivery_date: uc.expected_delivery_date,
        category: uc.category,
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

  const domainName = domainInfo?.name || 'Family Strategy';
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

  // Get status distribution
  const kanbanStatuses = await new Promise((resolve, reject) => {
    const statusQuery = domainId
      ? `SELECT status, COUNT(*) as count FROM use_cases WHERE domain_id = ? AND status IS NOT NULL GROUP BY status`
      : `SELECT status, COUNT(*) as count FROM use_cases WHERE status IS NOT NULL GROUP BY status`;
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

  const kanbanContext = kanbanStatuses.length > 0
    ? kanbanStatuses.map(s => `${s.status}: ${s.count} initiatives`).join(', ')
    : 'No status data available';

  const roadmapContext = roadmapDates.length > 0
    ? roadmapDates.map(r => `${r.delivery_month}: ${r.count} initiatives`).join(', ')
    : 'No upcoming deliveries scheduled';
  
  const baseInstructions = `You are Samantha, a friendly ${domainName} assistant for your family. You're having a conversation with ${userName}.

PERSONALITY: Be warm, conversational, and personable like a helpful family member. Use ${userName}'s name occasionally but not excessively. Be supportive and encouraging. Keep responses concise but informative.

CRITICAL: NEVER mention your training data cutoff date, knowledge limitations, or phrases like "My knowledge is current up to [date]" or "I am trained on data up to [date]". You have access to real-time data through functions - use them.

RESPONSE STYLE - CRITICAL FOR ALL RESPONSES:
Write like you're speaking to a family member, not writing a report. All responses must sound natural when spoken aloud. Never use structured labels like "Objective:", "Solution:", "Technical:", "Comments:", or "Description:". Speak in flowing paragraphs, not bullet lists or formatted sections. Weave comments, status, and details into a natural narrative. Lead with what's most important (status, purpose, key updates). Don't mention technical complexity, dates, authors, or granular details unless specifically requested. When someone asks "Tell me about X" give a brief overview. "What's the status" means focus on current state and progress. "Give me details" means a conversational update with key points only. Prioritize what matters most - users can check the UI for comprehensive details.

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

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 CURRENT STATE OVERVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

KANBAN STATUS DISTRIBUTION:
${kanbanContext}

ROADMAP - UPCOMING DELIVERIES (Next 6 Months):
${roadmapContext}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FAMILY CONTEXT:
Goals are what your family wants to achieve, aligned to these pillars. ${initiativePlural.charAt(0).toUpperCase() + initiativePlural.slice(1)} are specific plans and projects the family is working on. Priorities are based on family values, impact, and feasibility.

YOUR CAPABILITIES:
You can help ${userName} with questions about family ${initiativePlural}, including goals, priorities, project status and progress, and task details.

DATA ACCESS:
You have real-time functions to query family initiatives by status, goal, pillar, or priority level. You can also get goals by pillar, current statistics and counts, and detailed initiative information.

ANTI-HALLUCINATION RULES (CRITICAL):
Never make up or guess information about initiatives, goals, or statistics. If you don't have specific data, always use the available functions to get current information. If a function call fails or returns no data, say "I don't have that specific information available right now." Never provide numbers, names, or details unless they come from function calls. When asked about specific initiatives or statistics, always call the appropriate function first. Do not respond with example data or hypothetical scenarios - only real data from functions. If asked "how many" or "what are the" or "show me" you must call a function. When someone mentions any proper noun that could be an initiative name, search for it before responding. Never assume you know what something is - always search the database first.

BEHAVIORAL GUIDELINES:
If asked about topics outside family strategy, politely guide the conversation: "I can help with questions about your family's ${initiativePlural} and plans. What would you like to know?" Use the available functions to get current, accurate data rather than making assumptions. Be conversational and reference specific data when available rather than speaking generally. Use natural speech patterns like a supportive family member.

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
      if (!msg.text.includes('Welcome! I am Samantha') && !msg.text.includes('Hello ' + userName)) {
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