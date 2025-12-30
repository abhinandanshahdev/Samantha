-- Migration: Add Domain Support to Departments
-- Description: Adds domain_id to departments table to make departments domain-specific
-- Date: 2025-11-02

-- Step 1: Add domain_id to departments table (nullable for now)
ALTER TABLE departments
ADD COLUMN domain_id INT DEFAULT NULL AFTER id,
ADD KEY idx_department_domain_id (domain_id);

-- Step 2: Add foreign key constraint
ALTER TABLE departments
ADD CONSTRAINT fk_departments_domain
FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE RESTRICT;

-- Step 3: Assign existing departments to the first domain (AI & Data Science, ID=1)
-- This is safe because we'll create domain-specific departments via seeding
UPDATE departments SET domain_id = 1 WHERE domain_id IS NULL;

-- Step 4: Make domain_id NOT NULL after assigning values
ALTER TABLE departments MODIFY COLUMN domain_id INT NOT NULL;

-- Step 5: Update unique constraint to be domain-scoped
ALTER TABLE departments DROP INDEX name;
ALTER TABLE departments ADD UNIQUE KEY unique_department_domain (name, domain_id);

-- Migration complete
-- Note: Run the seed_default_departments.js script to populate departments for other domains
