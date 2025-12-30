#!/usr/bin/env node

/**
 * Fetch JWKS Keys from Microsoft Entra ID (Azure AD)
 *
 * This script fetches the public signing keys from Microsoft's JWKS endpoint
 * and saves them locally for offline JWT verification.
 *
 * Usage: node scripts/fetch-jwks-keys.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const OUTPUT_DIR = path.join(__dirname, '../server/config');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'jwks-keys.json');

// Try to get tenant ID from different sources
let tenantId = process.env.TENANT_ID;

// If not found, try to extract from MSAL_AUTHORITY
if (!tenantId && process.env.MSAL_AUTHORITY) {
  const authorityMatch = process.env.MSAL_AUTHORITY.match(/microsoftonline\.com\/([^\/]+)/);
  if (authorityMatch && authorityMatch[1] && authorityMatch[1] !== 'consumers' && authorityMatch[1] !== 'common') {
    tenantId = authorityMatch[1];
    console.log(`Extracted tenant ID from MSAL_AUTHORITY: ${tenantId}`);
  }
}

// Default to 'common' if still not found (works for multi-tenant apps)
if (!tenantId) {
  tenantId = 'common';
  console.log('Using "common" endpoint (works for all Microsoft accounts)');
}

const JWKS_URL = `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`;

console.log('Fetching JWKS keys from Microsoft...');
console.log(`URL: ${JWKS_URL}`);

https.get(JWKS_URL, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    if (res.statusCode !== 200) {
      console.error(`ERROR: Failed to fetch keys. HTTP ${res.statusCode}`);
      console.error('Response:', data);
      process.exit(1);
    }

    try {
      // Parse and validate JSON
      const jwks = JSON.parse(data);

      if (!jwks.keys || !Array.isArray(jwks.keys) || jwks.keys.length === 0) {
        console.error('ERROR: Invalid JWKS response - no keys found');
        process.exit(1);
      }

      // Ensure output directory exists
      if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      }

      // Save to file
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(jwks, null, 2));

      console.log(`SUCCESS: Fetched ${jwks.keys.length} signing keys`);
      console.log(`Saved to: ${OUTPUT_FILE}`);
      console.log('\nKeys:');
      jwks.keys.forEach((key, index) => {
        console.log(`  ${index + 1}. kid: ${key.kid}, alg: ${key.alg}, use: ${key.use}`);
      });
      console.log(`\nKeys fetched at: ${new Date().toISOString()}`);
      console.log('Remember to update these keys periodically (recommended: weekly)');

    } catch (error) {
      console.error('ERROR: Failed to parse JWKS response:', error.message);
      process.exit(1);
    }
  });
}).on('error', (error) => {
  console.error('ERROR: Failed to fetch JWKS keys:', error.message);
  console.error('Make sure you have internet connectivity');
  process.exit(1);
});
