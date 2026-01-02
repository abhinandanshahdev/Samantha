import React, { useState } from 'react';
import { useMsalAuth } from '../../context/DynamicMsalAuthContext';
import { getMsalConfigInfo } from '../../config/dynamicMsalConfig';

interface MicrosoftLoginProps {
  onSuccess: () => void;
}

const MicrosoftLogin: React.FC<MicrosoftLoginProps> = ({ onSuccess }) => {
  const { login, msalConfigured } = useMsalAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  const handleMicrosoftLogin = async () => {
    if (!msalConfigured) {
      return;
    }

    setIsLoading(true);
    try {
      const success = await login();
      if (success) {
        onSuccess();
      }
    } catch (error) {
      console.error('Login error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleConfigInfo = () => {
    setShowConfig(!showConfig);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '16px',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
        padding: '60px 50px',
        maxWidth: '480px',
        width: '100%',
        textAlign: 'center'
      }}>
        {/* Logo and Header */}
        <div style={{ marginBottom: '40px' }}>
          <img
            src="/logo-samantha.svg"
            alt="Samantha Logo"
            style={{
              height: '64px',
              width: 'auto',
              marginBottom: '20px'
            }}
          />
          <h1 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#D4AF37',
            margin: '0 0 8px 0',
            fontFamily: 'Montserrat, sans-serif'
          }}>Samantha</h1>
          <p style={{
            color: '#2C3E50',
            fontSize: '18px',
            margin: '0',
            fontWeight: '600'
          }}>Family Management</p>
        </div>

        {msalConfigured ? (
          <>
            <p style={{
              color: '#6C757D',
              fontSize: '16px',
              marginBottom: '32px',
              lineHeight: '1.5'
            }}>
              Sign in with your Microsoft account to access Samantha
            </p>
            
            <button
              onClick={handleMicrosoftLogin}
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '16px 24px',
                backgroundColor: isLoading ? '#ccc' : '#D4AF37',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                transition: 'all 0.3s ease',
                fontFamily: 'Montserrat, sans-serif',
                boxShadow: '0 4px 12px rgba(212, 175, 55, 0.3)'
              }}
              onMouseEnter={(e) => {
                if (!isLoading) {
                  (e.target as HTMLElement).style.backgroundColor = '#B8860B';
                  (e.target as HTMLElement).style.transform = 'translateY(-2px)';
                  (e.target as HTMLElement).style.boxShadow = '0 6px 20px rgba(212, 175, 55, 0.4)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isLoading) {
                  (e.target as HTMLElement).style.backgroundColor = '#D4AF37';
                  (e.target as HTMLElement).style.transform = 'translateY(0px)';
                  (e.target as HTMLElement).style.boxShadow = '0 4px 12px rgba(212, 175, 55, 0.3)';
                }
              }}
            >
              {isLoading ? (
                <>
                  <div style={{
                    width: '20px',
                    height: '20px',
                    border: '2px solid #ffffff',
                    borderTop: '2px solid transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }}></div>
                  Signing in...
                </>
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zM24 11.4H12.6V0H24v11.4z"/>
                  </svg>
                  Sign in with Microsoft
                </>
              )}
            </button>
          </>
        ) : (
          <div>
            <div style={{
              backgroundColor: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: '12px',
              padding: '24px',
              marginBottom: '24px'
            }}>
              <h3 style={{ color: '#DC2626', marginBottom: '16px', fontSize: '18px' }}>
                ⚙️ Configuration Required
              </h3>
              <p style={{ marginBottom: '20px', color: '#6B7280', lineHeight: '1.6' }}>
                Microsoft authentication needs to be configured. Please contact your system administrator.
              </p>
              
              <button
                onClick={toggleConfigInfo}
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid #D1D5DB',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  color: '#6B7280',
                  transition: 'all 0.2s ease'
                }}
              >
                {showConfig ? 'Hide' : 'Show'} Configuration Details
              </button>
            </div>
            
            {showConfig && (
              <div style={{
                backgroundColor: '#F9FAFB',
                padding: '20px',
                borderRadius: '12px',
                fontSize: '12px',
                fontFamily: 'monospace',
                border: '1px solid #E5E7EB',
                textAlign: 'left',
                marginTop: '16px'
              }}>
                <h4 style={{ marginBottom: '12px', color: '#374151' }}>Environment Variables:</h4>
                <pre style={{ marginBottom: '16px', color: '#6B7280' }}>
                  {JSON.stringify(getMsalConfigInfo(), null, 2)}
                </pre>
                <p style={{ fontWeight: 'bold', marginBottom: '8px', color: '#374151' }}>Configuration Steps:</p>
                <ol style={{ paddingLeft: '20px', fontSize: '12px', color: '#6B7280', lineHeight: '1.6' }}>
                  <li>Azure Portal → App Registrations</li>
                  <li>Create new app registration</li>
                  <li>Copy Application (client) ID</li>
                  <li>Configure redirect URIs</li>
                  <li>Update environment variables</li>
                </ol>
              </div>
            )}
          </div>
        )}

        <div style={{
          marginTop: '48px',
          paddingTop: '24px',
          borderTop: '1px solid #E5E7EB'
        }}>
          <p style={{
            color: '#9CA3AF',
            fontSize: '14px',
            margin: '0'
          }}>
            &copy; 2024 Samantha Family Management. All rights reserved.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default MicrosoftLogin;