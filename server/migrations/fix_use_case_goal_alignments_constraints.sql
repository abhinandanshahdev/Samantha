-- Migration: Fix use_case_goal_alignments Foreign Key Constraints
-- Description: Adds missing CASCADE constraints to ensure alignment records are deleted when use cases or strategic goals are deleted
-- Date: 2025-10-30
-- Issue: When an initiative was deleted, the alignment records in use_case_goal_alignments were not deleted,
--        causing strategic goal counts to be incorrect

-- Step 1: Clean up any orphaned alignment records (use cases that no longer exist)
DELETE FROM use_case_goal_alignments
WHERE use_case_id NOT IN (SELECT id FROM use_cases);

-- Step 2: Clean up any orphaned alignment records (strategic goals that no longer exist)
DELETE FROM use_case_goal_alignments
WHERE strategic_goal_id NOT IN (SELECT id FROM strategic_goals);

-- Step 3: Add the missing foreign key constraints with CASCADE
ALTER TABLE use_case_goal_alignments
  ADD CONSTRAINT fk_ucga_use_case
    FOREIGN KEY (use_case_id) REFERENCES use_cases(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_ucga_strategic_goal
    FOREIGN KEY (strategic_goal_id) REFERENCES strategic_goals(id) ON DELETE CASCADE;
