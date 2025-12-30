import React, { createContext, useContext, useEffect, useState } from 'react';
import { MsalProvider, useMsal, useIsAuthenticated } from '@azure/msal-react';
import { PublicClientApplication, AccountInfo, InteractionStatus } from '@azure/msal-browser';
import { msalConfig, loginRequest } from '../config/authConfig';
import { User } from '../types';
import { authAPI } from '../services/apiService';

interface AzureAuthContextType {
  user: User | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  getAccessToken: () => Promise<string | null>;
}

const AzureAuthContext = createContext<AzureAuthContextType | null>(null);

// MSAL instance
const msalInstance = new PublicClientApplication(msalConfig);

// Inner component that uses MSAL hooks
const AzureAuthProviderInner: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeAuth = async () => {
      if (isAuthenticated && accounts.length > 0 && inProgress === InteractionStatus.None) {
        try {
          const account = accounts[0];
          const tokenResponse = await instance.acquireTokenSilent({
            ...loginRequest,
            account: account
          });

          // Get or create user in backend
          const response = await authAPI.createOrUpdateAzureUser({
            azure_ad_id: account.homeAccountId,
            email: account.username,
            name: account.name || account.username,
            access_token: tokenResponse.accessToken
          });

          // Store the token
          localStorage.setItem('token', response.token);

          setUser({
            id: response.user.id,
            name: response.user.name,
            email: response.user.email,
            role: response.user.role || 'consumer',
            created_date: new Date().toISOString(),
            email_verified: true // Azure AD users are verified
          });
        } catch (error) {
          console.error('Error initializing auth:', error);
        }
      } else if (!isAuthenticated) {
        setUser(null);
      }
      setLoading(false);
    };

    initializeAuth();
  }, [isAuthenticated, accounts, instance, inProgress]);

  const login = async () => {
    try {
      setLoading(true);
      await instance.loginPopup(loginRequest);
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      setLoading(true);
      await instance.logoutPopup();
      setUser(null);
    } catch (error) {
      console.error('Logout failed:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const getAccessToken = async (): Promise<string | null> => {
    if (!isAuthenticated || accounts.length === 0) {
      return null;
    }

    try {
      const tokenResponse = await instance.acquireTokenSilent({
        ...loginRequest,
        account: accounts[0]
      });
      return tokenResponse.accessToken;
    } catch (error) {
      console.error('Failed to acquire token:', error);
      // Fallback to interactive token acquisition
      try {
        const tokenResponse = await instance.acquireTokenPopup(loginRequest);
        return tokenResponse.accessToken;
      } catch (interactiveError) {
        console.error('Interactive token acquisition failed:', interactiveError);
        return null;
      }
    }
  };

  const value: AzureAuthContextType = {
    user,
    loading,
    login,
    logout,
    isAuthenticated,
    getAccessToken
  };

  return (
    <AzureAuthContext.Provider value={value}>
      {children}
    </AzureAuthContext.Provider>
  );
};

// Outer component that provides MSAL
export const AzureAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <MsalProvider instance={msalInstance}>
      <AzureAuthProviderInner>{children}</AzureAuthProviderInner>
    </MsalProvider>
  );
};

export const useAzureAuth = () => {
  const context = useContext(AzureAuthContext);
  if (!context) {
    throw new Error('useAzureAuth must be used within an AzureAuthProvider');
  }
  return context;
};