const mysql = require('mysql2');
require('dotenv').config({ path: '../server/.env' });

// Create connection to MySQL
const connection = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'ai_use_case_repository',
  multipleStatements: true
});

const createTablesSQL = `
-- Create strategic pillars table if not exists
CREATE TABLE IF NOT EXISTS strategic_pillars (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create strategic goals table if not exists
CREATE TABLE IF NOT EXISTS strategic_goals (
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
    FOREIGN KEY (strategic_pillar_id) REFERENCES strategic_pillars(id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create use case goal alignments table if not exists
CREATE TABLE IF NOT EXISTS use_case_goal_alignments (
    use_case_id VARCHAR(36),
    strategic_goal_id VARCHAR(36),
    alignment_strength ENUM('Low', 'Medium', 'High') DEFAULT 'Medium',
    rationale TEXT,
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (use_case_id, strategic_goal_id),
    FOREIGN KEY (use_case_id) REFERENCES use_cases(id) ON DELETE CASCADE,
    FOREIGN KEY (strategic_goal_id) REFERENCES strategic_goals(id) ON DELETE CASCADE
);

-- Insert default strategic pillars if they don't exist
INSERT IGNORE INTO strategic_pillars (name, description) VALUES
('AI Ecosystem Growth', 'Initiatives focused on expanding and enhancing the AI ecosystem within the organization and externally'),
('AI Powered Operations', 'Leveraging AI to optimize and transform operational processes and workflows'),
('Responsible AI Governance', 'Ensuring ethical, transparent, and accountable AI development and deployment practices');
`;

console.log('Connecting to database...');
console.log('Database:', process.env.DB_NAME || 'ai_use_case_repository');
console.log('Host:', process.env.DB_HOST || 'localhost');

connection.connect((err) => {
  if (err) {
    console.error('Error connecting to database:', err);
    process.exit(1);
  }

  console.log('Connected to database successfully');
  console.log('Creating strategic goals tables...');

  connection.query(createTablesSQL, (err, results) => {
    if (err) {
      console.error('Error creating tables:', err);
      connection.end();
      process.exit(1);
    }

    console.log('Tables created successfully!');
    
    // Create indexes (ignore errors if they already exist)
    const indexes = [
      'CREATE INDEX idx_strategic_goals_pillar ON strategic_goals(strategic_pillar_id)',
      'CREATE INDEX idx_strategic_goals_status ON strategic_goals(status)',
      'CREATE INDEX idx_strategic_goals_priority ON strategic_goals(priority)',
      'CREATE INDEX idx_strategic_goals_author ON strategic_goals(author_id)',
      'CREATE INDEX idx_use_case_goal_alignments_use_case ON use_case_goal_alignments(use_case_id)',
      'CREATE INDEX idx_use_case_goal_alignments_goal ON use_case_goal_alignments(strategic_goal_id)'
    ];
    
    console.log('Creating indexes...');
    let indexCount = 0;
    
    indexes.forEach((indexSQL, i) => {
      connection.query(indexSQL, (err) => {
        if (err && err.code !== 'ER_DUP_KEYNAME') {
          console.warn(`Warning creating index ${i + 1}:`, err.message);
        } else if (!err) {
          console.log(`Index ${i + 1} created successfully`);
        } else {
          console.log(`Index ${i + 1} already exists`);
        }
        
        indexCount++;
        if (indexCount === indexes.length) {
          // Check if tables were created
          connection.query(`
            SELECT COUNT(*) as count FROM information_schema.tables 
            WHERE table_schema = ? 
            AND table_name IN ('strategic_pillars', 'strategic_goals', 'use_case_goal_alignments')
          `, [process.env.DB_NAME || 'ai_use_case_repository'], (err, results) => {
            if (err) {
              console.error('Error checking tables:', err);
            } else {
              console.log(`Found ${results[0].count} strategic tables in the database`);
            }
            
            // Check pillars
            connection.query('SELECT id, name FROM strategic_pillars', (err, pillars) => {
              if (err) {
                console.error('Error checking pillars:', err);
              } else {
                console.log('\nStrategic Pillars:');
                pillars.forEach(pillar => {
                  console.log(`  - ${pillar.id}: ${pillar.name}`);
                });
              }
              
              connection.end();
              console.log('\nDatabase setup completed!');
            });
          });
        }
      });
    });
  });
});