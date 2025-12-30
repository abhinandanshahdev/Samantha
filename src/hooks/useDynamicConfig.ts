import { useState, useEffect } from 'react';
import { configService, RuntimeConfig } from '../services/configService';

/**
 * Hook to use dynamic configuration
 * Returns config and loading state
 */
export function useDynamicConfig() {
  const [config, setConfig] = useState<RuntimeConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const runtimeConfig = await configService.getConfig();
        setConfig(runtimeConfig);
        setError(null);
      } catch (err) {
        console.error('Failed to load dynamic config:', err);
        setError('Failed to load configuration');
      } finally {
        setIsLoading(false);
      }
    };

    loadConfig();
  }, []);

  return { config, isLoading, error };
}

/**
 * Hook to check if MSAL is configured
 */
export function useMsalConfigured() {
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  
  useEffect(() => {
    const checkConfig = async () => {
      const configured = await configService.isMsalConfigured();
      setIsConfigured(configured);
    };
    
    checkConfig();
  }, []);
  
  return isConfigured;
}