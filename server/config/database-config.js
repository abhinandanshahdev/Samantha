require('dotenv').config();

// Database configuration factory supporting multiple database types
class DatabaseConfig {
  constructor() {
    this.dbType = process.env.DB_TYPE || 'mysql'; // mysql, mssql, sqlite
  }

  getConfig() {
    switch (this.dbType) {
      case 'mssql':
        return {
          type: 'mssql',
          config: {
            server: process.env.DB_HOST || 'localhost',
            database: process.env.DB_NAME || 'ai_use_case_repository',
            user: process.env.DB_USER || 'sa',
            password: process.env.DB_PASSWORD || '',
            port: parseInt(process.env.DB_PORT) || 1433,
            options: {
              encrypt: process.env.DB_ENCRYPT === 'true', // Required for Azure SQL
              trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
              enableArithAbort: true
            },
            pool: {
              max: 10,
              min: 0,
              idleTimeoutMillis: 30000
            }
          }
        };
      
      case 'sqlite':
        return {
          type: 'sqlite',
          config: {
            filename: process.env.DB_PATH || './database.sqlite'
          }
        };
      
      case 'mysql':
      default:
        const mysqlConfig = {
          host: process.env.DB_HOST || 'localhost',
          user: process.env.DB_USER || 'root',
          password: process.env.DB_PASSWORD || '',
          database: process.env.DB_NAME || 'ai_use_case_repository',
          port: parseInt(process.env.DB_PORT) || 3306,
          waitForConnections: true,
          connectionLimit: 10,
          maxIdle: 10,            // Maximum idle connections (same as connectionLimit to keep all alive)
          idleTimeout: 60000,     // Don't close idle connections for 60 seconds
          queueLimit: 0,
          connectTimeout: 60000,  // Increased from 10s to 60s for Azure
          acquireTimeout: 60000,  // Increased from 10s to 60s
          timeout: 60000,         // Increased from 10s to 60s
          enableKeepAlive: true,  // Keep connections alive
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
  }

  // Get schema creation queries based on database type
  getSchemaQueries() {
    const dbType = this.dbType;
    
    if (dbType === 'mssql') {
      return this.getMSSQLSchema();
    } else if (dbType === 'sqlite') {
      return this.getSQLiteSchema();
    } else {
      return this.getMySQLSchema();
    }
  }

  getMSSQLSchema() {
    // TODO: Add MSSQL schema if needed
    return {};
  }

  getSQLiteSchema() {
    // TODO: Add SQLite schema if needed
    return {};
  }

  getMySQLSchema() {
    // IMPORTANT: All foreign key constraints removed for flexible imports
    // Tables can be created in any order as they no longer have dependencies
    return {
      // 1. Base table: users (no foreign keys)
      users: `CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        email VARCHAR(255) UNIQUE NOT NULL,
        azure_ad_id VARCHAR(255) UNIQUE,
        name VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255),
        role ENUM('consumer', 'admin') DEFAULT 'consumer',
        status VARCHAR(20) DEFAULT 'active',
        email_verified TINYINT(1) DEFAULT 0,
        created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_users_email (email),
        INDEX idx_users_role (role),
        INDEX idx_users_status (status)
      )`,
      
      // 2. Base table: categories (no foreign keys)
      categories: `CREATE TABLE IF NOT EXISTS categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,
      
      // 3. Base table: departments (no foreign keys)
      departments: `CREATE TABLE IF NOT EXISTS departments (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        name VARCHAR(255) UNIQUE NOT NULL,
        created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,
      
      // 4. Base table: strategic_pillars (no foreign keys)
      strategic_pillars: `CREATE TABLE IF NOT EXISTS strategic_pillars (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,
      
      // 5. Table without foreign keys: strategic_goals (flexible for imports)
      strategic_goals: `CREATE TABLE IF NOT EXISTS strategic_goals (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        strategic_pillar_id INT NOT NULL,
        target_date DATE,
        priority ENUM('Low', 'Medium', 'High') DEFAULT 'Medium',
        status ENUM('draft', 'active', 'completed', 'cancelled') DEFAULT 'active',
        success_metrics TEXT,
        author_id VARCHAR(36) NOT NULL,
        created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_strategic_goals_pillar (strategic_pillar_id),
        INDEX idx_strategic_goals_status (status),
        INDEX idx_strategic_goals_priority (priority),
        INDEX idx_strategic_goals_author (author_id)
      )`,
      
      // 6. Base table: tags (no foreign keys)
      tags: `CREATE TABLE IF NOT EXISTS tags (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_tags_name (name)
      )`,
      
      // 7. Table without foreign keys: use_cases (flexible for imports)
      use_cases: `CREATE TABLE IF NOT EXISTS use_cases (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        problem_statement TEXT NOT NULL,
        solution_overview TEXT NOT NULL,
        technical_implementation TEXT,
        results_metrics TEXT,
        lessons_learned TEXT,
        category_id INT,
        status ENUM('concept', 'proof_of_concept', 'validation', 'pilot', 'production') DEFAULT 'concept',
        author_id VARCHAR(36) NOT NULL,
        department_id VARCHAR(36) NOT NULL,
        view_count INT DEFAULT 0,
        rating DECIMAL(3,2) DEFAULT 0.00,
        strategic_impact ENUM('Low', 'Medium', 'High') DEFAULT 'Low',
        data_complexity ENUM('Low', 'Medium', 'High') DEFAULT 'Low',
        integration_complexity ENUM('Low', 'Medium', 'High') DEFAULT 'Low',
        intelligence_complexity ENUM('Low', 'Medium', 'High') DEFAULT 'Low',
        functional_complexity ENUM('Low', 'Medium', 'High') DEFAULT 'Low',
        justification TEXT,
        created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_use_cases_category (category_id),
        INDEX idx_use_cases_author (author_id),
        INDEX idx_use_cases_department (department_id),
        INDEX idx_use_cases_status (status),
        INDEX idx_use_cases_strategic_impact (strategic_impact),
        INDEX idx_use_cases_created_date (created_date),
        INDEX idx_use_cases_rating (rating)
      )`,
      
      // 8. Junction table: use_case_tags (no foreign keys)
      use_case_tags: `CREATE TABLE IF NOT EXISTS use_case_tags (
        use_case_id VARCHAR(36) NOT NULL,
        tag_id INT NOT NULL,
        PRIMARY KEY (use_case_id, tag_id)
      )`,
      
      // 9. Junction table: use_case_goal_alignments (no foreign keys)
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
      
      // 10. Table without foreign keys: attachments (flexible for imports)
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
      
      // 11. Table without foreign keys: user_ratings (flexible for imports)
      user_ratings: `CREATE TABLE IF NOT EXISTS user_ratings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        use_case_id VARCHAR(36),
        user_id VARCHAR(36),
        rating INT CHECK (rating >= 1 AND rating <= 5),
        created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_user_rating (use_case_id, user_id),
        INDEX idx_user_ratings_use_case (use_case_id),
        INDEX idx_user_ratings_user (user_id)
      )`,
      
      // 12. Base table: outcomes (no foreign keys)
      outcomes: `CREATE TABLE IF NOT EXISTS outcomes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        domain_id INT NOT NULL,
        outcome_key VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        measure VARCHAR(500) NOT NULL,
        progress INT DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
        maturity INT CHECK (maturity >= 1 AND maturity <= 5),
        display_order INT DEFAULT 0,
        is_active TINYINT(1) DEFAULT 1,
        created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_outcome_domain_id (domain_id),
        INDEX idx_outcomes_display_order (display_order),
        INDEX idx_outcomes_active (is_active),
        UNIQUE KEY unique_outcome_per_domain (outcome_key, domain_id),
        FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE RESTRICT
      )`,

      // 13. Base table: user_preferences (no foreign keys)
      user_preferences: `CREATE TABLE IF NOT EXISTS user_preferences (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id VARCHAR(36) NOT NULL,
        preference_key VARCHAR(100) NOT NULL,
        preference_value TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_user_preference (user_id, preference_key),
        INDEX idx_user_prefs_user_id (user_id)
      )`
    };
  }
}

module.exports = new DatabaseConfig();