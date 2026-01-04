-- Migration: Fix entity_id column length for chat attachments
-- Chat entity IDs can be UUID + "_default" which exceeds 36 characters
-- Example: a401c1a4-e803-11f0-ab0f-000d3a066857_default (45 chars)

-- Increase entity_id from VARCHAR(36) to VARCHAR(100)
ALTER TABLE attachments MODIFY COLUMN entity_id VARCHAR(100);
