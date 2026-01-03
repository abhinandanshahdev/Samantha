/**
 * WhatsApp Routes
 * Handles Twilio WhatsApp webhooks
 */

const express = require('express');
const router = express.Router();
const whatsappService = require('../services/whatsappService');

// Twilio expects application/x-www-form-urlencoded
const bodyParser = require('body-parser');
router.use(bodyParser.urlencoded({ extended: false }));

/**
 * GET /api/whatsapp/webhook
 * Twilio webhook verification
 */
router.get('/webhook', (req, res) => {
  // Twilio doesn't actually require verification for WhatsApp webhooks,
  // but we'll respond with a simple OK for health checks
  res.status(200).send('WhatsApp webhook is active');
});

/**
 * GET /api/whatsapp/status
 * Get WhatsApp service status
 */
router.get('/status', (req, res) => {
  const status = whatsappService.getStatus();
  res.json(status);
});

/**
 * POST /api/whatsapp/webhook
 * Receive incoming WhatsApp messages from Twilio
 */
router.post('/webhook', async (req, res) => {
  console.log('WhatsApp webhook received:', JSON.stringify(req.body));

  try {
    // Extract message data from Twilio webhook
    const {
      From: from,
      To: to,
      Body: body,
      MessageSid: messageSid,
      NumMedia: numMedia
    } = req.body;

    // Validate required fields
    if (!from || !body) {
      console.error('Missing required fields in webhook:', { from: !!from, body: !!body });
      return res.status(400).send('Missing required fields');
    }

    // Validate webhook signature if configured
    if (process.env.WHATSAPP_VALIDATE_SIGNATURE === 'true') {
      const signature = req.headers['x-twilio-signature'];
      const url = `${process.env.BASE_URL || 'https://samantha.azurewebsites.net'}/api/whatsapp/webhook`;

      if (!whatsappService.validateWebhookSignature(signature, url, req.body)) {
        console.error('Invalid webhook signature');
        return res.status(403).send('Invalid signature');
      }
    }

    // Log incoming message
    console.log(`Incoming WhatsApp message from ${from}: ${body.substring(0, 100)}${body.length > 100 ? '...' : ''}`);

    // Handle media messages (for now, we'll just acknowledge them)
    if (parseInt(numMedia) > 0) {
      console.log(`Message contains ${numMedia} media attachment(s)`);
      // For now, we'll process only the text portion
    }

    // Process the message and get response
    const response = await whatsappService.processIncomingMessage(from, body);

    // Send response back via Twilio
    await whatsappService.sendMessage(from, response);

    // Acknowledge receipt (Twilio expects 200 OK with TwiML or empty body)
    res.status(200).send('');
  } catch (error) {
    console.error('WhatsApp webhook error:', error);

    // Try to send error message to user
    try {
      const from = req.body?.From;
      if (from) {
        await whatsappService.sendMessage(
          from,
          "I encountered an error processing your message. Please try again later."
        );
      }
    } catch (sendError) {
      console.error('Failed to send error message:', sendError);
    }

    // Return 200 to prevent Twilio retries
    res.status(200).send('');
  }
});

/**
 * POST /api/whatsapp/status-callback
 * Message status callbacks from Twilio
 */
router.post('/status-callback', (req, res) => {
  const {
    MessageSid: messageSid,
    MessageStatus: status,
    ErrorCode: errorCode,
    ErrorMessage: errorMessage
  } = req.body;

  console.log(`WhatsApp message ${messageSid} status: ${status}`);

  if (errorCode) {
    console.error(`WhatsApp message error: ${errorCode} - ${errorMessage}`);
  }

  // Acknowledge status update
  res.status(200).send('');
});

module.exports = router;
