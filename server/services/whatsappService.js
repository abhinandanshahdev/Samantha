/**
 * WhatsApp Service
 * Handles WhatsApp messages and Claude Agent integration
 */

const twilio = require('twilio');
const whatsappSessionService = require('./whatsappSessionService');

// Import Claude Agent SDK function
const { generateClaudeAgentResponse } = require('./claudeAgentService');

class WhatsAppService {
  constructor() {
    this.isConfigured = false;
    this.isEnabled = false;
    this.client = null;
    this.whatsappNumber = null;

    // Check feature flag first (defaults to disabled)
    const featureEnabled = process.env.FEATURE_WHATSAPP_ENABLED === 'true';

    if (!featureEnabled) {
      console.log('WhatsApp integration disabled via FEATURE_WHATSAPP_ENABLED flag');
      this.maxMessageLength = 1600;
      return;
    }

    // Initialize if environment variables are present
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_NUMBER) {
      try {
        this.client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        this.whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;
        this.isConfigured = true;
        this.isEnabled = true;
        console.log('WhatsApp Service initialized successfully');
        console.log('WhatsApp Number:', this.whatsappNumber);
      } catch (error) {
        console.error('Failed to initialize WhatsApp Service:', error.message);
      }
    } else {
      console.log('WhatsApp credentials not configured - WhatsApp integration disabled');
    }

    // WhatsApp message character limit
    this.maxMessageLength = 1600;
  }

  /**
   * Process incoming WhatsApp message
   * @param {string} from - Sender's phone number (whatsapp:+1234567890)
   * @param {string} body - Message content
   * @returns {Promise<string>} Response message
   */
  async processIncomingMessage(from, body) {
    // Extract phone number from WhatsApp format
    const phoneNumber = from.replace('whatsapp:', '');

    console.log(`WhatsApp message from ${phoneNumber}: ${body.substring(0, 50)}...`);

    try {
      // Get or create session
      const session = await whatsappSessionService.getOrCreateSession(phoneNumber);

      // Check if user is verified
      const user = await whatsappSessionService.getUserByPhone(phoneNumber);

      if (!user) {
        return this.formatResponse(
          "Your phone number is not linked to a Samantha account. " +
          "Please verify your phone number in the Samantha web app to use WhatsApp integration."
        );
      }

      // Handle special commands
      const command = body.trim().toLowerCase();
      if (command === '/clear' || command === '/reset') {
        await whatsappSessionService.clearSession(session.sessionId);
        return "Conversation cleared. How can I help you today?";
      }

      if (command === '/help') {
        return this.getHelpMessage();
      }

      // Add user message to session
      await whatsappSessionService.addMessage(session.sessionId, 'user', body);

      // Build conversation history for Claude
      const messages = session.conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Add current message
      messages.push({ role: 'user', content: body });

      // Process with Claude Agent (non-streaming for WhatsApp)
      const response = await this.processWithClaudeAgent(
        messages,
        user.userId,
        user.name,
        user.domainId,
        user.role
      );

      // Add assistant response to session
      await whatsappSessionService.addMessage(session.sessionId, 'assistant', response);

      return this.formatResponse(response);
    } catch (error) {
      console.error('Error processing WhatsApp message:', error);
      return this.formatResponse(
        "I encountered an error processing your message. Please try again."
      );
    }
  }

  /**
   * Process message with Claude Agent SDK
   * @param {Array} messages - Conversation history
   * @param {string} userId - User ID
   * @param {string} userName - User name
   * @param {string} domainId - Domain ID
   * @param {string} userRole - User role
   * @returns {Promise<string>} Claude's response
   */
  async processWithClaudeAgent(messages, userId, userName, domainId, userRole) {
    try {
      // Get the last user message as the query
      const lastMessage = messages[messages.length - 1];
      const userQuery = lastMessage?.content || '';

      // Convert messages to conversation history format expected by Claude Agent
      const conversationHistory = messages.slice(0, -1).map(msg => ({
        text: msg.content,
        isUser: msg.role === 'user'
      }));

      // Use the Claude Agent SDK function
      const response = await generateClaudeAgentResponse(
        userQuery,
        conversationHistory,
        userName,
        domainId,
        {
          userId,
          userRole,
          activeSkills: [] // No skills for WhatsApp (simpler interaction)
        }
      );

      // Extract text from response
      if (response && response.response) {
        return response.response;
      }

      return response?.toString() || "I'm not sure how to respond to that.";
    } catch (error) {
      console.error('Claude Agent error:', error);
      throw error;
    }
  }

  /**
   * Send WhatsApp message
   * @param {string} to - Recipient phone number
   * @param {string} body - Message content
   */
  async sendMessage(to, body) {
    if (!this.isConfigured) {
      throw new Error('WhatsApp not configured');
    }

    // Ensure proper WhatsApp format
    const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

    // Split long messages if needed
    const messageParts = this.splitMessage(body);

    for (const part of messageParts) {
      await this.client.messages.create({
        body: part,
        from: this.whatsappNumber,
        to: toNumber
      });

      // Small delay between multiple messages
      if (messageParts.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  /**
   * Format response for WhatsApp
   * @param {string} text - Response text
   * @returns {string} Formatted response
   */
  formatResponse(text) {
    if (!text) return "I'm not sure how to respond to that.";

    // Clean up markdown that doesn't work well in WhatsApp
    let formatted = text
      // Convert headers to bold
      .replace(/^###\s+(.+)$/gm, '*$1*')
      .replace(/^##\s+(.+)$/gm, '*$1*')
      .replace(/^#\s+(.+)$/gm, '*$1*')
      // Keep bold and italic
      .replace(/\*\*(.+?)\*\*/g, '*$1*')
      // Convert code blocks to monospace (WhatsApp uses backticks)
      .replace(/```[\w]*\n?([\s\S]*?)```/g, '```$1```')
      // Keep inline code
      .replace(/`([^`]+)`/g, '`$1`')
      // Convert bullet points
      .replace(/^[-*]\s+/gm, '- ')
      // Clean up extra whitespace
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return formatted;
  }

  /**
   * Split long messages for WhatsApp
   * @param {string} message - Message to split
   * @returns {Array<string>} Message parts
   */
  splitMessage(message) {
    if (message.length <= this.maxMessageLength) {
      return [message];
    }

    const parts = [];
    let remaining = message;

    while (remaining.length > 0) {
      if (remaining.length <= this.maxMessageLength) {
        parts.push(remaining);
        break;
      }

      // Find a good break point
      let breakPoint = this.maxMessageLength;

      // Try to break at paragraph
      const paragraphBreak = remaining.lastIndexOf('\n\n', this.maxMessageLength);
      if (paragraphBreak > this.maxMessageLength / 2) {
        breakPoint = paragraphBreak;
      } else {
        // Try to break at sentence
        const sentenceBreak = remaining.lastIndexOf('. ', this.maxMessageLength);
        if (sentenceBreak > this.maxMessageLength / 2) {
          breakPoint = sentenceBreak + 1;
        } else {
          // Try to break at word
          const wordBreak = remaining.lastIndexOf(' ', this.maxMessageLength);
          if (wordBreak > this.maxMessageLength / 2) {
            breakPoint = wordBreak;
          }
        }
      }

      parts.push(remaining.substring(0, breakPoint).trim());
      remaining = remaining.substring(breakPoint).trim();
    }

    // Add part indicators for multi-part messages
    if (parts.length > 1) {
      return parts.map((part, index) =>
        `[${index + 1}/${parts.length}]\n${part}`
      );
    }

    return parts;
  }

  /**
   * Get help message
   * @returns {string}
   */
  getHelpMessage() {
    return `*Samantha WhatsApp Commands*

/help - Show this help message
/clear - Clear conversation history

*What I can do:*
- Answer questions about your initiatives and tasks
- Provide strategic guidance
- Search and summarize information
- Help with planning and decision-making

Just type your question or request naturally!`;
  }

  /**
   * Validate Twilio webhook signature
   * @param {string} signature - X-Twilio-Signature header
   * @param {string} url - Request URL
   * @param {Object} params - Request body
   * @returns {boolean}
   */
  validateWebhookSignature(signature, url, params) {
    if (!process.env.TWILIO_AUTH_TOKEN) {
      console.warn('TWILIO_AUTH_TOKEN not set - skipping signature validation');
      return true;
    }

    return twilio.validateRequest(
      process.env.TWILIO_AUTH_TOKEN,
      signature,
      url,
      params
    );
  }

  /**
   * Get service status
   * @returns {{configured: boolean, whatsappNumber: string|null}}
   */
  getStatus() {
    return {
      configured: this.isConfigured,
      whatsappNumber: this.whatsappNumber
    };
  }
}

module.exports = new WhatsAppService();
