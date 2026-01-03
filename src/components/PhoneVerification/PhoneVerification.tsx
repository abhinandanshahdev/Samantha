import React, { useState, useEffect, useCallback } from 'react';
import { FaWhatsapp, FaCheck, FaTimes, FaSpinner, FaUnlink } from 'react-icons/fa';
import { phoneAPI, PhoneStatus } from '../../services/apiService';
import './PhoneVerification.css';

interface PhoneVerificationProps {
  onStatusChange?: (verified: boolean) => void;
}

// Common country codes
const COUNTRY_CODES = [
  { code: '1', label: '+1 (US/Canada)' },
  { code: '44', label: '+44 (UK)' },
  { code: '61', label: '+61 (Australia)' },
  { code: '91', label: '+91 (India)' },
  { code: '86', label: '+86 (China)' },
  { code: '81', label: '+81 (Japan)' },
  { code: '49', label: '+49 (Germany)' },
  { code: '33', label: '+33 (France)' },
  { code: '55', label: '+55 (Brazil)' },
  { code: '52', label: '+52 (Mexico)' }
];

const PhoneVerification: React.FC<PhoneVerificationProps> = ({ onStatusChange }) => {
  const [status, setStatus] = useState<PhoneStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [phoneNumber, setPhoneNumber] = useState('');
  const [countryCode, setCountryCode] = useState('1');
  const [verificationCode, setVerificationCode] = useState('');
  const [step, setStep] = useState<'enter' | 'verify'>('enter');

  // Load status
  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      const data = await phoneAPI.getStatus();
      setStatus(data);

      // If phone is pending verification, show verification step
      if (data.user.phone_number && !data.user.phone_verified) {
        setStep('verify');
      }
    } catch (err: any) {
      console.error('Failed to load phone status:', err);
      // Service might not be configured
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Clear messages after delay
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError(null);
        setSuccess(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  const handleSendCode = async () => {
    if (!phoneNumber.trim()) {
      setError('Please enter a phone number');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Format number: if starts with +, use as-is; otherwise prepend country code
      const formattedNumber = phoneNumber.startsWith('+')
        ? phoneNumber
        : `+${countryCode}${phoneNumber.replace(/\D/g, '')}`;

      const result = await phoneAPI.sendVerification(formattedNumber);

      if (result.success) {
        setSuccess('Verification code sent! Check your phone.');
        setStep('verify');
        await loadStatus();
      } else {
        setError(result.error || 'Failed to send verification code');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to send verification code');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode.trim() || verificationCode.length < 4) {
      setError('Please enter a valid verification code');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await phoneAPI.verifyCode(verificationCode);

      if (result.success) {
        setSuccess('Phone number verified successfully!');
        setVerificationCode('');
        await loadStatus();
        onStatusChange?.(true);
      } else {
        setError(result.error || 'Invalid verification code');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Verification failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnlink = async () => {
    if (!window.confirm('Are you sure you want to unlink your phone number? You will no longer be able to use WhatsApp integration.')) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await phoneAPI.unlink();

      if (result.success) {
        setSuccess('Phone number unlinked');
        setPhoneNumber('');
        setVerificationCode('');
        setStep('enter');
        await loadStatus();
        onStatusChange?.(false);
      } else {
        setError(result.error || 'Failed to unlink phone');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to unlink phone');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendCode = async () => {
    if (!status?.user.phone_number) return;

    setSubmitting(true);
    setError(null);

    try {
      const result = await phoneAPI.sendVerification(status.user.phone_number);

      if (result.success) {
        setSuccess('New verification code sent!');
      } else {
        setError(result.error || 'Failed to resend code');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to resend code');
    } finally {
      setSubmitting(false);
    }
  };

  const handleChangeNumber = () => {
    setStep('enter');
    setPhoneNumber('');
    setVerificationCode('');
  };

  // Loading state
  if (loading) {
    return (
      <div className="phone-verification">
        <div className="phone-verification-loading">
          <FaSpinner className="spinner" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  // Service not configured
  if (!status?.service.configured) {
    return (
      <div className="phone-verification">
        <div className="phone-verification-header">
          <FaWhatsapp className="whatsapp-icon" />
          <h3>WhatsApp Integration</h3>
        </div>
        <div className="phone-verification-unavailable">
          <p>WhatsApp integration is not configured.</p>
          <span>Contact your administrator to enable this feature.</span>
        </div>
      </div>
    );
  }

  // Already verified
  if (status?.user.phone_verified && status?.user.phone_number) {
    return (
      <div className="phone-verification">
        <div className="phone-verification-header">
          <FaWhatsapp className="whatsapp-icon verified" />
          <h3>WhatsApp Integration</h3>
        </div>

        <div className="phone-verified-status">
          <div className="verified-badge">
            <FaCheck className="check-icon" />
            <span>Phone Verified</span>
          </div>
          <div className="verified-number">{status.user.phone_number}</div>
          {status.user.phone_verified_date && (
            <div className="verified-date">
              Verified on {new Date(status.user.phone_verified_date).toLocaleDateString()}
            </div>
          )}
          <p className="verified-message">
            You can now chat with Voyagers via WhatsApp! Send a message to our WhatsApp number to get started.
          </p>
        </div>

        <button
          className="unlink-button"
          onClick={handleUnlink}
          disabled={submitting}
        >
          {submitting ? <FaSpinner className="spinner" /> : <FaUnlink />}
          <span>Unlink Phone</span>
        </button>

        {error && <div className="phone-error">{error}</div>}
        {success && <div className="phone-success">{success}</div>}
      </div>
    );
  }

  return (
    <div className="phone-verification">
      <div className="phone-verification-header">
        <FaWhatsapp className="whatsapp-icon" />
        <h3>WhatsApp Integration</h3>
      </div>

      <p className="phone-description">
        Link your phone number to chat with Voyagers via WhatsApp. You'll receive the same AI-powered assistance as the web chat.
      </p>

      {step === 'enter' && (
        <div className="phone-form">
          <div className="phone-input-group">
            <select
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              className="country-select"
              disabled={submitting}
            >
              {COUNTRY_CODES.map((cc) => (
                <option key={cc.code} value={cc.code}>{cc.label}</option>
              ))}
            </select>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="Phone number"
              className="phone-input"
              disabled={submitting}
            />
          </div>
          <button
            className="send-code-button"
            onClick={handleSendCode}
            disabled={submitting || !phoneNumber.trim()}
          >
            {submitting ? <FaSpinner className="spinner" /> : null}
            <span>Send Verification Code</span>
          </button>
        </div>
      )}

      {step === 'verify' && (
        <div className="verify-form">
          <p className="verify-instruction">
            Enter the 6-digit code sent to <strong>{status?.user.phone_number}</strong>
          </p>

          <div className="code-input-group">
            <input
              type="text"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="code-input"
              maxLength={6}
              disabled={submitting}
              autoFocus
            />
          </div>

          <div className="verify-actions">
            <button
              className="verify-button"
              onClick={handleVerifyCode}
              disabled={submitting || verificationCode.length < 4}
            >
              {submitting ? <FaSpinner className="spinner" /> : <FaCheck />}
              <span>Verify</span>
            </button>
            <button
              className="resend-button"
              onClick={handleResendCode}
              disabled={submitting}
            >
              Resend Code
            </button>
          </div>

          <button
            className="change-number-link"
            onClick={handleChangeNumber}
            disabled={submitting}
          >
            <FaTimes /> Use a different number
          </button>
        </div>
      )}

      {error && <div className="phone-error">{error}</div>}
      {success && <div className="phone-success">{success}</div>}
    </div>
  );
};

export default PhoneVerification;
