-- Migration: Add azure_ad_id column to users table for MSAL authentication
-- This migration adds support for Microsoft Azure AD authentication

-- Add azure_ad_id column if it doesn't exist
ALTER TABLE users 
ADD COLUMN azure_ad_id VARCHAR(255) UNIQUE DEFAULT NULL;

-- Create index for faster lookups
CREATE INDEX idx_users_azure_ad_id ON users(azure_ad_id);

-- Update the table comment
ALTER TABLE users COMMENT = 'User accounts with support for both traditional and Azure AD authentication';

-- Show the updated table structure
DESCRIBE users;