const express = require('express');
const router = express.Router();
const { generateIntelligentResponse, azureOpenAI, FUNCTION_IMPLEMENTATIONS, AVAILABLE_FUNCTIONS, FUNCTION_NAMES, synthesizeConversationalResponse } = require('../services/intelligentChatService');
const { generateIntelligentResponseWithReAct } = require('../services/reactPlanningService');
const { processVoiceQuery, processQueryWithProvider, getProviderStatus, AI_PROVIDERS, getProviderForRole } = require('../services/unifiedIntelligentService');
const db = require('../config/database-mysql-compat');
const {
  validateChatQuery,
  validatePrompt,
  validateDomainId,
  validateConversationHistory,
  validateLimit,
  validateFunctionName,
  logValidationFailure
} = require('../middleware/inputValidation');

// Middleware to require authentication via JWT
const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // Check if Authorization header exists
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn('⚠️  Backend: Missing or invalid Authorization header');
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Please provide a valid authentication token'
    });
  }

  try {
    const token = authHeader.substring(7);

    // Validate token format
    if (!token || token.split('.').length !== 3) {
      console.warn('⚠️  Backend: Invalid JWT token format');
      return res.status(401).json({
        error: 'Invalid token format',
        message: 'Authentication token is malformed'
      });
    }

    // Decode and extract user info
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());

    // Validate required fields in token (support both 'id' and 'userId' for compatibility)
    const userId = payload.userId || payload.id;
    if (!userId || !payload.email) {
      console.warn('⚠️  Backend: JWT missing required fields (userId/id or email)');
      return res.status(401).json({
        error: 'Invalid token payload',
        message: 'Authentication token is missing required information'
      });
    }

    // Check token expiration
    if (payload.exp && payload.exp < Date.now() / 1000) {
      console.warn('⚠️  Backend: JWT token expired');
      return res.status(401).json({
        error: 'Token expired',
        message: 'Authentication token has expired. Please login again.'
      });
    }

    req.user = {
      id: userId,
      email: payload.email,
      name: payload.name || payload.given_name || payload.preferred_username,
      role: payload.role
    };

    console.log('🔐 Backend: Authenticated user:', req.user.email, 'role:', req.user.role);
    next();

  } catch (error) {
    console.error('❌ Backend: JWT authentication error:', error.message);
    return res.status(401).json({
      error: 'Authentication failed',
      message: 'Invalid or corrupted authentication token'
    });
  }
};

// GET /api/chat/providers - Get available AI providers and their status
router.get('/providers', requireAuth, (req, res) => {
  try {
    const status = getProviderStatus();
    console.log('📊 AI Provider Status:', status);
    res.json(status);
  } catch (error) {
    console.error('❌ Failed to get provider status:', error);
    res.status(500).json({ error: 'Failed to get provider status' });
  }
});

// POST /api/chat/intelligent-claude - Generate intelligent response using Claude
// NOTE: This endpoint is restricted to admin users only
router.post('/intelligent-claude', requireAuth, async (req, res) => {
  // Restrict Claude endpoint to admin users only
  const userRole = req.user?.role || 'consumer';
  if (userRole !== 'admin') {
    console.log('🚫 Backend: Non-admin user attempted to use Claude endpoint:', req.user?.email);
    return res.status(403).json({
      error: 'Access denied',
      message: 'Claude AI is only available for admin users'
    });
  }

  try {
    const { userQuery, conversationHistory } = req.body;

    // Validate userQuery
    const queryValidation = validateChatQuery(userQuery);
    if (!queryValidation.valid) {
      logValidationFailure(req, '/api/chat/intelligent-claude', 'userQuery', queryValidation.error);
      return res.status(400).json({
        error: 'Invalid input',
        message: queryValidation.error
      });
    }

    // Validate conversationHistory
    const historyValidation = validateConversationHistory(conversationHistory);
    if (!historyValidation.valid) {
      logValidationFailure(req, '/api/chat/intelligent-claude', 'conversationHistory', historyValidation.error);
      return res.status(400).json({
        error: 'Invalid input',
        message: historyValidation.error
      });
    }

    // Validate domain_id
    const domainValidation = validateDomainId(req.body.domain_id);
    if (!domainValidation.valid) {
      logValidationFailure(req, '/api/chat/intelligent-claude', 'domain_id', domainValidation.error);
      return res.status(400).json({
        error: 'Invalid input',
        message: domainValidation.error
      });
    }

    // Use sanitized values
    const sanitizedQuery = queryValidation.sanitized;
    const sanitizedHistory = historyValidation.sanitized;
    const domainId = domainValidation.sanitized;

    // Extract user name from JWT
    let userName = 'unknown';
    if (req.user?.name) {
      userName = req.user.name.split(' ')[0];
    } else if (req.user?.email) {
      const emailName = req.user.email.split('@')[0].split('.')[0];
      userName = emailName.charAt(0).toUpperCase() + emailName.slice(1).toLowerCase();
    }

    console.log('🟣 Backend: Processing Claude chat request for:', userName);
    console.log('💬 Backend: Query:', sanitizedQuery);
    console.log('🏢 Backend: Domain ID:', domainId);

    // Use Claude provider via unified service
    const result = await processQueryWithProvider(
      sanitizedQuery,
      sanitizedHistory,
      userName,
      domainId,
      AI_PROVIDERS.CLAUDE,
      null // session context
    );

    console.log('✅ Backend: Generated Claude response');
    console.log(`   Iterations used: ${result.metadata?.iterations || 0}`);
    console.log(`   Execution time: ${result.metadata?.execution_time_ms || 0}ms`);

    res.json(result);

  } catch (error) {
    console.error('❌ Backend: Claude chat error:', error);
    res.status(500).json({
      error: 'Failed to generate Claude response',
      details: error.message
    });
  }
});

// POST /api/chat/intelligent-with-provider - Generate intelligent response with provider selection
router.post('/intelligent-with-provider', requireAuth, async (req, res) => {
  try {
    const { userQuery, conversationHistory, provider } = req.body;

    // Non-admin users can only use compass provider
    const userRole = req.user?.role || 'consumer';
    if (userRole !== 'admin' && provider === AI_PROVIDERS.CLAUDE) {
      console.log('🚫 Backend: Non-admin user attempted to use Claude provider:', req.user?.email);
      return res.status(403).json({
        error: 'Access denied',
        message: 'Claude AI is only available for admin users'
      });
    }

    // Validate userQuery
    const queryValidation = validateChatQuery(userQuery);
    if (!queryValidation.valid) {
      logValidationFailure(req, '/api/chat/intelligent-with-provider', 'userQuery', queryValidation.error);
      return res.status(400).json({
        error: 'Invalid input',
        message: queryValidation.error
      });
    }

    // Validate conversationHistory
    const historyValidation = validateConversationHistory(conversationHistory);
    if (!historyValidation.valid) {
      logValidationFailure(req, '/api/chat/intelligent-with-provider', 'conversationHistory', historyValidation.error);
      return res.status(400).json({
        error: 'Invalid input',
        message: historyValidation.error
      });
    }

    // Validate domain_id
    const domainValidation = validateDomainId(req.body.domain_id);
    if (!domainValidation.valid) {
      logValidationFailure(req, '/api/chat/intelligent-with-provider', 'domain_id', domainValidation.error);
      return res.status(400).json({
        error: 'Invalid input',
        message: domainValidation.error
      });
    }

    // Validate provider if specified
    const validProviders = Object.values(AI_PROVIDERS);
    if (provider && !validProviders.includes(provider)) {
      return res.status(400).json({
        error: 'Invalid provider',
        message: `Provider must be one of: ${validProviders.join(', ')}`
      });
    }

    // Use sanitized values
    const sanitizedQuery = queryValidation.sanitized;
    const sanitizedHistory = historyValidation.sanitized;
    const domainId = domainValidation.sanitized;

    // Extract user name from JWT
    let userName = 'unknown';
    if (req.user?.name) {
      userName = req.user.name.split(' ')[0];
    } else if (req.user?.email) {
      const emailName = req.user.email.split('@')[0].split('.')[0];
      userName = emailName.charAt(0).toUpperCase() + emailName.slice(1).toLowerCase();
    }

    console.log(`🤖 Backend: Processing chat with provider selection: ${provider || 'default'}`);
    console.log('💬 Backend: Query:', sanitizedQuery);
    console.log('🏢 Backend: Domain ID:', domainId);

    // Use unified service with provider selection
    const result = await processQueryWithProvider(
      sanitizedQuery,
      sanitizedHistory,
      userName,
      domainId,
      provider || null,
      null // session context
    );

    console.log('✅ Backend: Generated response');
    console.log(`   Provider: ${result.metadata?.provider || 'unknown'}`);
    console.log(`   Iterations used: ${result.metadata?.iterations || 0}`);
    console.log(`   Execution time: ${result.metadata?.execution_time_ms || 0}ms`);

    res.json(result);

  } catch (error) {
    console.error('❌ Backend: Provider chat error:', error);
    res.status(500).json({
      error: 'Failed to generate response',
      details: error.message
    });
  }
});

// POST /api/chat/intelligent - Generate intelligent response with function calling
router.post('/intelligent', requireAuth, async (req, res) => {
  try {
    const { userQuery, conversationHistory, isVoiceMode, activeSkills, sessionId } = req.body;

    // DEBUG: Log what we receive
    console.log('📥 Backend RECEIVED request body:');
    console.log('   - userQuery:', userQuery?.substring(0, 100));
    console.log('   - conversationHistory type:', typeof conversationHistory);
    console.log('   - conversationHistory isArray:', Array.isArray(conversationHistory));
    console.log('   - conversationHistory length:', conversationHistory?.length || 0);
    console.log('   - sessionId:', sessionId || 'none (new session)');
    if (conversationHistory && conversationHistory.length > 0) {
      console.log('   - First history item:', JSON.stringify(conversationHistory[0]));
    }

    // Validate userQuery
    const queryValidation = validateChatQuery(userQuery);
    if (!queryValidation.valid) {
      logValidationFailure(req, '/api/chat/intelligent', 'userQuery', queryValidation.error);
      return res.status(400).json({
        error: 'Invalid input',
        message: queryValidation.error
      });
    }

    // Validate conversationHistory
    const historyValidation = validateConversationHistory(conversationHistory);
    if (!historyValidation.valid) {
      logValidationFailure(req, '/api/chat/intelligent', 'conversationHistory', historyValidation.error);
      return res.status(400).json({
        error: 'Invalid input',
        message: historyValidation.error
      });
    }

    // Validate domain_id
    const domainValidation = validateDomainId(req.body.domain_id);
    if (!domainValidation.valid) {
      logValidationFailure(req, '/api/chat/intelligent', 'domain_id', domainValidation.error);
      return res.status(400).json({
        error: 'Invalid input',
        message: domainValidation.error
      });
    }

    // Use sanitized values
    const sanitizedQuery = queryValidation.sanitized;
    const sanitizedHistory = historyValidation.sanitized;
    const domainId = domainValidation.sanitized;

    // Extract user name from JWT, email, or use fallback
    let userName = 'unknown';
    if (req.user?.name) {
      userName = req.user.name.split(' ')[0];
    } else if (req.user?.email) {
      // Extract first name from email (e.g., "john.doe@example.com" -> "John")
      const emailName = req.user.email.split('@')[0].split('.')[0];
      userName = emailName.charAt(0).toUpperCase() + emailName.slice(1).toLowerCase();
    }

    console.log('🤖 Backend: Processing intelligent chat request for:', userName);
    console.log('💬 Backend: Query:', sanitizedQuery);
    console.log('🏢 Backend: Domain ID:', domainId);

    // Determine AI provider based on user role using env variables:
    // ADMIN_AI_PROVIDER for admins, CONSUMER_AI_PROVIDER for consumers
    const userRole = req.user?.role || 'consumer';
    const aiProvider = getProviderForRole(userRole);
    console.log('🤖 Backend: User role:', userRole, '-> AI Provider:', aiProvider);

    // Use unified service with provider selection
    const result = await processQueryWithProvider(
      sanitizedQuery,
      sanitizedHistory,
      userName,
      domainId,
      aiProvider, // Admin gets default provider, consumer gets compass
      null, // session context
      { activeSkills: activeSkills || [], sessionId: sessionId || null } // Pass sessionId for multi-turn memory
    );

    console.log('✅ Backend: Generated response');
    console.log(`   Provider: ${result.metadata?.provider || 'unknown'}`);
    console.log(`   Iterations used: ${result.metadata?.iterations || 0}`);
    console.log(`   Execution time: ${result.metadata?.execution_time_ms || 0}ms`);
    console.log(`   Response preview: ${result.response?.substring(0, 100)}...`);
    if (result.scratchpad) {
      console.log('📋 Scratchpad structure:');
      console.log(`   - Thoughts: ${result.scratchpad?.thoughts?.length || 0}`);
      console.log(`   - Actions: ${result.scratchpad?.actions?.length || 0}`);
      console.log(`   - Observations: ${result.scratchpad?.observations?.length || 0}`);
    }

    // Run synthesis agent ONLY in voice mode to ensure conversational output
    let finalResponse = result.response;
    let synthesized = result.metadata?.synthesized || false;

    if (isVoiceMode && !synthesized) {
      try {
        console.log('🎙️  Backend: Voice mode detected, running synthesis agent');
        finalResponse = await synthesizeConversationalResponse(result.response, sanitizedQuery);
        synthesized = true;
        console.log('✅ Backend: Response synthesized for conversational output');
      } catch (synthError) {
        console.error('⚠️  Backend: Synthesis failed, using original response:', synthError.message);
        synthesized = false;
      }
    } else {
      console.log('💬 Backend: Text mode - preserving original formatting (tables, bullets, etc.)');
    }

    // Log session_id for debugging
    if (result.metadata?.session_id) {
      console.log('📍 Backend: Returning session_id:', result.metadata.session_id);
    }

    res.json({
      response: finalResponse,
      userName,
      timestamp: new Date().toISOString(),
      sessionId: result.metadata?.session_id || null, // Return session_id for multi-turn memory
      metadata: {
        provider: result.metadata?.provider,
        iterations: result.metadata?.iterations || 0,
        execution_time_ms: result.metadata?.execution_time_ms || 0,
        max_iterations_reached: result.metadata?.max_iterations_reached || false,
        timeout_reached: result.metadata?.timeout_reached || false,
        synthesized: synthesized,
        session_id: result.metadata?.session_id || null
      },
      scratchpad: result.scratchpad,
      skills_used: result.skills_used || []
    });
    
  } catch (error) {
    console.error('❌ Backend: Intelligent chat error:', error);
    res.status(500).json({ 
      error: 'Failed to generate intelligent response',
      details: error.message
    });
  }
});

// POST /api/chat/intelligent/stream - SSE endpoint for streaming intelligent response with real-time progress
// NOTE: This endpoint uses Claude Agent SDK and is restricted to admin users only
router.post('/intelligent/stream', requireAuth, async (req, res) => {
  const { generateClaudeAgentResponseStream } = require('../services/claudeAgentService');

  // Restrict streaming endpoint to admin users only (uses Claude)
  const userRole = req.user?.role || 'consumer';
  if (userRole !== 'admin') {
    console.log('Backend: Non-admin user attempted to use streaming endpoint:', req.user?.email);
    return res.status(403).json({
      error: 'Access denied',
      message: 'Advanced AI streaming is only available for admin users'
    });
  }

  try {
    const { userQuery, conversationHistory, activeSkills, sessionId } = req.body;

    // Validate userQuery
    const queryValidation = validateChatQuery(userQuery);
    if (!queryValidation.valid) {
      logValidationFailure(req, '/api/chat/intelligent/stream', 'userQuery', queryValidation.error);
      return res.status(400).json({
        error: 'Invalid input',
        message: queryValidation.error
      });
    }

    // Validate conversationHistory
    const historyValidation = validateConversationHistory(conversationHistory);
    if (!historyValidation.valid) {
      logValidationFailure(req, '/api/chat/intelligent/stream', 'conversationHistory', historyValidation.error);
      return res.status(400).json({
        error: 'Invalid input',
        message: historyValidation.error
      });
    }

    // Validate domain_id
    const domainValidation = validateDomainId(req.body.domain_id);
    if (!domainValidation.valid) {
      logValidationFailure(req, '/api/chat/intelligent/stream', 'domain_id', domainValidation.error);
      return res.status(400).json({
        error: 'Invalid input',
        message: domainValidation.error
      });
    }

    const sanitizedQuery = queryValidation.sanitized;
    const sanitizedHistory = historyValidation.sanitized;
    const domainId = domainValidation.sanitized;

    // Extract user name
    let userName = 'unknown';
    if (req.user?.name) {
      userName = req.user.name.split(' ')[0];
    } else if (req.user?.email) {
      const emailName = req.user.email.split('@')[0].split('.')[0];
      userName = emailName.charAt(0).toUpperCase() + emailName.slice(1).toLowerCase();
    }

    console.log('STREAM: Backend: Starting streaming response for:', userName);

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.setHeader('Transfer-Encoding', 'chunked');

    // Disable Nagle's algorithm for immediate sends
    if (res.socket) {
      res.socket.setNoDelay(true);
      res.socket.setTimeout(0);
    }

    res.flushHeaders();
    console.log('SSE: Headers flushed, socket noDelay set');

    // Helper to write and flush SSE events immediately
    // Add padding to force browser to process chunks (browsers often buffer small chunks)
    const PADDING = ':' + ' '.repeat(2048) + '\n'; // 2KB padding comment
    const writeSSE = (eventType, data) => {
      const eventData = typeof data === 'string' ? data : JSON.stringify(data);
      console.log(`SSE WRITE: ${eventType} - ${eventData.substring(0, 100)}...`);
      // Add padding comment before event to force browser flush
      const message = PADDING + `event: ${eventType}\ndata: ${eventData}\n\n`;
      res.write(message);
      // Force flush using multiple methods
      if (typeof res.flush === 'function') {
        res.flush();
      }
      // Also try flushHeaders if available
      if (res.socket && res.socket.writable) {
        res.socket.uncork && res.socket.uncork();
      }
    };

    // Send initial connection event
    writeSSE('connected', { status: 'connected' });
    console.log('SSE: Initial connected event sent');

    // Generate unique requestId for interrupt capability
    const requestId = `${req.user?.id || 'anon'}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    writeSSE('session_started', { type: 'session_started', requestId });
    console.log(`SSE: Session started with requestId: ${requestId}`);

    // Track if client disconnected (use res 'close' event, not req)
    let clientDisconnected = false;
    res.on('close', () => {
      clientDisconnected = true;
      console.log(`SSE: Client disconnected for requestId: ${requestId}`);
    });

    // Note: Claude API sends built-in 'ping' events to keep connections alive
    // No custom heartbeat needed - client handles graceful degradation if connection lost

    // Stream progress events from the generator
    console.log('SSE: Creating generator...');
    const stream = generateClaudeAgentResponseStream(
      sanitizedQuery,
      sanitizedHistory,
      userName,
      domainId,
      {
        activeSkills: activeSkills || [],
        sessionId: sessionId || null,
        userId: req.user?.id || null,
        userRole: req.user?.role || null,
        requestId: requestId  // For interrupt capability
      }
    );
    console.log('SSE: Generator created, starting iteration...');

    let eventCount = 0;
    for await (const event of stream) {
      // Stop processing if client disconnected
      if (clientDisconnected) {
        console.log('SSE: Client disconnected, stopping stream processing');
        break;
      }

      eventCount++;
      console.log(`SSE LOOP: Event #${eventCount} received: type=${event.type}`);

      // Send each event as SSE
      writeSSE(event.type, event);
    }

    console.log(`SSE: Stream iteration complete - ${eventCount} events sent`);

    // Send close event (only if client still connected)
    if (!clientDisconnected && res.writable) {
      res.write(`event: close\ndata: {"status":"complete"}\n\n`);
    }
    res.end();

  } catch (error) {
    console.error('STREAM: Backend error:', error);

    // If headers haven't been sent, send error as JSON
    if (!res.headersSent) {
      return res.status(500).json({
        error: 'Streaming failed',
        message: error.message
      });
    }

    // If streaming already started, send error as SSE event
    res.write(`event: error\ndata: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
    res.end();
  }
});

// POST /api/chat/intelligent/abort - Abort an active streaming session
router.post('/intelligent/abort', requireAuth, async (req, res) => {
  const { interruptQuery } = require('../services/claudeAgentService');

  try {
    const { requestId } = req.body;

    if (!requestId) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'requestId is required'
      });
    }

    // Verify user owns this session (requestId starts with their user ID)
    const expectedPrefix = `${req.user?.id || 'anon'}-`;
    if (!requestId.startsWith(expectedPrefix)) {
      console.log(`Abort denied: User ${req.user?.id} tried to abort session ${requestId}`);
      return res.status(403).json({
        error: 'Access denied',
        message: 'Not authorized to abort this session'
      });
    }

    console.log(`Attempting to abort session: ${requestId}`);
    const success = await interruptQuery(requestId);

    if (success) {
      console.log(`Successfully aborted session: ${requestId}`);
      res.json({
        success: true,
        message: 'Session interrupted successfully'
      });
    } else {
      console.log(`Session not found or already completed: ${requestId}`);
      res.status(404).json({
        error: 'Session not found',
        message: 'The session may have already completed or expired'
      });
    }
  } catch (error) {
    console.error('Error aborting session:', error);
    res.status(500).json({
      error: 'Abort failed',
      message: error.message
    });
  }
});

// POST /api/chat/intelligent-voice - Generate intelligent response for voice mode with ReAct planning
router.post('/intelligent-voice', requireAuth, async (req, res) => {
  try {
    const { userQuery, conversationHistory, domain_id } = req.body;

    // Validate userQuery
    const queryValidation = validateChatQuery(userQuery);
    if (!queryValidation.valid) {
      logValidationFailure(req, '/api/chat/intelligent-voice', 'userQuery', queryValidation.error);
      return res.status(400).json({
        error: 'Invalid input',
        message: queryValidation.error
      });
    }

    // Validate conversationHistory
    const historyValidation = validateConversationHistory(conversationHistory);
    if (!historyValidation.valid) {
      logValidationFailure(req, '/api/chat/intelligent-voice', 'conversationHistory', historyValidation.error);
      return res.status(400).json({
        error: 'Invalid input',
        message: historyValidation.error
      });
    }

    // Validate domain_id
    const domainValidation = validateDomainId(domain_id);
    if (!domainValidation.valid) {
      logValidationFailure(req, '/api/chat/intelligent-voice', 'domain_id', domainValidation.error);
      return res.status(400).json({
        error: 'Invalid input',
        message: domainValidation.error
      });
    }

    // Use sanitized values
    const sanitizedQuery = queryValidation.sanitized;
    const sanitizedHistory = historyValidation.sanitized;
    const domainId = domainValidation.sanitized;

    // Extract user name from JWT
    let userName = 'unknown';
    if (req.user?.name) {
      userName = req.user.name.split(' ')[0];
    } else if (req.user?.email) {
      const emailName = req.user.email.split('@')[0].split('.')[0];
      userName = emailName.charAt(0).toUpperCase() + emailName.slice(1).toLowerCase();
    }

    console.log('🎙️  Backend: Processing voice query with ReAct intelligence:', userName);
    console.log('💬 Backend: Query:', sanitizedQuery);
    console.log('🏢 Backend: Domain ID:', domainId);

    // Use unified intelligent service for voice processing
    const result = await processVoiceQuery(
      sanitizedQuery,
      sanitizedHistory,
      userName,
      domainId
    );

    console.log('✅ Backend: Voice response generated with ReAct intelligence');
    console.log(`   Iterations used: ${result.metadata.iterations}`);
    console.log(`   Execution time: ${result.metadata.execution_time_ms}ms`);
    console.log(`   Response preview: ${result.response.substring(0, 100)}...`);

    res.json(result);

  } catch (error) {
    console.error('❌ Backend: Voice intelligent chat error:', error);
    res.status(500).json({
      error: 'Failed to generate intelligent voice response',
      details: error.message
    });
  }
});

// POST /api/chat/function - Execute individual functions for voice/realtime API
router.post('/function', requireAuth, async (req, res) => {
  try {
    const { functionName, arguments: argumentsStr } = req.body;
    
    if (!functionName || !argumentsStr) {
      return res.status(400).json({ 
        error: 'functionName and arguments are required' 
      });
    }
    
    let args;
    try {
      args = JSON.parse(argumentsStr);
    } catch (parseError) {
      return res.status(400).json({ 
        error: 'Invalid JSON in arguments' 
      });
    }
    
    console.log('🔧 Backend: Executing function:', functionName, args);
    
    let result = { error: "Function not implemented" };
    
    switch (functionName) {
      case 'get_use_cases_by_criteria':
        console.log('📊 Backend: Getting use cases by criteria:', args);
        
        let whereClause = 'WHERE 1=1';
        const queryParams = [];
        
        if (args.department) {
          whereClause += ' AND d.name = ?';
          queryParams.push(args.department);
        }
        if (args.status) {
          whereClause += ' AND uc.status = ?';
          queryParams.push(args.status);
        }
        if (args.strategic_impact) {
          whereClause += ' AND uc.strategic_impact = ?';
          queryParams.push(args.strategic_impact);
        }
        
        const limit = args.limit || 5;
        const useCaseQuery = `
          SELECT 
            uc.id,
            uc.title,
            uc.description,
            uc.status,
            uc.strategic_impact,
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
        
        const useCases = await new Promise((resolve, reject) => {
          db.query(useCaseQuery, queryParams, (err, results) => {
            if (err) reject(err);
            else resolve(results);
          });
        });
        
        result = useCases;
        console.log(`✅ Backend: Found ${result.length} use cases`);
        break;
        
      case 'get_strategic_goals_by_pillar':
        console.log('🎯 Backend: Getting strategic goals by pillar:', args);
        
        // First find the pillar by name
        const pillarQuery = `
          SELECT id, name, description 
          FROM strategic_pillars 
          WHERE LOWER(name) LIKE LOWER(?)
        `;
        
        const pillars = await new Promise((resolve, reject) => {
          db.query(pillarQuery, [`%${args.pillar_name}%`], (err, results) => {
            if (err) reject(err);
            else resolve(results);
          });
        });
        
        if (pillars.length === 0) {
          console.log('❌ Backend: Pillar not found');
          result = { error: "Pillar not found" };
        } else {
          const pillar = pillars[0];
          
          // Get strategic goals for this pillar
          const goalsQuery = `
            SELECT 
              sg.id,
              sg.title,
              sg.description,
              sg.priority,
              sg.status,
              sg.target_date,
              sp.name as strategic_pillar_name
            FROM strategic_goals sg
            JOIN strategic_pillars sp ON sg.strategic_pillar_id = sp.id
            WHERE sg.strategic_pillar_id = ?
            ORDER BY sg.priority ASC
          `;
          
          const goals = await new Promise((resolve, reject) => {
            db.query(goalsQuery, [pillar.id], (err, results) => {
              if (err) reject(err);
              else resolve(results);
            });
          });
          
          result = goals;
          console.log(`✅ Backend: Found ${result.length} goals for pillar ${pillar.name}`);
        }
        break;
        
      case 'get_strategic_pillars':
        console.log('🏛️ Backend: Getting all strategic pillars');
        
        const pillarsQuery = `
          SELECT id, name, description 
          FROM strategic_pillars 
          ORDER BY name ASC
        `;
        
        const allPillars = await new Promise((resolve, reject) => {
          db.query(pillarsQuery, [], (err, results) => {
            if (err) reject(err);
            else resolve(results);
          });
        });
        
        result = allPillars;
        console.log(`✅ Backend: Found ${result.length} strategic pillars`);
        break;
        
      case 'get_use_case_statistics':
        console.log('📈 Backend: Getting use case statistics:', args);
        
        // Get basic counts
        const countsQuery = `
          SELECT 
            (SELECT COUNT(*) FROM use_cases) as total_use_cases,
            (SELECT COUNT(*) FROM strategic_goals) as total_strategic_goals,
            (SELECT COUNT(*) FROM strategic_pillars) as total_strategic_pillars
        `;
        
        const counts = await new Promise((resolve, reject) => {
          db.query(countsQuery, [], (err, results) => {
            if (err) reject(err);
            else resolve(results[0]);
          });
        });
        
        const stats = {
          total_use_cases: counts.total_use_cases,
          total_strategic_goals: counts.total_strategic_goals,
          total_strategic_pillars: counts.total_strategic_pillars
        };
        
        if (args.group_by === 'department') {
          const deptQuery = `
            SELECT d.name as department, COUNT(uc.id) as count
            FROM departments d
            LEFT JOIN use_cases uc ON d.id = uc.department_id
            GROUP BY d.id, d.name
            ORDER BY count DESC
          `;
          
          const deptResults = await new Promise((resolve, reject) => {
            db.query(deptQuery, [], (err, results) => {
              if (err) reject(err);
              else resolve(results);
            });
          });
          
          const deptCounts = {};
          deptResults.forEach(row => {
            deptCounts[row.department] = row.count;
          });
          stats.by_department = deptCounts;
        }
        
        if (args.group_by === 'status') {
          const statusQuery = `
            SELECT status, COUNT(*) as count
            FROM use_cases
            GROUP BY status
            ORDER BY count DESC
          `;
          
          const statusResults = await new Promise((resolve, reject) => {
            db.query(statusQuery, [], (err, results) => {
              if (err) reject(err);
              else resolve(results);
            });
          });
          
          const statusCounts = {};
          statusResults.forEach(row => {
            statusCounts[row.status] = row.count;
          });
          stats.by_status = statusCounts;
        }
        
        if (args.group_by === 'strategic_impact') {
          const impactQuery = `
            SELECT strategic_impact, COUNT(*) as count
            FROM use_cases
            GROUP BY strategic_impact
            ORDER BY count DESC
          `;
          
          const impactResults = await new Promise((resolve, reject) => {
            db.query(impactQuery, [], (err, results) => {
              if (err) reject(err);
              else resolve(results);
            });
          });
          
          const impactCounts = {};
          impactResults.forEach(row => {
            impactCounts[row.strategic_impact] = row.count;
          });
          stats.by_strategic_impact = impactCounts;
        }
        
        console.log(`✅ Backend: Generated statistics`);
        result = stats;
        break;
        
      case 'search_use_cases':
        console.log('🔍 Backend: Smart searching use cases:', args);
        
        const originalTerm = args.search_term;
        const searchLimit = args.limit || 3; // Default to 3 for voice
        
        // Get ALL use cases for smart matching (max ~100, totally manageable)
        const allUseCasesQuery = `
          SELECT 
            uc.id,
            uc.title,
            uc.description,
            uc.status,
            uc.strategic_impact,
            uc.problem_statement,
            uc.solution_overview,
            d.name as department,
            u.name as author_name,
            uc.created_date
          FROM use_cases uc
          LEFT JOIN departments d ON uc.department_id = d.id
          LEFT JOIN users u ON uc.author_id = u.id
          ORDER BY uc.created_date DESC
        `;
        
        const allUseCases = await new Promise((resolve, reject) => {
          db.query(allUseCasesQuery, [], (err, results) => {
            if (err) reject(err);
            else resolve(results);
          });
        });
        
        // Smart fuzzy matching function
        const fuzzyMatch = (text, searchTerm) => {
          if (!text) return 0;
          
          const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
          const normalizedText = normalize(text);
          const normalizedSearch = normalize(searchTerm);
          
          // Exact match (highest score)
          if (normalizedText === normalizedSearch) return 100;
          
          // Contains exact normalized term
          if (normalizedText.includes(normalizedSearch)) return 90;
          
          // Word boundary matching - split and check each word
          const searchWords = searchTerm.toLowerCase().split(/\s+/);
          const textWords = text.toLowerCase().split(/\s+/);
          
          let wordMatches = 0;
          for (const searchWord of searchWords) {
            for (const textWord of textWords) {
              const normalizedTextWord = normalize(textWord);
              const normalizedSearchWord = normalize(searchWord);
              
              if (normalizedTextWord === normalizedSearchWord) {
                wordMatches += 50; // Full word match
              } else if (normalizedTextWord.includes(normalizedSearchWord) || normalizedSearchWord.includes(normalizedTextWord)) {
                wordMatches += 25; // Partial word match
              }
            }
          }
          
          // Bonus for title matches
          return wordMatches;
        };
        
        // Score and rank all use cases
        const scoredUseCases = allUseCases.map(uc => {
          const titleScore = fuzzyMatch(uc.title, originalTerm);
          const descScore = fuzzyMatch(uc.description, originalTerm) * 0.5; // Lower weight
          const problemScore = fuzzyMatch(uc.problem_statement, originalTerm) * 0.3;
          const solutionScore = fuzzyMatch(uc.solution_overview, originalTerm) * 0.3;
          
          const totalScore = titleScore + descScore + problemScore + solutionScore;
          
          return {
            ...uc,
            matchScore: totalScore
          };
        })
        .filter(uc => uc.matchScore > 0) // Only include matches
        .sort((a, b) => b.matchScore - a.matchScore) // Sort by best match
        .slice(0, searchLimit); // Limit results
        
        // Format results
        result = scoredUseCases.map(uc => ({
          id: uc.id,
          title: uc.title,
          description: uc.description,
          status: uc.status,
          strategic_impact: uc.strategic_impact,
          department: uc.department,
          author_name: uc.author_name,
          created_date: uc.created_date,
          match_score: Math.round(uc.matchScore) // Include score for debugging
        }));
        
        console.log(`✅ Backend: Smart search found ${result.length} matching use cases for "${originalTerm}"`);
        if (result.length > 0) {
          console.log(`Top match: "${result[0].title}" (score: ${result[0].match_score})`);
        }
        break;
        
      case 'get_use_case_details':
        console.log('🔎 Backend: Getting use case details:', args);
        
        let detailsQuery;
        let detailsParams;
        
        if (args.use_case_id) {
          detailsQuery = `
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
              uc.created_date
            FROM use_cases uc
            LEFT JOIN departments d ON uc.department_id = d.id
            LEFT JOIN users u ON uc.author_id = u.id
            WHERE uc.id = ?
          `;
          detailsParams = [args.use_case_id];
        } else if (args.use_case_title) {
          detailsQuery = `
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
              uc.created_date
            FROM use_cases uc
            LEFT JOIN departments d ON uc.department_id = d.id
            LEFT JOIN users u ON uc.author_id = u.id
            WHERE LOWER(uc.title) LIKE LOWER(?)
            LIMIT 1
          `;
          detailsParams = [`%${args.use_case_title}%`];
        } else {
          result = { error: "Either use_case_id or use_case_title is required" };
          break;
        }
        
        const useCaseResults = await new Promise((resolve, reject) => {
          db.query(detailsQuery, detailsParams, (err, results) => {
            if (err) reject(err);
            else resolve(results);
          });
        });
        
        if (useCaseResults.length === 0) {
          console.log('❌ Backend: Use case not found');
          result = { error: "Use case not found" };
        } else {
          const useCase = useCaseResults[0];
          console.log(`✅ Backend: Found use case: ${useCase.title}`);
          
          result = {
            id: useCase.id,
            title: useCase.title,
            description: useCase.description,
            problem_statement: useCase.problem_statement,
            solution_overview: useCase.solution_overview,
            department: useCase.department,
            status: useCase.status,
            strategic_impact: useCase.strategic_impact,
            complexity: {
              data_complexity: useCase.data_complexity,
              integration_complexity: useCase.integration_complexity,
              intelligence_complexity: useCase.intelligence_complexity,
              functional_complexity: useCase.functional_complexity
            },
            author_name: useCase.author_name,
            created_date: useCase.created_date,
            technical_implementation: useCase.technical_implementation,
            results_metrics: useCase.results_metrics
          };
        }
        break;
        
      case 'get_executive_brief':
        console.log('📋 Backend: Getting executive brief for last 7 days');
        
        const daysBack = args.days || 7; // Default to 7 days, allow customization
        
        // Get recent use case changes (created and updated)
        const recentUseCasesQuery = `
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
          WHERE uc.created_date >= DATE_SUB(NOW(), INTERVAL ? DAY)
          
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
            AND uc.updated_date > uc.created_date
          
          ORDER BY action_date DESC
        `;
        
        const recentUseCases = await new Promise((resolve, reject) => {
          db.query(recentUseCasesQuery, [daysBack, daysBack], (err, results) => {
            if (err) reject(err);
            else resolve(results);
          });
        });
        
        // Get recent strategic goal changes
        const recentGoalsQuery = `
          SELECT 
            'strategic_goal' as item_type,
            'created' as action_type,
            sg.id,
            sg.title,
            sg.status,
            sg.priority,
            sp.name as strategic_pillar_name,
            u.name as author_name,
            sg.created_date as action_date
          FROM strategic_goals sg
          LEFT JOIN strategic_pillars sp ON sg.strategic_pillar_id = sp.id
          LEFT JOIN users u ON sg.author_id = u.id
          WHERE sg.created_date >= DATE_SUB(NOW(), INTERVAL ? DAY)
          
          UNION ALL
          
          SELECT 
            'strategic_goal' as item_type,
            'updated' as action_type,
            sg.id,
            sg.title,
            sg.status,
            sg.priority,
            sp.name as strategic_pillar_name,
            u.name as author_name,
            sg.updated_date as action_date
          FROM strategic_goals sg
          LEFT JOIN strategic_pillars sp ON sg.strategic_pillar_id = sp.id
          LEFT JOIN users u ON sg.author_id = u.id
          WHERE sg.updated_date >= DATE_SUB(NOW(), INTERVAL ? DAY)
            AND sg.updated_date > sg.created_date
          
          ORDER BY action_date DESC
        `;
        
        const recentGoals = await new Promise((resolve, reject) => {
          db.query(recentGoalsQuery, [daysBack, daysBack], (err, results) => {
            if (err) reject(err);
            else resolve(results);
          });
        });
        
        // Get specific status changes and field updates
        const statusChangesQuery = `
          SELECT 
            uc.id,
            uc.title,
            uc.status as current_status,
            uc.strategic_impact as current_impact,
            d.name as department,
            uc.updated_date,
            CASE 
              WHEN uc.status = 'production' AND uc.updated_date >= DATE_SUB(NOW(), INTERVAL ? DAY) THEN 'moved_to_production'
              WHEN uc.status = 'pilot' AND uc.updated_date >= DATE_SUB(NOW(), INTERVAL ? DAY) THEN 'moved_to_pilot'
              WHEN uc.status = 'validation' AND uc.updated_date >= DATE_SUB(NOW(), INTERVAL ? DAY) THEN 'moved_to_validation'
              WHEN uc.strategic_impact = 'High' AND uc.updated_date >= DATE_SUB(NOW(), INTERVAL ? DAY) THEN 'elevated_to_high_impact'
              ELSE 'general_update'
            END as change_type,
            CASE 
              WHEN status = 'production' THEN 5
              WHEN status = 'pilot' THEN 4
              WHEN status = 'validation' THEN 3
              WHEN status = 'proof_of_concept' THEN 2
              WHEN status = 'concept' THEN 1
              ELSE 0
            END as maturity_level
          FROM use_cases uc
          LEFT JOIN departments d ON uc.department_id = d.id
          WHERE uc.updated_date >= DATE_SUB(NOW(), INTERVAL ? DAY)
            AND uc.updated_date > uc.created_date
          ORDER BY maturity_level DESC, uc.updated_date DESC
        `;
        
        const statusChanges = await new Promise((resolve, reject) => {
          db.query(statusChangesQuery, [daysBack, daysBack, daysBack, daysBack, daysBack], (err, results) => {
            if (err) reject(err);
            else resolve(results);
          });
        });
        
        // Get status progression analysis
        const statusProgressionQuery = `
          SELECT 
            COUNT(*) as count,
            status,
            AVG(CASE 
              WHEN status = 'production' THEN 5
              WHEN status = 'pilot' THEN 4
              WHEN status = 'validation' THEN 3
              WHEN status = 'proof_of_concept' THEN 2
              WHEN status = 'concept' THEN 1
              ELSE 0
            END) as avg_maturity_score
          FROM use_cases 
          WHERE updated_date >= DATE_SUB(NOW(), INTERVAL ? DAY)
          GROUP BY status
          ORDER BY avg_maturity_score DESC
        `;
        
        const statusProgression = await new Promise((resolve, reject) => {
          db.query(statusProgressionQuery, [daysBack], (err, results) => {
            if (err) reject(err);
            else resolve(results);
          });
        });
        
        // Get department activity summary
        const departmentActivityQuery = `
          SELECT 
            d.name as department,
            COUNT(CASE WHEN uc.created_date >= DATE_SUB(NOW(), INTERVAL ? DAY) THEN 1 END) as new_use_cases,
            COUNT(CASE WHEN uc.updated_date >= DATE_SUB(NOW(), INTERVAL ? DAY) AND uc.updated_date > uc.created_date THEN 1 END) as updated_use_cases,
            COUNT(CASE WHEN uc.status = 'production' AND uc.updated_date >= DATE_SUB(NOW(), INTERVAL ? DAY) THEN 1 END) as new_production_cases,
            COUNT(CASE WHEN uc.strategic_impact = 'High' AND uc.updated_date >= DATE_SUB(NOW(), INTERVAL ? DAY) THEN 1 END) as high_impact_updates
          FROM departments d
          LEFT JOIN use_cases uc ON d.id = uc.department_id
          GROUP BY d.id, d.name
          HAVING new_use_cases > 0 OR updated_use_cases > 0 OR new_production_cases > 0 OR high_impact_updates > 0
          ORDER BY (new_use_cases + updated_use_cases + new_production_cases + high_impact_updates) DESC
        `;
        
        const departmentActivity = await new Promise((resolve, reject) => {
          db.query(departmentActivityQuery, [daysBack, daysBack, daysBack, daysBack], (err, results) => {
            if (err) reject(err);
            else resolve(results);
          });
        });
        
        // Construct executive summary
        const summary = {
          period: `Last ${daysBack} days`,
          period_start: new Date(Date.now() - (daysBack * 24 * 60 * 60 * 1000)).toISOString().split('T')[0],
          period_end: new Date().toISOString().split('T')[0],
          
          // Activity overview
          activity_summary: {
            total_use_case_changes: recentUseCases.length,
            new_use_cases: recentUseCases.filter(uc => uc.action_type === 'created').length,
            updated_use_cases: recentUseCases.filter(uc => uc.action_type === 'updated').length,
            total_strategic_goal_changes: recentGoals.length,
            new_strategic_goals: recentGoals.filter(sg => sg.action_type === 'created').length,
            updated_strategic_goals: recentGoals.filter(sg => sg.action_type === 'updated').length,
            status_changes_tracked: statusChanges.length
          },
          
          // Recent key changes
          recent_use_cases: recentUseCases.slice(0, 10), // Top 10 most recent
          recent_strategic_goals: recentGoals.slice(0, 5), // Top 5 most recent
          
          // Status change analysis
          status_changes: {
            total_changes: statusChanges.length,
            by_change_type: statusChanges.reduce((acc, sc) => {
              acc[sc.change_type] = (acc[sc.change_type] || 0) + 1;
              return acc;
            }, {}),
            recent_status_changes: statusChanges.slice(0, 10), // Top 10 most recent status changes
            maturity_progression: {
              moved_to_production: statusChanges.filter(sc => sc.change_type === 'moved_to_production').length,
              moved_to_pilot: statusChanges.filter(sc => sc.change_type === 'moved_to_pilot').length,
              moved_to_validation: statusChanges.filter(sc => sc.change_type === 'moved_to_validation').length,
              elevated_to_high_impact: statusChanges.filter(sc => sc.change_type === 'elevated_to_high_impact').length
            }
          },
          
          // Department activity
          department_activity: departmentActivity,
          
          // Status progression insights
          status_progression: statusProgression,
          
          // Key highlights for narrative
          highlights: {
            most_active_departments: departmentActivity.slice(0, 3).map(d => d.department),
            production_ready_count: recentUseCases.filter(uc => uc.status === 'production').length,
            high_impact_count: recentUseCases.filter(uc => uc.strategic_impact === 'High').length,
            total_activity_score: recentUseCases.length + (recentGoals.length * 2), // Goals weighted higher
            significant_progressions: statusChanges.filter(sc => ['moved_to_production', 'moved_to_pilot'].includes(sc.change_type)).length
          },
          
          // Metadata
          generated_at: new Date().toISOString(),
          generated_for_days: daysBack
        };
        
        result = summary;
        console.log(`✅ Backend: Generated executive brief for ${daysBack} days with ${summary.activity_summary.total_use_case_changes + summary.activity_summary.total_strategic_goal_changes} total changes`);
        break;
    }
    
    res.json({ 
      result,
      functionName,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Backend: Function execution error:', error);
    res.status(500).json({ 
      error: 'Failed to execute function',
      details: error.message
    });
  }
});

// POST /api/chat/generate-usecase - Generate use case from prompt
router.post('/generate-usecase', requireAuth, async (req, res) => {
  try {
    const { prompt, domain_id } = req.body;

    // Validate prompt
    const promptValidation = validatePrompt(prompt);
    if (!promptValidation.valid) {
      logValidationFailure(req, '/api/chat/generate-usecase', 'prompt', promptValidation.error);
      return res.status(400).json({
        error: 'Invalid input',
        message: promptValidation.error
      });
    }

    // Validate domain_id - CRITICAL for SQL injection prevention
    const domainValidation = validateDomainId(domain_id);
    if (!domainValidation.valid) {
      logValidationFailure(req, '/api/chat/generate-usecase', 'domain_id', domainValidation.error);
      return res.status(400).json({
        error: 'Invalid input',
        message: domainValidation.error
      });
    }

    const sanitizedPrompt = promptValidation.sanitized;
    const sanitizedDomainId = domainValidation.sanitized;

    console.log('🤖 Backend: Generating use case from prompt:', sanitizedPrompt);
    console.log('🏢 Domain ID:', sanitizedDomainId);

    // Fetch domain information if provided
    let domainContext = 'AI';
    let domainDescription = 'AI and Machine Learning';

    if (sanitizedDomainId) {
      try {
        const db = require('../config/database-mysql-compat');
        // Now safe from SQL injection - sanitizedDomainId is validated integer
        const result = await db.query('SELECT * FROM domains WHERE id = ?', [sanitizedDomainId]);
        const domains = Array.isArray(result) ? result[0] : result;
        if (domains && domains.length > 0) {
          domainContext = domains[0].name;
          domainDescription = domains[0].hero_message || domains[0].name;
        }
      } catch (err) {
        console.warn('Failed to fetch domain info, using default:', err.message);
      }
    }

    // Fetch domain-specific categories and departments
    let categoryList = [];
    let departmentList = [];

    try {
      const db = require('../config/database-mysql-compat');

      // Fetch categories for the domain
      console.log('🔍 Fetching categories for domain:', domain_id);
      const categoryQuery = domain_id
        ? 'SELECT name FROM categories WHERE domain_id = ?'
        : 'SELECT name FROM categories LIMIT 10';
      const categoryParams = domain_id ? [domain_id] : [];
      const [categories] = await db.promise().query(categoryQuery, categoryParams);
      console.log('✅ Categories from DB:', categories);
      categoryList = categories.map(c => c.name);

      // Fetch departments for the domain
      console.log('🔍 Fetching departments for domain:', domain_id);
      const departmentQuery = domain_id
        ? 'SELECT name FROM departments WHERE domain_id = ? ORDER BY name'
        : 'SELECT name FROM departments ORDER BY name';
      const departmentParams = domain_id ? [domain_id] : [];
      const [departments] = await db.promise().query(departmentQuery, departmentParams);
      console.log('✅ Departments from DB:', departments);
      departmentList = departments.map(d => d.name);
    } catch (err) {
      console.warn('Failed to fetch categories/departments, using defaults:', err.message);
      // Use generic defaults if DB query fails
      categoryList = ['Strategy', 'Implementation', 'Operations', 'Research'];
      departmentList = ['Government Affairs', 'Corporate Affairs'];
    }

    // Use the same Azure OpenAI setup as intelligent chat
    const { generateIntelligentResponse } = require('../services/intelligentChatService');

    // Create a domain-aware specialized prompt for use case generation
    const systemPrompt = `You are an assistant that helps users create ${domainContext} initiative entries for a government organization (${domainDescription}). Based on the user's description, generate a structured initiative with the following fields:

1. title: A concise, descriptive title (max 50 characters)
2. description: A brief overview of the initiative
3. problem_statement: Clear description of the problem being solved
4. solution_overview: High-level solution approach
5. technical_implementation: Technical details of implementation (optional)
6. category: Must be one of these exact values:
${categoryList.map(c => `   - "${c}"`).join('\n')}
7. status: Always "concept"
8. complexity: Object with four complexity levels (Low/Medium/High):
    - data_complexity: Complexity of data processing
    - integration_complexity: Complexity of system integration
    - intelligence_complexity: Complexity of AI/ML algorithms
    - functional_complexity: Complexity of business logic
9. department: Must be one of these exact values:
${departmentList.map(d => `   - "${d}"`).join('\n')}
10. strategic_impact: Low/Medium/High based on business value

Respond with valid JSON only, no additional text.`;

    // Call COMPASS OpenAI directly for use case generation (same config as intelligent chat)
    const OpenAI = require('openai');

    const compassEndpoint = process.env.COMPASS_OPENAI_ENDPOINT || '';
    const baseURL = compassEndpoint.replace(/\/chat\/completions$/, '');

    const azureOpenAI = new OpenAI({
      apiKey: process.env.COMPASS_OPENAI_API_KEY,
      baseURL: baseURL,
      defaultQuery: { 'api-version': process.env.COMPASS_OPENAI_API_VERSION },
      defaultHeaders: {
        'api-key': process.env.COMPASS_OPENAI_API_KEY,
      },
    });

    const completion = await azureOpenAI.chat.completions.create({
      model: process.env.COMPASS_OPENAI_DEPLOYMENT_NAME,
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: sanitizedPrompt
        }
      ],
      max_completion_tokens: 10000,
      reasoning_effort: process.env.COMPASS_OPENAI_REASONING_EFFORT || "minimal"
    });

    console.log('🔍 Backend: COMPASS completion response:', JSON.stringify({
      choices: completion.choices?.length,
      firstChoice: completion.choices?.[0] ? {
        finish_reason: completion.choices[0].finish_reason,
        message: {
          role: completion.choices[0].message?.role,
          content_length: completion.choices[0].message?.content?.length || 0
        }
      } : null,
      usage: completion.usage
    }, null, 2));

    const response = completion.choices[0]?.message?.content;

    if (!response || response.trim().length === 0) {
      console.warn('⚠️ Backend: COMPASS returned empty response, finish_reason:', completion.choices?.[0]?.finish_reason);
      throw new Error(`No response from COMPASS OpenAI (finish_reason: ${completion.choices?.[0]?.finish_reason || 'unknown'})`);
    }

    // Parse the JSON response
    let generatedData;
    try {
      // Strip markdown code blocks if present (```json ... ```)
      let cleanedResponse = response.trim();
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      generatedData = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('❌ Backend: Failed to parse OpenAI response as JSON:', parseError);
      console.error('Raw response:', response);
      // Fallback generation
      generatedData = fallbackGeneration(prompt, categoryList, departmentList);
    }
    
    // Validate and sanitize the response
    // Ensure category is valid for this domain
    let validCategory = generatedData.category;
    if (!validCategory || !categoryList.includes(validCategory)) {
      validCategory = categoryList[0] || 'Strategy';
      console.warn(`⚠️ Backend: Invalid or missing category "${generatedData.category}", using "${validCategory}"`);
    }

    // Ensure department is valid
    let validDepartment = generatedData.department;
    if (!validDepartment || !departmentList.includes(validDepartment)) {
      validDepartment = departmentList[0] || 'Corporate Affairs';
      console.warn(`⚠️ Backend: Invalid or missing department "${generatedData.department}", using "${validDepartment}"`);
    }

    const sanitizedData = {
      title: generatedData.title || 'AI Use Case',
      description: generatedData.description || `AI use case for: ${prompt}`,
      problem_statement: generatedData.problem_statement || `Problem: ${prompt}`,
      solution_overview: generatedData.solution_overview || `Solution approach for: ${prompt}`,
      technical_implementation: generatedData.technical_implementation || '',
      category: validCategory,
      status: 'concept',
      complexity: generatedData.complexity || {
        data_complexity: 'Medium',
        integration_complexity: 'Medium',
        intelligence_complexity: 'Medium',
        functional_complexity: 'Medium'
      },
      department: validDepartment,
      strategic_impact: generatedData.strategic_impact || 'Medium'
    };
    
    console.log('✅ Backend: Generated use case:', sanitizedData.title);
    
    res.json({
      success: true,
      data: sanitizedData,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Backend: Use case generation error:', error);
    
    // Fallback generation on error
    try {
      // Try to get domain-specific lists, or use generic fallbacks
      let fallbackCategoryList = ['Strategy', 'Implementation', 'Operations', 'Research'];
      let fallbackDepartmentList = ['Government Affairs', 'Corporate Affairs'];

      try {
        const db = require('../config/database-mysql-compat');
        const domain_id = req.body.domain_id;

        if (domain_id) {
          const catResult = await db.query('SELECT name FROM categories WHERE domain_id = ? AND is_active = 1', [domain_id]);
          const categories = Array.isArray(catResult) ? catResult[0] : catResult;
          if (categories && categories.length > 0) {
            fallbackCategoryList = categories.map(c => c.name);
          }
        }

        const deptResult = await db.query('SELECT name FROM departments WHERE is_active = 1');
        const departments = Array.isArray(deptResult) ? deptResult[0] : deptResult;
        if (departments && departments.length > 0) {
          fallbackDepartmentList = departments.map(d => d.name);
        }
      } catch (dbError) {
        console.warn('Failed to fetch categories/departments for fallback:', dbError.message);
      }

      const fallbackData = fallbackGeneration(req.body.prompt, fallbackCategoryList, fallbackDepartmentList);
      console.log('🔄 Backend: Using fallback generation');
      
      res.json({
        success: true,
        data: fallbackData,
        fallback: true,
        timestamp: new Date().toISOString()
      });
    } catch (fallbackError) {
      res.status(500).json({ 
        error: 'Failed to generate use case',
        details: error.message
      });
    }
  }
});

// Fallback function for when COMPASS OpenAI API fails
const fallbackGeneration = (prompt, categoryList = [], departmentList = []) => {
  const promptLower = prompt.toLowerCase();

  // Use domain-specific category, or default to first available
  let category = categoryList[0] || 'Strategy';
  let department = departmentList[0] || 'Corporate Affairs';
  let complexity = {
    data_complexity: 'Medium',
    integration_complexity: 'Medium',
    intelligence_complexity: 'Medium',
    functional_complexity: 'Medium'
  };
  let strategic_impact = 'Medium';

  // Simple keyword-based categorization - but only use categories that exist in the domain
  const availableCategories = {
    'Internally deploy LLMs': ['llm', 'gpt', 'bert', 'language model'],
    'Leverage Vendor embedded solutions': ['vendor', 'software', 'integration'],
    'Leverage Copilot': ['copilot', 'microsoft', 'agent'],
    'Leverage DGE': ['government', 'g42', 'abu dhabi']
  };

  for (const [cat, keywords] of Object.entries(availableCategories)) {
    if (categoryList.includes(cat) && keywords.some(kw => promptLower.includes(kw))) {
      category = cat;
      if (cat === 'Internally deploy LLMs') {
        complexity.intelligence_complexity = 'High';
      } else if (cat === 'Leverage Vendor embedded solutions') {
        complexity.integration_complexity = 'High';
      } else if (cat === 'Leverage DGE') {
        complexity.integration_complexity = 'High';
        strategic_impact = 'High';
      }
      break;
    }
  }

  // Department detection - only use departments that exist in the domain
  const availableDepartments = {
    'Government Financial Affairs': ['financial', 'finance'],
    'Legal and Compliance Affairs': ['legal', 'compliance'],
    'Investment and Economic Affairs': ['investment', 'economic'],
    'Executive Financial Affairs': ['executive']
  };

  for (const [dept, keywords] of Object.entries(availableDepartments)) {
    if (departmentList.includes(dept) && keywords.some(kw => promptLower.includes(kw))) {
      department = dept;
      break;
    }
  }

  return {
    title: prompt.length > 50 ? prompt.substring(0, 50) + '...' : prompt,
    description: `AI use case for: ${prompt}`,
    problem_statement: `Problem: ${prompt}`,
    solution_overview: `Solution approach for: ${prompt}`,
    technical_implementation: `Technical implementation details for: ${prompt}`,
    category,
    status: 'concept',
    complexity,
    department,
    strategic_impact
  };
};

// POST /api/chat/generate-agent - Generate agent from prompt
router.post('/generate-agent', requireAuth, async (req, res) => {
  try {
    const { prompt, domain_id } = req.body;

    // Validate prompt
    const promptValidation = validatePrompt(prompt);
    if (!promptValidation.valid) {
      logValidationFailure(req, '/api/chat/generate-agent', 'prompt', promptValidation.error);
      return res.status(400).json({
        error: 'Invalid input',
        message: promptValidation.error
      });
    }

    // Validate domain_id
    const domainValidation = validateDomainId(domain_id);
    if (!domainValidation.valid) {
      logValidationFailure(req, '/api/chat/generate-agent', 'domain_id', domainValidation.error);
      return res.status(400).json({
        error: 'Invalid input',
        message: domainValidation.error
      });
    }

    const sanitizedPrompt = promptValidation.sanitized;
    const sanitizedDomainId = domainValidation.sanitized;

    console.log('🤖 Backend: Generating agent from prompt:', sanitizedPrompt);
    console.log('🏢 Domain ID:', sanitizedDomainId);

    // Fetch domain information if provided
    let domainContext = 'AI';
    let domainDescription = 'AI and Machine Learning';

    if (sanitizedDomainId) {
      try {
        const db = require('../config/database-mysql-compat');
        const result = await db.query('SELECT * FROM domains WHERE id = ?', [sanitizedDomainId]);
        const domains = Array.isArray(result) ? result[0] : result;
        if (domains && domains.length > 0) {
          domainContext = domains[0].name;
          domainDescription = domains[0].hero_message || domains[0].name;
        }
      } catch (err) {
        console.warn('Failed to fetch domain info, using default:', err.message);
      }
    }

    // Fetch domain-specific agent types and departments
    let agentTypeList = [];
    let departmentList = [];

    try {
      const db = require('../config/database-mysql-compat');

      // Fetch agent types for the domain
      const agentTypeQuery = domain_id
        ? 'SELECT name FROM agent_types WHERE domain_id = ?'
        : 'SELECT name FROM agent_types LIMIT 10';
      const agentTypeParams = domain_id ? [domain_id] : [];

      console.log('🔍 Fetching agent types with query:', agentTypeQuery, 'params:', agentTypeParams);
      const [types] = await db.promise().query(agentTypeQuery, agentTypeParams);
      console.log('✅ Agent types from DB:', types);

      if (!types || !Array.isArray(types) || types.length === 0) {
        console.warn('⚠️ No agent types found in database');
        agentTypeList = ['Conversational Agent', 'Analytical Agent', 'Processing Agent', 'Research Agent'];
      } else {
        agentTypeList = types.map(t => t.name);
      }
      console.log('✅ Final agent types list:', agentTypeList);

      // Fetch departments for the domain
      console.log('🔍 Fetching departments for domain:', domain_id);
      const departmentQuery = domain_id
        ? 'SELECT name FROM departments WHERE domain_id = ? ORDER BY name'
        : 'SELECT name FROM departments ORDER BY name';
      const departmentParams = domain_id ? [domain_id] : [];
      const [departments] = await db.promise().query(departmentQuery, departmentParams);
      console.log('✅ Departments from DB:', departments);

      if (!departments || !Array.isArray(departments) || departments.length === 0) {
        console.warn('⚠️ No departments found in database');
        departmentList = ['Government Affairs', 'Corporate Affairs'];
      } else {
        departmentList = departments.map(d => d.name);
      }
      console.log('✅ Final departments list:', departmentList);
    } catch (err) {
      console.error('❌ Failed to fetch agent types/departments:', err);
      console.error('Error details:', err.message);
      console.error('Stack:', err.stack);
      // Use generic defaults if DB query fails
      agentTypeList = ['Conversational Agent', 'Analytical Agent', 'Processing Agent', 'Research Agent'];
      departmentList = ['Government Affairs', 'Corporate Affairs'];
      console.warn('⚠️ Using fallback agent types:', agentTypeList);
      console.warn('⚠️ Using fallback departments:', departmentList);
    }

    // Use the same COMPASS OpenAI setup as intelligent chat
    const OpenAI = require('openai');

    const compassEndpoint = process.env.COMPASS_OPENAI_ENDPOINT || '';
    const baseURL = compassEndpoint.replace(/\/chat\/completions$/, '');

    const azureOpenAI = new OpenAI({
      apiKey: process.env.COMPASS_OPENAI_API_KEY,
      baseURL: baseURL,
      defaultQuery: { 'api-version': process.env.COMPASS_OPENAI_API_VERSION },
      defaultHeaders: {
        'api-key': process.env.COMPASS_OPENAI_API_KEY,
      },
    });

    // Create a domain-aware specialized prompt for agent generation
    const systemPrompt = `You are an assistant that helps users create ${domainContext} agent entries for a government organization (${domainDescription}). Based on the user's description, generate a structured agent with the following fields:

1. title: A concise, descriptive title (max 50 characters)
2. description: A brief overview of the agent's purpose and capabilities
3. problem_statement: Clear description of the problem this agent solves
4. solution_overview: How the agent solves the problem
5. technical_implementation: Technical details of implementation
6. results_metrics: Expected results and key performance metrics
7. agent_type: Must be EXACTLY one of these values (copy exactly):
${agentTypeList.map(t => `   - "${t}"`).join('\n')}
8. status: Always "concept"
9. complexity: Object with four complexity levels (Low/Medium/High):
    - data_complexity: Complexity of data processing
    - integration_complexity: Complexity of system integration
    - intelligence_complexity: Complexity of AI/ML algorithms
    - functional_complexity: Complexity of business logic
10. department: Must be EXACTLY one of these values (copy exactly):
${departmentList.map(d => `   - "${d}"`).join('\n')}
11. strategic_impact: Low/Medium/High based on business value

IMPORTANT: For agent_type and department, you MUST use EXACTLY one of the provided values, character-for-character. Do not create new values.

Respond with valid JSON only, no additional text.`;

    const completion = await azureOpenAI.chat.completions.create({
      model: process.env.COMPASS_OPENAI_DEPLOYMENT_NAME,
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: sanitizedPrompt
        }
      ],
      max_completion_tokens: 10000,
      reasoning_effort: process.env.COMPASS_OPENAI_REASONING_EFFORT || "minimal"
    });

    console.log('🔍 Backend: COMPASS agent completion response:', JSON.stringify({
      choices: completion.choices?.length,
      firstChoice: completion.choices?.[0] ? {
        finish_reason: completion.choices[0].finish_reason,
        message: {
          role: completion.choices[0].message?.role,
          content_length: completion.choices[0].message?.content?.length || 0
        }
      } : null,
      usage: completion.usage
    }, null, 2));

    const response = completion.choices[0]?.message?.content;

    if (!response || response.trim().length === 0) {
      console.warn('⚠️ Backend: COMPASS returned empty agent response, finish_reason:', completion.choices?.[0]?.finish_reason);
      throw new Error(`No response from COMPASS OpenAI (finish_reason: ${completion.choices?.[0]?.finish_reason || 'unknown'})`);
    }

    // Parse the JSON response
    let generatedData;
    try {
      // Strip markdown code blocks if present
      let cleanedResponse = response.trim();
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      generatedData = JSON.parse(cleanedResponse);
      console.log('📦 Parsed AI response:', JSON.stringify(generatedData, null, 2));
    } catch (parseError) {
      console.error('❌ Backend: Failed to parse OpenAI response as JSON:', parseError);
      console.error('Raw response:', response);
      // Fallback generation
      generatedData = fallbackAgentGeneration(prompt, agentTypeList, departmentList);
    }

    // Validate and sanitize the response
    console.log('🔍 Validating agent_type:', {
      generated: generatedData.agent_type,
      availableTypes: agentTypeList,
      isValid: agentTypeList.includes(generatedData.agent_type)
    });

    let validAgentType = generatedData.agent_type;
    if (!validAgentType || !agentTypeList.includes(validAgentType)) {
      validAgentType = agentTypeList[0] || 'Conversational Agent';
      console.warn(`⚠️ Backend: Invalid or missing agent_type "${generatedData.agent_type}", using "${validAgentType}"`);
    }

    console.log('🔍 Validating department:', {
      generated: generatedData.department,
      availableDepts: departmentList,
      isValid: departmentList.includes(generatedData.department)
    });

    let validDepartment = generatedData.department;
    if (!validDepartment || !departmentList.includes(validDepartment)) {
      validDepartment = departmentList[0] || 'Corporate Affairs';
      console.warn(`⚠️ Backend: Invalid or missing department "${generatedData.department}", using "${validDepartment}"`);
    }

    const sanitizedData = {
      title: generatedData.title || 'AI Agent',
      description: generatedData.description || `AI agent for: ${prompt}`,
      problem_statement: generatedData.problem_statement || `Problem: ${prompt}`,
      solution_overview: generatedData.solution_overview || `Solution approach for: ${prompt}`,
      technical_implementation: generatedData.technical_implementation || '',
      results_metrics: generatedData.results_metrics || '',
      agent_type: validAgentType,
      status: 'concept',
      complexity: generatedData.complexity || {
        data_complexity: 'Medium',
        integration_complexity: 'Medium',
        intelligence_complexity: 'Medium',
        functional_complexity: 'Medium'
      },
      department: validDepartment,
      strategic_impact: generatedData.strategic_impact || 'Medium'
    };

    console.log('✅ Backend: Generated agent:', sanitizedData.title);

    res.json({
      success: true,
      data: sanitizedData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Backend: Agent generation error:', error);

    // Fallback generation on error
    try {
      let fallbackAgentTypeList = ['Conversational Agent', 'Analytical Agent', 'Processing Agent', 'Research Agent'];
      let fallbackDepartmentList = ['Government Affairs', 'Corporate Affairs'];

      try {
        const db = require('../config/database-mysql-compat');
        const domain_id = req.body.domain_id;

        if (domain_id) {
          const [types] = await db.promise().query('SELECT name FROM agent_types WHERE domain_id = ?', [domain_id]);
          if (types && types.length > 0) {
            fallbackAgentTypeList = types.map(t => t.name);
          }

          const [departments] = await db.promise().query('SELECT name FROM departments WHERE domain_id = ? ORDER BY name', [domain_id]);
          if (departments && departments.length > 0) {
            fallbackDepartmentList = departments.map(d => d.name);
          }
        }
      } catch (dbError) {
        console.warn('Failed to fetch agent types/departments for fallback:', dbError.message);
      }

      const fallbackData = fallbackAgentGeneration(req.body.prompt, fallbackAgentTypeList, fallbackDepartmentList);
      console.log('🔄 Backend: Using fallback generation');

      res.json({
        success: true,
        data: fallbackData,
        fallback: true,
        timestamp: new Date().toISOString()
      });
    } catch (fallbackError) {
      res.status(500).json({
        error: 'Failed to generate agent',
        details: error.message
      });
    }
  }
});

// Fallback function for agent generation when COMPASS OpenAI API fails
const fallbackAgentGeneration = (prompt, agentTypeList = [], departmentList = []) => {
  const promptLower = prompt.toLowerCase();

  let agent_type = agentTypeList[0] || 'Conversational Agent';
  let department = departmentList[0] || 'Corporate Affairs';
  let complexity = {
    data_complexity: 'Medium',
    integration_complexity: 'Medium',
    intelligence_complexity: 'Medium',
    functional_complexity: 'Medium'
  };
  let strategic_impact = 'Medium';

  // Simple keyword-based agent type detection
  const agentTypeKeywords = {
    'Conversational Agent': ['chat', 'conversation', 'talk', 'customer service'],
    'Analytical Agent': ['analyze', 'data', 'insights', 'report'],
    'Processing Agent': ['process', 'automation', 'workflow'],
    'Research Agent': ['research', 'search', 'find', 'investigate']
  };

  for (const [type, keywords] of Object.entries(agentTypeKeywords)) {
    if (agentTypeList.includes(type) && keywords.some(kw => promptLower.includes(kw))) {
      agent_type = type;
      if (type === 'Analytical Agent') {
        complexity.intelligence_complexity = 'High';
      }
      break;
    }
  }

  // Department detection
  const availableDepartments = {
    'Government Financial Affairs': ['financial', 'finance'],
    'Legal and Compliance Affairs': ['legal', 'compliance'],
    'Investment and Economic Affairs': ['investment', 'economic'],
    'Executive Financial Affairs': ['executive']
  };

  for (const [dept, keywords] of Object.entries(availableDepartments)) {
    if (departmentList.includes(dept) && keywords.some(kw => promptLower.includes(kw))) {
      department = dept;
      break;
    }
  }

  return {
    title: prompt.length > 50 ? prompt.substring(0, 50) + '...' : prompt,
    description: `AI agent for: ${prompt}`,
    problem_statement: `Problem: ${prompt}`,
    solution_overview: `Solution approach for: ${prompt}`,
    technical_implementation: `Technical implementation details for: ${prompt}`,
    results_metrics: `Key performance indicators and success metrics for: ${prompt}`,
    agent_type,
    status: 'concept',
    complexity,
    department,
    strategic_impact
  };
};

// POST /api/chat/orchestrator - Orchestrator bridge for voice/stateful sessions
router.post('/orchestrator', requireAuth, async (req, res) => {
  try {
    const { toolName, payload, sessionContext, userName, domainId, userQuery, conversationHistory } = req.body;

    console.log('🌉 Backend: Orchestrator bridge called');
    console.log('   Tool:', toolName);
    console.log('   Payload:', payload);
    console.log('   Session context:', sessionContext ? `${sessionContext.recentCalls?.length || 0} recent calls` : 'none');

    // Validate toolName
    if (!toolName) {
      return res.status(400).json({
        ok: false,
        error: 'toolName is required'
      });
    }

    if (!FUNCTION_NAMES.includes(toolName)) {
      console.warn(`⚠️  Backend: Invalid tool name: ${toolName}`);
      return res.status(400).json({
        ok: false,
        error: `Invalid toolName. Must be one of: ${FUNCTION_NAMES.join(', ')}`
      });
    }

    // Validate payload - allow undefined/null but if present must be an object
    if (payload !== undefined && payload !== null && typeof payload !== 'object') {
      return res.status(400).json({
        ok: false,
        error: 'payload must be an object'
      });
    }

    // Default to empty object if no payload provided
    const effectivePayload = payload || {};

    // Get user name from JWT or request
    const effectiveUserName = userName || req.user?.name || 'unknown';
    const effectiveDomainId = domainId || req.user?.domainId || null;

    console.log('🧠 Backend: Routing to ReAct with tool request');

    // Prefer the user's natural query if provided; otherwise use a synthetic instruction
    const effectiveQuery = (typeof userQuery === 'string' && userQuery.trim().length > 0)
      ? userQuery.trim()
      : `Execute ${toolName} with parameters: ${JSON.stringify(effectivePayload)}`;

    // Sanitize conversation history
    const sanitizedHistory = Array.isArray(conversationHistory)
      ? conversationHistory.slice(-20).map(m => ({
          text: typeof m.text === 'string' ? m.text : '',
          isUser: !!m.isUser
        }))
      : [];

    // Call ReAct engine with session context and conversational history
    const reactResult = await generateIntelligentResponseWithReAct(
      effectiveQuery,
      sanitizedHistory,
      effectiveUserName,
      effectiveDomainId,
      azureOpenAI,
      FUNCTION_IMPLEMENTATIONS,
      AVAILABLE_FUNCTIONS,
      sessionContext // Pass session context for continuity
    );

    console.log('✅ Backend: Orchestrator bridge completed');
    console.log(`   Iterations: ${reactResult.iterations_used}`);
    console.log(`   Execution time: ${reactResult.execution_time_ms}ms`);

    // Extract and COMBINE all function results from this run (not just the last)
    let result = null;
    if (reactResult.scratchpad?.observations && reactResult.scratchpad.observations.length > 0) {
      const successful = reactResult.scratchpad.observations.filter(o => o && o.success);

      // Collect array results (e.g., multiple get_use_cases_by_criteria calls)
      const arrayResults = successful
        .map(o => o.result)
        .filter(r => Array.isArray(r));

      if (arrayResults.length > 0) {
        // Flatten and de-duplicate by id if present
        const flattened = arrayResults.flat();
        const dedupedMap = new Map();
        for (const item of flattened) {
          const key = item && (item.id || item.title || JSON.stringify(item));
          if (!dedupedMap.has(key)) dedupedMap.set(key, item);
        }
        result = Array.from(dedupedMap.values());
      } else {
        // Fallback: return the last observation's result
        const lastObservation = successful[successful.length - 1] || reactResult.scratchpad.observations[reactResult.scratchpad.observations.length - 1];
        result = lastObservation ? lastObservation.result : null;
      }
    }

    return res.json({
      ok: true,
      result: result,
      iterations: reactResult.iterations_used,
      execution_time_ms: reactResult.execution_time_ms,
      scratchpad: reactResult.scratchpad
    });

  } catch (error) {
    console.error('❌ Backend: Orchestrator bridge error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error'
    });
  }
});

module.exports = router;
