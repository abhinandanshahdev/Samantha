-- Migration: Add Kanban delivery tracking fields
-- Date: 2025-01-24
-- Description: Adds kanban_pillar (delivery status) and expected_delivery_date fields for roadmap/kanban view

-- Add kanban_pillar column with ENUM constraint and comment
ALTER TABLE use_cases ADD COLUMN kanban_pillar
  VARCHAR(50) DEFAULT 'backlog' NOT NULL
  COMMENT 'Delivery status for kanban/roadmap view'
  CHECK (kanban_pillar IN ('backlog', 'prioritised', 'in_progress', 'completed', 'blocked', 'slow_burner', 'de_prioritised', 'on_hold'));

-- Add expected_delivery_date column with comment (format: 'MMM YYYY' like 'Jan 2025')
ALTER TABLE use_cases ADD COLUMN expected_delivery_date VARCHAR(7) NULL
  COMMENT 'Expected delivery month and year in format MMM YYYY';

-- Set default kanban_pillar to 'backlog' for all existing records
UPDATE use_cases SET kanban_pillar = 'backlog' WHERE kanban_pillar IS NULL;

-- Add index for performance on kanban queries
CREATE INDEX idx_use_cases_kanban_pillar ON use_cases(kanban_pillar);
