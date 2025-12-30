const db = require('../config/database-mysql-compat');

/**
 * Middleware to check if user has admin role
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Get user role from database to ensure it's current
  db.query('SELECT role FROM users WHERE id = ?', [req.user.id], (err, results) => {
    if (err) {
      console.error('Error checking user role:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userRole = results[0].role;
    
    if (userRole !== 'admin') {
      return res.status(403).json({ 
        error: 'Admin access required. Your current role is: ' + userRole,
        requiredRole: 'admin',
        currentRole: userRole
      });
    }

    next();
  });
};

/**
 * Middleware to check if user has consumer or admin role (any authenticated user)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const requireConsumerOrAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Get user role from database to ensure it's current
  db.query('SELECT role FROM users WHERE id = ?', [req.user.id], (err, results) => {
    if (err) {
      console.error('Error checking user role:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userRole = results[0].role;
    
    if (userRole !== 'admin' && userRole !== 'consumer') {
      return res.status(403).json({ 
        error: 'Access denied. Please contact an administrator.',
        requiredRole: 'consumer or admin',
        currentRole: userRole
      });
    }

    // Add role to request object for use in route handlers
    req.userRole = userRole;
    next();
  });
};

/**
 * Utility function to convert legacy roles to new simplified roles
 * @param {string} legacyRole - The old role value
 * @returns {string} The new role value
 */
const convertLegacyRole = (legacyRole) => {
  switch (legacyRole) {
    case 'admin':
      return 'admin';
    case 'contributor':
      return 'admin'; // Promote contributors to admin
    case 'viewer':
    case 'pending':
      return 'consumer';
    default:
      return 'consumer'; // Default to consumer for unknown roles
  }
};

module.exports = {
  requireAdmin,
  requireConsumerOrAdmin,
  convertLegacyRole
};