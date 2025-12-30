-- Migration: Modify expected_delivery_date for roadmap timeline
-- Date: 2025-01-25
-- Description: Modifies expected_delivery_date to DATE type for roadmap timeline view
--              Month and year will be derived from the date field as needed

-- Modify expected_delivery_date to support full date format (YYYY-MM-DD)
-- This will convert existing 'MMM YYYY' strings to NULL since they can't be converted to DATE
ALTER TABLE use_cases MODIFY COLUMN expected_delivery_date DATE NULL
  COMMENT 'Expected delivery date in ISO format (YYYY-MM-DD). Month and year are derived from this field.';

-- Add index for performance on roadmap timeline queries
CREATE INDEX idx_use_cases_delivery_date ON use_cases(expected_delivery_date);
