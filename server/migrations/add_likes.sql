-- Migration: Add likes functionality for AI initiatives
-- This migration is backward compatible - only adds new tables

-- Create likes table to track who liked which use case
CREATE TABLE IF NOT EXISTS likes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  use_case_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (use_case_id) REFERENCES use_cases(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_like (use_case_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- Create indexes for better query performance
CREATE INDEX idx_likes_use_case_id ON likes(use_case_id);
CREATE INDEX idx_likes_user_id ON likes(user_id);
