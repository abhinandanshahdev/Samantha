-- Migration: Allow NULL for use_case_id in comments table
-- This enables comments to be associated with either use_cases or agents, but not both

-- Modify use_case_id to allow NULL values
ALTER TABLE comments MODIFY COLUMN use_case_id VARCHAR(36) NULL;

-- Add a check constraint to ensure at least one of use_case_id or agent_id is NOT NULL
-- Note: MySQL 8.0.16+ supports check constraints
ALTER TABLE comments ADD CONSTRAINT chk_comment_entity
  CHECK (
    (use_case_id IS NOT NULL AND agent_id IS NULL) OR
    (use_case_id IS NULL AND agent_id IS NOT NULL)
  );

-- Add comment to document the change
ALTER TABLE comments COMMENT = 'Comments can be associated with either a use_case (use_case_id) or an agent (agent_id), but not both';
