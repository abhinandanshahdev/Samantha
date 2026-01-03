/**
 * Migration: Update attachments table to support both initiatives and tasks
 *
 * Changes:
 * - Rename use_case_id to entity_id
 * - Add entity_type column (initiative/task)
 * - Add created_by column for tracking uploader
 * - Add new index for entity lookup
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mysql = require('mysql2/promise');

async function runMigration() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'samantha',
    multipleStatements: true
  });

  try {
    console.log('Connected to database');
    console.log('Starting attachments table migration...\n');

    // Check if migration already applied (entity_type column exists)
    const [columns] = await connection.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'attachments' AND COLUMN_NAME = 'entity_type'
    `, [process.env.DB_NAME || 'samantha']);

    if (columns.length > 0) {
      console.log('Migration already applied (entity_type column exists). Skipping...');
      await connection.end();
      return;
    }

    // Step 1: Add entity_type column
    console.log('Step 1: Adding entity_type column...');
    await connection.query(`
      ALTER TABLE attachments
      ADD COLUMN entity_type ENUM('initiative', 'task') DEFAULT 'initiative' AFTER id
    `);
    console.log('  entity_type column added');

    // Step 2: Rename use_case_id to entity_id
    console.log('Step 2: Renaming use_case_id to entity_id...');
    await connection.query(`
      ALTER TABLE attachments
      CHANGE COLUMN use_case_id entity_id VARCHAR(36)
    `);
    console.log('  Column renamed to entity_id');

    // Step 3: Add created_by column
    console.log('Step 3: Adding created_by column...');
    await connection.query(`
      ALTER TABLE attachments
      ADD COLUMN created_by VARCHAR(36) AFTER mime_type
    `);
    console.log('  created_by column added');

    // Step 4: Drop old index and add new composite index
    console.log('Step 4: Updating indexes...');
    try {
      await connection.query(`DROP INDEX idx_attachments_use_case ON attachments`);
      console.log('  Old index dropped');
    } catch (e) {
      console.log('  Old index not found, skipping drop');
    }

    await connection.query(`
      ALTER TABLE attachments
      ADD INDEX idx_attachments_entity (entity_id, entity_type)
    `);
    console.log('  New composite index added');

    // Step 5: Verify migration
    console.log('\nStep 5: Verifying migration...');
    const [tableInfo] = await connection.query(`DESCRIBE attachments`);
    console.log('\nUpdated attachments table structure:');
    tableInfo.forEach(col => {
      console.log(`  ${col.Field}: ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : ''} ${col.Default ? `DEFAULT ${col.Default}` : ''}`);
    });

    console.log('\nMigration completed successfully!');

  } catch (error) {
    console.error('\nMigration failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration();
