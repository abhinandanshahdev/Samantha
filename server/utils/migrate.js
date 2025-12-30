const fs = require('fs');
const path = require('path');
const db = require('../config/database-mysql-compat');

/**
 * Database Migration Runner
 *
 * This utility automatically runs SQL migration files on application startup.
 * It tracks which migrations have been executed to prevent re-running them.
 *
 * Features:
 * - Runs migrations in alphabetical order (by filename)
 * - Tracks completed migrations in schema_migrations table
 * - Only runs new migrations that haven't been executed
 * - Fails fast if any migration errors occur
 * - Supports multi-statement SQL files
 */

async function runMigrations() {
  const migrationsDir = path.join(__dirname, '..', 'migrations');

  console.log('=== DATABASE MIGRATION RUNNER ===');
  console.log(`Migrations directory: ${migrationsDir}`);

  try {
    // Step 1: Create schema_migrations table if it doesn't exist
    await createMigrationsTable();

    // Step 2: Get list of all migration files
    const migrationFiles = getMigrationFiles(migrationsDir);

    if (migrationFiles.length === 0) {
      console.log('No migration files found.');
      return;
    }

    console.log(`Found ${migrationFiles.length} migration file(s)`);

    // Step 3: Get list of already-executed migrations
    const executedMigrations = await getExecutedMigrations();
    console.log(`${executedMigrations.size} migration(s) already executed`);

    // Step 4: Run pending migrations
    const pendingMigrations = migrationFiles.filter(file => !executedMigrations.has(file));

    if (pendingMigrations.length === 0) {
      console.log('All migrations are up to date. No new migrations to run.');
      return;
    }

    console.log(`Running ${pendingMigrations.length} pending migration(s)...`);

    for (const migrationFile of pendingMigrations) {
      await runMigration(migrationsDir, migrationFile);
    }

    console.log('=== ALL MIGRATIONS COMPLETED SUCCESSFULLY ===');

  } catch (error) {
    console.error('=== MIGRATION FAILED ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    throw error; // Re-throw to prevent app from starting with incomplete migrations
  }
}

/**
 * Create the schema_migrations table to track executed migrations
 */
async function createMigrationsTable() {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      migration_name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_migration_name (migration_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3
  `;

  await db.promise().query(createTableSQL);
  console.log('Schema migrations tracking table ready');
}

/**
 * Get list of all .sql migration files in the migrations directory
 * Returns files sorted alphabetically (ensuring consistent execution order)
 */
function getMigrationFiles(migrationsDir) {
  if (!fs.existsSync(migrationsDir)) {
    console.log(`Migrations directory does not exist: ${migrationsDir}`);
    return [];
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort(); // Alphabetical order ensures consistent execution

  return files;
}

/**
 * Get set of migration filenames that have already been executed
 */
async function getExecutedMigrations() {
  const [rows] = await db.promise().query(
    'SELECT migration_name FROM schema_migrations'
  );

  return new Set(rows.map(row => row.migration_name));
}

/**
 * Run a single migration file
 */
async function runMigration(migrationsDir, migrationFile) {
  const migrationPath = path.join(migrationsDir, migrationFile);

  console.log(`\n--- Running migration: ${migrationFile} ---`);

  try {
    // Read the SQL file
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Remove SQL comments (lines starting with --)
    const lines = sql.split('\n');
    const sqlWithoutLineComments = lines
      .filter(line => !line.trim().startsWith('--'))
      .join('\n');

    // Split by semicolons to handle multiple statements
    const statements = sqlWithoutLineComments
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);

    console.log(`Executing ${statements.length} SQL statement(s)...`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      // Skip empty or whitespace-only statements
      if (!statement || statement.length === 0) {
        continue;
      }

      try {
        await db.promise().query(statement);
        console.log(`  ✓ Statement ${i + 1}/${statements.length} executed`);
      } catch (stmtError) {
        // Some errors are acceptable (e.g., "Duplicate key" when constraint already exists)
        if (isAcceptableError(stmtError)) {
          console.log(`  ⚠ Statement ${i + 1}/${statements.length} skipped (already exists): ${stmtError.message}`);
        } else {
          console.error(`  ✗ Statement ${i + 1}/${statements.length} failed`);
          console.error(`Statement: ${statement.substring(0, 100)}...`);
          throw stmtError;
        }
      }
    }

    // Record the migration as executed
    await db.promise().query(
      'INSERT INTO schema_migrations (migration_name) VALUES (?)',
      [migrationFile]
    );

    console.log(`✓ Migration completed: ${migrationFile}`);

  } catch (error) {
    console.error(`✗ Migration failed: ${migrationFile}`);
    throw error;
  }
}

/**
 * Check if an error is acceptable and can be ignored
 * (e.g., constraint already exists, column already exists)
 */
function isAcceptableError(error) {
  const acceptableErrors = [
    'ER_DUP_KEYNAME',        // Duplicate key name (index/constraint already exists)
    'ER_DUP_ENTRY',          // Duplicate entry (unique constraint violation during INSERT IGNORE)
    'ER_DUP_FIELDNAME',      // Duplicate column name (column already exists)
  ];

  // Also check for duplicate foreign key constraint errors in the message
  if (error.message && error.message.includes('Duplicate foreign key constraint name')) {
    return true;
  }

  return acceptableErrors.includes(error.code);
}

module.exports = {
  runMigrations
};
