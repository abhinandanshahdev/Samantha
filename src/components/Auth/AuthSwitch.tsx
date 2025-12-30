import React, { useState } from 'react';
import { useMsalAuth } from '../../context/DynamicMsalAuthContext';
import MicrosoftLogin from './MicrosoftLogin';
import Login from './Login';
import Register from './Register';
import PasswordReset from './PasswordReset';

interface AuthSwitchProps {
  onSuccess: () => void;
}

type AuthMode = 'microsoft' | 'traditional';
type AuthView = 'login' | 'register' | 'password_reset';

const AuthSwitch: React.FC<AuthSwitchProps> = ({ onSuccess }) => {
  const { msalConfigured } = useMsalAuth();
  const [authMode, setAuthMode] = useState<AuthMode>(msalConfigured ? 'microsoft' : 'traditional');
  const [authView, setAuthView] = useState<AuthView>('login');

  const handleSwitchToRegister = () => setAuthView('register');
  const handleSwitchToLogin = () => setAuthView('login');
  const handleForgotPassword = () => setAuthView('password_reset');
  const handleResetSuccess = () => setAuthView('login');

  // If MSAL is configured, prefer Microsoft auth but allow fallback
  if (authMode === 'microsoft') {
    return (
      <div>
        <MicrosoftLogin onSuccess={onSuccess} />
        
        {/* Fallback option if Microsoft auth doesn't work */}
        <div style={{ 
          textAlign: 'center', 
          marginTop: '20px', 
          paddingTop: '20px', 
          borderTop: '1px solid #eee' 
        }}>
          <button
            onClick={() => setAuthMode('traditional')}
            style={{
              background: 'none',
              border: 'none',
              color: '#666',
              fontSize: '14px',
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            Use traditional login instead
          </button>
        </div>
      </div>
    );
  }

  // Traditional email/password authentication
  switch (authView) {
    case 'register':
      return <Register onSuccess={onSuccess} onSwitchToLogin={handleSwitchToLogin} />;
    case 'password_reset':
      return <PasswordReset onSuccess={handleResetSuccess} onCancel={handleSwitchToLogin} />;
    default:
      return (
        <div>
          <Login 
            onSuccess={onSuccess} 
            onSwitchToRegister={handleSwitchToRegister}
            onForgotPassword={handleForgotPassword}
          />
          
          {/* Option to switch to Microsoft auth if configured */}
          {msalConfigured && (
            <div style={{ 
              textAlign: 'center', 
              marginTop: '20px', 
              paddingTop: '20px', 
              borderTop: '1px solid #eee' 
            }}>
              <button
                onClick={() => setAuthMode('microsoft')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#0078d4',
                  fontSize: '14px',
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                Sign in with Microsoft instead
              </button>
            </div>
          )}
        </div>
      );
  }
};

export default AuthSwitch;