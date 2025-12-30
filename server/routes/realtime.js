const express = require('express');
const OpenAI = require('openai');
const { DefaultAzureCredential } = require('@azure/identity');
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const router = express.Router();

// Using direct HTTP calls for Azure realtime sessions

router.post('/ephemeral-key', async (req, res) => {
  try {
    // Use environment variables for flexible configuration
    const realtimeEndpoint = process.env.REALTIME_ENDPOINT || process.env.AZURE_OPENAI_REALTIME_ENDPOINT;
    const realtimeApiKey = process.env.REALTIME_API_KEY || process.env.COMPASS_API_KEY || process.env.AZURE_OPENAI_REALTIME_KEY;
    const realtimeModel = process.env.REALTIME_MODEL || 'gpt-4o-realtime-preview-2024-12-17';

    if (!realtimeEndpoint || !realtimeApiKey) {
      throw new Error('Realtime API configuration missing. Set REALTIME_ENDPOINT and REALTIME_API_KEY environment variables.');
    }

    // Determine which service is being used based on endpoint
    const isAzure = realtimeEndpoint.includes('azure') || realtimeEndpoint.includes('cognitiveservices');
    const isCore42 = realtimeEndpoint.includes('core42');

    console.log(`Realtime API configuration: ${isCore42 ? 'Core42' : isAzure ? 'Azure' : 'Custom'}`);

    res.json({
      apiKey: realtimeApiKey,
      endpoint: realtimeEndpoint,
      model: realtimeModel,
      expires_at: new Date(Date.now() + 3600000).toISOString() // 1 hour from now
    });
  } catch (error) {
    console.error('Error providing realtime config:', error);
    res.status(500).json({
      error: error.message,
      details: 'Failed to provide realtime configuration'
    });
  }
});

module.exports = router;