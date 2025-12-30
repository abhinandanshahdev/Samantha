// MySQL compatibility layer for the new database adapter
const dbAdapter = require('./database-adapter');

// Initialize connection on module load
let initialized = false;

async function initialize() {
  if (!initialized) {
    await dbAdapter.connect();
    initialized = true;
  }
}

// Create MySQL-compatible interface
const mysqlCompat = {
  // MySQL2 promise-based query
  execute: async (query, params = []) => {
    await initialize();
    // Checkmarx Suppression: False positive - query and params are passed to parameterized query wrapper
    const results = await dbAdapter.query(query, params);
    return [results, null]; // MySQL2 format: [results, fields]
  },
  
  // MySQL2 callback-based query (for backward compatibility)
  query: (query, params, callback) => {
    // Handle different call signatures
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    
    initialize()
      .then(() => dbAdapter.query(query, params))
      .then(results => {
        if (callback) callback(null, results);
      })
      .catch(err => {
        if (callback) callback(err);
      });
  },
  
  // Connection methods
  connect: (callback) => {
    initialize()
      .then(() => {
        if (callback) callback(null);
      })
      .catch(err => {
        if (callback) callback(err);
      });
  },
  
  end: async () => {
    await dbAdapter.close();
  },
  
  // Helper methods from adapter
  insert: async (query, params = []) => {
    await initialize();
    return await dbAdapter.insert(query, params);
  },
  
  update: async (query, params = []) => {
    await initialize();
    return await dbAdapter.update(query, params);
  },
  
  delete: async (query, params = []) => {
    await initialize();
    return await dbAdapter.delete(query, params);
  },

  // Add promise() method for compatibility
  promise: () => {
    return {
      query: async (query, params = []) => {
        await initialize();
        // Checkmarx Suppression: False positive - query and params are passed to parameterized query wrapper
        const results = await dbAdapter.query(query, params);
        return [results, null]; // MySQL2 format: [results, fields]
      },
      execute: async (query, params = []) => {
        await initialize();
        const results = await dbAdapter.query(query, params);
        return [results, null]; // MySQL2 format: [results, fields]
      }
    };
  }
};

// Auto-initialize on first import
initialize().catch(console.error);

module.exports = mysqlCompat;