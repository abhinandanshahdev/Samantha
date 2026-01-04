-- Migration: Fix entity_id column length in audit_logs table
-- Ensure consistency with attachments table fix

ALTER TABLE audit_logs MODIFY COLUMN entity_id VARCHAR(100);
