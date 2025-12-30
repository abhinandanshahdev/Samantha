-- Migration: Add Data Sensitivity and Link Fields
-- Description: Adds data_sensitivity, roadmap_link, and value_realisation_link to use_cases and agents
-- Creates data_sensitivity_levels reference table
-- Date: 2025-11-17

USE ai_use_case_repository;

-- Step 1: Create data_sensitivity_levels reference table
CREATE TABLE IF NOT EXISTS data_sensitivity_levels (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  description VARCHAR(255),
  display_order INT NOT NULL DEFAULT 0,
  created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_display_order (display_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Step 2: Insert default data sensitivity levels
INSERT INTO data_sensitivity_levels (name, description, display_order) VALUES
('Public', 'Information that can be freely shared publicly', 1),
('Restricted', 'Information restricted to specific groups or individuals', 2),
('Confidential', 'Sensitive information requiring protection', 3),
('Secret', 'Highly classified information with strict access controls', 4)
ON DUPLICATE KEY UPDATE
  description = VALUES(description),
  display_order = VALUES(display_order);

-- Step 3: Add columns to use_cases table
ALTER TABLE use_cases
ADD COLUMN data_sensitivity VARCHAR(50) DEFAULT 'Public' AFTER department_id,
ADD COLUMN roadmap_link TEXT AFTER data_sensitivity,
ADD COLUMN value_realisation_link TEXT AFTER roadmap_link;

-- Step 4: Add columns to agents table
ALTER TABLE agents
ADD COLUMN data_sensitivity VARCHAR(50) DEFAULT 'Public' AFTER department_id,
ADD COLUMN roadmap_link TEXT AFTER data_sensitivity,
ADD COLUMN value_realisation_link TEXT AFTER roadmap_link;

-- Step 5: Create indexes for filtering
CREATE INDEX idx_use_cases_data_sensitivity ON use_cases(data_sensitivity);
CREATE INDEX idx_agents_data_sensitivity ON agents(data_sensitivity);

-- Migration complete
-- Data sensitivity levels are managed in the data_sensitivity_levels table
-- Roadmap and value realisation links store URLs/hyperlinks as text
