import { Configuration, PopupRequest } from "@azure/msal-browser";

// =============================================================================
// DEPRECATED: Legacy Auth Configuration
// =============================================================================
// SECURITY: Removed REACT_APP_ environment variables to prevent secrets
// from being embedded in the frontend bundle and exposed to users.
// Use dynamicMsalConfig.ts for secure, server-side configuration.
// =============================================================================

console.warn('⚠️ DEPRECATED: authConfig.ts uses legacy configuration. Use dynamicMsalConfig.ts instead.');

// MSAL configuration - secure defaults only, no secrets
export const msalConfig: Configuration = {
  auth: {
    clientId: '', // Will be configured dynamically
    authority: 'https://login.microsoftonline.com/common', // Safe default
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: "localStorage", // This configures where your cache will be stored
    storeAuthStateInCookie: false, // Set this to "true" if you are having issues on IE11 or Edge
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) {
          return;
        }
        switch (level) {
          case 0: // Error
            console.error(message);
            return;
          case 1: // Warning
            console.warn(message);
            return;
          case 2: // Info
            console.info(message);
            return;
          case 3: // Verbose
            console.debug(message);
            return;
        }
      }
    }
  }
};

// Add scopes here for ID token to be used at Microsoft identity platform endpoints.
// SECURITY: Removed REACT_APP_ variable, using safe default
export const loginRequest: PopupRequest = {
  scopes: ["User.Read"] // Safe default scope
};

// Add the endpoints here for Microsoft Graph API services you'd like to use.
export const graphConfig = {
  graphMeEndpoint: "https://graph.microsoft.com/v1.0/me"
};

// Auth configuration options
// SECURITY: Removed REACT_APP_ variable, using safe default
export const authConfig = {
  type: 'local', // Safe default: 'local' (removed dynamic switching for security)
  azureAd: {
    enabled: false, // Disabled legacy Azure AD config (use dynamic config instead)
    msalConfig,
    loginRequest,
    graphConfig
  }
};