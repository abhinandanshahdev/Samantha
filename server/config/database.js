const mysql = require('mysql2');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Database connection configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'ai_use_case_repository',
  port: process.env.DB_PORT || 3306
};

// Add SSL configuration for Azure MySQL (only if not localhost)
if (process.env.DB_HOST && !process.env.DB_HOST.includes('localhost') && !process.env.DB_HOST.includes('127.0.0.1')) {
  // Azure MySQL Flexible Server SSL configuration
  dbConfig.ssl = {
    rejectUnauthorized: false,
    // Force SSL mode for Azure MySQL
    secureConnection: true,
    // Set minimum TLS version
    minVersion: 'TLSv1.2'
  };
  
  // Add connection flags to ensure SSL is used
  dbConfig.connectTimeout = 10000;
  dbConfig.acquireTimeout = 10000;
  dbConfig.timeout = 10000;
  
  console.log('SSL enabled for database connection with Azure MySQL configuration');
}

// Database connection
const connection = mysql.createConnection(dbConfig);

// Connect to database
connection.connect((err) => {
  if (err) {
    console.error('Database connection failed:', err);
    process.exit(1);
  }
  console.log('Connected to MySQL database');
});

// Export both the connection and promise-based interface
module.exports = connection;
module.exports.promise = () => connection.promise();