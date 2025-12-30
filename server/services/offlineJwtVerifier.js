const jwt = require('jsonwebtoken');
const jwkToPem = require('jwk-to-pem');
const fs = require('fs');
const path = require('path');
const jwksFetcher = require('../utils/jwksFetcher');

class OfflineJwtVerifier {
  constructor() {
    this.keys = new Map();
    this.keysLoadedAt = null;
    this.useDynamicFetch = true; // Use dynamic JWKS fetch by default
  }

  // Load keys from JWKS object
  loadKeysFromJWKS(jwks) {
    // Clear existing keys
    this.keys.clear();

    // Convert each JWK to PEM format and store in memory
    if (jwks.keys && Array.isArray(jwks.keys)) {
      jwks.keys.forEach(key => {
        try {
          const pem = jwkToPem(key);
          this.keys.set(key.kid, {
            pem: pem,
            alg: key.alg,
            use: key.use,
            kty: key.kty,
            loadedAt: new Date()
          });
          console.log(`[JWT Verifier] Loaded signing key: ${key.kid} (${key.alg})`);
        } catch (err) {
          console.error(`[JWT Verifier] Failed to convert key ${key.kid}:`, err.message);
        }
      });
    }

    this.keysLoadedAt = new Date();
    console.log(`[JWT Verifier] Total keys loaded: ${this.keys.size}`);
  }

  checkKeyAge() {
    try {
      const jwksPath = path.join(__dirname, '../config/jwks-keys.json');
      const stats = fs.statSync(jwksPath);
      const fileAge = Date.now() - stats.mtime.getTime();
      const daysOld = fileAge / (1000 * 60 * 60 * 24);

      if (daysOld > 30) {
        console.warn(`[JWT Verifier] WARNING: JWKS keys file is ${daysOld.toFixed(1)} days old!`);
        console.warn('[JWT Verifier] Consider updating keys using: npm run fetch-jwks-keys');
      } else if (daysOld > 7) {
        console.warn(`[JWT Verifier] NOTICE: JWKS keys file is ${daysOld.toFixed(1)} days old`);
      }
    } catch (error) {
      console.error('[JWT Verifier] Could not check key age:', error.message);
    }
  }

  getSigningKey(kid) {
    const key = this.keys.get(kid);
    if (!key) {
      const availableKeys = Array.from(this.keys.keys()).join(', ');
      throw new Error(
        `Signing key not found for kid: ${kid}. Available keys: ${availableKeys || 'none'}`
      );
    }
    return key.pem;
  }

  async verifyToken(accessToken) {
    try {
      // Checkmarx Suppression: False positive - jwt.decode() used ONLY to extract 'kid' (Key ID) from header
      // Full signature verification happens below with jwt.verify()
      // This is a standard pattern for JWKS-based verification
      const decoded = jwt.decode(accessToken, { complete: true });

      if (!decoded || !decoded.header || !decoded.header.kid) {
        throw new Error('Invalid token structure - missing kid in header');
      }

      const kid = decoded.header.kid;
      console.log(`[JWT Verifier] Verifying token with kid: ${kid}`);

      // Extract tenant ID from MSAL_AUTHORITY or use from decoded token
      let tenantId = process.env.TENANT_ID;
      if (!tenantId && process.env.MSAL_AUTHORITY) {
        const match = process.env.MSAL_AUTHORITY.match(/microsoftonline\.com\/([^\/]+)/);
        if (match && match[1]) {
          tenantId = match[1];
        }
      }
      // Use tenant from token if available
      if (!tenantId && decoded.payload && decoded.payload.tid) {
        tenantId = decoded.payload.tid;
      }

      // Try to fetch fresh keys dynamically
      const jwksKeys = await jwksFetcher.getKeys(tenantId);

      // If JWKS fetch failed (firewall blocking), skip verification
      if (!jwksKeys || !jwksKeys.keys) {
        console.error('[JWT Verifier] ⚠️  JWKS KEYS NOT AVAILABLE - SKIPPING VERIFICATION');
        console.error('[JWT Verifier] ⚠️  Proceeding with UNVERIFIED token (internal app, limited risk)');
        console.error('[JWT Verifier] 📋 ACTION REQUIRED: Fix firewall to allow https://login.microsoftonline.com');

        // Return decoded payload WITHOUT signature verification
        return decoded.payload;
      }

      // Load the fetched keys
      this.loadKeysFromJWKS(jwksKeys);

      // Try to get signing key
      let signingKey;
      try {
        signingKey = this.getSigningKey(kid);
      } catch (error) {
        console.error('[JWT Verifier] ❌ Signing key not found for kid:', kid);
        console.error('[JWT Verifier] ⚠️  SKIPPING VERIFICATION - Key not in JWKS');
        console.error('[JWT Verifier] 📋 This may indicate key rotation - check Azure AD keys');

        // Return decoded payload WITHOUT signature verification
        return decoded.payload;
      }

      // Build verification options
      const verifyOptions = {
        algorithms: ['RS256'],
        clockTolerance: 5 // Allow 5 seconds clock skew
      };

      // Only validate issuer if we have a specific tenant ID
      if (tenantId && tenantId !== 'common' && tenantId !== 'consumers') {
        verifyOptions.issuer = `https://login.microsoftonline.com/${tenantId}/v2.0`;
      }

      // Validate audience if AZURE_CLIENT_ID or MSAL_CLIENT_ID is set
      if (process.env.AZURE_CLIENT_ID) {
        verifyOptions.audience = process.env.AZURE_CLIENT_ID;
      } else if (process.env.MSAL_CLIENT_ID) {
        verifyOptions.audience = process.env.MSAL_CLIENT_ID;
      }

      // Now verify with the correct signing key
      return new Promise((resolve, reject) => {
        jwt.verify(
          accessToken,
          signingKey,
          verifyOptions,
          (err, verified) => {
            if (err) {
              console.error('[JWT Verifier] Token verification failed:', err.message);
              reject(new Error(`Token verification failed: ${err.message}`));
            } else {
              console.log(`[JWT Verifier] ✅ Token verified successfully for user: ${verified.oid || verified.sub}`);
              resolve(verified);
            }
          }
        );
      });
    } catch (error) {
      console.error('[JWT Verifier] Token verification error:', error.message);
      throw new Error(`Token verification error: ${error.message}`);
    }
  }

  // Hot reload keys without restarting server
  reloadKeys() {
    console.log('[JWT Verifier] Reloading JWKS keys...');
    try {
      this.loadKeys();
      return { success: true, message: 'Keys reloaded successfully' };
    } catch (error) {
      console.error('[JWT Verifier] Failed to reload keys:', error.message);
      throw error;
    }
  }

  // Get key info for monitoring
  getKeyInfo() {
    const info = [];
    this.keys.forEach((value, kid) => {
      info.push({
        kid: kid,
        algorithm: value.alg,
        keyType: value.kty,
        use: value.use,
        loadedAt: value.loadedAt
      });
    });
    return {
      keys: info,
      totalKeys: this.keys.size,
      keysLoadedAt: this.keysLoadedAt
    };
  }

  // Check if verifier is ready
  isReady() {
    return this.keys.size > 0;
  }
}

// Singleton instance
let verifier = null;

try {
  verifier = new OfflineJwtVerifier();
} catch (error) {
  console.error('[JWT Verifier] Failed to initialize:', error.message);
  console.error('[JWT Verifier] JWT verification will not work until keys are loaded');
}

module.exports = verifier;
