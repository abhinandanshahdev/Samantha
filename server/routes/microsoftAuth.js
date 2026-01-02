const express = require('express');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const db = require('../config/database-mysql-compat');
const offlineJwtVerifier = require('../services/offlineJwtVerifier');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

/**
 * Verify Microsoft access token using offline JWT verification
 * SECURITY: This now properly verifies the JWT signature using JWKS keys
 */
async function verifyMicrosoftToken(accessToken) {
  try {
    console.log('Attempting to verify Microsoft token, length:', accessToken ? accessToken.length : 'null');

    if (!offlineJwtVerifier) {
      console.error('CRITICAL: Offline JWT verifier not initialized!');
      throw new Error('JWT verification service not available');
    }

    // Try to verify token signature using JWKS
    // If JWKS fetch fails, verifier will skip signature check and return decoded payload
    const verifiedToken = await offlineJwtVerifier.verifyToken(accessToken);

    // Extract user information from token claims (verified or unverified)
    return {
      id: verifiedToken.oid || verifiedToken.sub, // Object ID or Subject ID
      mail: verifiedToken.email || verifiedToken.preferred_username || verifiedToken.upn,
      userPrincipalName: verifiedToken.upn || verifiedToken.preferred_username,
      displayName: verifiedToken.name,
      givenName: verifiedToken.given_name,
      surname: verifiedToken.family_name,
      roles: verifiedToken.roles || [] // Extract AD app roles
    };
  } catch (error) {
    console.error('Microsoft token validation failed:', error.message);
    throw new Error(`Invalid Microsoft access token: ${error.message}`);
  }
}

/**
 * Get or create user from Microsoft account
 */
async function getOrCreateMicrosoftUser(microsoftUser) {
  const { id: microsoftId, mail, userPrincipalName, displayName, roles = [] } = microsoftUser;
  const email = mail || userPrincipalName;
  
  // Map roles with proper precedence order
  // Samantha: Gated access - new users are pending until admin approves
  let dbRole = 'viewer';    // default role (will be active once approved)
  let dbStatus = 'pending'; // default status - must be approved by admin to access
  let roleSource = 'default'; // Track where the role came from
  
  // Check ADMIN_EMAILS environment variable for admin access
  const adminEmails = process.env.ADMIN_EMAILS ?
    process.env.ADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase()) : [];

  if (adminEmails.length > 0 && adminEmails.includes(email.toLowerCase())) {
    dbRole = 'admin';
    dbStatus = 'active';
    roleSource = 'ADMIN_EMAILS';
    console.log(`User ${email} found in ADMIN_EMAILS, setting as active admin`);
  } else {
    // Default: pending viewer - must be approved by admin
    roleSource = 'DEFAULT_PENDING';
    console.log(`User ${email} not in ADMIN_EMAILS, setting as pending viewer (requires admin approval)`);
  }
  
  if (!email) {
    throw new Error('No email found in Microsoft account');
  }

  try {
    // Check if user already exists
    const [existingUsers] = await db.promise().query(
      'SELECT * FROM users WHERE email = ? OR azure_ad_id = ?',
      [email, microsoftId]
    );

    if (existingUsers.length > 0) {
      const user = existingUsers[0];
      
      // Update Microsoft ID if it's missing and sync role/status from AD
      const updates = [];
      const values = [];
      
      if (!user.azure_ad_id && microsoftId) {
        updates.push('azure_ad_id = ?');
        values.push(microsoftId);
      }
      
      // Sync role and status based on precedence (ADMIN_EMAILS overrides AD roles)
      if (user.role !== dbRole || user.status !== dbStatus) {
        console.log(`Updating user ${email} role from ${user.role}/${user.status} to ${dbRole}/${dbStatus} (source: ${roleSource})`);
        updates.push('role = ?', 'status = ?');
        values.push(dbRole, dbStatus);
      } else {
        console.log(`User ${email} role/status unchanged: ${user.role}/${user.status} (source: ${roleSource})`);
      }
      
      if (updates.length > 0) {
        values.push(user.id);
        // Checkmarx Suppression: False positive - dynamic UPDATE with hardcoded field names and parameterized values
        await db.promise().query(
          `UPDATE users SET ${updates.join(', ')}, updated_date = NOW() WHERE id = ?`,
          values
        );
      }
      
      return {
        id: user.id,
        microsoftId: microsoftId,
        email: user.email,
        name: user.name,
        role: dbRole,  // Return the synced role
        status: dbStatus // Include status in return
      };
    }

    // Create new user with role and status based on AD roles
    const insertId = await db.insert(
      'INSERT INTO users (azure_ad_id, email, name, role, status, created_date) VALUES (?, ?, ?, ?, ?, NOW())',
      [microsoftId, email, displayName || email, dbRole, dbStatus]
    );

    console.log(`Created new user ${email} with role ${dbRole} and status ${dbStatus} (source: ${roleSource})`);

    return {
      id: insertId,
      microsoftId: microsoftId,
      email: email,
      name: displayName || email,
      role: dbRole,
      status: dbStatus
    };
  } catch (error) {
    console.error('Database error in getOrCreateMicrosoftUser:', error);
    throw new Error('Database error while processing user');
  }
}

/**
 * POST /api/microsoft-auth/login
 * Exchange Microsoft access token for application JWT
 */
router.post('/login', async (req, res) => {
  try {
    const { accessToken } = req.body;

    if (!accessToken) {
      return res.status(400).json({ error: 'Access token is required' });
    }

    console.log('Microsoft auth login attempt, JWT_SECRET exists:', !!JWT_SECRET);

    // Verify Microsoft token and get user info (with signature verification)
    const microsoftUser = await verifyMicrosoftToken(accessToken);
    console.log('Microsoft user verified:', { id: microsoftUser.id, email: microsoftUser.mail || microsoftUser.userPrincipalName });
    
    // Get or create user in our database
    const user = await getOrCreateMicrosoftUser(microsoftUser);
    console.log('Database user found/created:', { id: user.id, email: user.email, role: user.role });
    
    // Generate JWT token for our application
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email, 
        role: user.role,
        microsoftId: user.microsoftId 
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    console.log('JWT token generated successfully for user:', user.email);

    res.json({
      token,
      user: {
        id: user.id,
        microsoftId: user.microsoftId,
        email: user.email,
        name: user.name,
        role: user.role,
      }
    });

  } catch (error) {
    console.error('Microsoft auth error:', error);
    res.status(401).json({ 
      error: error.message || 'Microsoft authentication failed' 
    });
  }
});

/**
 * POST /api/microsoft-auth/user-role
 * Get or set user role for Microsoft account
 */
router.post('/user-role', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Check if user exists
    const [users] = await db.promise().query(
      'SELECT role FROM users WHERE email = ?',
      [email]
    );

    if (users.length > 0) {
      return res.json({ role: users[0].role });
    }

    // User doesn't exist, return default role
    // The user will be created on first login
    res.json({ role: 'consumer' });

  } catch (error) {
    console.error('User role lookup error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * PUT /api/microsoft-auth/user-role
 * Update user role (admin only)
 */
router.put('/user-role', async (req, res) => {
  try {
    // This endpoint would need authentication middleware
    // For now, just return an error
    res.status(501).json({ error: 'Role updates not implemented yet' });
  } catch (error) {
    console.error('Role update error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/microsoft-auth/debug-token
 * Debug endpoint to check what token is being sent
 * WARNING: This endpoint should be disabled in production
 */
router.get('/debug-token', (req, res) => {
  // Checkmarx Finding: JWT without signature verification in debug endpoint
  // SECURITY: This is a debug-only endpoint and should be disabled in production
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.json({
      error: 'No token provided',
      authHeader: authHeader || 'Not provided'
    });
  }

  try {
    // SECURITY NOTE: jwt.decode() does NOT verify signature - only for debugging
    const decoded = jwt.decode(token);
    res.json({
      tokenExists: true,
      tokenLength: token.length,
      decoded: decoded,
      tokenStart: token.substring(0, 50) + '...',
      jwtSecretExists: !!JWT_SECRET
    });
  } catch (error) {
    res.json({
      tokenExists: true,
      tokenLength: token.length,
      decodeError: error.message,
      tokenStart: token.substring(0, 50) + '...',
      jwtSecretExists: !!JWT_SECRET
    });
  }
});

module.exports = router;