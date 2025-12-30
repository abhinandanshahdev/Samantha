-- Add status column to users table for RBAC implementation
-- This migration adds support for user account status (active, pending, inactive)

-- Add status column if it doesn't exist
ALTER TABLE users 
ADD COLUMN status VARCHAR(20) DEFAULT 'active' 
AFTER role;

-- Update existing users to have active status
UPDATE users 
SET status = 'active' 
WHERE status IS NULL;

-- Add comment to table
ALTER TABLE users 
COMMENT = 'User accounts with support for traditional and Azure AD authentication, including status tracking';

-- Verify the change
DESCRIBE users;