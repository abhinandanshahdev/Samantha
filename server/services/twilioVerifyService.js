/**
 * Twilio Verify Service
 * Handles SMS verification for linking phone numbers to user accounts
 */

const twilio = require('twilio');

class TwilioVerifyService {
  constructor() {
    this.isConfigured = false;
    this.isEnabled = false;
    this.client = null;
    this.verifyServiceSid = null;
    this.whatsappNumber = null;

    // Check feature flag first (defaults to disabled)
    const featureEnabled = process.env.FEATURE_TWILIO_ENABLED === 'true';

    if (!featureEnabled) {
      console.log('Twilio integration disabled via FEATURE_TWILIO_ENABLED flag');
      return;
    }

    // Initialize if environment variables are present
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_VERIFY_SERVICE_SID) {
      try {
        this.client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        this.verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
        this.whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER || null;
        this.isConfigured = true;
        this.isEnabled = true;
        console.log('Twilio Verify Service initialized successfully');
      } catch (error) {
        console.error('Failed to initialize Twilio Verify Service:', error.message);
      }
    } else {
      console.log('Twilio credentials not configured - phone verification disabled');
    }
  }

  /**
   * Send verification code via SMS
   * @param {string} phoneNumber - Phone number in E.164 format (e.g., +14155551234)
   * @returns {Promise<{success: boolean, message?: string, error?: string}>}
   */
  async sendVerificationCode(phoneNumber) {
    if (!this.isConfigured) {
      return { success: false, error: 'Twilio not configured' };
    }

    // Validate phone number format (E.164)
    if (!this.isValidE164(phoneNumber)) {
      return { success: false, error: 'Invalid phone number format. Use E.164 format (e.g., +14155551234)' };
    }

    try {
      const verification = await this.client.verify.v2
        .services(this.verifyServiceSid)
        .verifications.create({
          to: phoneNumber,
          channel: 'sms'
        });

      console.log(`Verification SMS sent to ${phoneNumber}, status: ${verification.status}`);

      return {
        success: true,
        status: verification.status,
        message: 'Verification code sent successfully'
      };
    } catch (error) {
      console.error(`Failed to send verification to ${phoneNumber}:`, error.message);

      // Handle specific Twilio errors
      if (error.code === 60200) {
        return { success: false, error: 'Invalid phone number' };
      } else if (error.code === 60203) {
        return { success: false, error: 'Max verification attempts reached. Please try again later.' };
      } else if (error.code === 60212) {
        return { success: false, error: 'Too many requests. Please wait before trying again.' };
      }

      return { success: false, error: error.message || 'Failed to send verification code' };
    }
  }

  /**
   * Verify the code entered by user
   * @param {string} phoneNumber - Phone number in E.164 format
   * @param {string} code - Verification code (typically 6 digits)
   * @returns {Promise<{success: boolean, valid?: boolean, message?: string, error?: string}>}
   */
  async verifyCode(phoneNumber, code) {
    if (!this.isConfigured) {
      return { success: false, error: 'Twilio not configured' };
    }

    if (!this.isValidE164(phoneNumber)) {
      return { success: false, error: 'Invalid phone number format' };
    }

    if (!code || !/^\d{4,8}$/.test(code.toString().trim())) {
      return { success: false, error: 'Invalid verification code format' };
    }

    try {
      const verificationCheck = await this.client.verify.v2
        .services(this.verifyServiceSid)
        .verificationChecks.create({
          to: phoneNumber,
          code: code.toString().trim()
        });

      console.log(`Verification check for ${phoneNumber}: ${verificationCheck.status}`);

      if (verificationCheck.status === 'approved') {
        return {
          success: true,
          valid: true,
          message: 'Phone number verified successfully'
        };
      } else {
        return {
          success: true,
          valid: false,
          message: 'Invalid verification code'
        };
      }
    } catch (error) {
      console.error(`Verification check failed for ${phoneNumber}:`, error.message);

      // Handle specific errors
      if (error.code === 60200) {
        return { success: false, error: 'Invalid phone number' };
      } else if (error.code === 20404) {
        return { success: false, error: 'No pending verification found. Please request a new code.' };
      }

      return { success: false, error: error.message || 'Verification failed' };
    }
  }

  /**
   * Validate E.164 phone number format
   * @param {string} phoneNumber
   * @returns {boolean}
   */
  isValidE164(phoneNumber) {
    // E.164: starts with +, followed by 1-15 digits
    return /^\+[1-9]\d{1,14}$/.test(phoneNumber);
  }

  /**
   * Format phone number to E.164
   * @param {string} countryCode - Country code (e.g., "1" for US)
   * @param {string} phoneNumber - Local phone number
   * @returns {string} E.164 formatted number
   */
  formatToE164(countryCode, phoneNumber) {
    // Remove all non-digits
    const cleaned = phoneNumber.replace(/\D/g, '');
    const cleanedCode = countryCode.replace(/\D/g, '');
    return `+${cleanedCode}${cleaned}`;
  }

  /**
   * Get service status
   * @returns {{configured: boolean, whatsappEnabled: boolean}}
   */
  getStatus() {
    return {
      configured: this.isConfigured,
      whatsappEnabled: !!this.whatsappNumber
    };
  }
}

// Export singleton instance
module.exports = new TwilioVerifyService();
