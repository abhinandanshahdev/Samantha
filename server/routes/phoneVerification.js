/**
 * Phone Verification Routes
 * Handles SMS verification for linking phone numbers to user accounts
 */

const express = require('express');
const router = express.Router();
const twilioVerifyService = require('../services/twilioVerifyService');
const db = require('../config/database-config');

/**
 * Middleware to require authentication
 */
const requireAuth = (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

/**
 * GET /api/phone/status
 * Get service status and user's phone verification status
 */
router.get('/status', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const serviceStatus = twilioVerifyService.getStatus();

    // Get user's phone status from database
    const userPhone = await new Promise((resolve, reject) => {
      db.query(
        'SELECT phone_number, phone_verified, phone_verified_date FROM users WHERE id = ?',
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows[0] || {});
        }
      );
    });

    res.json({
      success: true,
      service: serviceStatus,
      user: {
        phone_number: userPhone.phone_number || null,
        phone_verified: !!userPhone.phone_verified,
        phone_verified_date: userPhone.phone_verified_date || null
      }
    });
  } catch (error) {
    console.error('Error getting phone status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/phone/send-verification
 * Send SMS verification code to user's phone
 */
router.post('/send-verification', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { phone_number, country_code } = req.body;

    if (!phone_number) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // Format phone number to E.164 if country code provided
    let formattedNumber = phone_number;
    if (country_code && !phone_number.startsWith('+')) {
      formattedNumber = twilioVerifyService.formatToE164(country_code, phone_number);
    }

    // Validate format
    if (!twilioVerifyService.isValidE164(formattedNumber)) {
      return res.status(400).json({
        error: 'Invalid phone number format. Use E.164 format (e.g., +14155551234)'
      });
    }

    // Check if phone is already verified by another user
    const existingUser = await new Promise((resolve, reject) => {
      db.query(
        'SELECT id FROM users WHERE phone_number = ? AND phone_verified = 1 AND id != ?',
        [formattedNumber, userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows[0] || null);
        }
      );
    });

    if (existingUser) {
      return res.status(400).json({
        error: 'This phone number is already linked to another account'
      });
    }

    // Send verification code
    const result = await twilioVerifyService.sendVerificationCode(formattedNumber);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Store pending phone number (not verified yet)
    await new Promise((resolve, reject) => {
      db.query(
        'UPDATE users SET phone_number = ?, phone_verified = 0 WHERE id = ?',
        [formattedNumber, userId],
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
    });

    res.json({
      success: true,
      message: 'Verification code sent',
      phone_number: formattedNumber
    });
  } catch (error) {
    console.error('Error sending verification:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/phone/verify-code
 * Verify the code and link phone to account
 */
router.post('/verify-code', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Verification code is required' });
    }

    // Get user's pending phone number
    const user = await new Promise((resolve, reject) => {
      db.query(
        'SELECT phone_number FROM users WHERE id = ?',
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows[0] || null);
        }
      );
    });

    if (!user || !user.phone_number) {
      return res.status(400).json({
        error: 'No phone number pending verification. Please request a new code.'
      });
    }

    // Verify the code
    const result = await twilioVerifyService.verifyCode(user.phone_number, code);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    if (!result.valid) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // Mark phone as verified
    await new Promise((resolve, reject) => {
      db.query(
        'UPDATE users SET phone_verified = 1, phone_verified_date = NOW() WHERE id = ?',
        [userId],
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
    });

    res.json({
      success: true,
      message: 'Phone number verified successfully',
      phone_number: user.phone_number
    });
  } catch (error) {
    console.error('Error verifying code:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/phone/unlink
 * Remove phone number from account
 */
router.delete('/unlink', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;

    // Remove phone from user
    await new Promise((resolve, reject) => {
      db.query(
        'UPDATE users SET phone_number = NULL, phone_verified = 0, phone_verified_date = NULL WHERE id = ?',
        [userId],
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
    });

    // Clean up any WhatsApp sessions for this user
    await new Promise((resolve, reject) => {
      db.query(
        'DELETE FROM whatsapp_sessions WHERE user_id = ?',
        [userId],
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
    });

    res.json({
      success: true,
      message: 'Phone number unlinked successfully'
    });
  } catch (error) {
    console.error('Error unlinking phone:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
