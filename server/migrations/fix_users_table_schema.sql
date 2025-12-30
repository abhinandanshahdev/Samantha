-- Comprehensive migration to fix users table schema for Azure deployment
-- This fixes column naming inconsistencies and adds missing columns

-- Add status column if it doesn't exist
ALTER TABLE users 
ADD COLUMN status VARCHAR(20) DEFAULT 'active' 
AFTER role;

-- Add updated_at column to match code expectations (keep updated_date for compatibility)
ALTER TABLE users 
ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- Update existing users to have active status if null
UPDATE users 
SET status = 'active' 
WHERE status IS NULL OR status = '';

-- Update updated_at to match updated_date for existing records
UPDATE users 
SET updated_at = updated_date 
WHERE updated_at IS NULL;

-- Add comment to table
ALTER TABLE users 
COMMENT = 'User accounts with support for traditional and Azure AD authentication, including status tracking';

-- Show the updated table structure
DESCRIBE users;