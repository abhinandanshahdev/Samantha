// =============================================================================
// DEPRECATED: Legacy MSAL Configuration File
// =============================================================================
// This file has been deprecated in favor of dynamic configuration
// via dynamicMsalConfig.ts which fetches config from /api/config
// 
// SECURITY NOTE: This file previously used REACT_APP_ environment variables
// which would be embedded in the frontend bundle and exposed to users.
// The new dynamic approach keeps secrets secure on the backend.
// =============================================================================

import { Configuration, PublicClientApplication } from '@azure/msal-browser';

console.warn('⚠️ DEPRECATED: msalConfig.ts is deprecated. Use dynamicMsalConfig.ts instead.');

// Fallback configuration for legacy compatibility only
// These values are safe defaults with no secrets
export const msalConfig: Configuration = {
  auth: {
    clientId: '', // Will be configured dynamically
    authority: 'https://login.microsoftonline.com/common',
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: false,
    secureCookies: true, // Force secure cookies
  }
};

// Default scopes (no secrets here)
export const loginRequest = {
  scopes: ['User.Read'],
  prompt: 'select_account' as const,
};

export const tokenRequest = {
  scopes: ['User.Read'],
  forceRefresh: false,
};

// Create a placeholder instance (will be replaced by dynamic config)
export const msalInstance = new PublicClientApplication(msalConfig);

// Validation always fails for legacy config
export const validateMsalConfig = (): boolean => {
  console.error('❌ Legacy MSAL config should not be used. Use dynamic configuration instead.');
  return false;
};

// Debugging info shows this is deprecated
export const getMsalConfigInfo = () => {
  return {
    status: 'DEPRECATED - Use dynamic configuration',
    clientId: 'Not configured (use dynamic config)',
    authority: 'Default fallback',
    redirectUri: 'Default (window.location.origin)',
    scopes: ['User.Read'],
    apiScopes: ['User.Read'],
  };
};