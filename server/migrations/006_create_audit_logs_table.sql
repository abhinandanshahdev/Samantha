-- Migration: Create audit_logs table for tracking system events
-- This table logs important events like status changes, new entities, comments, and likes

CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(36) PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  entity_type VARCHAR(20) NOT NULL,
  entity_id VARCHAR(36) NOT NULL,
  entity_title VARCHAR(255),
  user_id VARCHAR(36),
  user_name VARCHAR(255),
  old_value TEXT,
  new_value TEXT,
  metadata JSON,
  created_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_entity (entity_type, entity_id),
  INDEX idx_event_type (event_type),
  INDEX idx_user (user_id),
  INDEX idx_created_date (created_date DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT = 'Audit log for tracking system events and changes';

-- Event types:
-- - kanban_change: Kanban pillar status changed
-- - roadmap_change: Expected delivery date changed
-- - status_change: Use case/agent status changed
-- - use_case_created: New use case created
-- - agent_created: New agent created
-- - comment_added: Comment added to use case or agent
-- - like_added: Like added to use case or agent

-- Entity types:
-- - use_case: Initiative/use case
-- - agent: Agent
