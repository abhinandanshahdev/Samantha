/**
 * Configuration Service
 * Fetches runtime configuration from the backend
 * This allows for environment-specific settings without rebuilding the frontend
 */

export interface MsalConfig {
  clientId: string;
  authority: string;
  redirectUri: string;
  postLogoutRedirectUri: string;
  scopes: string[];
  apiScopes: string[];
}

export interface ApiConfig {
  baseUrl: string;
}

export interface Features {
  voiceChat: boolean;
  intelligentChat: boolean;
  microsoftAuth: boolean;
}

export interface AppConfig {
  name: string;
  tagline: string;
  environment: string;
}

export interface RuntimeConfig {
  msalConfig: MsalConfig;
  apiConfig: ApiConfig;
  features: Features;
  app: AppConfig;
}

class ConfigService {
  private config: RuntimeConfig | null = null;
  private configPromise: Promise<RuntimeConfig> | null = null;

  /**
   * Fetch configuration from backend
   * Results are cached after first fetch
   */
  async getConfig(): Promise<RuntimeConfig> {
    // Return cached config if available
    if (this.config) {
      return this.config;
    }

    // Return existing promise if fetch is in progress
    if (this.configPromise) {
      return this.configPromise;
    }

    // Start new fetch
    this.configPromise = this.fetchConfig();
    
    try {
      this.config = await this.configPromise;
      return this.config;
    } finally {
      this.configPromise = null;
    }
  }

  private async fetchConfig(): Promise<RuntimeConfig> {
    try {
      const response = await fetch('/api/config');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch config: ${response.statusText}`);
      }

      const config = await response.json();
      
      // Validate required fields
      if (!config.msalConfig || !config.apiConfig) {
        throw new Error('Invalid configuration received from server');
      }

      console.log('Runtime configuration loaded:', {
        msalConfigured: !!config.msalConfig.clientId,
        environment: config.app.environment,
        features: config.features
      });

      return config;
    } catch (error) {
      console.error('Failed to load runtime configuration:', error);
      
      // Fall back to environment variables if available
      return this.getFallbackConfig();
    }
  }

  /**
   * Fallback configuration when backend is unavailable
   * Shows error message about missing configuration
   */
  private getFallbackConfig(): RuntimeConfig {
    console.error('Backend configuration unavailable. Please ensure MSAL_* environment variables are set on the server.');
    
    // Return minimal config that will trigger error messages in UI
    return {
      msalConfig: {
        clientId: '',
        authority: 'https://login.microsoftonline.com/consumers',
        redirectUri: window.location.origin,
        postLogoutRedirectUri: window.location.origin,
        scopes: ['User.Read'],
        apiScopes: ['User.Read']
      },
      apiConfig: {
        baseUrl: '/api'
      },
      features: {
        voiceChat: false,
        intelligentChat: false,
        microsoftAuth: false
      },
      app: {
        name: 'Samantha',
        tagline: 'Family Management',
        environment: 'error'
      }
    };
  }

  /**
   * Clear cached configuration
   * Useful for testing or when configuration changes
   */
  clearCache(): void {
    this.config = null;
    this.configPromise = null;
  }

  /**
   * Check if Microsoft authentication is configured
   */
  async isMsalConfigured(): Promise<boolean> {
    const config = await this.getConfig();
    return !!config.msalConfig.clientId && config.msalConfig.clientId !== '';
  }
}

// Export singleton instance
export const configService = new ConfigService();