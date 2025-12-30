-- Migration: Add User Preferences
-- Description: Adds user_preferences table to store UI preferences like goal display mode and selected domain
-- Date: 2025-10-31

USE ai_use_case_repository;

-- Create user_preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id VARCHAR(36) NOT NULL,
  preference_key VARCHAR(100) NOT NULL,
  preference_value TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_user_preference (user_id, preference_key),
  INDEX idx_user_prefs_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- Migration complete
-- Supported preferences:
--   goal_display_mode: 'completion' or 'initiatives' (default: 'initiatives')
--   selected_domain_id: number (default: first available domain)
