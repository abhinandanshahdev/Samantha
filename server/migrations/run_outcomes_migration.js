const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ai_use_case_repository',
    multipleStatements: true
  });

  try {
    console.log('Connected to database');

    // Read the migration SQL file
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'add_domain_to_outcomes.sql'),
      'utf8'
    );

    console.log('Running outcomes migration...');
    await connection.query(migrationSQL);
    console.log('✅ Migration completed successfully!');
    console.log('\nOutcomes are now domain-specific:');
    console.log('- AI domain outcomes: Sustainability, Financial Excellence, Economic Value');
    console.log('- Data domain outcomes: Data Quality, Data Accessibility, Governance Compliance');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration();
