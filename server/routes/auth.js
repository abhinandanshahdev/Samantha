const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database-mysql-compat');
const { convertLegacyRole } = require('../middleware/roleMiddleware');

// Register endpoint
router.post('/register', async (req, res) => {
  const { email, name, password, role = 'consumer' } = req.body;
  
  // Convert role to new simplified system
  const newRole = convertLegacyRole(role);
  
  if (!email || !name || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  
  try {
    // Check if user already exists
    db.query('SELECT id FROM users WHERE email = ?', [email], async (err, results) => {
      if (err) {
        console.error('Error checking user:', err);
        return res.status(500).json({ error: 'Server error' });
      }
      
      if (results.length > 0) {
        return res.status(400).json({ error: 'User already exists' });
      }
      
      // Hash password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      
      // Create user
      const query = 'INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)';
      
      db.query(query, [email, name, hashedPassword, newRole], (err, result) => {
        if (err) {
          console.error('Error creating user:', err);
          return res.status(500).json({ error: 'Failed to create user' });
        }
        
        // For UUID primary keys, we need to fetch the created user
        db.query('SELECT id FROM users WHERE email = ? ORDER BY created_date DESC LIMIT 1', [email], (err, newResult) => {
          if (err) {
            console.error('Error fetching created user:', err);
            return res.status(500).json({ error: 'Failed to fetch created user' });
          }
          
          const userId = newResult[0].id;

          // Generate JWT token
          const token = jwt.sign(
            { id: userId, email, role },
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
          );
          
          res.status(201).json({
            message: 'User created successfully',
            token,
            user: {
              id: userId,
              email,
              name,
              role,
              email_verified: false
            }
          });
        });
      });
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login endpoint
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  
  // Find user
  db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
    if (err) {
      console.error('Error finding user:', err);
      return res.status(500).json({ error: 'Server error' });
    }
    
    if (results.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = results[0];
    
    try {
      // Verify password
      const isMatch = await bcrypt.compare(password, user.password_hash);
      
      if (!isMatch) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      // Generate JWT token
      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET || 'fallback_secret',
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
      );
      
      res.json({
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          email_verified: user.email_verified,
          created_date: user.created_date
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });
});

// Verify token middleware
const verifyToken = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');

    // Handle both possible field names for backward compatibility
    req.user = {
      id: decoded.id || decoded.userId,
      email: decoded.email,
      role: decoded.role
    };

    next();
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Get current user
router.get('/me', verifyToken, (req, res) => {
  db.query('SELECT id, email, name, role, email_verified, created_date FROM users WHERE id = ?', 
    [req.user.id], (err, results) => {
    if (err) {
      console.error('Error fetching user:', err);
      return res.status(500).json({ error: 'Server error' });
    }
    
    if (results.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(results[0]);
  });
});

// Azure AD SSO endpoint
router.post('/azure-ad', async (req, res) => {
  const { azure_ad_id, email, name, access_token } = req.body;
  
  if (!azure_ad_id || !email || !name) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  try {
    // Check if user exists by Azure AD ID
    db.query('SELECT id, email, name, role FROM users WHERE azure_ad_id = ?', 
      [azure_ad_id], async (err, results) => {
      if (err) {
        console.error('Error checking Azure AD user:', err);
        return res.status(500).json({ error: 'Server error' });
      }
      
      let userId;
      let userRole;
      
      if (results.length > 0) {
        // User exists, update their info
        userId = results[0].id;
        userRole = results[0].role;
        
        db.query('UPDATE users SET name = ?, email = ? WHERE id = ?',
          [name, email, userId], (err) => {
          if (err) {
            console.error('Error updating Azure AD user:', err);
            return res.status(500).json({ error: 'Failed to update user' });
          }
        });
      } else {
        // Create new user
        const insertQuery = 'INSERT INTO users (azure_ad_id, email, name, role, email_verified) VALUES (?, ?, ?, ?, ?)';
        
        db.query(insertQuery, [azure_ad_id, email, name, 'consumer', true], (err, result) => {
          if (err) {
            console.error('Error creating Azure AD user:', err);
            return res.status(500).json({ error: 'Failed to create user' });
          }
          
          // Get the created user ID
          db.query('SELECT id, role FROM users WHERE azure_ad_id = ?', [azure_ad_id], (err, newResult) => {
            if (err || newResult.length === 0) {
              console.error('Error fetching created Azure AD user:', err);
              return res.status(500).json({ error: 'Failed to fetch created user' });
            }
            
            userId = newResult[0].id;
            userRole = newResult[0].role;
            
            // Generate JWT token
            const token = jwt.sign(
              { id: userId, email, role: userRole },
              process.env.JWT_SECRET || 'your-secret-key',
              { expiresIn: '7d' }
            );
            
            res.json({
              token,
              user: {
                id: userId,
                email,
                name,
                role: userRole
              }
            });
          });
        });
        
        return; // Exit early since we're handling the response in the callback
      }
      
      // For existing users, generate token immediately
      const token = jwt.sign(
        { id: userId, email, role: userRole },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );
      
      res.json({
        token,
        user: {
          id: userId,
          email,
          name,
          role: userRole
        }
      });
    });
  } catch (error) {
    console.error('Azure AD authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// Update user profile
router.put('/profile', verifyToken, (req, res) => {
  const { name } = req.body;
  
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Display name is required' });
  }

  const trimmedName = name.trim();
  
  if (trimmedName.length > 100) {
    return res.status(400).json({ error: 'Display name must be 100 characters or less' });
  }

  db.query('UPDATE users SET name = ? WHERE id = ?', 
    [trimmedName, req.user.id], (err, result) => {
    if (err) {
      console.error('Error updating user profile:', err);
      return res.status(500).json({ error: 'Failed to update profile' });
    }
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Return updated user data
    db.query('SELECT id, email, name, role, email_verified, created_date FROM users WHERE id = ?', 
      [req.user.id], (err, results) => {
      if (err) {
        console.error('Error fetching updated user:', err);
        return res.status(500).json({ error: 'Profile updated but failed to fetch updated data' });
      }
      
      if (results.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      const user = results[0];
      res.json({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        email_verified: user.email_verified,
        created_date: user.created_date
      });
    });
  });
});

// Migration route to convert legacy roles to simplified roles - Admin only
router.post('/migrate-roles', verifyToken, (req, res) => {
  // Only allow admin to run this migration
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  // Get all users with their current roles
  db.query('SELECT id, email, role FROM users', (err, users) => {
    if (err) {
      console.error('Error fetching users for migration:', err);
      return res.status(500).json({ error: 'Failed to fetch users' });
    }

    let updated = 0;
    let errors = 0;
    const results = [];

    if (users.length === 0) {
      return res.json({
        message: 'No users found to migrate',
        updated: 0,
        errors: 0,
        results: []
      });
    }

    users.forEach((user, index) => {
      const oldRole = user.role;
      const newRole = convertLegacyRole(oldRole);
      
      if (oldRole === newRole) {
        // Role doesn't need to change
        results.push({
          email: user.email,
          oldRole: oldRole,
          newRole: newRole,
          status: 'no change needed'
        });
        
        // Check if this is the last user
        if (index === users.length - 1) {
          return res.json({
            message: 'Role migration completed',
            updated: updated,
            errors: errors,
            results: results
          });
        }
        return;
      }

      // Update the user's role
      db.query('UPDATE users SET role = ? WHERE id = ?', [newRole, user.id], (updateErr) => {
        if (updateErr) {
          console.error(`Error updating role for user ${user.email}:`, updateErr);
          errors++;
          results.push({
            email: user.email,
            oldRole: oldRole,
            newRole: newRole,
            status: 'error',
            error: updateErr.message
          });
        } else {
          updated++;
          results.push({
            email: user.email,
            oldRole: oldRole,
            newRole: newRole,
            status: 'updated'
          });
        }

        // Check if this is the last user
        if (index === users.length - 1) {
          res.json({
            message: 'Role migration completed',
            updated: updated,
            errors: errors,
            results: results
          });
        }
      });
    });
  });
});

module.exports = { router, verifyToken };