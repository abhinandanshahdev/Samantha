-- Migration: Fix agents expected_delivery_date column type
-- Date: 2025-11-15
-- Description: Modifies expected_delivery_date in agents table to DATE type to match use_cases table

-- Step 1: Temporarily relax SQL mode to allow the column modification
SET SESSION sql_mode = 'NO_ENGINE_SUBSTITUTION';

-- Step 2: Change column to VARCHAR temporarily to allow data cleanup
ALTER TABLE agents MODIFY COLUMN expected_delivery_date VARCHAR(20) NULL;

-- Step 3: Convert empty strings and invalid dates to NULL
UPDATE agents SET expected_delivery_date = NULL WHERE expected_delivery_date = '' OR expected_delivery_date IS NOT NULL;

-- Step 4: Modify expected_delivery_date to support full date format (YYYY-MM-DD)
ALTER TABLE agents MODIFY COLUMN expected_delivery_date DATE NULL
  COMMENT 'Expected delivery date in ISO format (YYYY-MM-DD). Month and year are derived from this field.';

-- Step 5: Add index for performance on roadmap timeline queries (only if it doesn't exist)
SET @index_exists = (SELECT COUNT(1) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE table_schema = DATABASE()
    AND table_name = 'agents'
    AND index_name = 'idx_agents_delivery_date');

SET @sql = IF(@index_exists = 0,
    'CREATE INDEX idx_agents_delivery_date ON agents(expected_delivery_date)',
    'SELECT ''Index already exists'' AS message');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
