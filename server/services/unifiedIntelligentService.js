/**
 * Unified Intelligent Service
 *
 * This module provides a single source of truth for intelligent conversation handling
 * across both text and voice modalities. It leverages the ReAct planning service for
 * sophisticated multi-step reasoning and ensures consistent responses.
 *
 * Supports multiple AI providers:
 * - 'azure' (default): Azure OpenAI with GPT-4o-mini
 * - 'claude': Anthropic Claude with Claude Sonnet
 */

const { generateIntelligentResponseWithReAct } = require('./reactPlanningService');
const { azureOpenAI, FUNCTION_IMPLEMENTATIONS, AVAILABLE_FUNCTIONS, synthesizeConversationalResponse } = require('./intelligentChatService');

// Claude provider imports (lazy-loaded to avoid errors if not configured)
let claudeReactService = null;
let claudeAgentService = null;

const loadClaudeServices = () => {
  if (!claudeReactService) {
    try {
      claudeReactService = require('./claudeReactPlanningService');
      claudeAgentService = require('./claudeAgentService');
      console.log('✅ Claude services loaded successfully');
    } catch (error) {
      console.error('⚠️  Failed to load Claude services:', error.message);
      throw new Error('Claude provider not available: ' + error.message);
    }
  }
  return { claudeReactService, claudeAgentService };
};

/**
 * Available AI providers
 */
const AI_PROVIDERS = {
  COMPASS: 'compass',
  CLAUDE: 'claude'
};

/**
 * Get the default AI provider from environment or fallback to COMPASS
 */
const getDefaultProvider = () => {
  return process.env.DEFAULT_AI_PROVIDER || AI_PROVIDERS.COMPASS;
};

/**
 * Get the AI provider for a specific user role
 * Uses ADMIN_AI_PROVIDER for admins, CONSUMER_AI_PROVIDER for consumers
 * Falls back to DEFAULT_AI_PROVIDER if role-specific env is not set
 */
const getProviderForRole = (role) => {
  if (role === 'admin') {
    return process.env.ADMIN_AI_PROVIDER || process.env.DEFAULT_AI_PROVIDER || AI_PROVIDERS.CLAUDE;
  }
  // Consumer or any other role
  return process.env.CONSUMER_AI_PROVIDER || process.env.DEFAULT_AI_PROVIDER || AI_PROVIDERS.COMPASS;
};

/**
 * Check if a provider is available (has required configuration)
 */
const isProviderAvailable = (provider) => {
  switch (provider) {
    case AI_PROVIDERS.COMPASS:
      return !!(process.env.COMPASS_OPENAI_API_KEY && process.env.COMPASS_OPENAI_ENDPOINT);
    case AI_PROVIDERS.CLAUDE:
      return !!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'placeholder-key-replace-me');
    default:
      return false;
  }
};

/**
 * Process intelligent query for voice mode
 *
 * This function handles voice transcriptions using the same ReAct intelligence
 * as text chat, but with voice-specific optimizations for brevity and naturalness.
 *
 * @param {string} userQuery - The user's transcribed speech
 * @param {Array} conversationHistory - Array of previous messages
 * @param {string} userName - User's name for personalization
 * @param {number|null} domainId - Domain context
 * @returns {Promise<Object>} Response with text and metadata
 */
const processVoiceQuery = async (userQuery, conversationHistory = [], userName = 'unknown', domainId = null) => {
  console.log('🎙️  Processing voice query with ReAct intelligence:', userQuery);
  console.log('👤 User:', userName);
  console.log('🏢 Domain ID:', domainId);
  console.log('💬 Conversation history:', conversationHistory.length, 'messages');

  try {
    // Use ReAct planning for intelligent reasoning
    const reactResult = await generateIntelligentResponseWithReAct(
      userQuery,
      conversationHistory,
      userName,
      domainId,
      azureOpenAI,
      FUNCTION_IMPLEMENTATIONS,
      AVAILABLE_FUNCTIONS
    );

    console.log('✅ ReAct planning completed');
    console.log(`   Iterations used: ${reactResult.iterations_used}`);
    console.log(`   Execution time: ${reactResult.execution_time_ms}ms`);

    // Synthesize the response for voice (conversational, concise)
    let finalResponse = reactResult.response;
    let synthesized = false;

    try {
      finalResponse = await synthesizeConversationalResponse(reactResult.response, userQuery);
      synthesized = true;
      console.log('✅ Response synthesized for voice output');
    } catch (synthError) {
      console.error('⚠️  Voice synthesis failed, using original response:', synthError.message);
    }

    return {
      response: finalResponse,
      userName,
      timestamp: new Date().toISOString(),
      metadata: {
        iterations: reactResult.iterations_used,
        execution_time_ms: reactResult.execution_time_ms,
        max_iterations_reached: reactResult.max_iterations_reached || false,
        timeout_reached: reactResult.timeout_reached || false,
        synthesized: synthesized,
        modality: 'voice'
      },
      scratchpad: reactResult.scratchpad // Include thinking chain
    };

  } catch (error) {
    console.error('❌ Voice query processing error:', error);

    return {
      response: `I'm having trouble processing your request, ${userName}. Please try again.`,
      userName,
      timestamp: new Date().toISOString(),
      metadata: {
        error: error.message,
        modality: 'voice'
      }
    };
  }
};

/**
 * Process intelligent query for text mode
 *
 * This function handles text chat using ReAct planning for sophisticated reasoning.
 *
 * @param {string} userQuery - The user's text query
 * @param {Array} conversationHistory - Array of previous messages
 * @param {string} userName - User's name for personalization
 * @param {number|null} domainId - Domain context
 * @returns {Promise<Object>} Response with text and metadata
 */
const processTextQuery = async (userQuery, conversationHistory = [], userName = 'unknown', domainId = null) => {
  console.log('💬 Processing text query with ReAct intelligence:', userQuery);
  console.log('👤 User:', userName);
  console.log('🏢 Domain ID:', domainId);

  try {
    // Use ReAct planning for intelligent reasoning
    const reactResult = await generateIntelligentResponseWithReAct(
      userQuery,
      conversationHistory,
      userName,
      domainId,
      azureOpenAI,
      FUNCTION_IMPLEMENTATIONS,
      AVAILABLE_FUNCTIONS
    );

    console.log('✅ ReAct planning completed');
    console.log(`   Iterations used: ${reactResult.iterations_used}`);
    console.log(`   Execution time: ${reactResult.execution_time_ms}ms`);

    // Synthesize for conversational output
    let finalResponse = reactResult.response;
    let synthesized = false;

    try {
      finalResponse = await synthesizeConversationalResponse(reactResult.response, userQuery);
      synthesized = true;
      console.log('✅ Response synthesized for conversational output');
    } catch (synthError) {
      console.error('⚠️  Synthesis failed, using original response:', synthError.message);
    }

    return {
      response: finalResponse,
      userName,
      timestamp: new Date().toISOString(),
      metadata: {
        iterations: reactResult.iterations_used,
        execution_time_ms: reactResult.execution_time_ms,
        max_iterations_reached: reactResult.max_iterations_reached || false,
        timeout_reached: reactResult.timeout_reached || false,
        synthesized: synthesized,
        modality: 'text'
      },
      scratchpad: reactResult.scratchpad
    };

  } catch (error) {
    console.error('❌ Text query processing error:', error);

    return {
      response: `I'm having trouble processing your request, ${userName}. Please try again.`,
      userName,
      timestamp: new Date().toISOString(),
      metadata: {
        error: error.message,
        modality: 'text'
      }
    };
  }
};

/**
 * Process intelligent query with provider selection
 *
 * This function allows choosing between AI providers (Azure OpenAI or Claude)
 * for processing text queries. It provides a unified interface while allowing
 * users to switch providers based on their preference.
 *
 * @param {string} userQuery - The user's text query
 * @param {Array} conversationHistory - Array of previous messages
 * @param {string} userName - User's name for personalization
 * @param {number|null} domainId - Domain context
 * @param {string} provider - AI provider to use ('azure' or 'claude')
 * @param {Object} sessionContext - Optional session context for stateful conversations
 * @param {Object} options - Additional options (e.g., activeSkills)
 * @returns {Promise<Object>} Response with text and metadata
 */
const processQueryWithProvider = async (
  userQuery,
  conversationHistory = [],
  userName = 'unknown',
  domainId = null,
  provider = null,
  sessionContext = null,
  options = {}
) => {
  // Determine which provider to use
  const selectedProvider = provider || getDefaultProvider();
  console.log(`🤖 Processing query with provider: ${selectedProvider}`);
  console.log('💬 Query:', userQuery);
  console.log('👤 User:', userName);
  console.log('🏢 Domain ID:', domainId);

  // Validate provider availability
  if (!isProviderAvailable(selectedProvider)) {
    console.warn(`⚠️  Provider ${selectedProvider} is not configured, checking fallback...`);

    // Try to fall back to the other provider
    const fallbackProvider = selectedProvider === AI_PROVIDERS.CLAUDE
      ? AI_PROVIDERS.COMPASS
      : AI_PROVIDERS.CLAUDE;

    if (isProviderAvailable(fallbackProvider)) {
      console.log(`↩️  Falling back to ${fallbackProvider}`);
      return processQueryWithProvider(userQuery, conversationHistory, userName, domainId, fallbackProvider, sessionContext);
    }

    return {
      response: `I'm sorry ${userName}, but no AI provider is currently configured. Please contact your administrator.`,
      userName,
      timestamp: new Date().toISOString(),
      metadata: {
        error: 'No AI provider available',
        requested_provider: selectedProvider,
        modality: 'text'
      }
    };
  }

  try {
    let reactResult;
    let synthesized = false;
    let finalResponse;

    if (selectedProvider === AI_PROVIDERS.CLAUDE) {
      // Use Claude provider
      console.log('🟣 Using Claude provider');
      const { claudeReactService, claudeAgentService } = loadClaudeServices();

      // Pass active skills to Claude
      const activeSkills = options.activeSkills || [];
      if (activeSkills.length > 0) {
        console.log('📚 Active skills:', activeSkills.join(', '));
      }

      // Pass sessionId from options or sessionContext for multi-turn memory
      const claudeSessionId = options.sessionId || sessionContext?.sessionId || null;
      if (claudeSessionId) {
        console.log('🔄 Resuming Claude session:', claudeSessionId);
      }

      reactResult = await claudeReactService.generateClaudeResponseWithReAct(
        userQuery,
        conversationHistory,
        userName,
        domainId,
        { ...sessionContext, activeSkills, sessionId: claudeSessionId }
      );

      console.log('✅ Claude ReAct planning completed');
      console.log(`   Iterations used: ${reactResult.iterations_used}`);
      console.log(`   Execution time: ${reactResult.execution_time_ms}ms`);

      // Claude Agent SDK already produces conversational output with full context
      // Skip synthesis as it corrupts the response by making a context-less API call
      finalResponse = reactResult.response;
      synthesized = true; // Mark as synthesized since Claude SDK output is already conversational
      console.log('✅ Using Claude Agent SDK response directly (already conversational)');

    } else {
      // Use Azure OpenAI provider (default)
      console.log('🔵 Using Azure OpenAI provider');

      reactResult = await generateIntelligentResponseWithReAct(
        userQuery,
        conversationHistory,
        userName,
        domainId,
        azureOpenAI,
        FUNCTION_IMPLEMENTATIONS,
        AVAILABLE_FUNCTIONS,
        sessionContext
      );

      console.log('✅ Azure ReAct planning completed');
      console.log(`   Iterations used: ${reactResult.iterations_used}`);
      console.log(`   Execution time: ${reactResult.execution_time_ms}ms`);

      // Synthesize for conversational output
      finalResponse = reactResult.response;
      try {
        finalResponse = await synthesizeConversationalResponse(reactResult.response, userQuery);
        synthesized = true;
        console.log('✅ Response synthesized for conversational output (Azure)');
      } catch (synthError) {
        console.error('⚠️  Azure synthesis failed, using original response:', synthError.message);
      }
    }

    return {
      response: finalResponse,
      userName,
      timestamp: new Date().toISOString(),
      metadata: {
        provider: selectedProvider,
        iterations: reactResult.iterations_used,
        execution_time_ms: reactResult.execution_time_ms,
        max_iterations_reached: reactResult.max_iterations_reached || false,
        timeout_reached: reactResult.timeout_reached || false,
        synthesized: synthesized,
        modality: 'text',
        session_id: reactResult.session_id || null // Return session_id for multi-turn support
      },
      scratchpad: reactResult.scratchpad,
      skills_used: reactResult.skills_used || []
    };

  } catch (error) {
    console.error(`❌ Query processing error (${selectedProvider}):`, error);

    // If Claude fails, try Azure as fallback
    if (selectedProvider === AI_PROVIDERS.CLAUDE && isProviderAvailable(AI_PROVIDERS.COMPASS)) {
      console.log('↩️  Claude failed, attempting Azure fallback...');
      try {
        return await processQueryWithProvider(userQuery, conversationHistory, userName, domainId, AI_PROVIDERS.COMPASS, sessionContext);
      } catch (fallbackError) {
        console.error('❌ Azure fallback also failed:', fallbackError.message);
      }
    }

    return {
      response: `I'm having trouble processing your request, ${userName}. Please try again.`,
      userName,
      timestamp: new Date().toISOString(),
      metadata: {
        provider: selectedProvider,
        error: error.message,
        modality: 'text'
      }
    };
  }
};

/**
 * Get available providers and their status
 */
const getProviderStatus = () => {
  return {
    default: getDefaultProvider(),
    // Role-based provider configuration
    roleProviders: {
      admin: process.env.ADMIN_AI_PROVIDER || process.env.DEFAULT_AI_PROVIDER || AI_PROVIDERS.CLAUDE,
      consumer: process.env.CONSUMER_AI_PROVIDER || process.env.DEFAULT_AI_PROVIDER || AI_PROVIDERS.COMPASS
    },
    providers: {
      [AI_PROVIDERS.COMPASS]: {
        available: isProviderAvailable(AI_PROVIDERS.COMPASS),
        name: 'COMPASS OpenAI (Core42)',
        model: process.env.COMPASS_OPENAI_DEPLOYMENT_NAME || 'gpt-5'
      },
      [AI_PROVIDERS.CLAUDE]: {
        available: isProviderAvailable(AI_PROVIDERS.CLAUDE),
        name: 'Anthropic Claude',
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514'
      }
    }
  };
};

module.exports = {
  processVoiceQuery,
  processTextQuery,
  processQueryWithProvider,
  getProviderStatus,
  AI_PROVIDERS,
  getDefaultProvider,
  getProviderForRole,
  isProviderAvailable
};
