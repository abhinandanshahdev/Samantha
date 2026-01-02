import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { AccountInfo, AuthenticationResult, InteractionRequiredAuthError } from '@azure/msal-browser';
import { useMsal } from '@azure/msal-react';
import { msalInstance, loginRequest, tokenRequest, validateMsalConfig, getMsalConfigInfo } from '../config/msalConfig';
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
  getAccessToken: () => Promise<string | null>;
}

const MsalAuthContext = createContext<MsalAuthContextType | undefined>(undefined);

interface MsalAuthProviderProps {
  children: ReactNode;
}

export const MsalAuthProvider: React.FC<MsalAuthProviderProps> = ({ children }) => {
  const { instance, accounts } = useMsal();
  const [user, setUser] = useState<MsalUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [msalConfigured, setMsalConfigured] = useState<boolean>(false);

  // Check MSAL configuration on mount
  useEffect(() => {
    const configured = validateMsalConfig();
    setMsalConfigured(configured);
    
    if (!configured) {
      console.log('MSAL Configuration Info:', getMsalConfigInfo());
      console.log('Please configure Azure App Registration and update environment variables.');
    }
  }, []);

  // Handle account selection and user setup
  useEffect(() => {
    const handleAccountSelection = async () => {
      if (!msalConfigured) {
        setIsLoading(false);
        return;
      }

      try {
        // Handle redirect response first
        const response = await instance.handleRedirectPromise();
        if (response && response.account) {
          console.log('MSAL: Handling redirect response for:', response.account.username);
          
          // Exchange Microsoft token with backend
          const exchangeResult = await exchangeTokenWithBackend(response.accessToken);
          
          if (exchangeResult) {
            console.log('MSAL: Backend token exchange successful');
            
            // Store JWT token in sessionStorage for API calls
            sessionStorage.setItem('jwt_token', exchangeResult.token);
            
            setUser(exchangeResult.user);
            setIsLoading(false);
            return;
          } else {
            console.error('MSAL: Backend token exchange failed');
          }
        }

        // Check for existing accounts if no redirect response
        if (accounts && accounts.length > 0) {
          const account = accounts[0];
          console.log('MSAL: Found existing account:', account.username);
          
          // Try to get access token silently
          try {
            const tokenResponse = await instance.acquireTokenSilent({
              ...tokenRequest,
              account: account,
            });
            
            // Exchange Microsoft token with backend
            const exchangeResult = await exchangeTokenWithBackend(tokenResponse.accessToken);
            
            if (exchangeResult) {
              console.log('MSAL: Silent auth successful');
              sessionStorage.setItem('jwt_token', exchangeResult.token);
              setUser(exchangeResult.user);
            } else {
              console.error('MSAL: Backend exchange failed for existing account');
            }
          } catch (error) {
            console.error('MSAL: Silent token acquisition failed:', error);
            // Token might be expired, user will need to login again
          }
        } else {
          console.log('MSAL: No accounts found');
        }
      } catch (error) {
        console.error('MSAL: Account selection error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    handleAccountSelection();
  }, [accounts, instance, msalConfigured]);

  // Exchange Microsoft token for application JWT
  const exchangeTokenWithBackend = async (accessToken: string): Promise<{ token: string; user: MsalUser } | null> => {
    try {
      const response = await fetch('/api/microsoft-auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accessToken }),
      });

      if (response.ok) {
        const data = await response.json();
        return {
          token: data.token,
          user: {
            id: data.user.id,
            microsoftId: data.user.microsoftId,
            email: data.user.email,
            name: data.user.name,
            role: data.user.role as Role,
            accessToken: accessToken,
            created_date: new Date().toISOString(),
            email_verified: true, // Microsoft accounts are pre-verified
          },
        };
      } else {
        const error = await response.json();
        console.error('Backend token exchange failed:', error.error);
        return null;
      }
    } catch (error) {
      console.error('Failed to exchange token with backend:', error);
      return null;
    }
  };

  // Get user role from backend
  const getUserRole = async (email: string): Promise<Role> => {
    try {
      const response = await fetch(`/api/microsoft-auth/user-role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });
      
      if (response.ok) {
        const { role } = await response.json();
        return role || 'consumer';
      }
    } catch (error) {
      console.error('Failed to get user role:', error);
    }
    
    return 'consumer'; // Default role
  };

  const login = async (): Promise<boolean> => {
    if (!msalConfigured) {
      console.error('MSAL not configured. Please check environment variables.');
      return false;
    }

    try {
      console.log('MSAL: Starting login process...');
      // Use redirect for authentication
      await instance.loginRedirect(loginRequest);
      // loginRedirect doesn't return a value - it redirects the browser
      // The response will be handled in the useEffect above
      return true;
    } catch (error) {
      console.error('MSAL: Login failed:', error);
      return false;
    }
  };

  const logout = () => {
    console.log('MSAL: Logging out user');
    setUser(null);
    
    // Clear JWT token from storage
    sessionStorage.removeItem('jwt_token');
    localStorage.removeItem('jwt_token');
    
    instance.logoutPopup({
      postLogoutRedirectUri: process.env.REACT_APP_AZURE_POST_LOGOUT_REDIRECT_URI || window.location.origin,
    }).catch((error) => {
      console.error('MSAL: Logout error:', error);
    });
  };

  const updateUser = (updatedUser: User) => {
    console.log('MSAL: Updating user data', updatedUser);
    if (user) {
      setUser({
        ...user,
        ...updatedUser
      });
    }
  };

  const getAccessToken = async (): Promise<string | null> => {
    if (!user || !accounts || accounts.length === 0) {
      return null;
    }

    try {
      const response = await instance.acquireTokenSilent({
        ...tokenRequest,
        account: accounts[0],
      });
      return response.accessToken;
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        // fallback to interaction when silent call fails
        try {
          const response = await instance.acquireTokenPopup(tokenRequest);
          return response.accessToken;
        } catch (popupError) {
          console.error('MSAL: Token acquisition failed:', popupError);
          return null;
        }
      } else {
        console.error('MSAL: Silent token acquisition failed:', error);
        return null;
      }
    }
  };

  const isAuthenticated = !!user && msalConfigured;
  const isAdmin = user?.role === 'admin';


  // Show loading screen while checking authentication
  if (isLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '18px',
        color: '#6366F1',
        flexDirection: 'column',
        gap: '10px'
      }}>
        <div>Loading Samantha...</div>
        {!msalConfigured && (
          <div style={{ fontSize: '14px', color: '#666', textAlign: 'center', maxWidth: '400px' }}>
            Microsoft authentication is not configured. Please check your environment variables.
          </div>
        )}
      </div>
    );
  }

  return (
    <MsalAuthContext.Provider value={{ 
      user, 
      login, 
      logout, 
      updateUser,
      isAuthenticated, 
      isAdmin, 
      isLoading,
      msalConfigured,
      getAccessToken
    }}>
      {children}
    </MsalAuthContext.Provider>
  );
};

export const useMsalAuth = () => {
  const context = useContext(MsalAuthContext);
  if (undefined === context) {
    throw new Error('useMsalAuth must be used within MsalAuthProvider');
  }
  return context;
};