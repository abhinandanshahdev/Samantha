-- Migration: Add Social Features and Associations
-- Description: Adds owner fields, comments, and use case associations
-- Date: 2025-10-24

-- 1. Add owner fields to use_cases table
ALTER TABLE use_cases
  ADD COLUMN owner_name VARCHAR(255) NULL COMMENT 'Name of the initiative owner' AFTER author_id,
  ADD COLUMN owner_email VARCHAR(255) NULL COMMENT 'Email of the initiative owner' AFTER owner_name;

-- 2. Create comments table for social-style threaded comments
CREATE TABLE IF NOT EXISTS comments (
  id VARCHAR(36) PRIMARY KEY COMMENT 'UUID for comment',
  use_case_id VARCHAR(36) NOT NULL COMMENT 'Reference to the use case',
  user_id VARCHAR(36) NOT NULL COMMENT 'User who created the comment',
  parent_comment_id VARCHAR(36) NULL COMMENT 'Parent comment for threading (NULL = top-level)',
  content TEXT NOT NULL COMMENT 'Comment text content',
  is_edited BOOLEAN DEFAULT FALSE COMMENT 'Flag indicating if comment was edited',
  created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (use_case_id) REFERENCES use_cases(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_comment_id) REFERENCES comments(id) ON DELETE CASCADE,

  INDEX idx_use_case (use_case_id),
  INDEX idx_user (user_id),
  INDEX idx_parent (parent_comment_id),
  INDEX idx_created (created_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COMMENT='Threaded comments for use cases';

-- 3. Create use_case_associations table for related use cases
CREATE TABLE IF NOT EXISTS use_case_associations (
  id INT PRIMARY KEY AUTO_INCREMENT,
  use_case_id VARCHAR(36) NOT NULL COMMENT 'First use case in the association',
  related_use_case_id VARCHAR(36) NOT NULL COMMENT 'Related use case',
  created_by VARCHAR(36) NOT NULL COMMENT 'User who created the association',
  created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (use_case_id) REFERENCES use_cases(id) ON DELETE CASCADE,
  FOREIGN KEY (related_use_case_id) REFERENCES use_cases(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id),

  CONSTRAINT unique_association UNIQUE (use_case_id, related_use_case_id),
  CONSTRAINT no_self_reference CHECK (use_case_id != related_use_case_id),

  INDEX idx_use_case (use_case_id),
  INDEX idx_related (related_use_case_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COMMENT='Bidirectional associations between use cases';
