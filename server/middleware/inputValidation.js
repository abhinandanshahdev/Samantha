/**
 * Input Validation Middleware
 * OWASP A03: Injection Protection
 *
 * Provides comprehensive input validation and sanitization for AI endpoints
 */

// Validation limits
const LIMITS = {
  CHAT_QUERY_MAX_LENGTH: 2000,      // ~400 words, reasonable for chat
  PROMPT_MAX_LENGTH: 3000,           // Use case generation needs more detail
  CONVERSATION_HISTORY_MAX: 50,     // ReAct system manages last 20, allow buffer for safety
  FUNCTION_NAME_MAX_LENGTH: 100,
  DOMAIN_ID_MAX: 999999,
  LIMIT_MAX: 100
};

// Dangerous patterns that might indicate injection attempts
const SUSPICIOUS_PATTERNS = [
  /\\x00/,                           // Null byte
  /\.\.[\/\\]/,                      // Path traversal
  /<script[^>]*>.*?<\/script>/gi,   // Script tags
  /javascript:/gi,                   // JavaScript protocol
  /on\w+\s*=/gi,                     // Event handlers
];

/**
 * Sanitize string input - remove control characters and trim
 */
function sanitizeString(input) {
  if (typeof input !== 'string') {
    return '';
  }

  // Remove control characters except newline, tab, carriage return
  let sanitized = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Trim whitespace
  sanitized = sanitized.trim();

  return sanitized;
}

/**
 * Check for suspicious injection patterns
 */
function detectSuspiciousContent(input) {
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(input)) {
      return {
        suspicious: true,
        pattern: pattern.toString()
      };
    }
  }
  return { suspicious: false };
}

/**
 * Validate and sanitize user query for chat endpoint
 */
function validateChatQuery(userQuery) {
  // Type check
  if (typeof userQuery !== 'string') {
    return {
      valid: false,
      error: 'userQuery must be a string',
      sanitized: null
    };
  }

  // Sanitize
  const sanitized = sanitizeString(userQuery);

  // Check if empty after sanitization
  if (!sanitized || sanitized.length === 0) {
    return {
      valid: false,
      error: 'userQuery cannot be empty',
      sanitized: null
    };
  }

  // Length check
  if (sanitized.length > LIMITS.CHAT_QUERY_MAX_LENGTH) {
    return {
      valid: false,
      error: `userQuery exceeds maximum length of ${LIMITS.CHAT_QUERY_MAX_LENGTH} characters`,
      sanitized: null
    };
  }

  // Suspicious content check
  const suspiciousCheck = detectSuspiciousContent(sanitized);
  if (suspiciousCheck.suspicious) {
    return {
      valid: false,
      error: 'userQuery contains suspicious content',
      sanitized: null,
      details: `Detected pattern: ${suspiciousCheck.pattern}`
    };
  }

  return {
    valid: true,
    sanitized: sanitized
  };
}

/**
 * Validate and sanitize prompt for use case generation
 */
function validatePrompt(prompt) {
  if (typeof prompt !== 'string') {
    return {
      valid: false,
      error: 'prompt must be a string',
      sanitized: null
    };
  }

  const sanitized = sanitizeString(prompt);

  if (!sanitized || sanitized.length === 0) {
    return {
      valid: false,
      error: 'prompt cannot be empty',
      sanitized: null
    };
  }

  if (sanitized.length > LIMITS.PROMPT_MAX_LENGTH) {
    return {
      valid: false,
      error: `prompt exceeds maximum length of ${LIMITS.PROMPT_MAX_LENGTH} characters`,
      sanitized: null
    };
  }

  const suspiciousCheck = detectSuspiciousContent(sanitized);
  if (suspiciousCheck.suspicious) {
    return {
      valid: false,
      error: 'prompt contains suspicious content',
      sanitized: null
    };
  }

  return {
    valid: true,
    sanitized: sanitized
  };
}

/**
 * Validate domain_id - must be positive integer
 */
function validateDomainId(domainId) {
  // Allow null/undefined (means all domains or default)
  if (domainId === null || domainId === undefined) {
    return {
      valid: true,
      sanitized: null
    };
  }

  // Convert to number if string
  const numericId = typeof domainId === 'string' ? parseInt(domainId, 10) : domainId;

  // Type check - must be integer
  if (!Number.isInteger(numericId)) {
    return {
      valid: false,
      error: 'domain_id must be a positive integer',
      sanitized: null
    };
  }

  // Range check
  if (numericId < 1 || numericId > LIMITS.DOMAIN_ID_MAX) {
    return {
      valid: false,
      error: `domain_id must be between 1 and ${LIMITS.DOMAIN_ID_MAX}`,
      sanitized: null
    };
  }

  return {
    valid: true,
    sanitized: numericId
  };
}

/**
 * Validate conversation history array
 */
function validateConversationHistory(history) {
  // Allow null/undefined/empty array
  if (!history || history.length === 0) {
    return {
      valid: true,
      sanitized: []
    };
  }

  // Type check
  if (!Array.isArray(history)) {
    return {
      valid: false,
      error: 'conversationHistory must be an array',
      sanitized: null
    };
  }

  // Length check
  if (history.length > LIMITS.CONVERSATION_HISTORY_MAX) {
    return {
      valid: false,
      error: `conversationHistory exceeds maximum of ${LIMITS.CONVERSATION_HISTORY_MAX} messages`,
      sanitized: null
    };
  }

  // Validate each message
  const sanitizedHistory = [];
  for (let i = 0; i < history.length; i++) {
    const message = history[i];

    if (typeof message !== 'object' || message === null) {
      return {
        valid: false,
        error: `conversationHistory[${i}] must be an object`,
        sanitized: null
      };
    }

    // Check for required fields and sanitize
    // Support both formats: {role, content} and {text, isUser}
    if (message.role && typeof message.role === 'string') {
      // Format 1: OpenAI format with role/content
      const sanitizedRole = sanitizeString(message.role);
      const sanitizedContent = typeof message.content === 'string' ? sanitizeString(message.content) : '';

      sanitizedHistory.push({
        role: sanitizedRole,
        content: sanitizedContent
      });
    } else if (message.text && typeof message.text === 'string') {
      // Format 2: Frontend format with text/isUser
      const sanitizedText = sanitizeString(message.text);
      const role = message.isUser ? 'user' : 'assistant';

      sanitizedHistory.push({
        role: role,
        content: sanitizedText
      });
    }
  }

  return {
    valid: true,
    sanitized: sanitizedHistory
  };
}

/**
 * Validate limit parameter
 */
function validateLimit(limit) {
  if (limit === null || limit === undefined) {
    return {
      valid: true,
      sanitized: null
    };
  }

  const numericLimit = typeof limit === 'string' ? parseInt(limit, 10) : limit;

  if (!Number.isInteger(numericLimit)) {
    return {
      valid: false,
      error: 'limit must be a positive integer',
      sanitized: null
    };
  }

  if (numericLimit < 1 || numericLimit > LIMITS.LIMIT_MAX) {
    return {
      valid: false,
      error: `limit must be between 1 and ${LIMITS.LIMIT_MAX}`,
      sanitized: null
    };
  }

  return {
    valid: true,
    sanitized: numericLimit
  };
}

/**
 * Validate function name
 */
function validateFunctionName(functionName) {
  if (typeof functionName !== 'string') {
    return {
      valid: false,
      error: 'functionName must be a string',
      sanitized: null
    };
  }

  const sanitized = sanitizeString(functionName);

  if (!sanitized || sanitized.length === 0) {
    return {
      valid: false,
      error: 'functionName cannot be empty',
      sanitized: null
    };
  }

  if (sanitized.length > LIMITS.FUNCTION_NAME_MAX_LENGTH) {
    return {
      valid: false,
      error: `functionName exceeds maximum length of ${LIMITS.FUNCTION_NAME_MAX_LENGTH}`,
      sanitized: null
    };
  }

  // Only allow alphanumeric and underscores
  if (!/^[a-zA-Z0-9_]+$/.test(sanitized)) {
    return {
      valid: false,
      error: 'functionName can only contain letters, numbers, and underscores',
      sanitized: null
    };
  }

  return {
    valid: true,
    sanitized: sanitized
  };
}

/**
 * Log security validation failure
 */
function logValidationFailure(req, endpoint, validationType, error) {
  const userInfo = req.user ? `${req.user.email} (${req.user.id})` : 'unauthenticated';
  console.warn(`🚨 Security: Input validation failed`);
  console.warn(`   User: ${userInfo}`);
  console.warn(`   Endpoint: ${endpoint}`);
  console.warn(`   Validation: ${validationType}`);
  console.warn(`   Error: ${error}`);
  console.warn(`   IP: ${req.ip || req.connection.remoteAddress}`);
  console.warn(`   Timestamp: ${new Date().toISOString()}`);
}

module.exports = {
  validateChatQuery,
  validatePrompt,
  validateDomainId,
  validateConversationHistory,
  validateLimit,
  validateFunctionName,
  logValidationFailure,
  LIMITS
};
