import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { AccountInfo, AuthenticationResult, InteractionRequiredAuthError } from '@azure/msal-browser';
import { getMsalInstance, getLoginRequest, getTokenRequest, isMsalConfigured } from '../config/dynamicMsalConfig';
import { configService } from '../services/configService';
import { User } from '../types';

type Role = 'consumer' | 'admin';

interface MsalUser extends User {
  microsoftId: string;
  accessToken?: string;
}

interface MsalAuthContextType {
  user: MsalUser | null;
  login: () => Promise<boolean>;
  logout: () => void;
  updateUser: (updatedUser: User) => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  msalConfigured: boolean;
}

const MsalAuthContext = createContext<MsalAuthContextType | undefined>(undefined);

interface MsalAuthProviderProps {
  children: ReactNode;
}

export const MsalAuthProvider: React.FC<MsalAuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<MsalUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [msalConfigured, setMsalConfigured] = useState(false);

  useEffect(() => {
    const initializeMsalAuth = async () => {
      try {
        // Check if MSAL is configured
        const configured = await isMsalConfigured();
        setMsalConfigured(configured);

        if (!configured) {
          console.log('MSAL not configured - skipping Microsoft authentication');
          setIsLoading(false);
          return;
        }

        const msalInstance = getMsalInstance();
        if (!msalInstance) {
          console.warn('MSAL instance not available');
          setIsLoading(false);
          return;
        }

        // Handle redirect promise
        try {
          const response = await msalInstance.handleRedirectPromise();
          if (response) {
            console.log('MSAL redirect handled successfully');
            await handleAuthenticationResult(response);
          }
        } catch (error) {
          console.error('Error handling redirect:', error);
        }

        // Check for existing accounts
        const accounts = msalInstance.getAllAccounts();
        if (accounts.length > 0) {
          console.log('Existing MSAL account found');
          msalInstance.setActiveAccount(accounts[0]);
          await loadUserFromAccount(accounts[0]);
        }

      } catch (error) {
        console.error('Failed to initialize MSAL auth:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeMsalAuth();
  }, []);

  const loadUserFromAccount = async (account: AccountInfo): Promise<void> => {
    try {
      const msalInstance = getMsalInstance();
      if (!msalInstance) return;

      // Get access token
      const tokenRequest = await getTokenRequest();
      console.log('Token request scopes:', tokenRequest.scopes);
      
      let tokenResponse;
      try {
        tokenResponse = await msalInstance.acquireTokenSilent({
          ...tokenRequest,
          account: account,
        });
      } catch (silentError: any) {
        console.error('acquireTokenSilent failed:', silentError);
        // Try to acquire token interactively
        tokenResponse = await msalInstance.acquireTokenPopup({
          ...tokenRequest,
          account: account,
        });
      }

      console.log('Token response from MSAL:', {
        hasAccessToken: !!tokenResponse.accessToken,
        tokenLength: tokenResponse.accessToken?.length,
        tokenPreview: tokenResponse.accessToken?.substring(0, 50),
        idToken: tokenResponse.idToken?.substring(0, 50),
      });

      // Authenticate with backend - use ID token which is a JWT, not the access token
      const backendResponse = await fetch('/api/microsoft-auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accessToken: tokenResponse.idToken, // Use ID token, not access token!
        }),
      });

      if (backendResponse.ok) {
        const userData = await backendResponse.json();
        const msalUser: MsalUser = {
          id: userData.user.id,
          name: userData.user.name,
          email: userData.user.email,
          role: userData.user.role,
          created_date: userData.user.created_date || new Date().toISOString(),
          email_verified: userData.user.email_verified || true,
          microsoftId: account.homeAccountId || account.localAccountId,
          accessToken: tokenResponse.accessToken,
        };

        setUser(msalUser);
        localStorage.setItem('msal_jwt_token', userData.token);  // Use unique key to avoid conflicts
        localStorage.removeItem('token'); // Clear any old token
        console.log('MSAL user loaded successfully');
      } else {
        throw new Error('Backend authentication failed');
      }
    } catch (error) {
      console.error('Error loading user from account:', error);
      // If token refresh fails, clear the account
      if (error instanceof InteractionRequiredAuthError) {
        const msalInstance = getMsalInstance();
        if (msalInstance) {
          msalInstance.setActiveAccount(null);
        }
        setUser(null);
      }
    }
  };

  const handleAuthenticationResult = async (response: AuthenticationResult): Promise<void> => {
    if (response.account) {
      const msalInstance = getMsalInstance();
      if (msalInstance) {
        msalInstance.setActiveAccount(response.account);
        await loadUserFromAccount(response.account);
      }
    }
  };

  const login = async (): Promise<boolean> => {
    try {
      const msalInstance = getMsalInstance();
      if (!msalInstance) {
        console.error('MSAL not initialized');
        return false;
      }

      console.log('Starting MSAL login...');
      const loginRequest = await getLoginRequest();
      
      try {
        // Try redirect login
        await msalInstance.loginRedirect(loginRequest);
        return true;
      } catch (redirectError) {
        console.warn('Redirect login failed, trying popup:', redirectError);
        
        // Fallback to popup
        const response = await msalInstance.loginPopup(loginRequest);
        await handleAuthenticationResult(response);
        return true;
      }
    } catch (error) {
      console.error('MSAL login error:', error);
      return false;
    }
  };

  const logout = async (): Promise<void> => {
    try {
      const msalInstance = getMsalInstance();
      if (!msalInstance) return;

      const config = await configService.getConfig();
      
      setUser(null);
      localStorage.removeItem('token');
      
      const account = msalInstance.getActiveAccount();
      if (account) {
        await msalInstance.logoutRedirect({
          account: account,
          postLogoutRedirectUri: config.msalConfig.postLogoutRedirectUri,
        });
      }
    } catch (error) {
      console.error('MSAL logout error:', error);
    }
  };

  const updateUser = (updatedUser: User): void => {
    if (user) {
      setUser({ ...user, ...updatedUser });
    }
  };

  const contextValue: MsalAuthContextType = {
    user,
    login,
    logout,
    updateUser,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    isLoading,
    msalConfigured,
  };

  return (
    <MsalAuthContext.Provider value={contextValue}>
      {children}
    </MsalAuthContext.Provider>
  );
};

export const useMsalAuth = (): MsalAuthContextType => {
  const context = useContext(MsalAuthContext);
  if (context === undefined) {
    throw new Error('useMsalAuth must be used within a MsalAuthProvider');
  }
  return context;
};