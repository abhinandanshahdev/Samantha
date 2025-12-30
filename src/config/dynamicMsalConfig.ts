import { PublicClientApplication, Configuration, PopupRequest } from '@azure/msal-browser';
import { configService } from '../services/configService';

let msalInstance: PublicClientApplication | null = null;
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

/**
 * Initialize MSAL with dynamic configuration from backend
 */
export async function initializeMsal(): Promise<void> {
  // Return if already initialized
  if (isInitialized) {
    return;
  }

  // Return existing initialization promise if in progress
  if (initializationPromise) {
    return initializationPromise;
  }

  // Start initialization
  initializationPromise = performInitialization();
  
  try {
    await initializationPromise;
    isInitialized = true;
  } finally {
    initializationPromise = null;
  }
}

async function performInitialization(): Promise<void> {
  try {
    // Get configuration from backend
    const config = await configService.getConfig();
    
    if (!config.msalConfig.clientId) {
      console.log('MSAL not configured - no client ID provided');
      return;
    }

    // Create MSAL configuration
    const msalConfig: Configuration = {
      auth: {
        clientId: config.msalConfig.clientId,
        authority: config.msalConfig.authority,
        redirectUri: config.msalConfig.redirectUri || window.location.origin,
        postLogoutRedirectUri: config.msalConfig.postLogoutRedirectUri || window.location.origin,
      },
      cache: {
        cacheLocation: 'sessionStorage',
        storeAuthStateInCookie: false,
      },
    };

    // Create MSAL instance
    msalInstance = new PublicClientApplication(msalConfig);
    
    // Initialize the instance
    await msalInstance.initialize();
    
    console.log('MSAL initialized with dynamic configuration');
  } catch (error) {
    console.error('Failed to initialize MSAL:', error);
    throw error;
  }
}

/**
 * Get MSAL instance (must call initializeMsal first)
 */
export function getMsalInstance(): PublicClientApplication | null {
  if (!isInitialized) {
    console.warn('MSAL not initialized. Call initializeMsal() first.');
  }
  return msalInstance;
}

/**
 * Get login request configuration
 */
export async function getLoginRequest(): Promise<PopupRequest> {
  const config = await configService.getConfig();
  
  return {
    scopes: config.msalConfig.scopes,
    prompt: 'select_account',
  };
}

/**
 * Get token request configuration
 */
export async function getTokenRequest(): Promise<PopupRequest> {
  const config = await configService.getConfig();
  
  return {
    scopes: config.msalConfig.apiScopes,
    // forceRefresh is not part of PopupRequest, it's part of SilentRequest
    // Remove it from here
  };
}

/**
 * Check if MSAL is configured
 */
export async function isMsalConfigured(): Promise<boolean> {
  const config = await configService.getConfig();
  return !!config.msalConfig.clientId && config.msalConfig.clientId !== '';
}

/**
 * Get MSAL configuration info for debugging
 */
export async function getMsalConfigInfo(): Promise<any> {
  const config = await configService.getConfig();
  
  return {
    configured: !!config.msalConfig.clientId,
    clientId: config.msalConfig.clientId ? 'Set' : 'Missing',
    authority: config.msalConfig.authority || 'Using default (common)',
    redirectUri: config.msalConfig.redirectUri || 'Using window.location.origin',
    scopes: config.msalConfig.scopes,
    apiScopes: config.msalConfig.apiScopes,
    environment: config.app.environment
  };
}