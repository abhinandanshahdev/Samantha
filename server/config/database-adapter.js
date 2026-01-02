const mysql = require('mysql2/promise');
const dbConfig = require('./database-config');

class DatabaseAdapter {
  constructor() {
    this.connection = null;
    this.config = dbConfig.getConfig();
    this.keepAliveInterval = null;
    this.lastActivity = Date.now();
  }

  async connect() {
    try {
      this.connection = await mysql.createPool(this.config.config);
      console.log('Connected to MySQL database');
      // Start keep-alive ping
      this.startKeepAlive();

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
        await this.execute(query);
        console.log(`Table ${table} initialized`);
      } catch (error) {
        console.error(`Error initializing table ${table}:`, error.message);
        // Continue with other tables even if one fails (table might already exist)
      }
    }

    // Seed data for reference tables
    await this.seedCategoriesData();
  }

  async seedCategoriesData() {
    try {
      const results = await this.execute('SELECT COUNT(*) as count FROM categories');
      const count = results[0]?.count || 0;

      if (count === 0) {
        console.log('Seeding categories data...');

        // Insert default categories
        const categories = [
          { name: 'Home', description: 'Home-related initiatives and tasks' },
          { name: 'Health', description: 'Health and wellness initiatives' },
          { name: 'Education', description: 'Learning and education initiatives' },
          { name: 'Finance', description: 'Financial planning and management' },
          { name: 'Travel', description: 'Travel and vacation planning' },
          { name: 'Other', description: 'Miscellaneous initiatives' }
        ];

        for (const category of categories) {
          await this.execute(
            'INSERT INTO categories (domain_id, name, description) VALUES (1, ?, ?)',
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
    try {
      this.lastActivity = Date.now();
      const [results] = await this.connection.query(query, params);
      return results;
    } catch (error) {
      // Handle connection errors
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

  async query(query, params = []) {
    return await this.execute(query, params);
  }

  async insert(query, params = []) {
    const result = await this.execute(query, params);
    return result.insertId;
  }

  async update(query, params = []) {
    const result = await this.execute(query, params);
    return result.affectedRows;
  }

  async delete(query, params = []) {
    return await this.update(query, params);
  }

  // Helper method to build INSERT queries
  buildInsertQuery(table, data) {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map(() => '?').join(', ');

    const query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;

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
          if (this.connection) {
            await this.connection.query('SELECT 1');
            console.log('Keep-alive ping successful');
          }
        }
      } catch (error) {
        console.error('Keep-alive ping failed:', error.message);
        try {
          await this.reconnect();
        } catch (reconnectError) {
          console.error('Failed to reconnect after ping failure:', reconnectError.message);
        }
      }
    }, 30000);
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
      this.stopKeepAlive();

      if (this.connection) {
        try {
          await this.connection.end();
        } catch (err) {
          console.log('Error closing old connection:', err.message);
        }
      }

      await this.connect();
      console.log('Database reconnected successfully');
    } catch (error) {
      console.error('Failed to reconnect to database:', error);
      throw error;
    }
  }

  async close() {
    this.stopKeepAlive();

    if (this.connection) {
      await this.connection.end();
    }
  }
}

// Export singleton instance
module.exports = new DatabaseAdapter();
