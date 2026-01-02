require('dotenv').config();

// MySQL Database configuration for Samantha
class DatabaseConfig {
  getConfig() {
    const mysqlConfig = {
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'samantha',
      port: parseInt(process.env.DB_PORT) || 3306,
      waitForConnections: true,
      connectionLimit: 10,
      maxIdle: 10,
      idleTimeout: 60000,
      queueLimit: 0,
      connectTimeout: 60000,
      acquireTimeout: 60000,
      timeout: 60000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    };

    // Add SSL configuration for Azure MySQL (only if not localhost)
    if (process.env.DB_HOST && !process.env.DB_HOST.includes('localhost') && !process.env.DB_HOST.includes('127.0.0.1')) {
      mysqlConfig.ssl = {
        rejectUnauthorized: false,
        secureConnection: true,
        minVersion: 'TLSv1.2'
      };
    }

    return {
      type: 'mysql',
      config: mysqlConfig
    };
  }

  getSchemaQueries() {
    return this.getMySQLSchema();
  }

  getMySQLSchema() {
    // Samantha Family Management System - MySQL Schema
    // Simplified schema: No departments, agent_types, data_sensitivity
    // Single status field (8 kanban values), single effort_level field
    return {
      // 1. Base table: users
      users: `CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        email VARCHAR(255) UNIQUE NOT NULL,
        azure_ad_id VARCHAR(255) UNIQUE,
        name VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255),
        role ENUM('viewer', 'contributor', 'admin') DEFAULT 'viewer',
        status VARCHAR(20) DEFAULT 'active',
        email_verified TINYINT(1) DEFAULT 0,
        created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_users_email (email),
        INDEX idx_users_role (role),
        INDEX idx_users_status (status)
      )`,

      // 2. Base table: domains (for family member/category separation)
      domains: `CREATE TABLE IF NOT EXISTS domains (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        type ENUM('family', 'personal', 'work', 'custom') NOT NULL DEFAULT 'custom',
        hero_message TEXT,
        subtitle VARCHAR(255) DEFAULT 'Family Management',
        config_json JSON,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,

      // 3. Base table: categories
      categories: `CREATE TABLE IF NOT EXISTS categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        domain_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_domain_category (domain_id, name),
        INDEX idx_categories_domain (domain_id)
      )`,

      // 4. Base table: strategic_pillars
      strategic_pillars: `CREATE TABLE IF NOT EXISTS strategic_pillars (
        id INT AUTO_INCREMENT PRIMARY KEY,
        domain_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        display_order INT DEFAULT 0,
        created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_domain_pillar (domain_id, name),
        INDEX idx_pillars_domain (domain_id)
      )`,

      // 5. Strategic goals table
      strategic_goals: `CREATE TABLE IF NOT EXISTS strategic_goals (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        strategic_pillar_id INT NOT NULL,
        target_date DATE,
        priority ENUM('Low', 'Medium', 'High') DEFAULT 'Medium',
        status ENUM('draft', 'active', 'completed', 'cancelled') DEFAULT 'active',
        success_metrics TEXT,
        completion_percentage INT DEFAULT 0,
        display_order INT DEFAULT 0,
        author_id VARCHAR(36) NOT NULL,
        created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_strategic_goals_pillar (strategic_pillar_id),
        INDEX idx_strategic_goals_status (status),
        INDEX idx_strategic_goals_priority (priority),
        INDEX idx_strategic_goals_author (author_id)
      )`,

      // 6. Base table: tags
      tags: `CREATE TABLE IF NOT EXISTS tags (
        id INT AUTO_INCREMENT PRIMARY KEY,
        domain_id INT,
        name VARCHAR(100) NOT NULL,
        created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_domain_tag (domain_id, name),
        INDEX idx_tags_name (name)
      )`,

      // 7. Initiatives table (use_cases) - simplified
      use_cases: `CREATE TABLE IF NOT EXISTS use_cases (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        domain_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        problem_statement TEXT,
        solution_overview TEXT,
        technical_implementation TEXT,
        results_metrics TEXT,
        lessons_learned TEXT,
        category_id INT,
        status ENUM('intention', 'experimentation', 'commitment', 'implementation', 'integration', 'blocked', 'slow_burner', 'de_prioritised', 'on_hold') DEFAULT 'intention',
        author_id VARCHAR(36),
        author_name VARCHAR(255),
        owner_name VARCHAR(255),
        owner_email VARCHAR(255),
        view_count INT DEFAULT 0,
        rating DECIMAL(3,2) DEFAULT 0.00,
        strategic_impact ENUM('Low', 'Medium', 'High') DEFAULT 'Medium',
        effort_level ENUM('Low', 'Medium', 'High') DEFAULT 'Medium',
        justification TEXT,
        expected_delivery_date VARCHAR(7),
        roadmap_link TEXT,
        created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_use_cases_domain (domain_id),
        INDEX idx_use_cases_category (category_id),
        INDEX idx_use_cases_author (author_id),
        INDEX idx_use_cases_status (status),
        INDEX idx_use_cases_strategic_impact (strategic_impact),
        INDEX idx_use_cases_created_date (created_date)
      )`,

      // 8. Tasks table - simplified
      tasks: `CREATE TABLE IF NOT EXISTS tasks (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        domain_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        problem_statement TEXT,
        solution_overview TEXT,
        technical_implementation TEXT,
        results_metrics TEXT,
        lessons_learned TEXT,
        status ENUM('intention', 'experimentation', 'commitment', 'implementation', 'integration', 'blocked', 'slow_burner', 'de_prioritised', 'on_hold') DEFAULT 'intention',
        author_id VARCHAR(36),
        author_name VARCHAR(255),
        owner_name VARCHAR(255),
        owner_email VARCHAR(255),
        strategic_impact ENUM('Low', 'Medium', 'High') DEFAULT 'Medium',
        effort_level ENUM('Low', 'Medium', 'High') DEFAULT 'Medium',
        justification TEXT,
        expected_delivery_date VARCHAR(7),
        created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_tasks_domain (domain_id),
        INDEX idx_tasks_author (author_id),
        INDEX idx_tasks_status (status),
        INDEX idx_tasks_strategic_impact (strategic_impact),
        INDEX idx_tasks_created_date (created_date)
      )`,

      // 9. Junction table: use_case_tags
      use_case_tags: `CREATE TABLE IF NOT EXISTS use_case_tags (
        use_case_id VARCHAR(36) NOT NULL,
        tag_id INT NOT NULL,
        PRIMARY KEY (use_case_id, tag_id)
      )`,

      // 10. Junction table: use_case_goal_alignments
      use_case_goal_alignments: `CREATE TABLE IF NOT EXISTS use_case_goal_alignments (
        use_case_id VARCHAR(36) NOT NULL,
        strategic_goal_id VARCHAR(36) NOT NULL,
        alignment_strength ENUM('Low', 'Medium', 'High') DEFAULT 'Medium',
        rationale TEXT,
        created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (use_case_id, strategic_goal_id),
        INDEX idx_use_case_goal_alignments_use_case (use_case_id),
        INDEX idx_use_case_goal_alignments_goal (strategic_goal_id)
      )`,

      // 11. Task initiative associations
      task_initiative_associations: `CREATE TABLE IF NOT EXISTS task_initiative_associations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        task_id VARCHAR(36) NOT NULL,
        use_case_id VARCHAR(36) NOT NULL,
        created_by VARCHAR(36),
        created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_task_initiative (task_id, use_case_id),
        INDEX idx_task_associations_task (task_id),
        INDEX idx_task_associations_use_case (use_case_id)
      )`,

      // 12. Attachments table
      attachments: `CREATE TABLE IF NOT EXISTS attachments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        use_case_id VARCHAR(36),
        filename VARCHAR(255) NOT NULL,
        file_path VARCHAR(500),
        file_url VARCHAR(500),
        file_size INT,
        mime_type VARCHAR(100),
        created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_attachments_use_case (use_case_id)
      )`,

      // 13. Comments table (supports both use_cases and tasks)
      comments: `CREATE TABLE IF NOT EXISTS comments (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        use_case_id VARCHAR(36),
        task_id VARCHAR(36),
        user_id VARCHAR(36) NOT NULL,
        parent_comment_id VARCHAR(36),
        content TEXT NOT NULL,
        is_edited TINYINT(1) DEFAULT 0,
        created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_comments_use_case (use_case_id),
        INDEX idx_comments_task (task_id),
        INDEX idx_comments_user (user_id),
        INDEX idx_comments_created (created_date)
      )`,

      // 14. Likes table for initiatives
      likes: `CREATE TABLE IF NOT EXISTS likes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        use_case_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_like (use_case_id, user_id),
        INDEX idx_likes_use_case (use_case_id),
        INDEX idx_likes_user (user_id)
      )`,

      // 15. Task likes table
      task_likes: `CREATE TABLE IF NOT EXISTS task_likes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        task_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_task_like (task_id, user_id),
        INDEX idx_task_likes_task (task_id),
        INDEX idx_task_likes_user (user_id)
      )`,

      // 16. Use case associations (related initiatives)
      use_case_associations: `CREATE TABLE IF NOT EXISTS use_case_associations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        use_case_id VARCHAR(36) NOT NULL,
        related_use_case_id VARCHAR(36) NOT NULL,
        created_by VARCHAR(36),
        created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_association (use_case_id, related_use_case_id),
        INDEX idx_associations_use_case (use_case_id),
        INDEX idx_associations_related (related_use_case_id)
      )`,

      // 17. Outcomes table (KPIs per domain)
      outcomes: `CREATE TABLE IF NOT EXISTS outcomes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        domain_id INT NOT NULL,
        outcome_key VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        measure VARCHAR(500),
        progress INT DEFAULT 0,
        maturity INT,
        display_order INT DEFAULT 0,
        is_active TINYINT(1) DEFAULT 1,
        created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_outcome_domain_id (domain_id),
        UNIQUE KEY unique_outcome_per_domain (outcome_key, domain_id)
      )`,

      // 18. User preferences table
      user_preferences: `CREATE TABLE IF NOT EXISTS user_preferences (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id VARCHAR(36) NOT NULL,
        preference_key VARCHAR(100) NOT NULL,
        preference_value TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_user_preference (user_id, preference_key),
        INDEX idx_user_prefs_user_id (user_id)
      )`,

      // 19. Audit logs table
      audit_logs: `CREATE TABLE IF NOT EXISTS audit_logs (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        event_type VARCHAR(50) NOT NULL,
        entity_type VARCHAR(20) NOT NULL,
        entity_id VARCHAR(36) NOT NULL,
        entity_title VARCHAR(255),
        user_id VARCHAR(36),
        user_name VARCHAR(255),
        old_value TEXT,
        new_value TEXT,
        metadata JSON,
        created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_audit_entity (entity_type, entity_id),
        INDEX idx_audit_event (event_type),
        INDEX idx_audit_user (user_id),
        INDEX idx_audit_created (created_date)
      )`
    };
  }
}

module.exports = new DatabaseConfig();
