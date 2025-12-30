/**
 * Claude ReAct Planning Service
 *
 * This module provides Claude-based intelligent reasoning using the Claude Agent SDK.
 * It leverages the SDK's built-in features:
 * - Automatic tool execution loops (via query())
 * - Built-in memory management and context compaction
 * - Structured agent orchestration
 * - Human-in-the-loop capability via ask_user_clarification tool
 *
 * @see https://platform.claude.com/docs/en/agent-sdk/overview
 */

const { generateClaudeAgentResponse, synthesizeClaudeResponse, buildClaudeSystemPrompt, createHekmahMcpServer, query } = require('./claudeAgentService');

// Configuration for agent execution
const AGENT_CONFIG = {
  maxTurns: 15,           // Maximum tool execution iterations
  maxExecutionTime: 90000, // 90 seconds timeout
  enableMemory: true,      // Enable memory tool for persistent knowledge
  enableCompaction: true   // Enable context compaction for long conversations
};

/**
 * Build scratchpad context for enhanced reasoning
 * This provides visibility into the agent's working memory
 */
const buildScratchpadContext = (scratchpad) => {
  let context = `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  context += `📋 WORKING MEMORY (SCRATCHPAD)\n`;
  context += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  context += `Current Status: ${scratchpad.status}\n`;
  context += `Iterations: ${scratchpad.iterations_used}\n`;
  context += `Original Query: "${scratchpad.user_query}"\n\n`;

  if (scratchpad.tool_calls && scratchpad.tool_calls.length > 0) {
    context += `🔧 TOOLS CALLED:\n`;
    scratchpad.tool_calls.forEach((call, i) => {
      context += `[${i + 1}] ${call.name}: ${call.result_summary || 'Completed'}\n`;
    });
    context += `\n`;
  }

  if (scratchpad.observations && scratchpad.observations.length > 0) {
    context += `👁️ OBSERVATIONS:\n`;
    scratchpad.observations.forEach((obs, i) => {
      context += `[${i + 1}] ${obs}\n`;
    });
    context += `\n`;
  }

  context += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

  return context;
};

/**
 * Main entry point for Claude-based intelligent response generation
 * Uses the Claude Agent SDK's built-in orchestration
 *
 * @param {string} userQuery - The user's query
 * @param {Array} conversationHistory - Previous conversation messages
 * @param {string} userName - User's name for personalization
 * @param {number|null} domainId - Domain context
 * @param {Object} sessionContext - Optional session context for stateful conversations
 * @returns {Promise<Object>} Response with text and metadata
 */
const generateClaudeResponseWithReAct = async (
  userQuery,
  conversationHistory = [],
  userName = 'unknown',
  domainId = null,
  sessionContext = null
) => {
  console.log('🧠 Claude Agent SDK ReAct: Starting intelligent reasoning');
  console.log('💬 Query:', userQuery);
  console.log('👤 User:', userName);
  console.log('🏢 Domain ID:', domainId);

  if (sessionContext) {
    console.log('📋 Session context provided with', sessionContext.recentCalls?.length || 0, 'recent calls');
    if (sessionContext.activeSkills?.length > 0) {
      console.log('📚 Active skills:', sessionContext.activeSkills.join(', '));
    }
  }

  const startTime = Date.now();

  // Extract active skills from session context
  const activeSkills = sessionContext?.activeSkills || [];

  // Initialize scratchpad for tracking
  const scratchpad = {
    user_query: userQuery,
    status: 'processing',
    iterations_used: 0,
    tool_calls: [],
    observations: [],
    previous_context: sessionContext,
    active_skills: activeSkills
  };

  try {
    // Get current date context for temporal queries
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0];
    const currentMonth = now.toLocaleString('en-US', { month: 'short', year: 'numeric' });

    // Build enhanced prompt with temporal context
    const enhancedQuery = sessionContext?.recentCalls?.length > 0
      ? `[Context from previous queries: ${sessionContext.recentCalls.map(c => c.toolName).join(', ')}]\n\nCurrent date: ${currentDate}\nQuery: ${userQuery}`
      : `Current date: ${currentDate}\nQuery: ${userQuery}`;

    // Use the Claude Agent SDK for intelligent response generation
    // The SDK handles:
    // - Automatic tool execution loops
    // - Context management
    // - Memory (if enabled)
    // - Error handling and retries
    const result = await generateClaudeAgentResponse(
      enhancedQuery,
      conversationHistory,
      userName,
      domainId,
      {
        maxTurns: AGENT_CONFIG.maxTurns,
        activeSkills: activeSkills, // Pass active skills to agent
        sessionId: sessionContext?.sessionId, // Pass session ID for multi-turn memory
      }
    );

    // Update scratchpad with results
    scratchpad.status = 'completed';
    scratchpad.iterations_used = result.iterations_used || 0;
    scratchpad.final_response = result.response;

    // Map tool executions to the format expected by UI
    // UI expects scratchpad.actions, scratchpad.observations, scratchpad.thoughts
    const toolExecs = result.tool_executions || [];
    scratchpad.actions = toolExecs.map(t => ({
      iteration: t.iteration,
      function_name: t.function_name,
      arguments: t.arguments
    }));
    scratchpad.observations = toolExecs.map(t => ({
      iteration: t.iteration,
      function_name: t.function_name,
      success: t.success,
      result: t.result_summary,
      result_summary: t.result_summary
    }));
    // No explicit thoughts from Claude Agent SDK, but we can add a placeholder
    scratchpad.thoughts = [];

    const executionTime = Date.now() - startTime;

    console.log('✅ Claude Agent SDK ReAct: Completed');
    console.log(`   Iterations: ${scratchpad.iterations_used}`);
    console.log(`   Tool calls: ${scratchpad.actions.length}`);
    console.log(`   Execution time: ${executionTime}ms`);

    return {
      response: result.response,
      scratchpad: scratchpad,
      iterations_used: scratchpad.iterations_used,
      execution_time_ms: executionTime,
      provider: 'claude-agent-sdk',
      max_iterations_reached: scratchpad.iterations_used >= AGENT_CONFIG.maxTurns,
      timeout_reached: executionTime >= AGENT_CONFIG.maxExecutionTime,
      skills_used: result.skills_used || activeSkills,
      session_id: result.session_id // Pass session ID for multi-turn conversation support
    };

  } catch (error) {
    console.error('❌ Claude Agent SDK ReAct: Error:', error.message);

    scratchpad.status = 'failed';
    scratchpad.error = error.message;

    return {
      response: `I encountered an issue while processing your request, ${userName}. ${error.message}`,
      scratchpad: scratchpad,
      iterations_used: scratchpad.iterations_used,
      execution_time_ms: Date.now() - startTime,
      provider: 'claude-agent-sdk',
      error: error.message
    };
  }
};

/**
 * Execute a specific subagent task
 * Uses the SDK's subagent capability for isolated, parallel tasks
 *
 * @param {string} taskDescription - Description of the task for the subagent
 * @param {string} taskType - Type of subagent task ('research', 'analysis', 'summary')
 * @param {Object} context - Context for the subagent
 * @returns {Promise<Object>} Subagent result
 */
const executeSubagentTask = async (taskDescription, taskType, context = {}) => {
  console.log(`🤖 Launching subagent for ${taskType}:`, taskDescription);

  try {
    // Use the query function with subagent configuration
    let result = '';

    for await (const message of query({
      prompt: taskDescription,
      options: {
        // Subagents get their own isolated context
        maxTurns: 5,
        systemPrompt: `You are a specialized ${taskType} subagent. Complete the assigned task efficiently and return only the relevant findings.`
      }
    })) {
      if (message.type === 'result' && message.subtype === 'success') {
        result = message.result;
      }
    }

    console.log(`✅ Subagent ${taskType} completed`);
    return { success: true, result };

  } catch (error) {
    console.error(`❌ Subagent ${taskType} failed:`, error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Memory-enabled query execution
 * Uses the SDK's memory tool for persistent knowledge across sessions
 *
 * @param {string} userQuery - The user's query
 * @param {string} memoryKey - Key for memory storage/retrieval
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Response with memory context
 */
const queryWithMemory = async (userQuery, memoryKey, options = {}) => {
  console.log('🧠 Executing query with memory context:', memoryKey);

  // The Claude Agent SDK's memory tool handles:
  // - Storing relevant information
  // - Retrieving context from previous sessions
  // - Managing memory lifecycle

  // For now, we pass through to the standard query
  // Memory integration will be handled by the SDK when properly configured
  return generateClaudeResponseWithReAct(
    userQuery,
    options.conversationHistory || [],
    options.userName || 'unknown',
    options.domainId || null,
    { memoryKey, ...options.sessionContext }
  );
};

/**
 * Get the current agent configuration
 */
const getAgentConfig = () => {
  return { ...AGENT_CONFIG };
};

/**
 * Update agent configuration
 */
const updateAgentConfig = (updates) => {
  Object.assign(AGENT_CONFIG, updates);
  console.log('🔧 Agent config updated:', AGENT_CONFIG);
};

module.exports = {
  generateClaudeResponseWithReAct,
  executeSubagentTask,
  queryWithMemory,
  buildScratchpadContext,
  getAgentConfig,
  updateAgentConfig,
  AGENT_CONFIG
};
