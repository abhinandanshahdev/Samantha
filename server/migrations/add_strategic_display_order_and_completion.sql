-- Migration: Add Display Order and Completion Percentage to Strategic Pillars and Goals
-- Description: Adds display_order to strategic_pillars and display_order + completion_percentage to strategic_goals
-- Date: 2025-10-31

USE ai_use_case_repository;

-- Step 1: Add display_order to strategic_pillars table
ALTER TABLE strategic_pillars
ADD COLUMN display_order INT NOT NULL DEFAULT 0 AFTER description;

-- Step 2: Add completion_percentage and display_order to strategic_goals table
ALTER TABLE strategic_goals
ADD COLUMN completion_percentage INT DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100) AFTER status,
ADD COLUMN display_order INT NOT NULL DEFAULT 0 AFTER completion_percentage;

-- Step 3: Initialize display_order for existing strategic_pillars based on their ID order
-- This sets display_order based on creation order (by ID)
SET @row_number = 0;
UPDATE strategic_pillars
SET display_order = (@row_number:=@row_number + 1)
ORDER BY id;

-- Step 4: Initialize display_order for existing strategic_goals within each pillar
-- For each pillar, order goals by creation date
SET @row_number = 0;
SET @pillar_id = 0;

UPDATE strategic_goals sg
JOIN (
  SELECT
    id,
    strategic_pillar_id,
    @row_number := IF(@pillar_id = strategic_pillar_id, @row_number + 1, 1) AS new_display_order,
    @pillar_id := strategic_pillar_id
  FROM strategic_goals
  ORDER BY strategic_pillar_id, created_date
) AS numbered ON sg.id = numbered.id
SET sg.display_order = numbered.new_display_order;

-- Step 5: Create indexes for better performance on ordering
CREATE INDEX idx_strategic_pillars_display_order ON strategic_pillars(display_order);
CREATE INDEX idx_strategic_goals_display_order ON strategic_goals(strategic_pillar_id, display_order);

-- Migration complete
-- The display_order fields allow custom ordering of pillars and goals
-- The completion_percentage field allows tracking progress of strategic goals
