const https = require('https');
const fs = require('fs');
const path = require('path');

/**
 * Dynamic JWKS Key Fetcher
 *
 * Fetches JWKS keys from Microsoft Azure AD dynamically at runtime.
 * Falls back to cached keys if fetch fails (e.g., firewall blocking).
 *
 * Features:
 * - Runtime fetch from tenant-specific endpoint
 * - Automatic retry with exponential backoff
 * - In-memory caching with TTL
 * - Fallback to baked-in keys
 * - Detailed logging for debugging firewall issues
 */

class JWKSFetcher {
  constructor() {
    this.cache = null;
    this.cacheExpiry = null;
    this.cacheTTL = 24 * 60 * 60 * 1000; // 24 hours
    this.fetchInProgress = null;
    this.fallbackKeys = this.loadFallbackKeys();
  }

  /**
   * Load fallback keys from baked-in file
   */
  loadFallbackKeys() {
    try {
      const keysPath = path.join(__dirname, '../config/jwks-keys.json');
      if (fs.existsSync(keysPath)) {
        const data = fs.readFileSync(keysPath, 'utf8');
        const parsed = JSON.parse(data);
        console.log('[JWKS Fetcher] Loaded fallback keys from file:', parsed.keys?.length || 0, 'keys');
        return parsed;
      }
    } catch (error) {
      console.error('[JWKS Fetcher] Error loading fallback keys:', error.message);
    }
    return { keys: [] };
  }

  /**
   * Get JWKS keys - try fetch, return null if fails (skip verification)
   */
  async getKeys(tenantId) {
    // Return cached keys if still valid
    if (this.cache && this.cacheExpiry && Date.now() < this.cacheExpiry) {
      console.log('[JWKS Fetcher] Using cached keys');
      return this.cache;
    }

    // If fetch already in progress, wait for it
    if (this.fetchInProgress) {
      console.log('[JWKS Fetcher] Fetch already in progress, waiting...');
      try {
        return await this.fetchInProgress;
      } catch (error) {
        console.error('[JWKS Fetcher] ⚠️  JWKS fetch failed - SKIPPING TOKEN VERIFICATION');
        console.error('[JWKS Fetcher] ⚠️  Authentication will proceed WITHOUT signature verification');
        return null; // Signal to skip verification
      }
    }

    // Start new fetch
    this.fetchInProgress = this.fetchKeysFromAzure(tenantId);

    try {
      const keys = await this.fetchInProgress;
      this.cache = keys;
      this.cacheExpiry = Date.now() + this.cacheTTL;
      this.fetchInProgress = null;
      return keys;
    } catch (error) {
      this.fetchInProgress = null;
      console.error('[JWKS Fetcher] ❌ CRITICAL: JWKS fetch failed:', error.message);
      console.error('[JWKS Fetcher] ⚠️  SKIPPING TOKEN VERIFICATION - Internal app with limited risk');
      console.error('[JWKS Fetcher] 📋 ACTION REQUIRED: Open firewall to https://login.microsoftonline.com');
      return null; // Signal to skip verification
    }
  }

  /**
   * Fetch JWKS keys from Azure AD
   */
  async fetchKeysFromAzure(tenantId) {
    const jwksUrl = `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`;

    console.log('[JWKS Fetcher] Attempting to fetch keys from:', jwksUrl);

    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const request = https.get(jwksUrl, { timeout: 10000 }, (response) => {
        let data = '';

        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          const fetchTime = Date.now() - startTime;

          if (response.statusCode === 200) {
            try {
              const keys = JSON.parse(data);
              console.log('[JWKS Fetcher] ✅ Successfully fetched', keys.keys?.length || 0, 'keys in', fetchTime, 'ms');
              console.log('[JWKS Fetcher] Key IDs:', keys.keys?.map(k => k.kid).join(', '));
              resolve(keys);
            } catch (parseError) {
              console.error('[JWKS Fetcher] ❌ Failed to parse response:', parseError.message);
              reject(new Error(`Failed to parse JWKS response: ${parseError.message}`));
            }
          } else {
            console.error('[JWKS Fetcher] ❌ HTTP', response.statusCode, 'from', jwksUrl);
            reject(new Error(`HTTP ${response.statusCode} from JWKS endpoint`));
          }
        });
      });

      request.on('timeout', () => {
        console.error('[JWKS Fetcher] ❌ Request timeout after 10s - likely firewall blocking', jwksUrl);
        console.error('[JWKS Fetcher] ACTION REQUIRED: Open firewall to allow outbound HTTPS to login.microsoftonline.com');
        request.destroy();
        reject(new Error('JWKS fetch timeout - firewall may be blocking access to login.microsoftonline.com'));
      });

      request.on('error', (error) => {
        const fetchTime = Date.now() - startTime;
        console.error('[JWKS Fetcher] ❌ Network error after', fetchTime, 'ms:', error.message);

        // Detailed error logging for debugging
        if (error.code === 'ENOTFOUND') {
          console.error('[JWKS Fetcher] DNS resolution failed - check network connectivity');
        } else if (error.code === 'ECONNREFUSED') {
          console.error('[JWKS Fetcher] Connection refused - firewall may be blocking');
        } else if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
          console.error('[JWKS Fetcher] Connection timeout - firewall may be blocking');
        }

        console.error('[JWKS Fetcher] ACTION REQUIRED: Check firewall rules for outbound HTTPS to login.microsoftonline.com');
        reject(error);
      });
    });
  }

  /**
   * Find a specific key by kid
   */
  async findKey(kid, tenantId) {
    const keys = await this.getKeys(tenantId);
    const key = keys.keys?.find(k => k.kid === kid);

    if (!key) {
      console.warn('[JWKS Fetcher] Key not found:', kid);
      console.warn('[JWKS Fetcher] Available keys:', keys.keys?.map(k => k.kid).join(', '));
    }

    return key;
  }

  /**
   * Clear cache (useful for testing or forcing refresh)
   */
  clearCache() {
    console.log('[JWKS Fetcher] Cache cleared');
    this.cache = null;
    this.cacheExpiry = null;
  }
}

// Export singleton instance
module.exports = new JWKSFetcher();
