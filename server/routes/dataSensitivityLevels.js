const express = require('express');
const router = express.Router();
const db = require('../config/database-mysql-compat');
const { verifyToken } = require('./auth');

// Get all data sensitivity levels
router.get('/', verifyToken, (req, res) => {
  const query = 'SELECT id, name, description, display_order FROM data_sensitivity_levels ORDER BY display_order ASC';

  db.query(query, [], (err, results) => {
    if (err) {
      console.error('Error fetching data sensitivity levels:', err);
      return res.status(500).json({ error: 'Failed to fetch data sensitivity levels' });
    }

    res.json(results);
  });
});

module.exports = router;
