-- Migration: Add phone verification columns to users table
-- Also creates whatsapp_sessions table for WhatsApp integration

-- Add phone columns to users table
ALTER TABLE users ADD COLUMN phone_number VARCHAR(20) DEFAULT NULL;
ALTER TABLE users ADD COLUMN phone_verified TINYINT(1) DEFAULT 0;
ALTER TABLE users ADD COLUMN phone_verified_date TIMESTAMP NULL;

-- Add index on phone_number
ALTER TABLE users ADD INDEX idx_users_phone (phone_number);

-- Create whatsapp_sessions table
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  phone_number VARCHAR(20) NOT NULL,
  user_id VARCHAR(36),
  session_id VARCHAR(36),
  conversation_history JSON,
  last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_whatsapp_phone (phone_number),
  INDEX idx_whatsapp_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
