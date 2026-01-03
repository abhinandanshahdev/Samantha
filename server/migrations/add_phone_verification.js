/**
 * Migration: Add phone verification columns to users table
 * Run with: node server/migrations/add_phone_verification.js
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

async function runMigration() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ai_usecase',
    port: process.env.DB_PORT || 3306
  });

  console.log('Connected to database. Running phone verification migration...');

  try {
    // Check if phone_number column exists
    const [columns] = await connection.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'phone_number'`
    );

    if (columns.length === 0) {
      // Add phone columns
      await connection.execute(`
        ALTER TABLE users
        ADD COLUMN phone_number VARCHAR(20) DEFAULT NULL,
        ADD COLUMN phone_verified TINYINT(1) DEFAULT 0,
        ADD COLUMN phone_verified_date TIMESTAMP NULL
      `);
      console.log('Added phone_number, phone_verified, and phone_verified_date columns to users table');

      // Add index on phone_number
      await connection.execute(`
        ALTER TABLE users ADD INDEX idx_users_phone (phone_number)
      `);
      console.log('Added index idx_users_phone');
    } else {
      console.log('Phone columns already exist, skipping...');
    }

    // Check if whatsapp_sessions table exists
    const [tables] = await connection.execute(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'whatsapp_sessions'`
    );

    if (tables.length === 0) {
      // Create whatsapp_sessions table for Phase 6
      await connection.execute(`
        CREATE TABLE whatsapp_sessions (
          id INT AUTO_INCREMENT PRIMARY KEY,
          phone_number VARCHAR(20) NOT NULL,
          user_id VARCHAR(36),
          session_id VARCHAR(36),
          conversation_history JSON,
          last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_whatsapp_phone (phone_number),
          INDEX idx_whatsapp_user (user_id)
        )
      `);
      console.log('Created whatsapp_sessions table');
    } else {
      console.log('whatsapp_sessions table already exists, skipping...');
    }

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

runMigration().catch(console.error);
