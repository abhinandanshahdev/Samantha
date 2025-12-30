-- Migration: Add domain_id to outcomes table
-- Description: Makes outcomes domain-specific so each domain can have its own KPIs
-- Date: 2025-10-27

-- Step 1: Add domain_id column to outcomes table
ALTER TABLE outcomes
ADD COLUMN domain_id INT DEFAULT NULL AFTER id,
ADD KEY idx_outcome_domain_id (domain_id);

-- Step 2: Assign existing outcomes to AI domain (domain_id = 1)
UPDATE outcomes SET domain_id = 1 WHERE domain_id IS NULL;

-- Step 3: Make domain_id NOT NULL after migration
ALTER TABLE outcomes MODIFY COLUMN domain_id INT NOT NULL;

-- Step 4: Add foreign key constraint
ALTER TABLE outcomes
ADD CONSTRAINT fk_outcomes_domain
FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE RESTRICT;

-- Step 5: Remove UNIQUE constraint on outcome_key since keys can be reused across domains
ALTER TABLE outcomes DROP INDEX outcome_key;

-- Step 6: Add composite unique constraint (outcome_key + domain_id)
ALTER TABLE outcomes ADD UNIQUE KEY unique_outcome_per_domain (outcome_key, domain_id);

-- Step 7: Insert default DATA domain outcomes
INSERT INTO outcomes (outcome_key, title, measure, progress, maturity, display_order, domain_id)
VALUES
('data_quality', 'Data Quality & Integrity', '% of datasets meeting quality standards', 75, NULL, 1, 2),
('data_accessibility', 'Data Accessibility & Democratization', '% of business users with self-service data access', 60, NULL, 2, 2),
('governance_compliance', 'Governance & Compliance', '% of data assets with proper governance controls', 80, NULL, 3, 2);

-- Migration complete
