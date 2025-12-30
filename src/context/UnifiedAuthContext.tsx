import React, { createContext, useContext } from 'react';
import { authConfig } from '../config/authConfig';
import { AuthProvider as LocalAuthProvider, useAuth as useLocalAuth } from './AuthContext';
import { AzureAuthProvider, useAzureAuth } from './AzureAuthContext';
import { User } from '../types';

interface UnifiedAuthContextType {
  user: User | null;
  login: (email?: string, password?: string, rememberMe?: boolean) => Promise<boolean>;
  logout: () => void | Promise<void>;
  isAuthenticated: boolean;
  isAdmin: boolean;
  loading?: boolean;
  authType: 'local' | 'azure-ad';
}

const UnifiedAuthContext = createContext<UnifiedAuthContextType | undefined>(undefined);

// Component that switches between auth providers based on configuration
export const UnifiedAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (authConfig.type === 'azure-ad') {
    return (
      <AzureAuthProvider>
        <AzureAuthWrapper>{children}</AzureAuthWrapper>
      </AzureAuthProvider>
    );
  }
  
  return (
    <LocalAuthProvider>
      <LocalAuthWrapper>{children}</LocalAuthWrapper>
    </LocalAuthProvider>
  );
};

// Wrapper for Azure AD auth
const AzureAuthWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const azureAuth = useAzureAuth();
  
  const unifiedAuth: UnifiedAuthContextType = {
    user: azureAuth.user,
    login: async () => {
      await azureAuth.login();
      return true;
    },
    logout: azureAuth.logout,
    isAuthenticated: azureAuth.isAuthenticated,
    isAdmin: azureAuth.user?.role === 'admin',
    loading: azureAuth.loading,
    authType: 'azure-ad'
  };
  
  return (
    <UnifiedAuthContext.Provider value={unifiedAuth}>
      {children}
    </UnifiedAuthContext.Provider>
  );
};

// Wrapper for local auth
const LocalAuthWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const localAuth = useLocalAuth();
  
  const unifiedAuth: UnifiedAuthContextType = {
    user: localAuth.user,
    login: async (email?: string, password?: string, rememberMe?: boolean) => {
      if (!email || !password) {
        throw new Error('Email and password are required for local authentication');
      }
      return localAuth.login(email, password, rememberMe);
    },
    logout: localAuth.logout,
    isAuthenticated: localAuth.isAuthenticated,
    isAdmin: localAuth.isAdmin,
    authType: 'local'
  };
  
  return (
    <UnifiedAuthContext.Provider value={unifiedAuth}>
      {children}
    </UnifiedAuthContext.Provider>
  );
};

export const useUnifiedAuth = () => {
  const context = useContext(UnifiedAuthContext);
  if (!context) {
    throw new Error('useUnifiedAuth must be used within a UnifiedAuthProvider');
  }
  return context;
};