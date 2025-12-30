const express = require('express');
const router = express.Router();

/**
 * GET /api/config
 * Returns frontend configuration dynamically
 * This allows environment-specific configuration without rebuilding the frontend
 */
router.get('/', (req, res) => {
  // Check for required MSAL configuration
  const missingVars = [];
  if (!process.env.MSAL_CLIENT_ID) missingVars.push('MSAL_CLIENT_ID');
  if (!process.env.MSAL_REDIRECT_URI) missingVars.push('MSAL_REDIRECT_URI');
  
  if (missingVars.length > 0) {
    return res.status(500).json({
      error: 'Missing required MSAL configuration',
      message: `Please set the following environment variables: ${missingVars.join(', ')}`,
      missingVariables: missingVars,
      note: 'MSAL configuration is now handled via backend variables (MSAL_*) instead of frontend variables (REACT_APP_*)'
    });
  }

  // Build configuration object from environment variables
  const config = {
    // Microsoft Authentication Configuration
    msalConfig: {
      clientId: process.env.MSAL_CLIENT_ID,
      authority: process.env.MSAL_AUTHORITY || 'https://login.microsoftonline.com/consumers',
      redirectUri: process.env.MSAL_REDIRECT_URI,
      postLogoutRedirectUri: process.env.MSAL_POST_LOGOUT_REDIRECT_URI || process.env.MSAL_REDIRECT_URI,
      scopes: (process.env.MSAL_SCOPES || 'User.Read').split(',').map(s => s.trim()),
      apiScopes: (process.env.MSAL_API_SCOPES || 'User.Read').split(',').map(s => s.trim())
    },
    
    // API Configuration
    apiConfig: {
      baseUrl: process.env.API_BASE_URL || '/api'
    },
    
    // Feature flags (for future use)
    features: {
      voiceChat: process.env.ENABLE_VOICE_CHAT !== 'false',
      intelligentChat: process.env.ENABLE_INTELLIGENT_CHAT !== 'false',
      microsoftAuth: !!process.env.MSAL_CLIENT_ID
    },
    
    // Application metadata
    app: {
      name: process.env.APP_NAME || 'Hekmah',
      tagline: process.env.APP_TAGLINE || 'AI for AI @ DoF',
      environment: process.env.NODE_ENV || 'development'
    }
  };

  // Log config request for debugging (without sensitive data)
  console.log('Config requested:', {
    msalConfigured: !!config.msalConfig.clientId,
    environment: config.app.environment,
    features: config.features
  });

  res.json(config);
});

/**
 * GET /api/config/health
 * Health check for config service
 */
router.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    configAvailable: true,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;