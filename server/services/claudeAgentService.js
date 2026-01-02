/**
 * Claude Agent Service
 *
 * This module provides Claude-based AI agent functionality using the Claude Agent SDK.
 * It leverages the full Agent SDK with:
 * - Built-in agent orchestration via createSdkMcpServer
 * - Automatic tool execution loops
 * - Memory management
 * - Structured agent patterns
 *
 * @see https://platform.claude.com/docs/en/agent-sdk/overview
 */

const { query, tool, createSdkMcpServer } = require('@anthropic-ai/claude-agent-sdk');
const { z } = require('zod');
const fs = require('fs').promises;
const path = require('path');
const db = require('../config/database-mysql-compat');

// Import existing function implementations for database operations
const { FUNCTION_IMPLEMENTATIONS } = require('./intelligentChatService');

// Import skill service for Claude Skills support
const skillService = require('./skillService');

// Import artifact service for file generation
const artifactService = require('./artifactService');

// Import code execution and html2pptx services
const codeExecutionService = require('./codeExecutionService');
const html2pptxService = require('./html2pptxService');
const docxService = require('./docxService');

// Track active workspace sessions
const activeWorkspaces = new Map();

// Track active query objects for interrupt capability (time limits + user stop)
const activeQueries = new Map(); // requestId -> { query, timeoutId, startTime }

// Time limit: 30 minutes
const QUERY_TIME_LIMIT_MS = 30 * 60 * 1000;

/**
 * Register a query for timeout and external interrupt capability
 */
function registerQuery(requestId, queryObj) {
  const timeoutId = setTimeout(async () => {
    console.log(`Query ${requestId} hit 30-minute time limit, interrupting...`);
    const entry = activeQueries.get(requestId);
    if (entry) {
      entry.wasInterrupted = true;  // Set flag before interrupt
    }
    try {
      await queryObj.interrupt();
    } catch (e) {
      console.error(`Failed to interrupt query ${requestId}:`, e.message);
    }
  }, QUERY_TIME_LIMIT_MS);

  activeQueries.set(requestId, {
    query: queryObj,
    timeoutId,
    startTime: Date.now(),
    wasInterrupted: false  // Track if interrupt was requested
  });
  console.log(`Registered query ${requestId} with ${QUERY_TIME_LIMIT_MS / 1000}s time limit`);
}

/**
 * Cleanup a query (clear timeout and remove from map)
 */
function cleanupQuery(requestId) {
  const entry = activeQueries.get(requestId);
  if (entry) {
    clearTimeout(entry.timeoutId);
    activeQueries.delete(requestId);
    console.log(`Cleaned up query ${requestId}`);
  }
}

/**
 * Interrupt a query by requestId (called from abort endpoint)
 */
async function interruptQuery(requestId) {
  const entry = activeQueries.get(requestId);
  if (entry) {
    console.log(`Interrupting query ${requestId} at user request`);
    // Mark as interrupted BEFORE calling interrupt (so generator can check)
    entry.wasInterrupted = true;
    try {
      await entry.query.interrupt();
      // Don't cleanup here - let the generator check wasInterrupted first
      return true;
    } catch (e) {
      console.error(`Failed to interrupt query ${requestId}:`, e.message);
      cleanupQuery(requestId);
      return false;
    }
  }
  return false;
}

/**
 * Check if a query was interrupted (called from generator)
 */
function wasQueryInterrupted(requestId) {
  const entry = activeQueries.get(requestId);
  return entry?.wasInterrupted || false;
}

/**
 * Write tools that require user confirmation before execution
 * These tools make permanent changes to the database
 */
const WRITE_TOOLS_REQUIRING_CONFIRMATION = [
  'create_initiative',
  'update_initiative',
  'batch_update_initiative_field',
  'add_initiative_tags',
  'align_initiative_to_goals',
  'add_initiative_comment',
  'link_related_initiatives',
  'create_task',
  'update_task',
  'batch_update_task_field',
  'link_task_to_initiatives',
  'add_task_comment'
];

/**
 * Check if a tool name is a write tool requiring confirmation
 * Handles both raw tool names and MCP-prefixed names
 */
const isWriteTool = (toolName) => {
  const rawName = toolName.includes('__') ? toolName.split('__').pop() : toolName;
  return WRITE_TOOLS_REQUIRING_CONFIRMATION.includes(rawName);
};

/**
 * Admin-only write tools - consumers cannot use these even with confirmation
 * Excludes comment tools which are allowed for all authenticated users
 */
const ADMIN_ONLY_WRITE_TOOLS = [
  'create_initiative',
  'update_initiative',
  'batch_update_initiative_field',
  'add_initiative_tags',
  'align_initiative_to_goals',
  'link_related_initiatives',
  'create_task',
  'update_task',
  'batch_update_task_field',
  'link_task_to_initiatives'
];

/**
 * Check if a tool requires admin role
 */
const requiresAdminRole = (toolName) => {
  const rawName = toolName.includes('__') ? toolName.split('__').pop() : toolName;
  return ADMIN_ONLY_WRITE_TOOLS.includes(rawName);
};

/**
 * RBAC error response for tools that require admin access
 */
const createRbacError = () => ({
  content: [{
    type: "text",
    text: JSON.stringify({
      success: false,
      error: "Admin access required. This operation is not available for your role.",
      requires_role: "admin"
    })
  }]
});

/**
 * Check if user's current message contains confirmation words
 */
const CONFIRMATION_PATTERNS = [
  /\byes\b/i,
  /\byep\b/i,
  /\byeah\b/i,
  /\bgo ahead\b/i,
  /\bproceed\b/i,
  /\bconfirm(ed)?\b/i,  // Matches "confirm" and "confirmed"
  /\bdo it\b/i,
  /\bapprove(d)?\b/i,   // Matches "approve" and "approved"
  /\bok\b/i,
  /\bokay\b/i,
  /\bsure\b/i,
  /\bplease do\b/i,
  /\bmake the changes?\b/i,
  /\bgo for it\b/i,
  /\bthat's? (fine|good|correct)\b/i,
  /\bsounds? good\b/i,
  /\blgtm\b/i,
  /\bship it\b/i,
  /\byes please\b/i,    // Added common phrase
  /\bplease proceed\b/i // Added common phrase
];

const hasUserConfirmation = (userQuery) => {
  if (!userQuery) return false;
  const queryLower = userQuery.toLowerCase().trim();
  const isShortQuery = queryLower.split(/\s+/).length <= 10;
  return isShortQuery && CONFIRMATION_PATTERNS.some(pattern => pattern.test(queryLower));
};

/**
 * User-friendly status messages for tool calls
 * Maps internal tool names to business-friendly messages
 */
const TOOL_STATUS_MESSAGES = {
  // Data retrieval tools
  get_use_cases_by_criteria: (args) => `Searching initiatives${args.status ? ` (${args.status})` : ''}...`,
  get_tasks_by_criteria: (args) => `Searching tasks${args.status ? ` (${args.status})` : ''}...`,
  search_use_cases: (args) => `Searching for "${args.search_term || args.query || 'items'}"...`,
  search_tasks: (args) => `Searching tasks for "${args.search_term || args.query || 'items'}"...`,
  get_strategic_goals_by_pillar: () => 'Loading strategic goals...',
  get_strategic_pillars: () => 'Loading strategic pillars...',
  get_use_cases_by_goal: () => 'Loading related initiatives...',
  get_use_case_statistics: () => 'Loading statistics...',
  get_task_statistics: () => 'Loading task statistics...',
  get_use_case_details: () => 'Loading initiative details...',
  get_task_details: () => 'Loading task details...',
  get_tasks_by_initiative: () => 'Loading tasks by initiative...',
  get_use_cases_by_tag: () => 'Loading initiatives by tag...',
  get_domain_metadata: () => 'Loading domain information...',

  // Workspace tools (shared by presentation, dashboard, etc.)
  workspace_init: () => null, // Hidden - internal
  workspace_write_file: (args) => args?.path?.endsWith('.html') ? 'Creating dashboard...' : 'Creating content...',
  workspace_read_file: () => null, // Hidden - internal
  workspace_list_files: () => null, // Hidden - internal
  workspace_cleanup: () => null, // Hidden - internal
  create_pptx: () => 'Generating PowerPoint...',
  render_html_to_image: () => 'Rendering preview...',
  view_thumbnail_grid: () => 'Checking slide layout...',
  execute_code: () => 'Processing...',

  // Excel tools
  excel_init: () => 'Preparing spreadsheet...',
  excel_add_sheet: () => 'Adding worksheet...',
  excel_add_rows: () => 'Adding data...',
  excel_preview: () => 'Previewing spreadsheet...',
  excel_generate: () => 'Generating Excel file...',

  // DOCX tools
  create_docx: () => 'Generating Word document...',
  extract_docx_text: () => 'Extracting text from document...',
  unpack_docx: () => 'Unpacking document for editing...',
  pack_docx: () => 'Packing document...',

  // Other tools
  create_artifact: () => 'Creating file...',
  ask_user_clarification: () => 'Asking for clarification...',

  // Write operation tools (initiatives)
  create_initiative: () => 'Creating initiative...',
  update_initiative: () => 'Updating initiative...',
  batch_update_initiative_field: (args) => `Updating ${args.initiative_ids?.length || 0} initiatives...`,
  add_initiative_tags: () => 'Adding tags...',
  align_initiative_to_goals: () => 'Aligning to strategic goals...',
  add_initiative_comment: () => 'Adding comment...',
  link_related_initiatives: () => 'Linking related initiatives...',

  // Write operation tools (tasks)
  create_task: () => 'Creating task...',
  update_task: () => 'Updating task...',
  batch_update_task_field: (args) => `Updating ${args.task_ids?.length || 0} tasks...`,
  link_task_to_initiatives: () => 'Linking task to initiatives...',
  add_task_comment: () => 'Adding comment...'
};

/**
 * User-friendly result messages for tool results
 * Returns a message to show when a tool completes
 */
const getToolResultMessage = (toolName, result) => {
  try {
    const parsed = typeof result === 'string' ? JSON.parse(result) : result;

    // Check for validation errors (self-correction)
    if (parsed.success === false && parsed.error) {
      if (parsed.error.includes('overflow') || parsed.error.includes('validation')) {
        return 'Fixing layout issues...';
      }
      return null; // Don't show other errors to user
    }

    // Show counts for data retrieval
    if (parsed.count !== undefined) {
      const noun = toolName.includes('task') ? 'tasks' : 'initiatives';
      return `Found ${parsed.count} ${noun}`;
    }
    if (Array.isArray(parsed)) {
      const noun = toolName.includes('task') ? 'tasks' : 'items';
      return `Found ${parsed.length} ${noun}`;
    }
    if (parsed.useCases && Array.isArray(parsed.useCases)) {
      return `Found ${parsed.useCases.length} initiatives`;
    }
    if (parsed.tasks && Array.isArray(parsed.tasks)) {
      return `Found ${parsed.tasks.length} tasks`;
    }

    // Artifact creation
    if (parsed.artifact) {
      return null; // Artifact handled separately
    }

    // PPTX creation
    if (parsed.path && parsed.path.includes('.pptx')) {
      return 'PowerPoint ready';
    }

    return null; // No message for other results
  } catch (e) {
    return null;
  }
};

/**
 * Get user-friendly status message for a tool call
 * Returns null if the tool should be hidden from user
 */
const getToolStatusMessage = (toolName, args = {}) => {
  const messageFunc = TOOL_STATUS_MESSAGES[toolName];
  if (!messageFunc) {
    // Unknown tool - hide it
    return null;
  }
  return messageFunc(args);
};

// Helper to mask API key for logging
const maskApiKey = (key) => {
  if (!key) return 'NO_KEY';
  if (key.length <= 8) return 'KEY_TOO_SHORT';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
};

/**
 * Get Claude configuration (supports Core42 Foundry-style)
 * When CLAUDE_CODE_USE_FOUNDRY=1, uses Core42/Compass endpoint
 * Otherwise falls back to direct Anthropic API
 */
const getClaudeConfig = () => {
  const useFoundry = process.env.CLAUDE_CODE_USE_FOUNDRY === '1';

  // Include PATH so SDK can spawn node subprocess
  const baseEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME
  };

  if (useFoundry) {
    return {
      model: process.env.ANTHROPIC_DEFAULT_SONNET_MODEL || 'claude-sonnet-4',
      env: {
        ...baseEnv,
        CLAUDE_CODE_USE_FOUNDRY: '1',
        ANTHROPIC_FOUNDRY_BASE_URL: process.env.ANTHROPIC_FOUNDRY_BASE_URL,
        ANTHROPIC_FOUNDRY_API_KEY: process.env.ANTHROPIC_FOUNDRY_API_KEY,
        ANTHROPIC_DEFAULT_SONNET_MODEL: process.env.ANTHROPIC_DEFAULT_SONNET_MODEL
      },
      isFoundry: true
    };
  }

  return {
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
    env: {
      ...baseEnv,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY
    },
    isFoundry: false
  };
};

// Get the model to use
const getClaudeModel = () => {
  return getClaudeConfig().model;
};

// Log Claude Agent SDK configuration
const config = getClaudeConfig();
console.log('Claude Agent SDK Configuration:', {
  mode: config.isFoundry ? 'Core42 Foundry' : 'Direct Anthropic',
  apiKey: maskApiKey(config.isFoundry ? process.env.ANTHROPIC_FOUNDRY_API_KEY : process.env.ANTHROPIC_API_KEY),
  baseUrl: config.isFoundry ? process.env.ANTHROPIC_FOUNDRY_BASE_URL : 'api.anthropic.com',
  model: getClaudeModel(),
  sdkVersion: 'claude-agent-sdk'
});

/**
 * Create MCP Server with Samantha-specific tools
 * Uses the Claude Agent SDK's createSdkMcpServer for built-in orchestration
 */
const createSamanthaMcpServer = (domainId = null, userId = null, userRole = null) => {
  return createSdkMcpServer({
    name: "samantha-tools",
    version: "1.0.0",
    tools: [
      // Tool 1: Get use cases by criteria
      tool(
        "get_use_cases_by_criteria",
        "Get initiatives filtered by various criteria like status, strategic impact, effort level, and delivery date",
        {
          status: z.enum(["intention", "experimentation", "commitment", "implementation", "integration"]).optional().describe("Filter by status"),
          strategic_impact: z.enum(["Low", "Medium", "High"]).optional().describe("Filter by strategic impact level"),
          effort_level: z.enum(["Low", "Medium", "High"]).optional().describe("Filter by effort level"),
          expected_delivery_date: z.string().optional().describe("Filter by expected delivery date (format: MMM YYYY, e.g., 'Jan 2025')"),
          has_delivery_date: z.boolean().optional().describe("Filter by whether initiative has a delivery date set"),
          limit: z.number().optional().describe("Maximum number of results to return (default 10)")
        },
        async (args) => {
          const result = await FUNCTION_IMPLEMENTATIONS.get_use_cases_by_criteria(args, domainId);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
          };
        }
      ),

      // Tool 2: Get strategic goals by pillar
      tool(
        "get_strategic_goals_by_pillar",
        "Get strategic goals aligned to a specific strategic pillar",
        {
          pillar_name: z.string().describe("Strategic pillar name")
        },
        async (args) => {
          const result = await FUNCTION_IMPLEMENTATIONS.get_strategic_goals_by_pillar(args, domainId);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
          };
        }
      ),

      // Tool 3: Get all strategic pillars
      tool(
        "get_strategic_pillars",
        "Get all strategic pillars",
        {},
        async (args) => {
          const result = await FUNCTION_IMPLEMENTATIONS.get_strategic_pillars(args, domainId);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
          };
        }
      ),

      // Tool 4: Get use cases by goal
      tool(
        "get_use_cases_by_goal",
        "Get family initiatives that are aligned to a specific goal",
        {
          goal_id: z.string().optional().describe("The ID of the strategic goal"),
          goal_title: z.string().optional().describe("The title/name of the strategic goal (alternative to goal_id)"),
          limit: z.number().optional().describe("Maximum number of results to return (default 50)")
        },
        async (args) => {
          const result = await FUNCTION_IMPLEMENTATIONS.get_use_cases_by_goal(args, domainId);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
          };
        }
      ),

      // Tool 5: Get use case statistics
      tool(
        "get_use_case_statistics",
        "Get real-time statistics about initiatives and goals",
        {
          group_by: z.enum(["status", "strategic_impact", "effort_level", "category"]).optional().describe("How to group the statistics")
        },
        async (args) => {
          const result = await FUNCTION_IMPLEMENTATIONS.get_use_case_statistics(args, domainId);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
          };
        }
      ),

      // Tool 6: Search use cases
      tool(
        "search_use_cases",
        "Search for use cases by name, title, or description containing specific keywords",
        {
          search_term: z.string().describe("The term to search for in use case titles and descriptions"),
          limit: z.number().optional().describe("Maximum number of results to return (default 10)")
        },
        async (args) => {
          const result = await FUNCTION_IMPLEMENTATIONS.search_use_cases(args, domainId);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
          };
        }
      ),

      // Tool 7: Get use case details
      tool(
        "get_use_case_details",
        "Get detailed information about a specific use case including full description, technical details, complexity, status, and all user comments/discussion",
        {
          use_case_id: z.string().optional().describe("ID of the use case"),
          use_case_title: z.string().optional().describe("Title or name of the use case (alternative to ID)")
        },
        async (args) => {
          const result = await FUNCTION_IMPLEMENTATIONS.get_use_case_details(args, domainId);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
          };
        }
      ),

      // Tool 8: Ask user clarification
      tool(
        "ask_user_clarification",
        "Ask the user for clarification when their query is ambiguous or needs more context",
        {
          question: z.string().describe("The clarifying question to ask the user"),
          context: z.string().optional().describe("Brief context explaining why clarification is needed")
        },
        async (args) => {
          // This is a special tool that signals the need for user input
          return {
            content: [{ type: "text", text: JSON.stringify({ clarification_needed: true, ...args }) }]
          };
        }
      ),

      // Tool 10: Get use cases by tag
      tool(
        "get_use_cases_by_tag",
        "Get family initiatives that have a specific tag (e.g., 'vacation', 'home improvement', 'education')",
        {
          tag_name: z.string().describe("The tag name to filter by (e.g., 'vacation', 'health', 'education')"),
          limit: z.number().optional().describe("Maximum number of results to return (default 20)")
        },
        async (args) => {
          const result = await FUNCTION_IMPLEMENTATIONS.get_use_cases_by_tag(args, domainId);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
          };
        }
      ),

      // Tool 11: Get domain metadata
      tool(
        "get_domain_metadata",
        "Get all metadata for the current domain including categories, tags, and strategic pillars. Use this to understand what filter values are available.",
        {},
        async (args) => {
          const result = await FUNCTION_IMPLEMENTATIONS.get_domain_metadata(args, domainId);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
          };
        }
      ),

      // Tool 12: Search tasks
      tool(
        "search_tasks",
        "Search for tasks by name, title, or description containing specific keywords",
        {
          search_term: z.string().describe("The term to search for in task titles and descriptions"),
          limit: z.number().optional().describe("Maximum number of results to return (default 10)")
        },
        async (args) => {
          const result = await FUNCTION_IMPLEMENTATIONS.search_tasks(args, domainId);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
          };
        }
      ),

      // Tool 13: Get tasks by criteria
      tool(
        "get_tasks_by_criteria",
        "Get tasks filtered by various criteria like status, strategic impact, and effort level",
        {
          status: z.enum(["intention", "experimentation", "commitment", "implementation", "integration"]).optional().describe("Filter by status"),
          strategic_impact: z.enum(["Low", "Medium", "High"]).optional().describe("Filter by strategic impact level"),
          effort_level: z.enum(["Low", "Medium", "High"]).optional().describe("Filter by effort level"),
          limit: z.number().optional().describe("Maximum number of results to return (default 10)")
        },
        async (args) => {
          const result = await FUNCTION_IMPLEMENTATIONS.get_tasks_by_criteria(args, domainId);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
          };
        }
      ),

      // Tool 14: Get tasks by initiative
      tool(
        "get_tasks_by_initiative",
        "Get tasks associated with a specific initiative by searching for the initiative name",
        {
          initiative_name: z.string().describe("The name of the initiative to find associated tasks for"),
          limit: z.number().optional().describe("Maximum number of tasks to return (default 10)")
        },
        async (args) => {
          const result = await FUNCTION_IMPLEMENTATIONS.get_tasks_by_initiative(args, domainId);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
          };
        }
      ),

      // Tool 15: Get task statistics
      tool(
        "get_task_statistics",
        "Get statistics about tasks, grouped by status, strategic impact, or effort level",
        {
          group_by: z.enum(["status", "strategic_impact", "effort_level"]).optional().describe("How to group the statistics (default: status)")
        },
        async (args) => {
          const result = await FUNCTION_IMPLEMENTATIONS.get_task_statistics(args, domainId);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
          };
        }
      ),

      // Tool 16: Get task details
      tool(
        "get_task_details",
        "Get detailed information about a specific task including full description, technical details, and linked initiatives",
        {
          task_id: z.string().optional().describe("ID of the task"),
          task_title: z.string().optional().describe("Title or name of the task (alternative to ID)")
        },
        async (args) => {
          const result = await FUNCTION_IMPLEMENTATIONS.get_task_details(args, domainId);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
          };
        }
      ),

      // Tool 17: Create artifact (downloadable files)
      tool(
        "create_artifact",
        "Create a downloadable file artifact (PowerPoint presentation, Excel spreadsheet, or HTML dashboard). Use this for simple, non-iterative file generation. For complex presentations, use the workspace tools instead. For interactive dashboards with charts, use 'dashboard' type.",
        {
          type: z.enum(["presentation", "spreadsheet", "dashboard"]).describe("Type of artifact: 'presentation' for PowerPoint, 'spreadsheet' for Excel, 'dashboard' for interactive HTML dashboard with Chart.js"),
          title: z.string().describe("Title of the artifact/document"),
          data: z.any().describe("Structured data for the artifact. For presentations: {slides: [{type: 'title'|'bullets'|'table', title, content/bullets/table}]}. For spreadsheets: {sheets: [{name, headers, data}]} or {headers, rows}. For dashboards: {content: 'full HTML string with Chart.js scripts'} or {html: 'full HTML string'}.")
        },
        async (args) => {
          try {
            console.log('📎 Creating artifact:', args.type, args.title);
            const artifact = await artifactService.createArtifact(args.type, {
              title: args.title,
              ...args.data
            });

            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  success: true,
                  artifact: {
                    id: artifact.id,
                    type: artifact.type,
                    title: artifact.title,
                    fileName: artifact.fileName,
                    downloadUrl: `/api/artifacts/${artifact.id}/download`
                  },
                  message: `Created ${artifact.type} artifact "${artifact.title}". The user can download it using the link provided.`
                })
              }]
            };
          } catch (error) {
            console.error('❌ Artifact creation failed:', error);
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error: error.message
                })
              }]
            };
          }
        }
      ),

      // Tool 11: Initialize workspace for skill execution
      tool(
        "workspace_init",
        "Initialize a workspace session for creating files, executing code, and generating presentations. Call this first before using other workspace tools.",
        {},
        async () => {
          try {
            const { v4: uuidv4 } = require('uuid');
            const sessionId = uuidv4();
            const workspacePath = await codeExecutionService.initWorkspace(sessionId);
            activeWorkspaces.set(sessionId, { created: Date.now(), path: workspacePath });

            console.log('📁 Workspace initialized:', sessionId);
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  success: true,
                  sessionId: sessionId,
                  message: "Workspace initialized. Use this sessionId for all workspace operations.",
                  directories: {
                    slides: "slides/",
                    output: "output/",
                    thumbnails: "thumbnails/"
                  }
                })
              }]
            };
          } catch (error) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ success: false, error: error.message })
              }]
            };
          }
        }
      ),

      // Tool 12: Write file to workspace
      tool(
        "workspace_write_file",
        "Write a file to the workspace. Use this to create HTML slides, CSS files, or any other content needed for presentation generation.",
        {
          sessionId: z.string().describe("The workspace session ID from workspace_init"),
          path: z.string().describe("Relative file path within workspace (e.g., 'slides/slide1.html')"),
          content: z.string().describe("File content to write")
        },
        async (args) => {
          try {
            const result = await codeExecutionService.writeFile(args.sessionId, args.path, args.content);
            console.log('📝 File written:', args.path);
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ success: true, path: args.path, message: `File written: ${args.path}` })
              }]
            };
          } catch (error) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ success: false, error: error.message })
              }]
            };
          }
        }
      ),

      // Tool 13: Read file from workspace
      tool(
        "workspace_read_file",
        "Read a file from the workspace. Use this to verify file contents or read generated output.",
        {
          sessionId: z.string().describe("The workspace session ID"),
          path: z.string().describe("Relative file path to read"),
          asBase64: z.boolean().optional().describe("Return content as base64 (for binary files like images)")
        },
        async (args) => {
          try {
            const result = args.asBase64
              ? await codeExecutionService.readFileBase64(args.sessionId, args.path)
              : await codeExecutionService.readFile(args.sessionId, args.path);
            return {
              content: [{
                type: "text",
                text: JSON.stringify(result)
              }]
            };
          } catch (error) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ success: false, error: error.message })
              }]
            };
          }
        }
      ),

      // Tool 14: List files in workspace
      tool(
        "workspace_list_files",
        "List files in a workspace directory.",
        {
          sessionId: z.string().describe("The workspace session ID"),
          path: z.string().optional().describe("Relative directory path (default: root)")
        },
        async (args) => {
          try {
            const result = await codeExecutionService.listFiles(args.sessionId, args.path || '');
            return {
              content: [{
                type: "text",
                text: JSON.stringify(result)
              }]
            };
          } catch (error) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ success: false, error: error.message })
              }]
            };
          }
        }
      ),

      // Tool 15: Execute JavaScript code
      tool(
        "execute_code",
        "Execute JavaScript code in the workspace context. Use for complex processing, rendering, or file manipulation. The code runs with Node.js and has access to fs, path, and the workspace directory.",
        {
          sessionId: z.string().describe("The workspace session ID"),
          code: z.string().describe("JavaScript code to execute. Use 'workspacePath' variable to access workspace directory.")
        },
        async (args) => {
          try {
            console.log('⚡ Executing code in workspace:', args.sessionId);
            const result = await codeExecutionService.executeJavaScript(args.sessionId, args.code);
            return {
              content: [{
                type: "text",
                text: JSON.stringify(result)
              }]
            };
          } catch (error) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ success: false, error: error.message })
              }]
            };
          }
        }
      ),

      // Tool 16: Create PPTX from HTML slides
      tool(
        "create_pptx",
        "Convert HTML slides to a PowerPoint presentation. Accepts HTML file paths (saved via workspace_write_file) or HTML content strings. Uses Playwright for accurate positioning and creates native, editable PPTX elements.",
        {
          sessionId: z.string().describe("The workspace session ID"),
          title: z.string().describe("Presentation title"),
          slides: z.array(z.string()).describe("Array of HTML file paths (e.g., 'slide1.html') or HTML content strings starting with '<'. Each slide should be a complete HTML document or body content."),
          charts: z.array(z.object({
            type: z.enum(['bar', 'line', 'pie', 'doughnut']).describe("Chart type"),
            placeholderId: z.string().optional().describe("ID of the placeholder element in HTML"),
            data: z.array(z.object({
              name: z.string(),
              labels: z.array(z.string()),
              values: z.array(z.number())
            })).describe("Chart data series"),
            title: z.string().optional().describe("Chart title"),
            colors: z.array(z.string()).optional().describe("Chart colors (hex without #)"),
            direction: z.enum(['col', 'bar']).optional().describe("Bar chart direction"),
            showLegend: z.boolean().optional(),
            categoryAxisTitle: z.string().optional(),
            valueAxisTitle: z.string().optional()
          }).nullable()).optional().describe("Chart configurations for each slide (null for slides without charts)"),
          options: z.object({
            author: z.string().optional(),
            company: z.string().optional()
          }).optional()
        },
        async (args) => {
          try {
            const workspacePath = codeExecutionService.getWorkspacePath(args.sessionId);
            console.log('Creating PPTX:', args.title, 'with', args.slides.length, 'slides');

            const result = await html2pptxService.convertHtmlToPptx(
              workspacePath,
              {
                title: args.title,
                author: args.options?.author,
                company: args.options?.company,
                slides: args.slides,
                charts: args.charts || []
              }
            );

            // Register the artifact for download
            const artifact = await artifactService.registerExternalFile(
              result.path,
              args.title,
              'presentation'
            );

            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  success: true,
                  artifact: {
                    id: artifact.id,
                    type: 'presentation',
                    title: args.title,
                    fileName: result.filename,
                    downloadUrl: `/api/artifacts/${artifact.id}/download`,
                    slideCount: result.slideCount
                  },
                  message: `Created presentation "${args.title}" with ${result.slideCount} slides. User can download via the link.`
                })
              }]
            };
          } catch (error) {
            console.error('PPTX creation failed:', error);
            
            // Provide helpful error guidance based on common issues
            let helpText = '';
            if (error.message.includes("don't match presentation layout")) {
              helpText = '\n\nFIX: The HTML body MUST have exactly: style="width: 960px; height: 540px; margin: 0; padding: 0; box-sizing: border-box;". Do NOT try other dimensions - 960x540 is the ONLY valid size.';
            } else if (error.message.includes("has border") || error.message.includes("has background")) {
              helpText = '\n\nFIX: Borders, backgrounds, and shadows are ONLY allowed on <div> elements. Wrap text in a <div> for styling: <div style="border:..."><p>text</p></div>';
            }
            
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ 
                  success: false, 
                  error: error.message + helpText
                })
              }]
            };
          }
        }
      ),

      // Tool 17: Cleanup workspace
      tool(
        "workspace_cleanup",
        "Clean up a workspace session and delete temporary files. Call this when done with presentation generation.",
        {
          sessionId: z.string().describe("The workspace session ID to cleanup")
        },
        async (args) => {
          try {
            // Skip actual cleanup to preserve workspace files for debugging/inspection
            // Files remain at: server/workspace/{sessionId}/
            // await codeExecutionService.cleanupWorkspace(args.sessionId);
            // activeWorkspaces.delete(args.sessionId);
            console.log('📁 Workspace preserved (cleanup skipped):', args.sessionId);
            console.log('   Files at: server/workspace/' + args.sessionId + '/');
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ success: true, message: "Workspace session completed (files preserved for inspection)" })
              }]
            };
          } catch (error) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ success: false, error: error.message })
              }]
            };
          }
        }
      ),

      // Tool 18: Render HTML/CSS to image (with optional preview)
      tool(
        "render_html_to_image",
        "Render HTML/CSS content to a PNG image. Use this to create individual slides. Set returnPreview=true to see the rendered result immediately for validation.",
        {
          sessionId: z.string().describe("The workspace session ID"),
          html: z.string().describe("HTML content to render. Can include inline CSS styles. Supports div, span, p, h1-h6, ul, li, strong, em elements."),
          outputPath: z.string().describe("Output path relative to workspace (e.g., 'slides/slide1.png')"),
          width: z.number().optional().describe("Image width in pixels (default: 1280)"),
          height: z.number().optional().describe("Image height in pixels (default: 720)"),
          returnPreview: z.boolean().optional().describe("If true, returns the rendered image so you can see it immediately (default: false)")
        },
        async (args) => {
          try {
            console.log('🖼️  Rendering HTML to image:', args.outputPath);
            const result = await html2pptxService.renderSlideToImage(
              args.sessionId,
              args.html,
              args.outputPath,
              { width: args.width, height: args.height }
            );

            // If preview requested, return the image so Claude can see it
            if (args.returnPreview) {
              const imageData = await fs.readFile(result.fullPath);
              const base64 = imageData.toString('base64');

              return {
                content: [
                  {
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: "image/png",
                      data: base64
                    }
                  },
                  {
                    type: "text",
                    text: `Rendered slide saved to ${result.path}. Review the visual appearance above - if it needs adjustment, re-render with updated HTML/CSS.`
                  }
                ]
              };
            }

            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  success: true,
                  path: result.path,
                  message: `Rendered HTML to ${result.path}. Use view_thumbnail_grid to see all slides, or set returnPreview=true to see individual slides.`
                })
              }]
            };
          } catch (error) {
            console.error('❌ HTML render failed:', error);
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ success: false, error: error.message })
              }]
            };
          }
        }
      ),

      // Tool 19: View thumbnail grid (with vision support)
      tool(
        "view_thumbnail_grid",
        "Generate a thumbnail grid of all rendered slide images in the workspace. Returns the grid image so you can visually validate the slides before final PPTX generation. Use this to check layouts, colors, and text rendering.",
        {
          sessionId: z.string().describe("The workspace session ID")
        },
        async (args) => {
          try {
            const workspacePath = codeExecutionService.getWorkspacePath(args.sessionId);
            const slidesDir = path.join(workspacePath, 'slides');
            const thumbsDir = path.join(workspacePath, 'thumbnails');

            // Find all PNG files in slides directory
            const files = await fs.readdir(slidesDir);
            const pngFiles = files
              .filter(f => f.endsWith('.png'))
              .sort()
              .map(f => path.join(slidesDir, f));

            if (pngFiles.length === 0) {
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({ success: false, error: "No rendered slides found. Use render_html_to_image first." })
                }]
              };
            }

            // Generate thumbnail grid
            const gridPath = await html2pptxService.generateThumbnailGrid(pngFiles, thumbsDir, {
              cols: 4,
              thumbWidth: 320,
              thumbHeight: 180
            });

            // Read as base64 for preview
            const gridData = await fs.readFile(gridPath);
            const base64 = gridData.toString('base64');

            // Return image content block so Claude can see the thumbnail grid
            return {
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: "image/png",
                    data: base64
                  }
                },
                {
                  type: "text",
                  text: `Thumbnail grid showing ${pngFiles.length} slides. Please review the visual appearance - check layouts, colors, text readability, and overall design. If any slides need adjustment, re-render them with updated HTML/CSS.`
                }
              ]
            };
          } catch (error) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ success: false, error: error.message })
              }]
            };
          }
        }
      ),

      // Tool 20: Initialize Excel workbook in workspace
      tool(
        "excel_init",
        "Initialize a new Excel workbook in the workspace. Call this before adding sheets and data. Returns a workbookId to use with other excel tools.",
        {
          sessionId: z.string().describe("The workspace session ID"),
          title: z.string().describe("Workbook title/filename")
        },
        async (args) => {
          try {
            const workspacePath = codeExecutionService.getWorkspacePath(args.sessionId);
            const workbookId = require('uuid').v4().slice(0, 8);
            const workbookPath = path.join(workspacePath, 'output', `${workbookId}_workbook.json`);

            // Initialize workbook metadata
            const workbook = {
              id: workbookId,
              title: args.title,
              sheets: [],
              createdAt: Date.now()
            };

            await fs.mkdir(path.join(workspacePath, 'output'), { recursive: true });
            await fs.writeFile(workbookPath, JSON.stringify(workbook, null, 2));

            console.log('📊 Excel workbook initialized:', workbookId);
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  success: true,
                  workbookId: workbookId,
                  title: args.title,
                  message: `Workbook "${args.title}" initialized. Use excel_add_sheet to add sheets.`
                })
              }]
            };
          } catch (error) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ success: false, error: error.message })
              }]
            };
          }
        }
      ),

      // Tool 21: Add sheet to Excel workbook
      tool(
        "excel_add_sheet",
        "Add a new sheet to the Excel workbook with headers and optional initial data.",
        {
          sessionId: z.string().describe("The workspace session ID"),
          workbookId: z.string().describe("The workbook ID from excel_init"),
          sheetName: z.string().describe("Name of the sheet (e.g., 'Summary', 'Details')"),
          headers: z.array(z.string()).describe("Column headers for the sheet"),
          rows: z.array(z.array(z.any())).optional().describe("Optional initial data rows")
        },
        async (args) => {
          try {
            const workspacePath = codeExecutionService.getWorkspacePath(args.sessionId);
            const workbookPath = path.join(workspacePath, 'output', `${args.workbookId}_workbook.json`);

            const workbook = JSON.parse(await fs.readFile(workbookPath, 'utf-8'));

            // Add new sheet
            workbook.sheets.push({
              name: args.sheetName,
              headers: args.headers,
              rows: args.rows || []
            });

            await fs.writeFile(workbookPath, JSON.stringify(workbook, null, 2));

            console.log('📋 Sheet added:', args.sheetName);
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  success: true,
                  sheetName: args.sheetName,
                  headerCount: args.headers.length,
                  rowCount: args.rows?.length || 0,
                  totalSheets: workbook.sheets.length,
                  message: `Sheet "${args.sheetName}" added with ${args.headers.length} columns and ${args.rows?.length || 0} rows.`
                })
              }]
            };
          } catch (error) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ success: false, error: error.message })
              }]
            };
          }
        }
      ),

      // Tool 22: Add rows to Excel sheet
      tool(
        "excel_add_rows",
        "Add more rows to an existing sheet in the workbook.",
        {
          sessionId: z.string().describe("The workspace session ID"),
          workbookId: z.string().describe("The workbook ID"),
          sheetName: z.string().describe("Name of the sheet to add rows to"),
          rows: z.array(z.array(z.any())).describe("Data rows to add (each row is an array of values)")
        },
        async (args) => {
          try {
            const workspacePath = codeExecutionService.getWorkspacePath(args.sessionId);
            const workbookPath = path.join(workspacePath, 'output', `${args.workbookId}_workbook.json`);

            const workbook = JSON.parse(await fs.readFile(workbookPath, 'utf-8'));
            const sheet = workbook.sheets.find(s => s.name === args.sheetName);

            if (!sheet) {
              throw new Error(`Sheet "${args.sheetName}" not found`);
            }

            sheet.rows.push(...args.rows);
            await fs.writeFile(workbookPath, JSON.stringify(workbook, null, 2));

            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  success: true,
                  sheetName: args.sheetName,
                  rowsAdded: args.rows.length,
                  totalRows: sheet.rows.length,
                  message: `Added ${args.rows.length} rows to "${args.sheetName}". Total: ${sheet.rows.length} rows.`
                })
              }]
            };
          } catch (error) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ success: false, error: error.message })
              }]
            };
          }
        }
      ),

      // Tool 23: Preview Excel workbook structure
      tool(
        "excel_preview",
        "Preview the current structure of the Excel workbook - shows all sheets, their headers, row counts, and sample data.",
        {
          sessionId: z.string().describe("The workspace session ID"),
          workbookId: z.string().describe("The workbook ID"),
          sampleRows: z.number().optional().describe("Number of sample rows to show per sheet (default: 3)")
        },
        async (args) => {
          try {
            const workspacePath = codeExecutionService.getWorkspacePath(args.sessionId);
            const workbookPath = path.join(workspacePath, 'output', `${args.workbookId}_workbook.json`);

            const workbook = JSON.parse(await fs.readFile(workbookPath, 'utf-8'));
            const sampleCount = args.sampleRows || 3;

            const preview = {
              title: workbook.title,
              sheetCount: workbook.sheets.length,
              sheets: workbook.sheets.map(sheet => ({
                name: sheet.name,
                headers: sheet.headers,
                rowCount: sheet.rows.length,
                sampleData: sheet.rows.slice(0, sampleCount)
              }))
            };

            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  success: true,
                  preview: preview,
                  message: `Workbook "${workbook.title}" has ${workbook.sheets.length} sheet(s). Review the structure and data above. Use excel_add_rows to add more data or excel_generate to create the final file.`
                }, null, 2)
              }]
            };
          } catch (error) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ success: false, error: error.message })
              }]
            };
          }
        }
      ),

      // Tool 24: Generate final Excel file
      tool(
        "excel_generate",
        "Generate the final .xlsx Excel file from the workbook data. Returns a download link.",
        {
          sessionId: z.string().describe("The workspace session ID"),
          workbookId: z.string().describe("The workbook ID"),
          options: z.object({
            author: z.string().optional(),
            autoFitColumns: z.boolean().optional().describe("Auto-fit column widths (default: true)"),
            headerStyle: z.boolean().optional().describe("Apply bold styling to headers (default: true)")
          }).optional()
        },
        async (args) => {
          try {
            const workspacePath = codeExecutionService.getWorkspacePath(args.sessionId);
            const workbookPath = path.join(workspacePath, 'output', `${args.workbookId}_workbook.json`);

            const workbookData = JSON.parse(await fs.readFile(workbookPath, 'utf-8'));
            const ExcelJS = require('exceljs');
            const workbook = new ExcelJS.Workbook();

            workbook.creator = args.options?.author || 'Samantha';
            workbook.created = new Date();

            // Create sheets
            for (const sheetData of workbookData.sheets) {
              const sheet = workbook.addWorksheet(sheetData.name);

              // Add headers
              if (sheetData.headers) {
                sheet.addRow(sheetData.headers);
                if (args.options?.headerStyle !== false) {
                  sheet.getRow(1).font = { bold: true };
                  sheet.getRow(1).fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFD4AF37' }
                  };
                }
              }

              // Add data rows
              for (const row of sheetData.rows) {
                sheet.addRow(row);
              }

              // Auto-fit columns
              if (args.options?.autoFitColumns !== false) {
                sheet.columns.forEach(column => {
                  let maxLength = 10;
                  column.eachCell({ includeEmpty: true }, cell => {
                    const cellLength = cell.value ? String(cell.value).length : 0;
                    if (cellLength > maxLength) {
                      maxLength = Math.min(cellLength, 50);
                    }
                  });
                  column.width = maxLength + 2;
                });
              }
            }

            // Save file
            const fileName = `${workbookData.title.replace(/[^a-zA-Z0-9-_\s]/g, '').replace(/\s+/g, '_')}_${args.workbookId}.xlsx`;
            const filePath = path.join(workspacePath, 'output', fileName);
            await workbook.xlsx.writeFile(filePath);

            // Register artifact
            const artifact = await artifactService.registerExternalFile(
              filePath,
              workbookData.title,
              'spreadsheet'
            );

            console.log('📊 Excel file generated:', fileName);
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  success: true,
                  artifact: {
                    id: artifact.id,
                    type: 'spreadsheet',
                    title: workbookData.title,
                    fileName: fileName,
                    downloadUrl: `/api/artifacts/${artifact.id}/download`,
                    sheetCount: workbookData.sheets.length,
                    totalRows: workbookData.sheets.reduce((sum, s) => sum + s.rows.length, 0)
                  },
                  message: `Created Excel file "${workbookData.title}" with ${workbookData.sheets.length} sheet(s). User can download via the link.`
                })
              }]
            };
          } catch (error) {
            console.error('❌ Excel generation failed:', error);
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ success: false, error: error.message })
              }]
            };
          }
        }
      ),

      // =====================================================
      // DOCX DOCUMENT TOOLS
      // =====================================================

      // Tool 25: Create Word Document
      tool(
        "create_docx",
        "Create a professional Word document (.docx). Supports sections, paragraphs, bullet/numbered lists, tables, and highlighted boxes. Returns a download link.",
        {
          sessionId: z.string().describe("The workspace session ID from workspace_init"),
          title: z.string().describe("Document title"),
          subtitle: z.string().optional().describe("Document subtitle"),
          author: z.string().optional().describe("Author name"),
          includeTableOfContents: z.boolean().optional().describe("Include table of contents (default: false)"),
          headerText: z.string().optional().describe("Header text for all pages"),
          footerText: z.string().optional().describe("Footer text"),
          sections: z.array(z.object({
            heading: z.string().optional().describe("Section heading"),
            level: z.number().optional().describe("Heading level: 1, 2, or 3 (default: 1)"),
            content: z.array(z.object({
              type: z.enum(["paragraph", "bullet", "numbered", "table", "highlight", "pagebreak"]).describe("Content type"),
              text: z.string().optional().describe("Text for paragraph or highlight"),
              title: z.string().optional().describe("Title for highlight box"),
              items: z.array(z.string()).optional().describe("Items for bullet or numbered list"),
              headers: z.array(z.string()).optional().describe("Table column headers"),
              rows: z.array(z.array(z.string())).optional().describe("Table data rows")
            })).describe("Section content items")
          })).describe("Document sections")
        },
        async (args) => {
          try {
            const workspacePath = codeExecutionService.getWorkspacePath(args.sessionId);
            console.log('Creating DOCX:', args.title);

            const result = await docxService.createDocx(workspacePath, {
              title: args.title,
              subtitle: args.subtitle,
              author: args.author,
              sections: args.sections,
              includeTableOfContents: args.includeTableOfContents,
              headerText: args.headerText,
              footerText: args.footerText
            });

            // Register the artifact for download
            const artifact = await artifactService.registerExternalFile(
              result.path,
              args.title,
              'document'
            );

            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  success: true,
                  artifact: {
                    id: artifact.id,
                    type: 'document',
                    title: args.title,
                    fileName: result.filename,
                    downloadUrl: `/api/artifacts/${artifact.id}/download`,
                    sectionCount: result.sectionCount
                  },
                  message: `Created Word document "${args.title}" with ${result.sectionCount} sections. User can download via the link.`
                })
              }]
            };
          } catch (error) {
            console.error('DOCX creation failed:', error);
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ success: false, error: error.message })
              }]
            };
          }
        }
      ),

      // Tool 26: Extract text from DOCX
      tool(
        "extract_docx_text",
        "Extract text from a Word document and convert to markdown. Useful for reading and analyzing document content. Requires pandoc.",
        {
          sessionId: z.string().describe("The workspace session ID"),
          docxPath: z.string().describe("Path to the .docx file (relative to workspace or absolute)"),
          trackChanges: z.enum(["all", "accept", "reject"]).optional().describe("How to handle tracked changes: all (show both), accept, reject (default: all)")
        },
        async (args) => {
          try {
            const workspacePath = codeExecutionService.getWorkspacePath(args.sessionId);
            const inputPath = path.isAbsolute(args.docxPath) ? args.docxPath : path.join(workspacePath, args.docxPath);
            const outputPath = path.join(workspacePath, 'output', `extracted_${Date.now()}.md`);

            await fs.mkdir(path.join(workspacePath, 'output'), { recursive: true });

            const result = await docxService.extractTextFromDocx(inputPath, outputPath, {
              trackChanges: args.trackChanges || 'all'
            });

            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  success: true,
                  content: result.content,
                  outputPath: result.path,
                  message: 'Document text extracted to markdown.'
                })
              }]
            };
          } catch (error) {
            console.error('DOCX extraction failed:', error);
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ success: false, error: error.message })
              }]
            };
          }
        }
      ),

      // Tool 27: Unpack DOCX for editing
      tool(
        "unpack_docx",
        "Unpack a Word document into its XML components for raw editing. Use this when you need to make tracked changes or complex edits. Returns suggested RSID for changes.",
        {
          sessionId: z.string().describe("The workspace session ID"),
          docxPath: z.string().describe("Path to the .docx file to unpack")
        },
        async (args) => {
          try {
            const workspacePath = codeExecutionService.getWorkspacePath(args.sessionId);
            const inputPath = path.isAbsolute(args.docxPath) ? args.docxPath : path.join(workspacePath, args.docxPath);
            const outputDir = path.join(workspacePath, 'unpacked_' + Date.now());

            const result = await docxService.unpackDocx(inputPath, outputDir);

            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  success: true,
                  unpackedPath: result.path,
                  suggestedRsid: result.suggestedRsid,
                  keyFiles: {
                    mainDocument: 'word/document.xml',
                    comments: 'word/comments.xml',
                    media: 'word/media/'
                  },
                  message: `Document unpacked. Use RSID "${result.suggestedRsid}" for tracked changes. Edit word/document.xml then use pack_docx.`
                })
              }]
            };
          } catch (error) {
            console.error('DOCX unpack failed:', error);
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ success: false, error: error.message })
              }]
            };
          }
        }
      ),

      // Tool 28: Pack DOCX from unpacked directory
      tool(
        "pack_docx",
        "Pack an unpacked Word document directory back into a .docx file. Use after making XML edits.",
        {
          sessionId: z.string().describe("The workspace session ID"),
          unpackedDir: z.string().describe("Path to the unpacked directory"),
          outputFilename: z.string().describe("Output filename for the new .docx file")
        },
        async (args) => {
          try {
            const workspacePath = codeExecutionService.getWorkspacePath(args.sessionId);
            const inputDir = path.isAbsolute(args.unpackedDir) ? args.unpackedDir : path.join(workspacePath, args.unpackedDir);
            const outputPath = path.join(workspacePath, 'output', args.outputFilename);

            await fs.mkdir(path.join(workspacePath, 'output'), { recursive: true });

            const result = await docxService.packDocx(inputDir, outputPath);

            // Register the artifact for download
            const artifact = await artifactService.registerExternalFile(
              result.path,
              args.outputFilename.replace('.docx', ''),
              'document'
            );

            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  success: true,
                  artifact: {
                    id: artifact.id,
                    type: 'document',
                    fileName: args.outputFilename,
                    downloadUrl: `/api/artifacts/${artifact.id}/download`
                  },
                  message: `Document packed successfully. User can download via the link.`
                })
              }]
            };
          } catch (error) {
            console.error('DOCX pack failed:', error);
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ success: false, error: error.message })
              }]
            };
          }
        }
      ),

      // =====================================================
      // WRITE OPERATION TOOLS (Execute Directly)
      // =====================================================

      // Tool 29: Create Initiative
      tool(
        "create_initiative",
        "Create a new initiative. Executes immediately - confirm with user before calling.",
        {
          // Required fields
          title: z.string().describe("Title of the initiative"),
          description: z.string().describe("Full description of the initiative"),
          problem_statement: z.string().describe("The problem this initiative solves"),
          solution_overview: z.string().describe("Overview of the proposed solution"),
          category: z.string().describe("Category name (must exist in domain)"),
          strategic_impact: z.enum(["Low", "Medium", "High"]).describe("Strategic impact level"),
          // Optional fields
          status: z.enum(["intention", "experimentation", "commitment", "implementation", "integration"]).optional().describe("Initiative status (default: intention)"),
          effort_level: z.enum(["Low", "Medium", "High"]).optional().describe("Effort level"),
          technical_implementation: z.string().optional().describe("Technical implementation details"),
          justification: z.string().optional().describe("Business justification"),
          owner_name: z.string().optional().describe("Initiative owner name"),
          owner_email: z.string().optional().describe("Initiative owner email"),
          expected_delivery_date: z.string().optional().describe("Expected delivery date (format: MMM YYYY)"),
          roadmap_link: z.string().optional().describe("Link to roadmap"),
          tags: z.array(z.string()).optional().describe("Tags to add to the initiative"),
          strategic_goal_ids: z.array(z.number()).optional().describe("IDs of strategic goals to align to")
        },
        async (args) => {
          // RBAC: Admin only
          if (userRole !== 'admin') return createRbacError();

          try {
            // Get category ID
            const categoryResult = await new Promise((resolve, reject) => {
              db.query('SELECT id FROM categories WHERE name = ? AND domain_id = ?', [args.category, domainId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
              });
            });
            if (categoryResult.length === 0) {
              return { content: [{ type: "text", text: JSON.stringify({ success: false, error: `Category '${args.category}' not found in this domain` }) }] };
            }
            const categoryId = categoryResult[0].id;

            const insertQuery = `
              INSERT INTO use_cases (
                title, description, problem_statement, solution_overview,
                technical_implementation, category_id, status, author_id,
                owner_name, owner_email, strategic_impact, effort_level,
                justification, expected_delivery_date, roadmap_link, domain_id
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const values = [
              args.title, args.description, args.problem_statement, args.solution_overview,
              args.technical_implementation || null, categoryId, args.status || 'intention', userId,
              args.owner_name || null, args.owner_email || null, args.strategic_impact,
              args.effort_level || 'Medium', args.justification || null, args.expected_delivery_date || null,
              args.roadmap_link || null, domainId
            ];

            await new Promise((resolve, reject) => {
              db.query(insertQuery, values, (err) => err ? reject(err) : resolve());
            });

            // Get the created initiative ID
            const newResult = await new Promise((resolve, reject) => {
              db.query('SELECT id FROM use_cases WHERE title = ? AND author_id = ? ORDER BY created_date DESC LIMIT 1', [args.title, userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
              });
            });
            const useCaseId = newResult[0]?.id;

            // Handle tags if provided
            if (args.tags && args.tags.length > 0 && useCaseId) {
              for (const tagName of args.tags) {
                await new Promise((resolve, reject) => {
                  db.query('INSERT INTO tags (name) VALUES (?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)', [tagName.trim()], (err, tagResult) => {
                    if (err) return reject(err);
                    db.query('INSERT IGNORE INTO use_case_tags (use_case_id, tag_id) VALUES (?, ?)', [useCaseId, tagResult.insertId], (err) => {
                      if (err) return reject(err);
                      resolve();
                    });
                  });
                });
              }
            }

            // Handle strategic goals if provided
            if (args.strategic_goal_ids && args.strategic_goal_ids.length > 0 && useCaseId) {
              for (const goalId of args.strategic_goal_ids) {
                await new Promise((resolve, reject) => {
                  db.query('INSERT INTO use_case_goal_alignments (use_case_id, strategic_goal_id) VALUES (?, ?)', [useCaseId, goalId], (err) => {
                    if (err) return reject(err);
                    resolve();
                  });
                });
              }
            }

            return { content: [{ type: "text", text: JSON.stringify({ success: true, id: useCaseId, title: args.title, message: `Initiative "${args.title}" created successfully` }) }] };
          } catch (error) {
            return { content: [{ type: "text", text: JSON.stringify({ success: false, error: error.message }) }] };
          }
        }
      ),

      // Tool 26: Update Initiative
      tool(
        "update_initiative",
        "Update an existing initiative. Executes immediately - confirm with user before calling.",
        {
          initiative_id: z.string().optional().describe("ID of the initiative to update"),
          initiative_title: z.string().optional().describe("Title of the initiative (alternative lookup)"),
          updates: z.object({
            title: z.string().optional(),
            description: z.string().optional(),
            problem_statement: z.string().optional(),
            solution_overview: z.string().optional(),
            technical_implementation: z.string().optional(),
            category: z.string().optional(),
            status: z.enum(["intention", "experimentation", "commitment", "implementation", "integration"]).optional(),
            strategic_impact: z.enum(["Low", "Medium", "High"]).optional(),
            effort_level: z.enum(["Low", "Medium", "High"]).optional(),
            expected_delivery_date: z.string().optional(),
            justification: z.string().optional(),
            owner_name: z.string().optional(),
            owner_email: z.string().optional(),
            roadmap_link: z.string().optional()
          }).describe("Fields to update")
        },
        async (args) => {
          // RBAC: Admin only
          if (userRole !== 'admin') return createRbacError();

          try {
            // First, look up the initiative
            let initiativeInfo = null;
            if (args.initiative_id) {
              const result = await new Promise((resolve, reject) => {
                db.query('SELECT id, title FROM use_cases WHERE id = ?', [args.initiative_id], (err, rows) => {
                  if (err) reject(err);
                  else resolve(rows[0] || null);
                });
              });
              initiativeInfo = result;
            } else if (args.initiative_title) {
              const result = await new Promise((resolve, reject) => {
                db.query('SELECT id, title FROM use_cases WHERE title LIKE ? LIMIT 1', [`%${args.initiative_title}%`], (err, rows) => {
                  if (err) reject(err);
                  else resolve(rows[0] || null);
                });
              });
              initiativeInfo = result;
            }

            if (!initiativeInfo) {
              return { content: [{ type: "text", text: JSON.stringify({ success: false, error: 'Initiative not found' }) }] };
            }

            // Build dynamic update query
            const updateFields = [];
            const values = [];
            for (const [key, value] of Object.entries(args.updates)) {
              if (value !== undefined && value !== null) {
                if (key === 'category' || key === 'department') continue; // Handle separately if needed
                updateFields.push(`${key} = ?`);
                values.push(value);
              }
            }

            if (updateFields.length === 0) {
              return { content: [{ type: "text", text: JSON.stringify({ success: true, id: initiativeInfo.id, message: 'No fields to update' }) }] };
            }

            updateFields.push('updated_date = NOW()');
            values.push(initiativeInfo.id);

            const updateQuery = `UPDATE use_cases SET ${updateFields.join(', ')} WHERE id = ?`;
            const result = await new Promise((resolve, reject) => {
              db.query(updateQuery, values, (err, res) => {
                if (err) reject(err);
                else resolve(res);
              });
            });

            return { content: [{ type: "text", text: JSON.stringify({ success: true, id: initiativeInfo.id, title: initiativeInfo.title, message: `Initiative "${initiativeInfo.title}" updated successfully`, affectedRows: result.affectedRows }) }] };
          } catch (error) {
            return { content: [{ type: "text", text: JSON.stringify({ success: false, error: error.message }) }] };
          }
        }
      ),

      // Tool 27: Batch Update Initiative Field
      tool(
        "batch_update_initiative_field",
        "Update a single field across multiple initiatives. Executes immediately - confirm with user before calling.",
        {
          initiative_ids: z.array(z.string()).describe("Array of initiative IDs to update"),
          field: z.enum(["status", "strategic_impact", "effort_level", "expected_delivery_date", "category"]).describe("The field to update"),
          value: z.string().describe("The new value for the field")
        },
        async (args) => {
          // RBAC: Admin only
          if (userRole !== 'admin') return createRbacError();

          try {
            if (!args.initiative_ids || args.initiative_ids.length === 0) {
              return { content: [{ type: "text", text: JSON.stringify({ success: false, error: 'No initiative IDs provided' }) }] };
            }

            const placeholders = args.initiative_ids.map(() => '?').join(',');
            const updateQuery = `UPDATE use_cases SET ${args.field} = ?, updated_date = NOW() WHERE id IN (${placeholders})`;

            const result = await new Promise((resolve, reject) => {
              db.query(updateQuery, [args.value, ...args.initiative_ids], (err, res) => {
                if (err) reject(err);
                else resolve(res);
              });
            });

            return { content: [{ type: "text", text: JSON.stringify({ success: true, affectedRows: result.affectedRows, message: `Updated ${args.field} to "${args.value}" for ${result.affectedRows} initiatives` }) }] };
          } catch (error) {
            return { content: [{ type: "text", text: JSON.stringify({ success: false, error: error.message }) }] };
          }
        }
      ),

      // Tool 28: Add Initiative Tags
      tool(
        "add_initiative_tags",
        "Add tags to an initiative. Executes immediately - confirm with user before calling.",
        {
          initiative_id: z.string().optional().describe("ID of the initiative"),
          initiative_title: z.string().optional().describe("Title of the initiative (alternative lookup)"),
          tags: z.array(z.string()).describe("Tags to add")
        },
        async (args) => {
          // RBAC: Admin only
          if (userRole !== 'admin') return createRbacError();

          try {
            // Look up initiative
            let initiativeInfo = null;
            if (args.initiative_id) {
              const result = await new Promise((resolve, reject) => {
                db.query('SELECT id, title FROM use_cases WHERE id = ?', [args.initiative_id], (err, rows) => {
                  if (err) reject(err);
                  else resolve(rows[0] || null);
                });
              });
              initiativeInfo = result;
            } else if (args.initiative_title) {
              const result = await new Promise((resolve, reject) => {
                db.query('SELECT id, title FROM use_cases WHERE title LIKE ? LIMIT 1', [`%${args.initiative_title}%`], (err, rows) => {
                  if (err) reject(err);
                  else resolve(rows[0] || null);
                });
              });
              initiativeInfo = result;
            }

            if (!initiativeInfo) {
              return { content: [{ type: "text", text: JSON.stringify({ success: false, error: 'Initiative not found' }) }] };
            }

            // Add each tag
            const addedTags = [];
            for (const tagName of args.tags) {
              await new Promise((resolve, reject) => {
                db.query('INSERT INTO tags (name) VALUES (?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)', [tagName.trim()], (err, tagResult) => {
                  if (err) return reject(err);
                  db.query('INSERT IGNORE INTO use_case_tags (use_case_id, tag_id) VALUES (?, ?)', [initiativeInfo.id, tagResult.insertId], (err) => {
                    if (err) return reject(err);
                    addedTags.push(tagName);
                    resolve();
                  });
                });
              });
            }

            return { content: [{ type: "text", text: JSON.stringify({ success: true, initiative_id: initiativeInfo.id, initiative_title: initiativeInfo.title, tags_added: addedTags, message: `Added ${addedTags.length} tag(s) to "${initiativeInfo.title}"` }) }] };
          } catch (error) {
            return { content: [{ type: "text", text: JSON.stringify({ success: false, error: error.message }) }] };
          }
        }
      ),

      // Tool 29: Align Initiative to Strategic Goals
      tool(
        "align_initiative_to_goals",
        "Align an initiative to strategic goals. Executes immediately - confirm with user before calling.",
        {
          initiative_id: z.string().optional().describe("ID of the initiative"),
          initiative_title: z.string().optional().describe("Title of the initiative (alternative lookup)"),
          strategic_goal_ids: z.array(z.string()).describe("IDs of strategic goals to align to (string UUIDs)")
        },
        async (args) => {
          // RBAC: Admin only
          if (userRole !== 'admin') return createRbacError();

          try {
            // Look up initiative with domain filtering
            let initiativeInfo = null;
            if (args.initiative_id) {
              const result = await new Promise((resolve, reject) => {
                const query = domainId
                  ? 'SELECT id, title, domain_id FROM use_cases WHERE id = ? AND domain_id = ?'
                  : 'SELECT id, title, domain_id FROM use_cases WHERE id = ?';
                const params = domainId ? [args.initiative_id, domainId] : [args.initiative_id];
                db.query(query, params, (err, rows) => {
                  if (err) reject(err);
                  else resolve(rows[0] || null);
                });
              });
              initiativeInfo = result;
            } else if (args.initiative_title) {
              // Try exact match first, then fuzzy match
              const result = await new Promise((resolve, reject) => {
                const baseQuery = domainId
                  ? 'SELECT id, title, domain_id FROM use_cases WHERE domain_id = ? AND '
                  : 'SELECT id, title, domain_id FROM use_cases WHERE ';
                const exactQuery = baseQuery + (domainId ? 'title = ?' : 'title = ?') + ' LIMIT 1';
                const exactParams = domainId ? [domainId, args.initiative_title] : [args.initiative_title];

                db.query(exactQuery, exactParams, (err, rows) => {
                  if (err) return reject(err);
                  if (rows && rows.length > 0) return resolve(rows[0]);

                  // Fallback to LIKE search
                  const likeQuery = baseQuery + 'title LIKE ? LIMIT 1';
                  const likeParams = domainId ? [domainId, `%${args.initiative_title}%`] : [`%${args.initiative_title}%`];
                  db.query(likeQuery, likeParams, (err2, rows2) => {
                    if (err2) reject(err2);
                    else resolve(rows2[0] || null);
                  });
                });
              });
              initiativeInfo = result;
            }

            if (!initiativeInfo) {
              return { content: [{ type: "text", text: JSON.stringify({ success: false, error: 'Initiative not found in current domain' }) }] };
            }

            // Validate that all goal IDs exist and belong to the same domain
            if (args.strategic_goal_ids && args.strategic_goal_ids.length > 0) {
              const goalValidation = await new Promise((resolve, reject) => {
                const placeholders = args.strategic_goal_ids.map(() => '?').join(',');
                const query = `
                  SELECT sg.id, sg.title, sp.domain_id
                  FROM strategic_goals sg
                  JOIN strategic_pillars sp ON sg.strategic_pillar_id = sp.id
                  WHERE sg.id IN (${placeholders})
                `;
                db.query(query, args.strategic_goal_ids, (err, rows) => {
                  if (err) reject(err);
                  else resolve(rows);
                });
              });

              // Check all goals were found
              if (goalValidation.length !== args.strategic_goal_ids.length) {
                const foundIds = goalValidation.map(g => g.id);
                const missingIds = args.strategic_goal_ids.filter(id => !foundIds.includes(id));
                return { content: [{ type: "text", text: JSON.stringify({
                  success: false,
                  error: `Strategic goal(s) not found: ${missingIds.join(', ')}`
                }) }] };
              }

              // Check all goals belong to the same domain as the initiative
              if (domainId) {
                const wrongDomainGoals = goalValidation.filter(g => g.domain_id !== domainId);
                if (wrongDomainGoals.length > 0) {
                  return { content: [{ type: "text", text: JSON.stringify({
                    success: false,
                    error: `Strategic goal(s) belong to a different domain: ${wrongDomainGoals.map(g => g.title).join(', ')}`
                  }) }] };
                }
              }
            }

            // Delete existing alignments first
            await new Promise((resolve, reject) => {
              db.query('DELETE FROM use_case_goal_alignments WHERE use_case_id = ?', [initiativeInfo.id], (err) => {
                if (err) reject(err);
                else resolve();
              });
            });

            // Add new alignments using INSERT IGNORE to handle any edge cases
            let alignedCount = 0;
            if (args.strategic_goal_ids && args.strategic_goal_ids.length > 0) {
              for (const goalId of args.strategic_goal_ids) {
                await new Promise((resolve, reject) => {
                  db.query(
                    'INSERT INTO use_case_goal_alignments (use_case_id, strategic_goal_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE use_case_id = use_case_id',
                    [initiativeInfo.id, goalId],
                    (err) => {
                      if (err) reject(err);
                      else {
                        alignedCount++;
                        resolve();
                      }
                    }
                  );
                });
              }
            }

            return { content: [{ type: "text", text: JSON.stringify({
              success: true,
              initiative_id: initiativeInfo.id,
              initiative_title: initiativeInfo.title,
              goals_aligned: alignedCount,
              message: `Aligned "${initiativeInfo.title}" to ${alignedCount} strategic goal(s)`
            }) }] };

          } catch (error) {
            return { content: [{ type: "text", text: JSON.stringify({ success: false, error: error.message }) }] };
          }
        }
      ),

      // Tool 30: Add Initiative Comment
      tool(
        "add_initiative_comment",
        "Add a comment to an initiative. Executes immediately - confirm with user before calling.",
        {
          initiative_id: z.string().optional().describe("ID of the initiative"),
          initiative_title: z.string().optional().describe("Title of the initiative (alternative lookup)"),
          content: z.string().describe("Comment content")
        },
        async (args) => {
          try {
            // Look up initiative
            let initiativeInfo = null;
            if (args.initiative_id) {
              const result = await new Promise((resolve, reject) => {
                db.query('SELECT id, title FROM use_cases WHERE id = ?', [args.initiative_id], (err, rows) => {
                  if (err) reject(err);
                  else resolve(rows[0] || null);
                });
              });
              initiativeInfo = result;
            } else if (args.initiative_title) {
              const result = await new Promise((resolve, reject) => {
                db.query('SELECT id, title FROM use_cases WHERE title LIKE ? LIMIT 1', [`%${args.initiative_title}%`], (err, rows) => {
                  if (err) reject(err);
                  else resolve(rows[0] || null);
                });
              });
              initiativeInfo = result;
            }

            if (!initiativeInfo) {
              return { content: [{ type: "text", text: JSON.stringify({ success: false, error: 'Initiative not found' }) }] };
            }

            // Use current user's ID and prefix content with (AI generated)
            const aiPrefixedContent = `(AI generated) ${args.content}`;
            await new Promise((resolve, reject) => {
              db.query('INSERT INTO comments (id, use_case_id, user_id, content) VALUES (UUID(), ?, ?, ?)', [initiativeInfo.id, userId, aiPrefixedContent], (err, res) => {
                if (err) reject(err);
                else resolve(res);
              });
            });

            return { content: [{ type: "text", text: JSON.stringify({ success: true, initiative_id: initiativeInfo.id, initiative_title: initiativeInfo.title, message: `Comment added to "${initiativeInfo.title}"` }) }] };
          } catch (error) {
            return { content: [{ type: "text", text: JSON.stringify({ success: false, error: error.message }) }] };
          }
        }
      ),

      // Tool 31: Link Related Initiatives
      tool(
        "link_related_initiatives",
        "Link two initiatives as related to each other (bidirectional). Use this to establish relationships between initiatives that share common goals, technologies, or dependencies. Executes immediately - confirm with user before calling.",
        {
          initiative_id: z.string().optional().describe("ID of the first initiative"),
          initiative_title: z.string().optional().describe("Title of the first initiative (alternative lookup)"),
          related_initiative_id: z.string().optional().describe("ID of the initiative to link"),
          related_initiative_title: z.string().optional().describe("Title of the initiative to link (alternative lookup)")
        },
        async (args) => {
          // RBAC: Admin only
          if (userRole !== 'admin') return createRbacError();

          try {
            // Resolve first initiative
            let initiative1Id = args.initiative_id;
            let initiative1Title = args.initiative_title;
            if (!initiative1Id && initiative1Title) {
              const result = await new Promise((resolve, reject) => {
                db.query('SELECT id, title FROM use_cases WHERE title LIKE ? AND domain_id = ?', [`%${initiative1Title}%`, domainId], (err, rows) => {
                  if (err) reject(err);
                  else resolve(rows);
                });
              });
              if (result.length === 0) {
                return { content: [{ type: "text", text: JSON.stringify({ success: false, error: `Initiative "${initiative1Title}" not found` }) }] };
              }
              initiative1Id = result[0].id;
              initiative1Title = result[0].title;
            }

            // Resolve second initiative
            let initiative2Id = args.related_initiative_id;
            let initiative2Title = args.related_initiative_title;
            if (!initiative2Id && initiative2Title) {
              const result = await new Promise((resolve, reject) => {
                db.query('SELECT id, title FROM use_cases WHERE title LIKE ? AND domain_id = ?', [`%${initiative2Title}%`, domainId], (err, rows) => {
                  if (err) reject(err);
                  else resolve(rows);
                });
              });
              if (result.length === 0) {
                return { content: [{ type: "text", text: JSON.stringify({ success: false, error: `Initiative "${initiative2Title}" not found` }) }] };
              }
              initiative2Id = result[0].id;
              initiative2Title = result[0].title;
            }

            if (!initiative1Id || !initiative2Id) {
              return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "Both initiatives must be specified (by ID or title)" }) }] };
            }

            if (initiative1Id === initiative2Id) {
              return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "Cannot link an initiative to itself" }) }] };
            }

            // Check if association already exists (in either direction)
            const existingResult = await new Promise((resolve, reject) => {
              db.query(
                'SELECT id FROM use_case_associations WHERE (use_case_id = ? AND related_use_case_id = ?) OR (use_case_id = ? AND related_use_case_id = ?)',
                [initiative1Id, initiative2Id, initiative2Id, initiative1Id],
                (err, rows) => {
                  if (err) reject(err);
                  else resolve(rows);
                }
              );
            });

            if (existingResult.length > 0) {
              return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "These initiatives are already linked" }) }] };
            }

            // Create the association
            await new Promise((resolve, reject) => {
              db.query(
                'INSERT INTO use_case_associations (use_case_id, related_use_case_id, created_by) VALUES (?, ?, ?)',
                [initiative1Id, initiative2Id, userId],
                (err, res) => {
                  if (err) reject(err);
                  else resolve(res);
                }
              );
            });

            // Get titles for response if not already known
            if (!initiative1Title || !initiative2Title) {
              const titles = await new Promise((resolve, reject) => {
                db.query('SELECT id, title FROM use_cases WHERE id IN (?, ?)', [initiative1Id, initiative2Id], (err, rows) => {
                  if (err) reject(err);
                  else resolve(rows);
                });
              });
              for (const row of titles) {
                if (row.id === initiative1Id) initiative1Title = row.title;
                if (row.id === initiative2Id) initiative2Title = row.title;
              }
            }

            return { content: [{ type: "text", text: JSON.stringify({ 
              success: true, 
              message: `Successfully linked "${initiative1Title}" with "${initiative2Title}"`,
              initiative_1: { id: initiative1Id, title: initiative1Title },
              initiative_2: { id: initiative2Id, title: initiative2Title }
            }) }] };
          } catch (error) {
            return { content: [{ type: "text", text: JSON.stringify({ success: false, error: error.message }) }] };
          }
        }
      ),

      // Tool 32: Create Task
      tool(
        "create_task",
        "Create a new task. Executes immediately - confirm with user before calling. At least one initiative must be linked.",
        {
          // Required fields
          title: z.string().describe("Title of the task"),
          description: z.string().describe("Full description of the task"),
          problem_statement: z.string().describe("The problem this task solves"),
          solution_overview: z.string().describe("Overview of the task's solution"),
          linked_initiative_ids: z.array(z.string()).min(1).describe("IDs of initiatives to link (at least one required)"),
          // Optional fields
          status: z.enum(["intention", "experimentation", "commitment", "implementation", "integration"]).optional().describe("Task status"),
          strategic_impact: z.enum(["Low", "Medium", "High"]).optional().describe("Strategic impact level"),
          effort_level: z.enum(["Low", "Medium", "High"]).optional().describe("Effort level"),
          technical_implementation: z.string().optional().describe("Technical implementation details"),
          justification: z.string().optional().describe("Business justification"),
          owner_name: z.string().optional().describe("Task owner name"),
          owner_email: z.string().optional().describe("Task owner email"),
          expected_delivery_date: z.string().optional().describe("Expected delivery date (format: MMM YYYY)")
        },
        async (args) => {
          // RBAC: Admin only
          if (userRole !== 'admin') return createRbacError();

          try {
            const insertQuery = `
              INSERT INTO tasks (
                title, description, problem_statement, solution_overview,
                technical_implementation, status, author_id,
                owner_name, owner_email, strategic_impact,
                effort_level, justification, expected_delivery_date, domain_id
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const values = [
              args.title, args.description, args.problem_statement, args.solution_overview,
              args.technical_implementation || null, args.status || 'intention', userId,
              args.owner_name || null, args.owner_email || null, args.strategic_impact || 'Medium',
              args.effort_level || 'Medium', args.justification || null, args.expected_delivery_date || null, domainId
            ];

            await new Promise((resolve, reject) => {
              db.query(insertQuery, values, (err) => err ? reject(err) : resolve());
            });

            // Get the created task ID
            const newResult = await new Promise((resolve, reject) => {
              db.query('SELECT id FROM tasks WHERE title = ? AND author_id = ? ORDER BY created_date DESC LIMIT 1', [args.title, userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
              });
            });
            const taskId = newResult[0]?.id;

            // Link to initiatives
            if (args.linked_initiative_ids && args.linked_initiative_ids.length > 0 && taskId) {
              for (const initiativeId of args.linked_initiative_ids) {
                await new Promise((resolve, reject) => {
                  db.query('INSERT INTO task_initiative_associations (task_id, use_case_id, created_by) VALUES (?, ?, ?)', [taskId, initiativeId, userId], (err) => {
                    if (err) reject(err);
                    else resolve();
                  });
                });
              }
            }

            return { content: [{ type: "text", text: JSON.stringify({ success: true, id: taskId, title: args.title, message: `Task "${args.title}" created successfully` }) }] };
          } catch (error) {
            return { content: [{ type: "text", text: JSON.stringify({ success: false, error: error.message }) }] };
          }
        }
      ),

      // Tool 33: Update Task
      tool(
        "update_task",
        "Update an existing task. Executes immediately - confirm with user before calling.",
        {
          task_id: z.string().optional().describe("ID of the task to update"),
          task_title: z.string().optional().describe("Title of the task (alternative lookup)"),
          updates: z.object({
            title: z.string().optional(),
            description: z.string().optional(),
            problem_statement: z.string().optional(),
            solution_overview: z.string().optional(),
            technical_implementation: z.string().optional(),
            status: z.enum(["intention", "experimentation", "commitment", "implementation", "integration"]).optional(),
            strategic_impact: z.enum(["Low", "Medium", "High"]).optional(),
            effort_level: z.enum(["Low", "Medium", "High"]).optional(),
            expected_delivery_date: z.string().optional(),
            justification: z.string().optional(),
            owner_name: z.string().optional(),
            owner_email: z.string().optional()
          }).describe("Fields to update")
        },
        async (args) => {
          // RBAC: Admin only
          if (userRole !== 'admin') return createRbacError();

          try {
            // Look up task
            let taskInfo = null;
            if (args.task_id) {
              const result = await new Promise((resolve, reject) => {
                db.query('SELECT id, title FROM tasks WHERE id = ?', [args.task_id], (err, rows) => {
                  if (err) reject(err);
                  else resolve(rows[0] || null);
                });
              });
              taskInfo = result;
            } else if (args.task_title) {
              const result = await new Promise((resolve, reject) => {
                db.query('SELECT id, title FROM tasks WHERE title LIKE ? LIMIT 1', [`%${args.task_title}%`], (err, rows) => {
                  if (err) reject(err);
                  else resolve(rows[0] || null);
                });
              });
              taskInfo = result;
            }

            if (!taskInfo) {
              return { content: [{ type: "text", text: JSON.stringify({ success: false, error: 'Task not found' }) }] };
            }

            // Build dynamic update query
            const updateFields = [];
            const values = [];
            for (const [key, value] of Object.entries(args.updates)) {
              if (value !== undefined && value !== null) {
                updateFields.push(`${key} = ?`);
                values.push(value);
              }
            }

            if (updateFields.length === 0) {
              return { content: [{ type: "text", text: JSON.stringify({ success: true, id: taskInfo.id, message: 'No fields to update' }) }] };
            }

            updateFields.push('updated_date = NOW()');
            values.push(taskInfo.id);

            const updateQuery = `UPDATE tasks SET ${updateFields.join(', ')} WHERE id = ?`;
            const result = await new Promise((resolve, reject) => {
              db.query(updateQuery, values, (err, res) => {
                if (err) reject(err);
                else resolve(res);
              });
            });

            return { content: [{ type: "text", text: JSON.stringify({ success: true, id: taskInfo.id, title: taskInfo.title, message: `Task "${taskInfo.title}" updated successfully`, affectedRows: result.affectedRows }) }] };
          } catch (error) {
            return { content: [{ type: "text", text: JSON.stringify({ success: false, error: error.message }) }] };
          }
        }
      ),

      // Tool 34: Batch Update Task Field
      tool(
        "batch_update_task_field",
        "Update a single field across multiple tasks. Executes immediately - confirm with user before calling.",
        {
          task_ids: z.array(z.string()).describe("Array of task IDs to update"),
          field: z.enum(["status", "strategic_impact", "effort_level", "expected_delivery_date"]).describe("The field to update"),
          value: z.string().describe("The new value for the field")
        },
        async (args) => {
          // RBAC: Admin only
          if (userRole !== 'admin') return createRbacError();

          try {
            if (!args.task_ids || args.task_ids.length === 0) {
              return { content: [{ type: "text", text: JSON.stringify({ success: false, error: 'No task IDs provided' }) }] };
            }

            const placeholders = args.task_ids.map(() => '?').join(',');
            const updateQuery = `UPDATE tasks SET ${args.field} = ?, updated_date = NOW() WHERE id IN (${placeholders})`;

            const result = await new Promise((resolve, reject) => {
              db.query(updateQuery, [args.value, ...args.task_ids], (err, res) => {
                if (err) reject(err);
                else resolve(res);
              });
            });

            return { content: [{ type: "text", text: JSON.stringify({ success: true, affectedRows: result.affectedRows, message: `Updated ${args.field} to "${args.value}" for ${result.affectedRows} tasks` }) }] };
          } catch (error) {
            return { content: [{ type: "text", text: JSON.stringify({ success: false, error: error.message }) }] };
          }
        }
      ),

      // Tool 35: Link Task to Initiatives
      tool(
        "link_task_to_initiatives",
        "Link a task to additional initiatives. Executes immediately - confirm with user before calling.",
        {
          task_id: z.string().optional().describe("ID of the task"),
          task_title: z.string().optional().describe("Title of the task (alternative lookup)"),
          initiative_ids: z.array(z.string()).describe("IDs of initiatives to link")
        },
        async (args) => {
          // RBAC: Admin only
          if (userRole !== 'admin') return createRbacError();

          try {
            // Look up task
            let taskInfo = null;
            if (args.task_id) {
              const result = await new Promise((resolve, reject) => {
                db.query('SELECT id, title FROM tasks WHERE id = ?', [args.task_id], (err, rows) => {
                  if (err) reject(err);
                  else resolve(rows[0] || null);
                });
              });
              taskInfo = result;
            } else if (args.task_title) {
              const result = await new Promise((resolve, reject) => {
                db.query('SELECT id, title FROM tasks WHERE title LIKE ? LIMIT 1', [`%${args.task_title}%`], (err, rows) => {
                  if (err) reject(err);
                  else resolve(rows[0] || null);
                });
              });
              taskInfo = result;
            }

            if (!taskInfo) {
              return { content: [{ type: "text", text: JSON.stringify({ success: false, error: 'Task not found' }) }] };
            }

            // Link to initiatives
            let linkedCount = 0;
            for (const initiativeId of args.initiative_ids) {
              await new Promise((resolve, reject) => {
                db.query('INSERT IGNORE INTO task_initiative_associations (task_id, use_case_id, created_by) VALUES (?, ?, ?)', [taskInfo.id, initiativeId, userId], (err) => {
                  if (err) reject(err);
                  else { linkedCount++; resolve(); }
                });
              });
            }

            return { content: [{ type: "text", text: JSON.stringify({ success: true, task_id: taskInfo.id, task_title: taskInfo.title, initiatives_linked: linkedCount, message: `Linked task "${taskInfo.title}" to ${linkedCount} initiative(s)` }) }] };
          } catch (error) {
            return { content: [{ type: "text", text: JSON.stringify({ success: false, error: error.message }) }] };
          }
        }
      ),

      // Tool 36: Add Task Comment
      tool(
        "add_task_comment",
        "Add a comment to a task. Executes immediately - confirm with user before calling.",
        {
          task_id: z.string().optional().describe("ID of the task"),
          task_title: z.string().optional().describe("Title of the task (alternative lookup)"),
          content: z.string().describe("Comment content")
        },
        async (args) => {
          try {
            // Look up task
            let taskInfo = null;
            if (args.task_id) {
              const result = await new Promise((resolve, reject) => {
                db.query('SELECT id, title FROM tasks WHERE id = ?', [args.task_id], (err, rows) => {
                  if (err) reject(err);
                  else resolve(rows[0] || null);
                });
              });
              taskInfo = result;
            } else if (args.task_title) {
              const result = await new Promise((resolve, reject) => {
                db.query('SELECT id, title FROM tasks WHERE title LIKE ? LIMIT 1', [`%${args.task_title}%`], (err, rows) => {
                  if (err) reject(err);
                  else resolve(rows[0] || null);
                });
              });
              taskInfo = result;
            }

            if (!taskInfo) {
              return { content: [{ type: "text", text: JSON.stringify({ success: false, error: 'Task not found' }) }] };
            }

            // Use current user's ID and prefix content with (AI generated)
            const aiPrefixedContent = `(AI generated) ${args.content}`;
            await new Promise((resolve, reject) => {
              db.query('INSERT INTO comments (id, task_id, user_id, content) VALUES (UUID(), ?, ?, ?)', [taskInfo.id, userId, aiPrefixedContent], (err, res) => {
                if (err) reject(err);
                else resolve(res);
              });
            });

            return { content: [{ type: "text", text: JSON.stringify({ success: true, task_id: taskInfo.id, task_title: taskInfo.title, message: `Comment added to task "${taskInfo.title}"` }) }] };
          } catch (error) {
            return { content: [{ type: "text", text: JSON.stringify({ success: false, error: error.message }) }] };
          }
        }
      )
    ]
  });
};

/**
 * Build intelligent system prompt with dynamic data and active skills
 * @param {string} userName - The user's name
 * @param {string|null} domainId - Optional domain ID
 * @param {string[]} activeSkills - Array of active skill names to include
 */
const buildClaudeSystemPrompt = async (userName, domainId = null, activeSkills = []) => {
  console.log('🧠 Claude Agent SDK: Building system prompt for user:', userName, 'Domain ID:', domainId);
  console.log('📚 Active skills:', activeSkills.length > 0 ? activeSkills.join(', ') : 'none');

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

  // Get strategic pillars for the prompt
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
  const pillarNames = pillars.map(p => p.name).join(', ');

  const basePrompt = `You are Samantha, a friendly ${domainName} assistant for your family. You're having a conversation with ${userName}.

PERSONALITY: Be warm, conversational, and personable like a helpful family member. Use ${userName}'s name occasionally but not excessively. Be supportive and encouraging. Keep responses concise but informative.

RESPONSE STYLE - CRITICAL FOR ALL RESPONSES:
Write like you're speaking to a family member, not writing a report. All responses must sound natural when spoken aloud. Never use structured labels like "Objective:", "Solution:", "Technical:", "Comments:", or "Description:". Speak in flowing paragraphs, not bullet lists or formatted sections. Weave comments, status, and details into a natural narrative. Lead with what's most important (status, purpose, key updates). Don't mention technical complexity, dates, authors, or granular details unless specifically requested.

CONTEXT YOU SHOULD KNOW:
The family's strategic pillars guiding all ${initiativePlural} are: ${pillarNames}. Goals are what your family wants to achieve, aligned to these pillars. ${initiativePlural.charAt(0).toUpperCase() + initiativePlural.slice(1)} are specific plans and projects the family is working on. Status values follow a progress model: intention (idea stage), experimentation (trying it out), commitment (decided to do it), implementation (actively working on it), integration (completed and part of family life).

YOUR CAPABILITIES:
You can help ${userName} with questions about family ${initiativePlural}, including goals, priorities, project status and progress, and tasks associated with family plans.

DATA ACCESS:
You have real-time tools to query family initiatives by status, goal, pillar, or priority level. You can also get goals by pillar, current statistics and counts, and detailed initiative information. You can search and filter tasks as well.

ANTI-HALLUCINATION RULES (CRITICAL):
Never make up or guess information about initiatives, goals, or statistics. If you don't have specific data, always use the available tools to get current information. If a tool call fails or returns no data, say "I don't have that specific information available right now." Never provide numbers, names, or details unless they come from tool calls. When asked about specific initiatives or statistics, always call the appropriate tool first. Do not respond with example data or hypothetical scenarios - only real data from tools.

BEHAVIORAL GUIDELINES:
If asked about topics outside family strategy, politely guide the conversation back: "I can help with questions about your family's ${initiativePlural} and plans. What would you like to know?" Use the available tools to get current, accurate data rather than making assumptions.

FORMATTING:
Use markdown formatting to make responses clear and scannable:
- Use bullet points for lists of items (3+ items)
- Use numbered lists for sequential steps or ranked items
- Use markdown tables (| Column | Column |) for comparing data or showing structured information
- Use **bold** for emphasis on key terms
- Keep responses concise but well-structured
- Avoid excessive whitespace

CRITICAL - WRITE OPERATIONS REQUIRE USER CONFIRMATION (THIS IS MANDATORY):
You have tools that can create, update, and modify initiatives and tasks in the database. These execute IMMEDIATELY and make PERMANENT changes.

**STOP AND ASK BEFORE ANY WRITE OPERATION** - This is your most important rule:
1. FIRST: Explain what you plan to do and list ALL items that will be affected
2. SECOND: Ask explicitly "Would you like me to proceed with these changes?" and WAIT for user response
3. THIRD: Only call write tools AFTER the user explicitly confirms (e.g., "yes", "go ahead", "proceed", "confirm")

Write tools that REQUIRE confirmation: create_initiative, update_initiative, batch_update_initiative_field, add_initiative_tags, align_initiative_to_goals, add_initiative_comment, create_task, update_task, batch_update_task_field, link_task_to_initiatives, add_task_comment

VIOLATION: If you call ANY write tool without first asking and receiving user confirmation, you have violated your core operating rules. Even if the user's request seems clear, you MUST ask for confirmation before executing writes.

Example of CORRECT behavior:
User: "Tag all vacation planning initiatives with 'Priority'"
You: "I found 3 vacation planning initiatives. I'll add the tag 'Priority' to all of them. Would you like me to proceed with tagging these 3 initiatives?"
[Wait for user to say yes]
Then call add_initiative_tags

Example of INCORRECT behavior (DO NOT DO THIS):
User: "Tag all vacation planning initiatives with 'Priority'"
You: [Immediately calls add_initiative_tags without asking] - THIS IS WRONG

MANDATORY: When users ask about priorities, specific initiatives, family goals, or progress, you must use the available tools to provide accurate, current information.`;

  // Append active skill instructions
  if (activeSkills.length > 0) {
    let skillsPrompt = '\n\n--- ACTIVE SKILLS ---\nThe following specialized skills are active for this session. When the user\'s request matches a skill\'s capabilities, follow that skill\'s instructions.\n';

    for (const skillName of activeSkills) {
      try {
        const skillPrompt = await skillService.getSkillPrompt(skillName);
        skillsPrompt += skillPrompt;
      } catch (err) {
        console.warn(`Failed to load skill ${skillName}:`, err.message);
      }
    }

    return basePrompt + skillsPrompt;
  }

  return basePrompt;
};

/**
 * Generate response using Claude Agent SDK with built-in orchestration
 * Uses the query() function for automatic tool execution loops
 *
 * @param {string} userQuery - The user's query
 * @param {Array} conversationHistory - Previous conversation messages
 * @param {string} userName - The user's name
 * @param {string|null} domainId - Optional domain ID
 * @param {Object} options - Additional options
 * @param {string[]} options.activeSkills - Explicitly activated skills
 * @param {boolean} options.autoDetectSkills - Whether to auto-detect skills from query (default: true)
 */
const generateClaudeAgentResponse = async (
  userQuery,
  conversationHistory = [],
  userName = 'unknown',
  domainId = null,
  options = {}
) => {
  console.log('🤖 Claude Agent SDK: Generating response for:', userName);
  console.log('💬 Query:', userQuery);
  console.log('🏢 Domain ID:', domainId);

  const startTime = Date.now();
  let iterationsUsed = 0;
  let finalResponse = '';
  let usedSkills = [];
  let sessionId = null; // Track SDK session for multi-turn conversations
  let collectedArtifacts = []; // Track artifacts from tool results
  let toolExecutions = []; // Track tool executions for UI progress display
  let pendingToolUse = null; // Track pending tool_use to match with tool_result

  try {
    // Only load skills that the user has explicitly activated in the UI
    const activeSkills = options.activeSkills || [];
    usedSkills = activeSkills;

    if (activeSkills.length > 0) {
      console.log('Skills activated by user:', activeSkills.join(', '));
    } else {
      console.log('No skills activated - using base capabilities only');
    }

    // Build system prompt with active skills
    const systemPrompt = await buildClaudeSystemPrompt(userName, domainId, activeSkills);

    // Create MCP server with tools bound to domainId, userId, and userRole (for RBAC)
    const userId = options.userId || null;
    const userRole = options.userRole || null;
    const samanthaServer = createSamanthaMcpServer(domainId, userId, userRole);

    // Build conversation context
    const contextMessages = conversationHistory
      .filter(msg => msg.text && !msg.text.includes('Welcome! I am Samantha'))
      .map(msg => `${msg.isUser ? 'User' : 'Assistant'}: ${msg.text}`)
      .join('\n');

    const fullPrompt = contextMessages
      ? `Previous conversation:\n${contextMessages}\n\nCurrent query: ${userQuery}`
      : userQuery;

    // Use the Claude Agent SDK query() function with built-in orchestration
    // Check if we should resume an existing session for multi-turn conversations
    const resumeSessionId = options.sessionId || null;
    if (resumeSessionId) {
      console.log('🔄 Claude Agent SDK: Resuming session:', resumeSessionId);
    } else {
      console.log('🆕 Claude Agent SDK: Starting new session');
    }
    console.log('🔧 Claude Agent SDK: Starting query with automatic tool orchestration');

    for await (const message of query({
      prompt: fullPrompt,
      options: {
        model: getClaudeModel(),
        env: getClaudeConfig().env, // Core42 Foundry or Anthropic API config
        systemPrompt: systemPrompt,
        permissionMode: 'default', // Default mode with hooks and canUseTool for human-in-the-loop
        mcpServers: {
          "samantha-tools": samanthaServer
        },
        // PreToolUse hooks - return 'ask' for write tools to trigger canUseTool
        hooks: {
          PreToolUse: [{
            matcher: "*", // Match all tools
            hooks: [async (inputData) => {
              const toolName = inputData.tool_name;
              console.log(`PreToolUse Hook: Checking tool "${toolName}"`);
              
              if (isWriteTool(toolName)) {
                console.log(`PreToolUse Hook: Write tool "${toolName}" - returning 'ask' to trigger canUseTool`);
                return {
                  hookSpecificOutput: {
                    hookEventName: "PreToolUse",
                    permissionDecision: "ask" // This triggers canUseTool callback
                  }
                };
              }
              
              // Auto-allow read-only tools
              console.log(`PreToolUse Hook: Read tool "${toolName}" - auto-allowing`);
              return {
                hookSpecificOutput: {
                  hookEventName: "PreToolUse",
                  permissionDecision: "allow"
                }
              };
            }]
          }]
        },
        // Resume previous session if sessionId provided (enables multi-turn memory)
        ...(resumeSessionId && { resume: resumeSessionId }),
        allowedTools: [
          // Read-only tools
          "mcp__samantha-tools__get_use_cases_by_criteria",
          "mcp__samantha-tools__get_strategic_goals_by_pillar",
          "mcp__samantha-tools__get_strategic_pillars",
          "mcp__samantha-tools__get_use_cases_by_goal",
          "mcp__samantha-tools__get_use_case_statistics",
          "mcp__samantha-tools__search_use_cases",
          "mcp__samantha-tools__get_use_case_details",
          "mcp__samantha-tools__ask_user_clarification",
          "mcp__samantha-tools__get_use_cases_by_tag",
          "mcp__samantha-tools__get_domain_metadata",
          "mcp__samantha-tools__search_tasks",
          "mcp__samantha-tools__get_tasks_by_criteria",
          "mcp__samantha-tools__get_tasks_by_initiative",
          "mcp__samantha-tools__get_task_statistics",
          "mcp__samantha-tools__get_task_details",
          "mcp__samantha-tools__create_artifact",
          "mcp__samantha-tools__workspace_init",
          "mcp__samantha-tools__workspace_write_file",
          "mcp__samantha-tools__workspace_read_file",
          "mcp__samantha-tools__workspace_list_files",
          "mcp__samantha-tools__execute_code",
          "mcp__samantha-tools__create_pptx",
          "mcp__samantha-tools__workspace_cleanup",
          "mcp__samantha-tools__render_html_to_image",
          "mcp__samantha-tools__view_thumbnail_grid",
          "mcp__samantha-tools__excel_init",
          "mcp__samantha-tools__excel_add_sheet",
          "mcp__samantha-tools__excel_add_rows",
          "mcp__samantha-tools__excel_preview",
          "mcp__samantha-tools__excel_generate",
          // DOCX document tools
          "mcp__samantha-tools__create_docx",
          "mcp__samantha-tools__extract_docx_text",
          "mcp__samantha-tools__unpack_docx",
          "mcp__samantha-tools__pack_docx",
          // Write operation tools - in allowedTools so Claude knows they exist,
          // but PreToolUse hook returns 'ask' to trigger canUseTool for approval
          "mcp__samantha-tools__create_initiative",
          "mcp__samantha-tools__update_initiative",
          "mcp__samantha-tools__batch_update_initiative_field",
          "mcp__samantha-tools__add_initiative_tags",
          "mcp__samantha-tools__align_initiative_to_goals",
          "mcp__samantha-tools__add_initiative_comment",
          "mcp__samantha-tools__link_related_initiatives",
          "mcp__samantha-tools__create_task",
          "mcp__samantha-tools__update_task",
          "mcp__samantha-tools__batch_update_task_field",
          "mcp__samantha-tools__link_task_to_initiatives",
          "mcp__samantha-tools__add_task_comment"
        ],
        maxTurns: options.maxTurns || 25,
        ...options,
        // canUseTool callback - called when PreToolUse hook returns 'ask'
        canUseTool: async (toolName, input) => {
          console.log(`canUseTool: Checking tool ${toolName}`);
          if (isWriteTool(toolName)) {
            if (hasUserConfirmation(userQuery)) {
              console.log(`canUseTool: ALLOWING write tool ${toolName} - user confirmed`);
              return { behavior: 'allow', updatedInput: input };
            }
            const rawToolName = toolName.includes('__') ? toolName.split('__').pop() : toolName;
            console.log(`canUseTool: DENYING write tool ${toolName} - needs confirmation`);
            return { 
              behavior: 'deny', 
              message: `I need your confirmation before I can ${rawToolName.replace(/_/g, ' ')}. Please say "yes" or "go ahead" to proceed.`,
              interrupt: false
            };
          }
          return { behavior: 'allow', updatedInput: input };
        }
      }
    })) {
      // Capture session_id from any message (all SDK messages have session_id)
      if (message.session_id && !sessionId) {
        sessionId = message.session_id;
        console.log('📍 Claude Agent SDK: Session ID captured:', sessionId);
      }

      // Debug: log all message types to understand SDK structure
      console.log(`📨 SDK Message: type=${message.type}, subtype=${message.subtype || 'n/a'}`);

      // Process messages from the agent loop
      if (message.type === 'assistant') {
        iterationsUsed++;
        console.log(`🔄 Iteration ${iterationsUsed}: Assistant response`);

        // Check if assistant message contains tool_use blocks
        if (message.message?.content) {
          for (const block of message.message.content) {
            if (block.type === 'tool_use') {
              console.log(`🔧 Tool called (from assistant): ${block.name}`);
              pendingToolUse = {
                iteration: iterationsUsed,
                function_name: block.name,
                arguments: block.input || {},
                timestamp: Date.now()
              };
            }
          }
        }

        // Capture assistant message content as potential final response
        // This is important when Claude uses tools - the actual response text is in assistant messages
        if (message.message?.content) {
          const textContent = message.message.content
            .filter(block => block.type === 'text')
            .map(block => block.text)
            .join('\n');
          if (textContent.trim()) {
            finalResponse = textContent;
            console.log(`📝 Captured assistant text (${textContent.length} chars)`);
          }
        }
      } else if (message.type === 'tool_use') {
        console.log(`🔧 Tool called: ${message.name}`);
        // Track the tool execution for UI display
        pendingToolUse = {
          iteration: iterationsUsed,
          function_name: message.name,
          arguments: message.input || {},
          timestamp: Date.now()
        };
      } else if (message.type === 'tool_result') {
        console.log(`📊 Tool result received`);
        // Complete the pending tool execution with results
        if (pendingToolUse) {
          let resultSummary = 'Completed';
          let success = true;

          // Extract result summary from tool result content
          try {
            if (message.content && Array.isArray(message.content)) {
              for (const block of message.content) {
                if (block.type === 'text') {
                  const parsed = JSON.parse(block.text);

                  if (parsed.success !== undefined) {
                    success = parsed.success;
                    if (parsed.count !== undefined) {
                      resultSummary = `${parsed.count} results`;
                    } else if (parsed.artifact) {
                      resultSummary = `Created ${parsed.artifact.type}: ${parsed.artifact.title}`;
                      // Also collect artifact
                      collectedArtifacts.push(parsed.artifact);
                      console.log(`Artifact collected: ${parsed.artifact.title} (${parsed.artifact.id})`);
                    } else if (parsed.message) {
                      resultSummary = parsed.message;
                    }
                  } else if (Array.isArray(parsed)) {
                    resultSummary = `${parsed.length} results`;
                  }
                }
              }
            }
          } catch (e) {
            // Not JSON, use default summary
          }

          toolExecutions.push({
            ...pendingToolUse,
            success: success,
            result_summary: resultSummary
          });
          pendingToolUse = null;
        }
      } else if (message.type === 'result' && message.subtype === 'success') {
        // Use result if provided, otherwise keep the captured assistant response
        if (message.result && message.result.trim()) {
          finalResponse = message.result;
        }
        // Also capture session_id from result message
        if (message.session_id) {
          sessionId = message.session_id;
        }
        console.log('✅ Claude Agent SDK: Query completed successfully');
        console.log('📍 Final session ID:', sessionId);
        console.log(`📝 Final response length: ${finalResponse?.length || 0} chars`);
      } else if (message.type === 'result' && message.subtype === 'error') {
        console.error('❌ Claude Agent SDK: Query failed:', message.error);
        throw new Error(message.error);
      }
    }

    const executionTime = Date.now() - startTime;

    // If artifacts were collected, append them to the response for frontend parsing
    let enhancedResponse = finalResponse || `I couldn't generate a response, ${userName}. Please try rephrasing your question.`;
    if (collectedArtifacts.length > 0) {
      console.log(`📎 Total artifacts collected: ${collectedArtifacts.length}`);
      // Append artifact JSON to response so frontend can parse it
      for (const artifact of collectedArtifacts) {
        enhancedResponse += `\n\n{"success":true,"artifact":${JSON.stringify(artifact)}}`;
      }
    }

    return {
      response: enhancedResponse,
      iterations_used: iterationsUsed,
      execution_time_ms: executionTime,
      provider: 'claude-agent-sdk',
      skills_used: usedSkills,
      session_id: sessionId, // Return session_id for multi-turn conversation support
      artifacts: collectedArtifacts, // Also return artifacts directly
      tool_executions: toolExecutions // Tool call data for UI progress display
    };

  } catch (error) {
    console.error('❌ Claude Agent SDK: Error details:', {
      message: error.message,
      apiKey: maskApiKey(process.env.ANTHROPIC_API_KEY)
    });
    throw error;
  }
};

/**
 * Synthesis Agent: Converts responses into conversational, voice-ready format
 * Uses a lightweight Claude call for reformatting
 */
const synthesizeClaudeResponse = async (originalResponse, userQuery) => {
  try {
    console.log('🎨 Claude Agent SDK: Running synthesis for conversational output');

    const synthesisPrompt = `You are a conversational synthesis agent. Your ONLY job is to reformat responses into natural language WITHOUT changing any facts.

CRITICAL RULES - MUST FOLLOW:
1. NEVER add information that is not in the original response
2. NEVER make up details, examples, or explanations
3. NEVER generalize specific facts into vague descriptions
4. If the original mentions specific names, numbers, or titles - USE THEM EXACTLY
5. Only change formatting: remove bullets/labels, combine into flowing paragraphs
6. If original says "I don't have that information" - keep that message
7. Preserve ALL specific details: initiative names, goal titles, departments, statuses, dates, numbers

CONCISENESS REQUIREMENT:
- Keep response under 75-90 words (roughly 30 seconds of speech)
- For lists of multiple items, mention 2-3 key examples then summarize the rest
- Focus on the most relevant information to the query
- Be brief but don't lose critical facts

FORMATTING CHANGES ONLY:
- Remove bullet points and numbered lists
- Remove labels like "Objective:", "Status:", "Description:"
- Combine items into narrative sentences with natural transitions
- Make it sound conversational when spoken aloud

Original Query: "${userQuery}"

Response to Rewrite (PRESERVE ALL FACTS, KEEP BRIEF):
${originalResponse}`;

    // Use a simple query for synthesis
    let synthesizedText = originalResponse;

    for await (const message of query({
      prompt: synthesisPrompt,
      options: {
        model: getClaudeModel(),
        env: getClaudeConfig().env, // Core42 Foundry or Anthropic API config
        maxTurns: 1 // No tools needed for synthesis
      }
    })) {
      if (message.type === 'result' && message.subtype === 'success') {
        synthesizedText = message.result;
      }
    }

    console.log('✅ Claude Agent SDK: Synthesis completed successfully');
    console.log(`   Original length: ${originalResponse.length} chars`);
    console.log(`   Synthesized length: ${synthesizedText.length} chars`);

    return synthesizedText;

  } catch (error) {
    console.error('❌ Claude Agent SDK: Synthesis failed:', error.message);
    console.log('⚠️  Falling back to original response');
    return originalResponse;
  }
};

// Tool names for validation
const CLAUDE_TOOL_NAMES = [
  'get_use_cases_by_criteria',
  'get_strategic_goals_by_pillar',
  'get_strategic_pillars',
  'get_use_cases_by_goal',
  'get_use_case_statistics',
  'search_use_cases',
  'get_use_case_details',
  'ask_user_clarification',
  'create_artifact',
  'workspace_init',
  'workspace_write_file',
  'workspace_read_file',
  'workspace_list_files',
  'execute_code',
  'create_pptx',
  'workspace_cleanup',
  'render_html_to_image',
  'view_thumbnail_grid',
  'excel_init',
  'excel_add_sheet',
  'excel_add_rows',
  'excel_preview',
  'excel_generate',
  // DOCX document tools
  'create_docx',
  'extract_docx_text',
  'unpack_docx',
  'pack_docx',
  // Write operation tools (initiatives)
  'create_initiative',
  'update_initiative',
  'batch_update_initiative_field',
  'add_initiative_tags',
  'align_initiative_to_goals',
  'add_initiative_comment',
  // Write operation tools (tasks)
  'create_task',
  'update_task',
  'batch_update_task_field',
  'link_task_to_initiatives',
  'add_task_comment'
];

/**
 * Streaming version of generateClaudeAgentResponse
 * Yields progress events for real-time UI updates
 *
 * @yields {Object} Progress events with type: 'thinking', 'tool_call', 'tool_result', 'text', 'done', 'error'
 */
async function* generateClaudeAgentResponseStream(
  userQuery,
  conversationHistory = [],
  userName = 'unknown',
  domainId = null,
  options = {}
) {
  console.log('STREAM: Claude Agent SDK: Starting streaming response for:', userName);

  const startTime = Date.now();
  let iterationsUsed = 0;
  let finalResponse = '';
  let usedSkills = [];
  let sessionId = null;
  let collectedArtifacts = [];
  let toolExecutions = [];
  let pendingToolUse = null;
  
  // Human-in-the-loop: AbortController to stop SDK when permission is needed
  const abortController = new AbortController();
  let permissionAborted = false;
  const permissionGranted = options.permissionGranted || false;
  
  // Track thinking/reasoning content from Claude
  let thinkingContent = '';

  try {
    // Yield initial thinking state
    console.log('STREAM GEN: About to yield first thinking event');
    yield { type: 'thinking', message: 'Starting to process your request...' };
    console.log('STREAM GEN: First thinking event yielded successfully');

    // Only load skills that the user has explicitly activated in the UI
    console.log('STREAM GEN: Checking activated skills...');
    const activeSkills = options.activeSkills || [];
    usedSkills = activeSkills;

    // maxTurns is now just a safety fallback - primary limit is time-based (30 minutes)
    const maxTurns = 500;
    console.log(`STREAM GEN: maxTurns set to ${maxTurns} (safety fallback, primary limit is ${QUERY_TIME_LIMIT_MS / 1000}s)`);

    if (activeSkills.length > 0) {
      console.log('STREAM GEN: Skills activated by user:', activeSkills.join(', '));
    } else {
      console.log('STREAM GEN: No skills activated - using base capabilities only');
    }

    // Build system prompt with active skills
    const systemPrompt = await buildClaudeSystemPrompt(userName, domainId, activeSkills);

    // Create MCP server with tools bound to domainId, userId, and userRole (for RBAC)
    const userId = options.userId || null;
    const userRole = options.userRole || null;
    console.log('🔐 RBAC: Creating MCP server with userRole:', userRole, 'userId:', userId);
    const samanthaServer = createSamanthaMcpServer(domainId, userId, userRole);

    // Build conversation context
    const contextMessages = conversationHistory
      .filter(msg => msg.text && !msg.text.includes('Welcome! I am Samantha'))
      .map(msg => `${msg.isUser ? 'User' : 'Assistant'}: ${msg.text}`)
      .join('\n');

    const fullPrompt = contextMessages
      ? `Previous conversation:\n${contextMessages}\n\nCurrent query: ${userQuery}`
      : userQuery;

    const resumeSessionId = options.sessionId || null;

    console.log('STREAM GEN: Yielding second thinking event (Analyzing)');
    yield { type: 'thinking', message: 'Analyzing your query...' };
    console.log('STREAM GEN: Second thinking event yielded, now starting SDK loop');

    console.log('STREAM GEN: Creating query() call to SDK');

    // Get requestId for timeout and interrupt capability
    const requestId = options.requestId;

    // Create the query object (store reference for interrupt capability)
    const agentQuery = query({
      prompt: fullPrompt,
      options: {
        model: getClaudeModel(),
        env: getClaudeConfig().env, // Core42 Foundry or Anthropic API config
        systemPrompt: systemPrompt,
        permissionMode: 'default',
        abortController: abortController, // For aborting on permission request
        maxThinkingTokens: 8000, // Enable extended thinking to show Claude's reasoning
        mcpServers: {
          "samantha-tools": samanthaServer
        },
        ...(resumeSessionId && { resume: resumeSessionId }),
        allowedTools: [
          // All tools in allowedTools - we handle permission in message processing
          "mcp__samantha-tools__get_use_cases_by_criteria",
          "mcp__samantha-tools__get_strategic_goals_by_pillar",
          "mcp__samantha-tools__get_strategic_pillars",
          "mcp__samantha-tools__get_use_cases_by_goal",
          "mcp__samantha-tools__get_use_case_statistics",
          "mcp__samantha-tools__search_use_cases",
          "mcp__samantha-tools__get_use_case_details",
          "mcp__samantha-tools__ask_user_clarification",
          "mcp__samantha-tools__get_use_cases_by_tag",
          "mcp__samantha-tools__get_domain_metadata",
          "mcp__samantha-tools__search_agents",
          "mcp__samantha-tools__get_agents_by_criteria",
          "mcp__samantha-tools__get_agents_by_initiative",
          "mcp__samantha-tools__get_agent_statistics",
          "mcp__samantha-tools__get_agent_details",
          "mcp__samantha-tools__create_artifact",
          "mcp__samantha-tools__workspace_init",
          "mcp__samantha-tools__workspace_write_file",
          "mcp__samantha-tools__workspace_read_file",
          "mcp__samantha-tools__workspace_list_files",
          "mcp__samantha-tools__execute_code",
          "mcp__samantha-tools__create_pptx",
          "mcp__samantha-tools__workspace_cleanup",
          "mcp__samantha-tools__render_html_to_image",
          "mcp__samantha-tools__view_thumbnail_grid",
          "mcp__samantha-tools__excel_init",
          "mcp__samantha-tools__excel_add_sheet",
          "mcp__samantha-tools__excel_add_rows",
          "mcp__samantha-tools__excel_preview",
          "mcp__samantha-tools__excel_generate",
          // DOCX document tools
          "mcp__samantha-tools__create_docx",
          "mcp__samantha-tools__extract_docx_text",
          "mcp__samantha-tools__unpack_docx",
          "mcp__samantha-tools__pack_docx",
          "mcp__samantha-tools__create_initiative",
          "mcp__samantha-tools__update_initiative",
          "mcp__samantha-tools__batch_update_initiative_field",
          "mcp__samantha-tools__add_initiative_tags",
          "mcp__samantha-tools__align_initiative_to_goals",
          "mcp__samantha-tools__add_initiative_comment",
          "mcp__samantha-tools__link_related_initiatives",
          "mcp__samantha-tools__create_task",
          "mcp__samantha-tools__update_task",
          "mcp__samantha-tools__batch_update_task_field",
          "mcp__samantha-tools__link_task_to_initiatives",
          "mcp__samantha-tools__add_task_comment"
        ],
        maxTurns: maxTurns,
        ...options
      }
    });

    // Register query for timeout and external interrupt capability
    if (requestId) {
      registerQuery(requestId, agentQuery);
      console.log(`STREAM GEN: Query registered for interrupt with requestId: ${requestId}`);
    }

    // Track if interrupted for cleanup
    let wasInterrupted = false;

    try {
      for await (const message of agentQuery) {
      // Log every message from SDK for debugging
      console.log(`STREAM GEN MSG: type=${message.type}, subtype=${message.subtype || 'n/a'}`);

      // Capture session_id
      if (message.session_id && !sessionId) {
        sessionId = message.session_id;
      }

      // Process messages and yield progress events
      if (message.type === 'assistant') {
        iterationsUsed++;

        if (message.message?.content) {
          // First, capture any thinking blocks (extended thinking)
          for (const block of message.message.content) {
            if (block.type === 'thinking') {
              thinkingContent += (thinkingContent ? '\n\n' : '') + block.thinking;
              console.log(`STREAM GEN: Captured thinking (${block.thinking.length} chars)`);
              // Yield thinking for UI display
              yield { type: 'thinking_content', content: block.thinking };
            }
          }
          
          // Capture text content
          const textContent = message.message.content
            .filter(block => block.type === 'text')
            .map(block => block.text)
            .join('\n');
          if (textContent.trim()) {
            finalResponse = textContent;
            yield { type: 'text', content: textContent };
          }
          
          // Check for tool_use blocks - HUMAN-IN-THE-LOOP for write tools
          for (const block of message.message.content) {
            if (block.type === 'tool_use') {
              const toolName = block.name.replace('mcp__samantha-tools__', '');
              const toolArgs = block.input || {};
              
              // Check if this is a write tool that needs permission
              if (isWriteTool(toolName) && !permissionGranted && !hasUserConfirmation(userQuery)) {
                console.log(`STREAM GEN: Write tool "${toolName}" detected - requesting permission`);
                
                // Build action summary
                let actionSummary = `Execute ${toolName.replace(/_/g, ' ')}`;
                if (toolName === 'update_initiative' && toolArgs.updates?.kanban_pillar) {
                  actionSummary = `Move initiative to ${toolArgs.updates.kanban_pillar}`;
                } else if (toolName === 'batch_update_initiative_field') {
                  actionSummary = `Update ${toolArgs.initiative_ids?.length || 0} initiatives - set ${toolArgs.field} to "${toolArgs.value}"`;
                } else if (toolName === 'create_initiative') {
                  actionSummary = `Create initiative: "${toolArgs.title || 'Untitled'}"`;
                }
                
                // Yield permission request with thinking + explanation
                yield {
                  type: 'permission_request',
                  message: 'I need your confirmation before making this change.',
                  action: actionSummary,
                  toolName: toolName,
                  toolArgs: toolArgs,
                  thinking: thinkingContent || null,
                  explanation: finalResponse || null,
                  sessionId: sessionId,
                  requiresConfirmation: true
                };
                
                // Yield done with the explanation (including thinking)
                const responseWithThinking = thinkingContent 
                  ? `**My reasoning:**\n${thinkingContent}\n\n${finalResponse || ''}\n\nPlease confirm to proceed.`
                  : `${finalResponse || ''}\n\nPlease confirm to proceed with: ${actionSummary}`;
                
                yield {
                  type: 'done',
                  response: responseWithThinking,
                  awaitingPermission: true,
                  pendingAction: { toolName, toolArgs, actionSummary },
                  sessionId: sessionId,
                  metadata: {
                    iterations: iterationsUsed,
                    provider: 'claude-agent-sdk',
                    session_id: sessionId,
                    awaiting_permission: true
                  }
                };
                
                // ABORT to prevent tool execution
                console.log('STREAM GEN: Aborting SDK to prevent unauthorized tool execution');
                permissionAborted = true;
                abortController.abort();
                return;
              }
              
              // Track allowed tool use
              pendingToolUse = {
                iteration: iterationsUsed,
                function_name: toolName,
                arguments: toolArgs,
                timestamp: Date.now()
              };

              // Yield status for non-write tools
              const statusMessage = getToolStatusMessage(toolName, toolArgs);
              if (statusMessage) {
                console.log(`STREAM GEN: Yielding status for ${toolName}: ${statusMessage}`);
                yield { type: 'status', message: statusMessage };
              }
            }
          }
        }
      } else if (message.type === 'tool_use') {
        const toolName = message.name.replace('mcp__samantha-tools__', '');
        pendingToolUse = {
          iteration: iterationsUsed,
          function_name: toolName,
          arguments: message.input || {},
          timestamp: Date.now()
        };

        // Yield status event with user-friendly message
        const statusMessage = getToolStatusMessage(toolName, message.input || {});
        if (statusMessage) {
          yield {
            type: 'status',
            message: statusMessage
          };
        }
      } else if (message.type === 'user' && pendingToolUse) {
        // SDK sends tool results as 'user' type messages
        // This contains the result of the tool execution
        let resultSummary = 'Completed';
        let success = true;
        let rawResult = null;

        try {
          // The tool result content might be in message.message.content
          const content = message.message?.content || message.content;
          if (content && Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'tool_result') {
                // Try to parse the tool result content
                if (block.content && Array.isArray(block.content)) {
                  for (const resultBlock of block.content) {
                    if (resultBlock.type === 'text') {
                      try {
                        const parsed = JSON.parse(resultBlock.text);
                        rawResult = parsed; // Store for user-friendly message
                        if (parsed.success !== undefined) {
                          success = parsed.success;
                        }
                        if (parsed.count !== undefined) {
                          resultSummary = `${parsed.count} results`;
                        } else if (parsed.artifact) {
                          resultSummary = `Created ${parsed.artifact.type}: ${parsed.artifact.title}`;
                          collectedArtifacts.push(parsed.artifact);
                        } else if (parsed.message) {
                          resultSummary = parsed.message;
                        } else if (Array.isArray(parsed)) {
                          resultSummary = `${parsed.length} results`;
                        }
                      } catch (e) {
                        // Content isn't JSON, try to summarize
                        if (resultBlock.text && resultBlock.text.length > 0) {
                          resultSummary = resultBlock.text.substring(0, 50) + (resultBlock.text.length > 50 ? '...' : '');
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        } catch (e) {
          console.log('STREAM GEN: Error parsing tool result:', e.message);
        }

        const toolExec = {
          ...pendingToolUse,
          success: success,
          result_summary: resultSummary
        };
        toolExecutions.push(toolExec);

        // Yield user-friendly status message for tool result
        const resultMessage = getToolResultMessage(toolExec.function_name, rawResult);
        if (resultMessage) {
          console.log(`STREAM GEN: Yielding result status for ${toolExec.function_name}: ${resultMessage}`);
          yield {
            type: 'status',
            message: resultMessage
          };
        }

        pendingToolUse = null;
      } else if (message.type === 'result' && message.subtype === 'success') {
        if (message.result && message.result.trim()) {
          finalResponse = message.result;
        }
        if (message.session_id) {
          sessionId = message.session_id;
        }
      } else if (message.type === 'result' && message.subtype === 'error') {
        yield { type: 'error', message: message.error };
        throw new Error(message.error);
      } else if (message.type === 'result' && message.subtype === 'error_max_turns') {
        // Agent hit maximum iterations without completing the task
        console.log(`STREAM GEN: Hit max turns limit (${iterationsUsed} iterations)`);
        
        // Check if any artifacts were created despite the failure
        const hasPartialArtifacts = collectedArtifacts.length > 0;
        
        // Build an informative error message for the user
        const errorMessage = hasPartialArtifacts
          ? `⚠️ I wasn't able to fully complete your request within the allowed processing time (${iterationsUsed} steps). Some artifacts may have been created but there might be issues. Please check and let me know if you'd like me to try again with a simpler approach.`
          : `⚠️ I wasn't able to complete your request within the allowed processing time (${iterationsUsed} steps). The task may be too complex or I may be stuck on validation errors. Would you like me to try a simpler approach?`;
        
        // Set this as the final response so user sees the error
        finalResponse = errorMessage;
        
        // Also yield an error event for the UI to show
        yield {
          type: 'error',
          message: `Task incomplete: Hit maximum processing steps (${iterationsUsed}/${options.maxTurns || 80}). The request may need to be simplified.`
        };
      }
      }
    } catch (interruptError) {
      // Handle interrupt from timeout or user stop
      if (interruptError.name === 'AbortError' || interruptError.message?.includes('interrupt')) {
        wasInterrupted = true;
        console.log('STREAM GEN: Query interrupted (timeout or user request)');

        // Yield interrupted event with partial results
        yield {
          type: 'interrupted',
          message: 'Processing was stopped.',
          partialArtifacts: collectedArtifacts,
          completedSteps: toolExecutions.filter(t => t.success).map(t => t.function_name)
        };
      } else {
        // Re-throw if it's not an interrupt error
        throw interruptError;
      }
    } finally {
      // Check if query was interrupted (before cleanup removes the flag)
      if (requestId && !wasInterrupted) {
        wasInterrupted = wasQueryInterrupted(requestId);
        if (wasInterrupted) {
          console.log('STREAM GEN: Detected graceful interrupt via flag check');
          // Yield interrupted event since we didn't catch an exception
          yield {
            type: 'interrupted',
            message: 'Processing was stopped.',
            partialArtifacts: collectedArtifacts,
            completedSteps: toolExecutions.filter(t => t.success).map(t => t.function_name)
          };
        }
      }
      // Always cleanup the query registration
      if (requestId) {
        cleanupQuery(requestId);
      }
    }

    const executionTime = Date.now() - startTime;
    console.log(`STREAM GEN: SDK loop complete. Iterations: ${iterationsUsed}, Time: ${executionTime}ms, Interrupted: ${wasInterrupted}`);

    // Enhance response with artifacts
    let enhancedResponse = finalResponse || `I couldn't generate a response, ${userName}. Please try rephrasing your question.`;
    if (collectedArtifacts.length > 0) {
      for (const artifact of collectedArtifacts) {
        enhancedResponse += `\n\n{"success":true,"artifact":${JSON.stringify(artifact)}}`;
      }
    }

    // Yield final done event with complete result
    // If interrupted, we still yield done but with modified response
    if (wasInterrupted) {
      enhancedResponse = `**Processing was stopped.** ${collectedArtifacts.length > 0 ? `${collectedArtifacts.length} artifact(s) were created before stopping.` : 'No artifacts were created.'}`;
    }

    console.log('STREAM GEN: About to yield done event');
    yield {
      type: 'done',
      response: enhancedResponse,
      scratchpad: {
        actions: toolExecutions.map(t => ({
          iteration: t.iteration,
          function_name: t.function_name,
          arguments: t.arguments
        })),
        observations: toolExecutions.map(t => ({
          iteration: t.iteration,
          function_name: t.function_name,
          success: t.success,
          result: t.result_summary,
          result_summary: t.result_summary
        })),
        thoughts: []
      },
      metadata: {
        iterations: iterationsUsed,
        execution_time_ms: executionTime,
        provider: 'claude-agent-sdk',
        session_id: sessionId,
        interrupted: wasInterrupted
      },
      skills_used: usedSkills,
      sessionId: sessionId,
      artifacts: collectedArtifacts
    };

  } catch (error) {
    // If we aborted for permission, this is expected - don't treat as error
    if (permissionAborted) {
      console.log('STREAM GEN: Caught abort from permission request - this is expected');
      return; // Already yielded permission_request and done
    }
    
    // Check if this is an abort error
    if (error.name === 'AbortError' || error.message?.includes('abort')) {
      console.log('STREAM GEN: SDK aborted (permission required)');
      return;
    }
    
    yield { type: 'error', message: error.message };
    throw error;
  }
}

module.exports = {
  createSamanthaMcpServer,
  generateClaudeAgentResponse,
  generateClaudeAgentResponseStream, // New streaming version
  buildClaudeSystemPrompt,
  synthesizeClaudeResponse,
  CLAUDE_TOOL_NAMES,
  FUNCTION_IMPLEMENTATIONS,
  getClaudeModel,
  query, // Re-export query for direct use
  // Skills exports
  listSkills: skillService.listSkills,
  loadSkill: skillService.loadSkill,
  getSkillPrompt: skillService.getSkillPrompt,
  detectSkillTriggers: skillService.detectSkillTriggers,
  TOOL_STATUS_MESSAGES,
  // Query interrupt capability
  interruptQuery
};
