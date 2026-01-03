/**
 * WhatsApp Session Service
 * Manages conversation sessions for WhatsApp users
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../config/database-config');

class WhatsAppSessionService {
  constructor() {
    this.maxHistoryLength = 20; // Keep last 20 messages for context
    this.sessionTimeoutMinutes = 60; // Session expires after 60 minutes of inactivity
  }

  /**
   * Get or create a session for a phone number
   * @param {string} phoneNumber - WhatsApp phone number
   * @returns {Promise<{sessionId: string, userId: string|null, conversationHistory: Array}>}
   */
  async getOrCreateSession(phoneNumber) {
    // First, try to find an existing active session
    const existingSession = await new Promise((resolve, reject) => {
      db.query(
        `SELECT id, phone_number, user_id, session_id, conversation_history, last_activity
         FROM whatsapp_sessions
         WHERE phone_number = ?
         AND last_activity > DATE_SUB(NOW(), INTERVAL ? MINUTE)
         ORDER BY last_activity DESC
         LIMIT 1`,
        [phoneNumber, this.sessionTimeoutMinutes],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows[0] || null);
        }
      );
    });

    if (existingSession) {
      // Parse conversation history
      let conversationHistory = [];
      if (existingSession.conversation_history) {
        try {
          conversationHistory = typeof existingSession.conversation_history === 'string'
            ? JSON.parse(existingSession.conversation_history)
            : existingSession.conversation_history;
        } catch (e) {
          console.error('Failed to parse conversation history:', e);
        }
      }

      return {
        sessionId: existingSession.session_id,
        userId: existingSession.user_id,
        conversationHistory,
        isNew: false
      };
    }

    // Look up user by verified phone number
    const user = await new Promise((resolve, reject) => {
      db.query(
        'SELECT id, name, email, domain_id FROM users WHERE phone_number = ? AND phone_verified = 1',
        [phoneNumber],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows[0] || null);
        }
      );
    });

    // Create new session
    const sessionId = uuidv4();

    await new Promise((resolve, reject) => {
      db.query(
        `INSERT INTO whatsapp_sessions (phone_number, user_id, session_id, conversation_history)
         VALUES (?, ?, ?, ?)`,
        [phoneNumber, user?.id || null, sessionId, JSON.stringify([])],
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
    });

    return {
      sessionId,
      userId: user?.id || null,
      userName: user?.name || null,
      userEmail: user?.email || null,
      domainId: user?.domain_id || null,
      conversationHistory: [],
      isNew: true
    };
  }

  /**
   * Update session with new message
   * @param {string} sessionId - Session ID
   * @param {string} role - 'user' or 'assistant'
   * @param {string} content - Message content
   */
  async addMessage(sessionId, role, content) {
    // Get current conversation history
    const session = await new Promise((resolve, reject) => {
      db.query(
        'SELECT conversation_history FROM whatsapp_sessions WHERE session_id = ?',
        [sessionId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows[0] || null);
        }
      );
    });

    if (!session) {
      console.error(`Session not found: ${sessionId}`);
      return;
    }

    let history = [];
    if (session.conversation_history) {
      try {
        history = typeof session.conversation_history === 'string'
          ? JSON.parse(session.conversation_history)
          : session.conversation_history;
      } catch (e) {
        console.error('Failed to parse conversation history:', e);
      }
    }

    // Add new message
    history.push({
      role,
      content,
      timestamp: new Date().toISOString()
    });

    // Trim to max length
    if (history.length > this.maxHistoryLength) {
      history = history.slice(-this.maxHistoryLength);
    }

    // Update session
    await new Promise((resolve, reject) => {
      db.query(
        `UPDATE whatsapp_sessions
         SET conversation_history = ?, last_activity = NOW()
         WHERE session_id = ?`,
        [JSON.stringify(history), sessionId],
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
    });
  }

  /**
   * Get user info for a phone number
   * @param {string} phoneNumber
   * @returns {Promise<{userId: string, name: string, email: string, domainId: string}|null>}
   */
  async getUserByPhone(phoneNumber) {
    const user = await new Promise((resolve, reject) => {
      db.query(
        'SELECT id, name, email, domain_id, role FROM users WHERE phone_number = ? AND phone_verified = 1',
        [phoneNumber],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows[0] || null);
        }
      );
    });

    if (!user) return null;

    return {
      userId: user.id,
      name: user.name,
      email: user.email,
      domainId: user.domain_id,
      role: user.role
    };
  }

  /**
   * Clear session history
   * @param {string} sessionId
   */
  async clearSession(sessionId) {
    await new Promise((resolve, reject) => {
      db.query(
        `UPDATE whatsapp_sessions
         SET conversation_history = ?, last_activity = NOW()
         WHERE session_id = ?`,
        [JSON.stringify([]), sessionId],
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
    });
  }

  /**
   * Delete old sessions
   * @param {number} daysOld - Delete sessions older than this many days
   */
  async cleanupOldSessions(daysOld = 7) {
    await new Promise((resolve, reject) => {
      db.query(
        `DELETE FROM whatsapp_sessions WHERE last_activity < DATE_SUB(NOW(), INTERVAL ? DAY)`,
        [daysOld],
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
    });
  }
}

module.exports = new WhatsAppSessionService();
