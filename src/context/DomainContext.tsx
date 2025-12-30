import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Domain } from '../types';
import { domainAPI, userPreferencesAPI } from '../services/apiService';

interface DomainContextType {
  activeDomain: Domain | null;
  availableDomains: Domain[];
  isLoading: boolean;
  error: string | null;
  switchDomain: (domainId: number) => void;
  refreshDomains: () => Promise<void>;
}

const DomainContext = createContext<DomainContextType | undefined>(undefined);

interface DomainProviderProps {
  children: ReactNode;
}

const ACTIVE_DOMAIN_KEY = 'active_domain_id';

export const DomainProvider: React.FC<DomainProviderProps> = ({ children }) => {
  const [activeDomain, setActiveDomain] = useState<Domain | null>(null);
  const [availableDomains, setAvailableDomains] = useState<Domain[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasAttemptedLoad, setHasAttemptedLoad] = useState(false);

  // Load domains only when we have a token (authenticated)
  useEffect(() => {
    const token = localStorage.getItem('token') ||
                  localStorage.getItem('msal_jwt_token') ||
                  sessionStorage.getItem('token');

    // Only load domains if we have a token
    if (token && !hasAttemptedLoad) {
      console.log('DomainContext: Token found, loading domains...');
      loadDomains();
      setHasAttemptedLoad(true);
    } else if (!token && !hasAttemptedLoad) {
      // No token, user not authenticated yet
      console.log('DomainContext: No token, waiting for authentication...');
      setIsLoading(false);
      setHasAttemptedLoad(true);
    }
  }, [hasAttemptedLoad]);

  // Re-trigger domain loading when a new token appears (after login)
  useEffect(() => {
    const checkForNewToken = () => {
      const token = localStorage.getItem('token') ||
                    localStorage.getItem('msal_jwt_token') ||
                    sessionStorage.getItem('token');

      // If we have a token and no domains loaded yet, reset and load
      if (token && availableDomains.length === 0 && !isLoading) {
        console.log('DomainContext: New token detected, loading domains...');
        setHasAttemptedLoad(false); // Reset to allow re-loading
      }
    };

    // Check periodically for new token (after login)
    const interval = setInterval(checkForNewToken, 500);

    // Clean up after domains are loaded or 10 seconds
    const timeout = setTimeout(() => clearInterval(interval), 10000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [availableDomains.length, isLoading]);

  // Listen for storage events (login in another tab or after login)
  useEffect(() => {
    const handleStorageChange = () => {
      const token = localStorage.getItem('token') ||
                    localStorage.getItem('msal_jwt_token') ||
                    sessionStorage.getItem('token');

      if (token && availableDomains.length === 0) {
        // Token added and we don't have domains yet, load them
        loadDomains();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [availableDomains.length]);

  const loadDomains = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch all available domains
      const domains = await domainAPI.getAll();

      if (domains.length === 0) {
        console.warn('DomainContext: No domains available');
        setIsLoading(false);
        return;
      }

      setAvailableDomains(domains);

      // Try to get domain preference from database first, then fallback to localStorage
      let domainToSelect = null;

      try {
        const dbDomainId = await userPreferencesAPI.get('selected_domain_id');
        if (dbDomainId) {
          const dbDomain = domains.find(d => d.id === parseInt(dbDomainId));
          if (dbDomain) {
            domainToSelect = dbDomain;
            console.log('DomainContext: Using database preference domain:', dbDomain.name);
          }
        }
      } catch (err) {
        console.log('DomainContext: No database preference, checking localStorage');
      }

      // Fallback to localStorage if database preference not found
      if (!domainToSelect) {
        const storedDomainId = localStorage.getItem(ACTIVE_DOMAIN_KEY);
        if (storedDomainId) {
          const storedDomain = domains.find(d => d.id === parseInt(storedDomainId));
          if (storedDomain) {
            domainToSelect = storedDomain;
            console.log('DomainContext: Using localStorage domain:', storedDomain.name);
          }
        }
      }

      // If no valid stored domain, ALWAYS default to first domain
      if (!domainToSelect) {
        domainToSelect = domains[0];
        console.log('DomainContext: No valid stored domain, defaulting to first domain:', domainToSelect.name);
      }

      // Set the active domain immediately
      setActiveDomain(domainToSelect);

      // Save to both database and localStorage
      localStorage.setItem(ACTIVE_DOMAIN_KEY, domainToSelect.id.toString());
      try {
        await userPreferencesAPI.set('selected_domain_id', domainToSelect.id.toString());
      } catch (err) {
        console.warn('Failed to save domain preference to database:', err);
      }
    } catch (err) {
      console.error('Error loading domains:', err);
      // Only set error if it's not an authentication error
      const errorMessage = err instanceof Error ? err.message : 'Failed to load domains';
      if (!errorMessage.includes('token') && !errorMessage.includes('401')) {
        setError('Failed to load domains');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const switchDomain = async (domainId: number) => {
    // Set the domain ID in both localStorage and database
    localStorage.setItem(ACTIVE_DOMAIN_KEY, domainId.toString());

    try {
      await userPreferencesAPI.set('selected_domain_id', domainId.toString());
    } catch (err) {
      console.warn('Failed to save domain preference to database:', err);
    }

    // Reload the page to refresh all data for the new domain
    // This ensures all components re-fetch data with the new domain context
    window.location.reload();
  };

  const refreshDomains = async () => {
    await loadDomains();
  };

  const value: DomainContextType = {
    activeDomain,
    availableDomains,
    isLoading,
    error,
    switchDomain,
    refreshDomains
  };

  return (
    <DomainContext.Provider value={value}>
      {children}
    </DomainContext.Provider>
  );
};

// Custom hook to use the domain context
export const useDomain = (): DomainContextType => {
  const context = useContext(DomainContext);
  if (context === undefined) {
    throw new Error('useDomain must be used within a DomainProvider');
  }
  return context;
};

// Helper hook to get just the active domain ID (commonly needed)
export const useActiveDomainId = (): number | null => {
  const { activeDomain } = useDomain();
  return activeDomain?.id || null;
};

// Helper hook to get domain configuration
export const useDomainConfig = () => {
  const { activeDomain } = useDomain();
  return activeDomain?.config_json || null;
};

// Helper hook to get domain-specific terminology
export const useDomainTerminology = () => {
  const { activeDomain } = useDomain();
  const config = activeDomain?.config_json;

  return {
    initiativeSingular: config?.terminology?.initiative_singular || 'Initiative',
    initiativePlural: config?.terminology?.initiative_plural || 'Initiatives',
    // Can add more terminology here as needed
  };
};

export default DomainContext;
