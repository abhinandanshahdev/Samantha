-- Migration: Add Multi-Domain Support
-- Description: Adds domain tables and updates existing tables to support multiple domains
-- Date: 2025-10-27

-- Step 1: Create domains table
CREATE TABLE IF NOT EXISTS domains (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  type ENUM('ai', 'data', 'infosec', 'infrastructure', 'custom') NOT NULL DEFAULT 'custom',
  hero_message TEXT,
  subtitle VARCHAR(255) DEFAULT 'Strategic Initiatives @ DoF',
  config_json JSON,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_domain_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- Step 2: Create domain_users table for access control
CREATE TABLE IF NOT EXISTS domain_users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id VARCHAR(36) NOT NULL,
  domain_id INT NOT NULL,
  role ENUM('viewer', 'contributor', 'admin') DEFAULT 'viewer',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_domain (user_id, domain_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- Step 3: Add domain_id to use_cases table
ALTER TABLE use_cases
ADD COLUMN domain_id INT DEFAULT NULL AFTER id,
ADD KEY idx_domain_id (domain_id);

-- Add foreign key constraint
ALTER TABLE use_cases
ADD CONSTRAINT fk_use_cases_domain
FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE RESTRICT;

-- Step 4: Add domain_id to strategic_pillars table
ALTER TABLE strategic_pillars
ADD COLUMN domain_id INT DEFAULT NULL AFTER id,
ADD KEY idx_pillar_domain_id (domain_id);

ALTER TABLE strategic_pillars
ADD CONSTRAINT fk_strategic_pillars_domain
FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE RESTRICT;

-- Step 5: Add domain_id to categories table
ALTER TABLE categories
ADD COLUMN domain_id INT DEFAULT NULL AFTER id,
ADD KEY idx_category_domain_id (domain_id);

ALTER TABLE categories
ADD CONSTRAINT fk_categories_domain
FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE RESTRICT;

-- Step 6: Add domain_id to outcome_metrics table (SKIPPED - table doesn't exist in production)
-- Production uses 'outcomes' table instead, which will be migrated in add_domain_to_outcomes.sql
-- ALTER TABLE outcome_metrics
-- ADD COLUMN domain_id INT DEFAULT NULL AFTER id,
-- ADD KEY idx_outcome_domain_id (domain_id);

-- ALTER TABLE outcome_metrics
-- ADD CONSTRAINT fk_outcome_metrics_domain
-- FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE RESTRICT;

-- Step 7: Insert default "AI & Data Science" domain
INSERT INTO domains (id, name, type, hero_message, subtitle, is_active, config_json)
VALUES (
  1,
  'AI & Data Science',
  'ai',
  'Benchmark for Data & AI-Driven Excellence in Public Finance',
  'AI for AI @ DoF',
  true,
  JSON_OBJECT(
    'terminology', JSON_OBJECT(
      'initiative_singular', 'Initiative',
      'initiative_plural', 'Initiatives'
    ),
    'features', JSON_OBJECT(
      'complexity_fields', true,
      'ai_autocomplete', true
    )
  )
);

-- Step 8: Insert "DATA" domain
INSERT INTO domains (id, name, type, hero_message, subtitle, is_active, config_json)
VALUES (
  2,
  'Data Management',
  'data',
  'Excellence in Data Governance, Quality & Analytics',
  'Data Initiatives @ DoF',
  true,
  JSON_OBJECT(
    'terminology', JSON_OBJECT(
      'initiative_singular', 'Initiative',
      'initiative_plural', 'Initiatives'
    ),
    'features', JSON_OBJECT(
      'complexity_fields', true,
      'ai_autocomplete', false
    )
  )
);

-- Step 9: Migrate existing use_cases to AI domain
UPDATE use_cases SET domain_id = 1 WHERE domain_id IS NULL;

-- Step 10: Migrate existing strategic_pillars to AI domain
UPDATE strategic_pillars SET domain_id = 1 WHERE domain_id IS NULL;

-- Step 11: Migrate existing categories to AI domain
UPDATE categories SET domain_id = 1 WHERE domain_id IS NULL;

-- Step 12: Migrate existing outcome_metrics to AI domain (SKIPPED - table doesn't exist)
-- UPDATE outcome_metrics SET domain_id = 1 WHERE domain_id IS NULL;

-- Step 13: Make domain_id NOT NULL after migration
ALTER TABLE use_cases MODIFY COLUMN domain_id INT NOT NULL;
ALTER TABLE strategic_pillars MODIFY COLUMN domain_id INT NOT NULL;
ALTER TABLE categories MODIFY COLUMN domain_id INT NOT NULL;
-- ALTER TABLE outcome_metrics MODIFY COLUMN domain_id INT NOT NULL;

-- Step 14: Create default DATA domain pillars
INSERT INTO strategic_pillars (name, description, domain_id, created_date, updated_date)
VALUES
('Data Governance & Quality', 'Establish robust data governance frameworks and ensure high-quality data across all systems', 2, NOW(), NOW()),
('Data Analytics & Insights', 'Transform data into actionable insights through advanced analytics and visualization', 2, NOW(), NOW()),
('Data Infrastructure & Architecture', 'Build scalable, secure, and efficient data infrastructure and architecture', 2, NOW(), NOW());

-- Step 15: Create default DATA domain categories
INSERT INTO categories (name, description, domain_id, created_date, updated_date)
VALUES
('Data Pipeline Development', 'Building and maintaining data ingestion and transformation pipelines', 2, NOW(), NOW()),
('Data Quality Management', 'Initiatives focused on improving and monitoring data quality', 2, NOW(), NOW()),
('Analytics Platform', 'Developing analytics tools and platforms for data exploration', 2, NOW(), NOW()),
('Data Governance', 'Implementing data governance policies, standards, and compliance', 2, NOW(), NOW()),
('Master Data Management', 'Managing critical business data entities and reference data', 2, NOW(), NOW());

-- Step 16: Create default DATA domain outcomes (SKIPPED - will be done in add_domain_to_outcomes.sql)
-- INSERT INTO outcome_metrics (name, description, target_metric, current_progress, domain_id, created_at, updated_at)
-- VALUES
-- ('Data Quality Score', 'Percentage of data passing quality validation checks', 95.0, 0.0, 2, NOW(), NOW()),
-- ('Data Accessibility', 'Percentage of critical data accessible through self-service platforms', 90.0, 0.0, 2, NOW(), NOW()),
-- ('Governance Compliance', 'Percentage of data assets with proper governance controls', 100.0, 0.0, 2, NOW(), NOW());

-- Step 17: Grant all users access to both domains by default (as viewers)
-- This will be handled by application logic, but we can create a trigger or default access
-- For now, we'll let the application handle domain access assignment

-- Migration complete
-- To rollback, run the rollback script
