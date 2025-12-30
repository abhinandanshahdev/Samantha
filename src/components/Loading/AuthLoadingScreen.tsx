import React from 'react';

const AuthLoadingScreen: React.FC = () => {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      padding: '20px'
    }}>
      <div style={{
        textAlign: 'center',
        maxWidth: '400px'
      }}>
        {/* Logo */}
        <img 
          src="/assets/DoFLogo.png" 
          alt="Department of Finance Abu Dhabi Logo" 
          style={{
            width: '100px',
            height: 'auto',
            marginBottom: '30px',
            opacity: 0.9
          }}
        />

        {/* Title */}
        <h1 style={{
          fontSize: '28px',
          fontWeight: '700',
          color: '#D4AF37',
          margin: '0 0 10px 0',
          fontFamily: 'Montserrat, sans-serif'
        }}>
          Hekmah
        </h1>
        
        <p style={{
          color: '#6C757D',
          fontSize: '14px',
          margin: '0 0 40px 0',
          fontWeight: '500'
        }}>
          Strategic Initiative Repository
        </p>

        {/* Elegant Loading Animation */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '20px'
        }}>
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#D4AF37',
                animation: `authPulse 1.4s ease-in-out ${index * 0.2}s infinite both`,
                opacity: 0.7
              }}
            ></div>
          ))}
        </div>

        <p style={{
          color: '#9CA3AF',
          fontSize: '13px',
          margin: '0',
          fontWeight: '400'
        }}>
          Initializing secure connection...
        </p>
      </div>

      {/* CSS Animation */}
      <style>{`
        @keyframes authPulse {
          0%, 80%, 100% {
            transform: scale(0.8);
            opacity: 0.5;
          }
          40% {
            transform: scale(1.2);
            opacity: 1;
          }
        }
        
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

export default AuthLoadingScreen;