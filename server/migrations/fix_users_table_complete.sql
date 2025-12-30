-- Complete fix for users table schema to support RBAC implementation
-- This adds missing status column and updates role ENUM to match application expectations

-- Add status column if it doesn't exist
ALTER TABLE users 
ADD COLUMN status VARCHAR(20) DEFAULT 'active';

-- Update role ENUM to include 'consumer' and remove unused values
ALTER TABLE users 
MODIFY COLUMN role ENUM('consumer', 'admin') DEFAULT 'consumer';

-- Update existing users to use new role values
UPDATE users 
SET role = 'consumer' 
WHERE role IN ('viewer', 'contributor');

-- Update existing users to have active status if null
UPDATE users 
SET status = 'active' 
WHERE status IS NULL OR status = '';

-- Show the updated table structure
DESCRIBE users;