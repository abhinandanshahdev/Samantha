/**
 * Migration: Update status names from organizational to family-oriented workflow
 *
 * Status changes:
 * - backlog -> intention
 * - prioritised -> commitment
 * - in_progress -> implementation
 * - completed -> integration
 * - NEW: experimentation
 *
 * Tables affected: use_cases, tasks
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
    console.log('Starting status name migration...\n');

    // Step 1: Alter use_cases table to add new ENUM values (keeping old ones temporarily)
    console.log('Step 1: Updating use_cases ENUM to include new values...');
    await connection.query(`
      ALTER TABLE use_cases
      MODIFY COLUMN status ENUM(
        'backlog', 'prioritised', 'in_progress', 'completed',
        'intention', 'experimentation', 'commitment', 'implementation', 'integration',
        'blocked', 'slow_burner', 'de_prioritised', 'on_hold'
      ) DEFAULT 'intention'
    `);
    console.log('  use_cases ENUM updated');

    // Step 2: Alter tasks table to add new ENUM values (keeping old ones temporarily)
    console.log('Step 2: Updating tasks ENUM to include new values...');
    await connection.query(`
      ALTER TABLE tasks
      MODIFY COLUMN status ENUM(
        'backlog', 'prioritised', 'in_progress', 'completed',
        'intention', 'experimentation', 'commitment', 'implementation', 'integration',
        'blocked', 'slow_burner', 'de_prioritised', 'on_hold'
      ) DEFAULT 'intention'
    `);
    console.log('  tasks ENUM updated');

    // Step 3: Migrate use_cases data
    console.log('\nStep 3: Migrating use_cases data...');

    const useCaseMigrations = [
      { from: 'backlog', to: 'intention' },
      { from: 'prioritised', to: 'commitment' },
      { from: 'in_progress', to: 'implementation' },
      { from: 'completed', to: 'integration' }
    ];

    for (const { from, to } of useCaseMigrations) {
      const [result] = await connection.query(
        `UPDATE use_cases SET status = ? WHERE status = ?`,
        [to, from]
      );
      console.log(`  ${from} -> ${to}: ${result.affectedRows} rows updated`);
    }

    // Step 4: Migrate tasks data
    console.log('\nStep 4: Migrating tasks data...');

    for (const { from, to } of useCaseMigrations) {
      const [result] = await connection.query(
        `UPDATE tasks SET status = ? WHERE status = ?`,
        [to, from]
      );
      console.log(`  ${from} -> ${to}: ${result.affectedRows} rows updated`);
    }

    // Step 5: Remove old ENUM values from use_cases
    console.log('\nStep 5: Removing old ENUM values from use_cases...');
    await connection.query(`
      ALTER TABLE use_cases
      MODIFY COLUMN status ENUM(
        'intention', 'experimentation', 'commitment', 'implementation', 'integration',
        'blocked', 'slow_burner', 'de_prioritised', 'on_hold'
      ) DEFAULT 'intention'
    `);
    console.log('  use_cases ENUM cleaned up');

    // Step 6: Remove old ENUM values from tasks
    console.log('Step 6: Removing old ENUM values from tasks...');
    await connection.query(`
      ALTER TABLE tasks
      MODIFY COLUMN status ENUM(
        'intention', 'experimentation', 'commitment', 'implementation', 'integration',
        'blocked', 'slow_burner', 'de_prioritised', 'on_hold'
      ) DEFAULT 'intention'
    `);
    console.log('  tasks ENUM cleaned up');

    // Step 7: Verify migration
    console.log('\nStep 7: Verifying migration...');

    const [useCaseCounts] = await connection.query(`
      SELECT status, COUNT(*) as count
      FROM use_cases
      GROUP BY status
      ORDER BY FIELD(status, 'intention', 'experimentation', 'commitment', 'implementation', 'integration', 'blocked', 'slow_burner', 'de_prioritised', 'on_hold')
    `);
    console.log('\n  Use Cases by status:');
    useCaseCounts.forEach(row => {
      console.log(`    ${row.status}: ${row.count}`);
    });

    const [taskCounts] = await connection.query(`
      SELECT status, COUNT(*) as count
      FROM tasks
      GROUP BY status
      ORDER BY FIELD(status, 'intention', 'experimentation', 'commitment', 'implementation', 'integration', 'blocked', 'slow_burner', 'de_prioritised', 'on_hold')
    `);
    console.log('\n  Tasks by status:');
    if (taskCounts.length === 0) {
      console.log('    (no tasks found)');
    } else {
      taskCounts.forEach(row => {
        console.log(`    ${row.status}: ${row.count}`);
      });
    }

    console.log('\nMigration completed successfully!');
    console.log('\nNew status workflow:');
    console.log('  intention     -> Idea/need identified');
    console.log('  experimentation -> Small trials');
    console.log('  commitment    -> Decision made');
    console.log('  implementation -> Active execution');
    console.log('  integration   -> Embedded as habit');

  } catch (error) {
    console.error('\nMigration failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration();
