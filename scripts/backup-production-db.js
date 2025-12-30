/**
 * Production Database Backup Script
 * Creates a SQL dump of the production database for local testing
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const BACKUP_DIR = path.join(__dirname, '..');
const BACKUP_DATE = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').split('.')[0];
const BACKUP_FILE = path.join(BACKUP_DIR, `backup_v37_to_v38_${BACKUP_DATE}.sql`);

// Production database configuration
const DB_CONFIG = {
  host: 'aiusecasemysql.mysql.database.azure.com',
  user: 'adminuser',
  password: 'YrV9X4bTeLEIzslYzFSm6NgoQDbrBuh3AdARX2WNx3Y=',
  database: 'ai_use_case_repository',
  ssl: {
    rejectUnauthorized: false
  }
};

async function backupDatabase() {
  let connection;
  let writeStream;

  try {
    console.log('🔄 Connecting to production database...');
    console.log(`   Host: ${DB_CONFIG.host}`);
    console.log(`   Database: ${DB_CONFIG.database}`);

    connection = await mysql.createConnection(DB_CONFIG);
    console.log('✅ Connected successfully\n');

    // Create write stream
    writeStream = fs.createWriteStream(BACKUP_FILE);

    // Write header
    writeStream.write(`-- MySQL Database Backup\n`);
    writeStream.write(`-- Host: ${DB_CONFIG.host}\n`);
    writeStream.write(`-- Database: ${DB_CONFIG.database}\n`);
    writeStream.write(`-- Date: ${new Date().toISOString()}\n`);
    writeStream.write(`-- Backup for v37 -> v38 migration testing\n\n`);
    writeStream.write(`SET FOREIGN_KEY_CHECKS=0;\n`);
    writeStream.write(`SET SQL_MODE="NO_AUTO_VALUE_ON_ZERO";\n\n`);

    // Get all tables
    console.log('📋 Fetching table list...');
    const [tables] = await connection.query('SHOW TABLES');
    const tableNames = tables.map(row => Object.values(row)[0]);
    console.log(`   Found ${tableNames.length} tables\n`);

    // Backup each table
    for (const tableName of tableNames) {
      console.log(`📦 Backing up table: ${tableName}`);

      // Get CREATE TABLE statement
      const [createTable] = await connection.query(`SHOW CREATE TABLE \`${tableName}\``);
      writeStream.write(`\n-- Table: ${tableName}\n`);
      writeStream.write(`DROP TABLE IF EXISTS \`${tableName}\`;\n`);
      writeStream.write(`${createTable[0]['Create Table']};\n\n`);

      // Get row count
      const [countResult] = await connection.query(`SELECT COUNT(*) as count FROM \`${tableName}\``);
      const rowCount = countResult[0].count;
      console.log(`   Rows: ${rowCount}`);

      if (rowCount > 0) {
        // Get data in batches
        const BATCH_SIZE = 1000;
        let offset = 0;
        let totalWritten = 0;

        while (offset < rowCount) {
          const [rows] = await connection.query(
            `SELECT * FROM \`${tableName}\` LIMIT ${BATCH_SIZE} OFFSET ${offset}`
          );

          if (rows.length > 0) {
            writeStream.write(`-- Data for table: ${tableName} (rows ${offset + 1} to ${offset + rows.length})\n`);

            for (const row of rows) {
              const columns = Object.keys(row);
              const values = Object.values(row).map(val => {
                if (val === null) return 'NULL';
                if (typeof val === 'number') return val;
                if (val instanceof Date) return `'${val.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '')}'`;
                if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "\\'")}'`;
                return `'${String(val).replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`;
              });

              writeStream.write(
                `INSERT INTO \`${tableName}\` (\`${columns.join('`, `')}\`) VALUES (${values.join(', ')});\n`
              );
              totalWritten++;
            }
            writeStream.write('\n');
          }

          offset += BATCH_SIZE;
          if (totalWritten % 5000 === 0 && totalWritten > 0) {
            console.log(`   Progress: ${totalWritten} rows written...`);
          }
        }

        console.log(`   ✅ Completed: ${totalWritten} rows written\n`);
      } else {
        console.log(`   ⚠️  Empty table\n`);
      }
    }

    writeStream.write(`\nSET FOREIGN_KEY_CHECKS=1;\n`);
    writeStream.write(`\n-- Backup completed: ${new Date().toISOString()}\n`);

    await new Promise((resolve) => writeStream.end(resolve));

    console.log('\n✅ Backup completed successfully!');
    console.log(`📁 Backup file: ${BACKUP_FILE}`);

    // Get file size
    const stats = fs.statSync(BACKUP_FILE);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`📊 File size: ${fileSizeMB} MB`);

  } catch (error) {
    console.error('\n❌ Backup failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Database connection closed');
    }
  }
}

// Run backup
backupDatabase();
