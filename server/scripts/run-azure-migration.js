const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
  console.log('Running Azure database migration...');
  
  // Use Azure database configuration
  const config = {
    host: process.env.DB_HOST || 'aiusecasemysql.mysql.database.azure.com',
    user: process.env.DB_USER || 'adminuser',
    password: process.env.DB_PASSWORD || 'YrV9X4bTeLEIzslYzFSm6NgoQDbrBuh3AdARX2WNx3Y=',
    database: process.env.DB_NAME || 'ai_use_case_repository',
    port: process.env.DB_PORT || 3306,
    ssl: {
      rejectUnauthorized: false
    },
    connectTimeout: 60000
  };

  let connection;
  
  try {
    console.log(`Connecting to Azure MySQL at ${config.host}...`);
    connection = await mysql.createConnection(config);
    console.log('Connected successfully!');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, '../migrations/add_azure_ad_id.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Split by semicolon and execute each statement
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const statement of statements) {
      console.log(`\nExecuting: ${statement.substring(0, 50)}...`);
      try {
        const [result] = await connection.execute(statement);
        console.log('Success!', result.info || '');
      } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME') {
          console.log('Column already exists, skipping...');
        } else if (err.code === 'ER_DUP_KEYNAME') {
          console.log('Index already exists, skipping...');
        } else {
          console.error('Error:', err.message);
        }
      }
    }
    
    // Verify the column exists
    console.log('\nVerifying azure_ad_id column...');
    const [columns] = await connection.execute(
      "SHOW COLUMNS FROM users WHERE Field = 'azure_ad_id'"
    );
    
    if (columns.length > 0) {
      console.log('✅ azure_ad_id column exists!');
      console.log('Column details:', columns[0]);
    } else {
      console.log('❌ azure_ad_id column not found!');
    }
    
    console.log('\nMigration completed successfully!');
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('Database connection closed.');
    }
  }
}

// Run the migration
runMigration();