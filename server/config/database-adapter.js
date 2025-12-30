const mysql = require('mysql2/promise');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const sql = require('mssql');
const dbConfig = require('./database-config');

class DatabaseAdapter {
  constructor() {
    this.connection = null;
    this.config = dbConfig.getConfig();
    this.type = this.config.type;
    this.keepAliveInterval = null;
    this.lastActivity = Date.now();
  }

  async connect() {
    try {
      switch (this.type) {
        case 'mssql':
          this.connection = await sql.connect(this.config.config);
          console.log('Connected to SQL Server database');
          break;
        
        case 'sqlite':
          this.connection = await open({
            filename: this.config.config.filename,
            driver: sqlite3.Database
          });
          console.log('Connected to SQLite database');
          break;
        
        case 'mysql':
        default:
          this.connection = await mysql.createPool(this.config.config);
          console.log('Connected to MySQL database');
          // Start keep-alive ping for MySQL
          this.startKeepAlive();
          break;
      }
      
      await this.initializeSchema();
    } catch (error) {
      console.error('Database connection failed:', error);
      throw error;
    }
  }

  async initializeSchema() {
    const schemas = dbConfig.getSchemaQueries();
    
    // Create tables in the correct order due to foreign key dependencies
    for (const [table, query] of Object.entries(schemas)) {
      try {
        // Checkmarx Suppression: False positive - schema queries are hardcoded in database-config.js, not user input
        await this.execute(query);
        console.log(`Table ${table} initialized`);
      } catch (error) {
        console.error(`Error initializing table ${table}:`, error.message);
        // Continue with other tables even if one fails (table might already exist)
      }
    }
    
    // Seed data for reference tables
    await this.seedOutcomesData();
    await this.seedDepartmentsData();
    await this.seedCategoriesData();
  }


  async seedOutcomesData() {
    try {
      // Check if outcomes table has data
      // Checkmarx Suppression: False positive - static query with no user input
      const results = await this.execute('SELECT COUNT(*) as count FROM outcomes');
      const count = results[0]?.count || 0;

      if (count === 0) {
        console.log('Seeding outcomes data...');

        // Insert default AI domain outcomes (domain_id = 1)
        const aiOutcomes = [
          {
            domain_id: 1,
            outcome_key: 'sustainability',
            title: 'Sustainability, Future Readiness & Capability',
            measure: 'AI Maturity (1–5) → Strategic/AI‑native at 5',
            progress: 60,
            maturity: 3,
            display_order: 1
          },
          {
            domain_id: 1,
            outcome_key: 'financial',
            title: 'Financial Management Excellence using AI',
            measure: '% of identified DoF processes augmented or reimagined using AI',
            progress: 42,
            maturity: null,
            display_order: 2
          },
          {
            domain_id: 1,
            outcome_key: 'economic',
            title: 'Economic Value & Responsible Innovation',
            measure: '% of projects meeting business value and passing RAI evaluation',
            progress: 58,
            maturity: null,
            display_order: 3
          }
        ];

        // Insert default Data domain outcomes (domain_id = 2)
        const dataOutcomes = [
          {
            domain_id: 2,
            outcome_key: 'data_quality',
            title: 'Data Quality & Integrity',
            measure: '% of datasets meeting quality standards',
            progress: 75,
            maturity: null,
            display_order: 1
          },
          {
            domain_id: 2,
            outcome_key: 'data_accessibility',
            title: 'Data Accessibility & Democratization',
            measure: '% of business users with self-service data access',
            progress: 60,
            maturity: null,
            display_order: 2
          },
          {
            domain_id: 2,
            outcome_key: 'governance_compliance',
            title: 'Governance & Compliance',
            measure: '% of data assets with proper governance controls',
            progress: 80,
            maturity: null,
            display_order: 3
          }
        ];

        const allOutcomes = [...aiOutcomes, ...dataOutcomes];

        for (const outcome of allOutcomes) {
          // Checkmarx Suppression: False positive - parameterized query with hardcoded SQL and seed data
          await this.execute(
            'INSERT INTO outcomes (domain_id, outcome_key, title, measure, progress, maturity, display_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [outcome.domain_id, outcome.outcome_key, outcome.title, outcome.measure, outcome.progress, outcome.maturity, outcome.display_order]
          );
        }

        console.log('Outcomes data seeded successfully (AI and Data domains)');
      } else {
        console.log(`Outcomes table already has ${count} records, skipping seed`);
      }
    } catch (error) {
      console.error('Error seeding outcomes data:', error.message);
      // Non-fatal error - continue even if seeding fails
    }
  }

  async seedDepartmentsData() {
    try {
      // Check if departments table has data
      // Checkmarx Suppression: False positive - static query with no user input
      const results = await this.execute('SELECT COUNT(*) as count FROM departments');
      const count = results[0]?.count || 0;
      
      if (count === 0) {
        console.log('Seeding departments data...');
        
        // Insert default departments
        const departments = [
          { name: 'Government Financial Affairs' },
          { name: 'Executive Financial Affairs' },
          { name: 'Investment and Economic Affairs' },
          { name: 'Legal and Compliance Affairs' },
          { name: 'Corporate Affairs' }
        ];
        
        for (const dept of departments) {
          // Checkmarx Suppression: False positive - parameterized query with hardcoded SQL and seed data
          await this.execute(
            'INSERT INTO departments (name) VALUES (?)',
            [dept.name]
          );
        }
        
        console.log('Departments data seeded successfully');
      } else {
        console.log(`Departments table already has ${count} records, skipping seed`);
      }
    } catch (error) {
      console.error('Error seeding departments data:', error.message);
      // Non-fatal error - continue even if seeding fails
    }
  }

  async seedCategoriesData() {
    try {
      // Check if categories table has data
      // Checkmarx Suppression: False positive - static query with no user input
      const results = await this.execute('SELECT COUNT(*) as count FROM categories');
      const count = results[0]?.count || 0;
      
      if (count === 0) {
        console.log('Seeding categories data...');
        
        // Insert default categories (patterns)
        const categories = [
          {
            name: 'Internally deploy LLMs',
            description: 'Deploy and manage Large Language Models internally within the organization'
          },
          {
            name: 'Leverage Vendor embedded solutions',
            description: 'Utilize third-party vendor solutions with embedded AI capabilities'
          },
          {
            name: 'Leverage Copilot',
            description: 'Use Microsoft Copilot and related tools for productivity enhancement'
          },
          {
            name: 'Leverage DGE',
            description: 'Leverage Digital Government Excellence platform and tools'
          },
          {
            name: 'Build ML',
            description: 'Build custom Machine Learning models and solutions from scratch'
          }
        ];
        
        for (const category of categories) {
          // Checkmarx Suppression: False positive - parameterized query with hardcoded SQL and seed data
          await this.execute(
            'INSERT INTO categories (name, description) VALUES (?, ?)',
            [category.name, category.description]
          );
        }
        
        console.log('Categories data seeded successfully');
      } else {
        console.log(`Categories table already has ${count} records, skipping seed`);
      }
    } catch (error) {
      console.error('Error seeding categories data:', error.message);
      // Non-fatal error - continue even if seeding fails
    }
  }

  async execute(query, params = []) {
    switch (this.type) {
      case 'mssql':
        const request = this.connection.request();
        params.forEach((param, index) => {
          request.input(`param${index}`, param);
        });
        
        // Replace ? with @param0, @param1, etc. for SQL Server
        let paramIndex = 0;
        const processedQuery = query.replace(/\?/g, () => `@param${paramIndex++}`);

        // Checkmarx Suppression: False positive - query uses parameterized placeholders, params bound via request.input()
        return await request.query(processedQuery);
      
      case 'sqlite':
        if (query.toLowerCase().startsWith('select')) {
          return await this.connection.all(query, params);
        } else {
          return await this.connection.run(query, params);
        }
      
      case 'mysql':
      default:
        try {
          this.lastActivity = Date.now();
          // Use query() instead of execute() for compatibility with non-prepared statements
          const [results] = await this.connection.query(query, params);
          return results;
        } catch (error) {
          // Handle various connection errors
          if (error.code === 'PROTOCOL_CONNECTION_LOST' || 
              error.code === 'ECONNREFUSED' ||
              error.code === 'ETIMEDOUT' ||
              (error.message && (
                error.message.includes('closed state') ||
                error.message.includes('Connection lost') ||
                error.message.includes('The server closed the connection')
              ))) {
            console.log('Connection error detected:', error.code || error.message);
            console.log('Attempting to reconnect...');
            await this.reconnect();
            // Retry the query after reconnection
            this.lastActivity = Date.now();
            const [results] = await this.connection.query(query, params);
            return results;
          }
          throw error;
        }
    }
  }

  async query(query, params = []) {
    // Checkmarx Suppression: False positive - wrapper method that passes query and params to parameterized execute()
    const results = await this.execute(query, params);

    // Normalize results across different databases
    switch (this.type) {
      case 'mssql':
        return results.recordset || [];
      case 'sqlite':
        return Array.isArray(results) ? results : [];
      case 'mysql':
      default:
        return results;
    }
  }

  async insert(query, params = []) {
    // Checkmarx Suppression: False positive - wrapper method that passes query and params to parameterized execute()
    const result = await this.execute(query, params);

    // Return inserted ID
    switch (this.type) {
      case 'mssql':
        // For SQL Server, we need to add OUTPUT INSERTED.id to the query
        return result.recordset?.[0]?.id || null;
      case 'sqlite':
        return result.lastID;
      case 'mysql':
      default:
        return result.insertId;
    }
  }

  async update(query, params = []) {
    // Checkmarx Suppression: False positive - wrapper method that passes query and params to parameterized execute()
    const result = await this.execute(query, params);

    // Return affected rows
    switch (this.type) {
      case 'mssql':
        return result.rowsAffected[0];
      case 'sqlite':
        return result.changes;
      case 'mysql':
      default:
        return result.affectedRows;
    }
  }

  async delete(query, params = []) {
    return await this.update(query, params);
  }

  // Helper method to build INSERT queries that work across databases
  buildInsertQuery(table, data) {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map(() => '?').join(', ');
    
    let query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
    
    // Add OUTPUT clause for SQL Server to return inserted ID
    if (this.type === 'mssql') {
      query = `INSERT INTO ${table} (${columns.join(', ')}) OUTPUT INSERTED.id VALUES (${placeholders})`;
    }
    
    return { query, values };
  }

  // Helper method to build UPDATE queries
  buildUpdateQuery(table, data, condition, conditionParams = []) {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const setClause = columns.map(col => `${col} = ?`).join(', ');
    
    const query = `UPDATE ${table} SET ${setClause} WHERE ${condition}`;
    const params = [...values, ...conditionParams];
    
    return { query, params };
  }

  startKeepAlive() {
    // Clear any existing interval
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
    }

    // Ping every 30 seconds to keep connection alive
    this.keepAliveInterval = setInterval(async () => {
      try {
        // Only ping if we haven't had activity in the last 20 seconds
        const timeSinceLastActivity = Date.now() - this.lastActivity;
        if (timeSinceLastActivity > 20000) {
          if (this.type === 'mysql' && this.connection) {
            // Use a simple SELECT 1 query as a ping
            await this.connection.query('SELECT 1');
            console.log('Keep-alive ping successful');
          }
        }
      } catch (error) {
        console.error('Keep-alive ping failed:', error.message);
        // Attempt reconnection if ping fails
        try {
          await this.reconnect();
        } catch (reconnectError) {
          console.error('Failed to reconnect after ping failure:', reconnectError.message);
        }
      }
    }, 30000); // Run every 30 seconds
  }

  stopKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  async reconnect() {
    console.log('Attempting database reconnection...');
    try {
      // Stop keep-alive during reconnection
      this.stopKeepAlive();
      
      // Close existing connection if it exists
      if (this.connection) {
        try {
          if (this.type === 'mysql') {
            await this.connection.end();
          }
        } catch (err) {
          console.log('Error closing old connection:', err.message);
        }
      }
      
      // Re-establish connection
      await this.connect();
      console.log('Database reconnected successfully');
    } catch (error) {
      console.error('Failed to reconnect to database:', error);
      throw error;
    }
  }

  async close() {
    // Stop keep-alive before closing
    this.stopKeepAlive();
    
    switch (this.type) {
      case 'mssql':
        await sql.close();
        break;
      case 'sqlite':
        await this.connection.close();
        break;
      case 'mysql':
      default:
        if (this.connection) {
          await this.connection.end();
        }
        break;
    }
  }
}

// Export singleton instance
module.exports = new DatabaseAdapter();