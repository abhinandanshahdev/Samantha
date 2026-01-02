import React, { createContext, useState, useEffect, useContext } from 'react';
import { User } from '../types';
import { authAPI } from '../services/apiService';

type Role = 'consumer' | 'admin';

interface StoredUser extends User {
  password: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<boolean>;
  register: (email: string, password: string, name: string, role: Role) => Promise<boolean>;
  logout: () => void;
  resetPassword: (email: string, newPassword: string) => Promise<boolean>;
  updateUser: (updatedUser: User) => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    console.log('AuthContext: Checking stored token:', token ? 'Token exists' : 'No token found');
    
    if (token) {
      console.log('AuthContext: Verifying token with server...');
      // Verify token and get user info
      authAPI.getCurrentUser().then(user => {
        console.log('AuthContext: Token verified, user logged in:', user);
        setUser(user);
        setIsLoading(false);
      }).catch((error) => {
        console.error('AuthContext: Token verification failed:', error);
        // Token is invalid, clear it
        localStorage.removeItem('token');
        sessionStorage.removeItem('token');
        setUser(null);
        setIsLoading(false);
      });
    } else {
      // No token, ensure user is null
      setUser(null);
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password: string, rememberMe: boolean = false): Promise<boolean> => {
    try {
      console.log('AuthContext: Attempting login for:', email);
      const response = await authAPI.login(email, password);
      
      if (response.token) {
        console.log('AuthContext: Login successful, storing token');
        // Store token based on remember me preference
        if (rememberMe) {
          localStorage.setItem('token', response.token);
          console.log('AuthContext: Token stored in localStorage');
        } else {
          sessionStorage.setItem('token', response.token);
          console.log('AuthContext: Token stored in sessionStorage');
        }
        setUser(response.user);
        return true;
      }
      console.log('AuthContext: Login failed - no token in response');
      return false;
    } catch (error) {
      console.error('AuthContext: Login error:', error);
      return false;
    }
  };

  const register = async (email: string, password: string, name: string, role: Role): Promise<boolean> => {
    try {
      const response = await authAPI.register(email, password, name, role);
      if (response.token) {
        sessionStorage.setItem('token', response.token);
        setUser(response.user);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Registration error:', error);
      return false;
    }
  };

  const resetPassword = async (email: string, newPassword: string): Promise<boolean> => {
    try {
      // This would be implemented in the backend
      // For now, return false as it's not implemented
      return false;
    } catch (error) {
      console.error('Password reset error:', error);
      return false;
    }
  };

  const logout = () => {
    console.log('AuthContext: Logging out user');
    setUser(null);
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
  };

  const updateUser = (updatedUser: User) => {
    console.log('AuthContext: Updating user data', updatedUser);
    setUser(updatedUser);
  };

  const isAuthenticated = !!user;
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
        color: '#6366F1'
      }}>
        Loading Samantha...
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, login, register, resetPassword, logout, updateUser, isAuthenticated, isAdmin, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (undefined === context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}; 