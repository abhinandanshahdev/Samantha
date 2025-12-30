-- Migration: Add Agents Support
-- Description: Adds agent types, agents, and agent-initiative association tables
-- Date: 2025-11-15

-- Step 1: Create agent_types reference table
CREATE TABLE IF NOT EXISTS agent_types (
  id INT PRIMARY KEY AUTO_INCREMENT,
  domain_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_domain_agent_type (domain_id, name),
  FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE,
  INDEX idx_agent_types_domain (domain_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- Step 2: Create agents table
CREATE TABLE IF NOT EXISTS agents (
  id VARCHAR(36) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci PRIMARY KEY DEFAULT (UUID()),
  domain_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  problem_statement TEXT NOT NULL,
  solution_overview TEXT NOT NULL,
  technical_implementation TEXT,
  results_metrics TEXT,
  lessons_learned TEXT,
  agent_type_id INT NOT NULL,
  status ENUM('concept', 'proof_of_concept', 'validation', 'pilot', 'production') DEFAULT 'concept',
  department_id VARCHAR(36) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  author_id VARCHAR(36) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  owner_name VARCHAR(255) NULL,
  owner_email VARCHAR(255) NULL,
  strategic_impact ENUM('Low', 'Medium', 'High') DEFAULT 'Low',
  data_complexity ENUM('Low', 'Medium', 'High') DEFAULT 'Low',
  integration_complexity ENUM('Low', 'Medium', 'High') DEFAULT 'Low',
  intelligence_complexity ENUM('Low', 'Medium', 'High') DEFAULT 'Low',
  functional_complexity ENUM('Low', 'Medium', 'High') DEFAULT 'Low',
  justification TEXT,
  kanban_pillar VARCHAR(50) DEFAULT 'backlog' NOT NULL CHECK (kanban_pillar IN ('backlog', 'prioritised', 'in_progress', 'completed', 'blocked', 'slow_burner', 'de_prioritised', 'on_hold')) COMMENT 'Delivery status for kanban/roadmap view',
  expected_delivery_date VARCHAR(7) NULL COMMENT 'Expected delivery month and year in format MMM YYYY',
  created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_type_id) REFERENCES agent_types(id) ON DELETE RESTRICT,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_agents_domain (domain_id),
  INDEX idx_agents_type (agent_type_id),
  INDEX idx_agents_department (department_id),
  INDEX idx_agents_author (author_id),
  INDEX idx_agents_status (status),
  INDEX idx_agents_strategic_impact (strategic_impact),
  INDEX idx_agents_created_date (created_date),
  INDEX idx_agents_kanban_pillar (kanban_pillar)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- Step 3: Create agent_initiative_associations junction table
CREATE TABLE IF NOT EXISTS agent_initiative_associations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agent_id VARCHAR(36) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  use_case_id VARCHAR(36) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  created_by VARCHAR(36) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_agent_initiative (agent_id, use_case_id),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (use_case_id) REFERENCES use_cases(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_agent_initiatives_agent (agent_id),
  INDEX idx_agent_initiatives_use_case (use_case_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- Step 4: Create agent_likes table for social features
CREATE TABLE IF NOT EXISTS agent_likes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agent_id VARCHAR(36) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  user_id VARCHAR(36) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_agent_like (agent_id, user_id),
  INDEX idx_agent_likes_agent_id (agent_id),
  INDEX idx_agent_likes_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- Step 5: Extend comments table to support agents
ALTER TABLE comments
ADD COLUMN agent_id VARCHAR(36) NULL AFTER use_case_id,
ADD FOREIGN KEY fk_comments_agent (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
ADD INDEX idx_comments_agent (agent_id);

-- Update check constraint to ensure either use_case_id or agent_id is set (not both, not neither)
-- Note: MySQL doesn't support CHECK constraints on existing tables in older versions,
-- so we'll handle this validation at application level

-- Step 6: Insert default agent types for existing domains
-- Get all domain IDs and insert default agent types for each
INSERT INTO agent_types (domain_id, name, description)
SELECT id, 'Execution Agent', 'Agents that execute tasks and workflows autonomously'
FROM domains
WHERE NOT EXISTS (
  SELECT 1 FROM agent_types
  WHERE agent_types.domain_id = domains.id
  AND agent_types.name = 'Execution Agent'
);

INSERT INTO agent_types (domain_id, name, description)
SELECT id, 'Thinking Agent', 'Agents that analyze, reason, and provide strategic insights'
FROM domains
WHERE NOT EXISTS (
  SELECT 1 FROM agent_types
  WHERE agent_types.domain_id = domains.id
  AND agent_types.name = 'Thinking Agent'
);

INSERT INTO agent_types (domain_id, name, description)
SELECT id, 'Conversational Agent', 'Agents that interact with users through natural language'
FROM domains
WHERE NOT EXISTS (
  SELECT 1 FROM agent_types
  WHERE agent_types.domain_id = domains.id
  AND agent_types.name = 'Conversational Agent'
);

INSERT INTO agent_types (domain_id, name, description)
SELECT id, 'Decision Support Agent', 'Agents that provide recommendations and decision support'
FROM domains
WHERE NOT EXISTS (
  SELECT 1 FROM agent_types
  WHERE agent_types.domain_id = domains.id
  AND agent_types.name = 'Decision Support Agent'
);

INSERT INTO agent_types (domain_id, name, description)
SELECT id, 'Creative Agent', 'Agents that generate creative content and solutions'
FROM domains
WHERE NOT EXISTS (
  SELECT 1 FROM agent_types
  WHERE agent_types.domain_id = domains.id
  AND agent_types.name = 'Creative Agent'
);

INSERT INTO agent_types (domain_id, name, description)
SELECT id, 'Platform Agent', 'Agents that integrate with and manage platform services'
FROM domains
WHERE NOT EXISTS (
  SELECT 1 FROM agent_types
  WHERE agent_types.domain_id = domains.id
  AND agent_types.name = 'Platform Agent'
);

INSERT INTO agent_types (domain_id, name, description)
SELECT id, 'Control Agent', 'Agents that monitor, control, and orchestrate other agents'
FROM domains
WHERE NOT EXISTS (
  SELECT 1 FROM agent_types
  WHERE agent_types.domain_id = domains.id
  AND agent_types.name = 'Control Agent'
);

-- Migration complete
-- To rollback, drop tables in reverse order: agent_likes, agent_initiative_associations, agents, agent_types
-- And remove agent_id column from comments table
