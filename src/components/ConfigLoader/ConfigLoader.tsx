import React, { useEffect, useState } from 'react';
import { configService } from '../../services/configService';
import { initializeMsal } from '../../config/dynamicMsalConfig';
import AuthLoadingScreen from '../Loading/AuthLoadingScreen';

interface ConfigLoaderProps {
  children: React.ReactNode;
}

/**
 * ConfigLoader Component
 * Loads runtime configuration before rendering the application
 * This ensures all dynamic settings are available before components initialize
 */
const ConfigLoader: React.FC<ConfigLoaderProps> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadConfiguration = async () => {
      try {
        // Load configuration from backend
        console.log('Loading runtime configuration...');
        const config = await configService.getConfig();
        
        // Initialize MSAL if configured
        if (config.features.microsoftAuth) {
          console.log('Initializing MSAL with dynamic configuration...');
          await initializeMsal();
        }
        
        console.log('Configuration loaded successfully');
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to load configuration:', err);
        
        // In case of error, try to continue with fallback config
        // This allows the app to work even if the config endpoint is down
        setError('Using fallback configuration');
        setIsLoading(false);
      }
    };

    loadConfiguration();
  }, []);

  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  if (error) {
    console.warn(error);
  }

  return <>{children}</>;
};

export default ConfigLoader;