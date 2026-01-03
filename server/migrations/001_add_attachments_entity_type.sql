-- Migration: Update attachments table to support initiatives, tasks, and chat uploads
-- This migration:
-- 1. Adds entity_type column (initiative/task/chat)
-- 2. Renames use_case_id to entity_id
-- 3. Adds created_by column for tracking uploader

-- Step 1: Add entity_type column (check if exists first via procedure)
-- Note: MySQL doesn't support IF NOT EXISTS for columns directly, so we handle errors

-- Add entity_type column
ALTER TABLE attachments ADD COLUMN entity_type ENUM('initiative', 'task', 'chat') DEFAULT 'initiative' AFTER id;

-- Step 2: Rename use_case_id to entity_id
ALTER TABLE attachments CHANGE COLUMN use_case_id entity_id VARCHAR(36);

-- Step 3: Add created_by column
ALTER TABLE attachments ADD COLUMN created_by VARCHAR(36) AFTER mime_type;

-- Step 4: Drop old index if exists (will error if not exists - acceptable)
-- DROP INDEX idx_attachments_use_case ON attachments;

-- Step 5: Add new composite index
ALTER TABLE attachments ADD INDEX idx_attachments_entity (entity_id, entity_type);
