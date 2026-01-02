import React from 'react';

interface PendingAccessProps {
  user: {
    name: string;
    email: string;
  };
  onLogout: () => void;
}

const PendingAccess: React.FC<PendingAccessProps> = ({ user, onLogout }) => {
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
            src="/assets/DoFLogo.png" 
            alt="Department of Finance Abu Dhabi Logo" 
            style={{
              width: '120px',
              height: 'auto',
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

        {/* Pending Access Message */}
        <div style={{
          backgroundColor: '#FEF3C7',
          border: '1px solid #F59E0B',
          borderRadius: '12px',
          padding: '32px 24px',
          marginBottom: '32px'
        }}>
          <div style={{
            fontSize: '48px',
            marginBottom: '16px'
          }}>⏳</div>
          
          <h2 style={{
            fontSize: '24px',
            fontWeight: '600',
            color: '#92400E',
            margin: '0 0 16px 0',
            fontFamily: 'Montserrat, sans-serif'
          }}>Access Pending</h2>
          
          <p style={{
            color: '#6B7280',
            fontSize: '16px',
            lineHeight: '1.6',
            marginBottom: '16px'
          }}>
            Hello <strong>{user.name}</strong>,
          </p>
          
          <p style={{
            color: '#6B7280',
            fontSize: '16px',
            lineHeight: '1.6',
            marginBottom: '24px'
          }}>
            You don't have access to Samantha yet. Your account ({user.email}) has been logged, 
            and an administrator will review your access request shortly.
          </p>
          
          <div style={{
            backgroundColor: '#F3F4F6',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '24px',
            fontSize: '14px',
            color: '#6B7280',
            lineHeight: '1.5'
          }}>
            <strong>What happens next?</strong>
            <br />
            • Your access request is under review
            <br />
            • An administrator will configure your role
            <br />
            • You'll receive notification once access is granted
            <br />
            • You can then return to sign in with full access
          </div>
        </div>

        {/* Actions */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <button
            onClick={onLogout}
            style={{
              width: '100%',
              padding: '12px 24px',
              backgroundColor: '#6B7280',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              fontFamily: 'Montserrat, sans-serif'
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLElement).style.backgroundColor = '#4B5563';
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.backgroundColor = '#6B7280';
            }}
          >
            Sign Out
          </button>
          
          <p style={{
            color: '#9CA3AF',
            fontSize: '14px',
            margin: '16px 0 0 0'
          }}>
            For urgent access requests, please contact your system administrator.
          </p>
        </div>

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
            &copy; 2024 Department of Finance Abu Dhabi. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PendingAccess;