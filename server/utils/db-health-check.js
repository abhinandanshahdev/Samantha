const dbAdapter = require('../config/database-adapter');

class DatabaseHealthCheck {
  constructor() {
    this.isHealthy = true;
    this.lastCheck = new Date();
    this.checkInterval = null;
  }

  async checkHealth() {
    try {
      // Simple health check query
      await dbAdapter.query('SELECT 1 as health_check');
      this.isHealthy = true;
      this.lastCheck = new Date();
      return true;
    } catch (error) {
      console.error('Database health check failed:', error.message);
      this.isHealthy = false;
      
      // Attempt to reconnect
      try {
        await dbAdapter.reconnect();
        console.log('Database reconnected after health check failure');
        this.isHealthy = true;
        return true;
      } catch (reconnectError) {
        console.error('Failed to reconnect during health check:', reconnectError.message);
        return false;
      }
    }
  }

  startHealthChecks(intervalMs = 30000) {
    // Check every 30 seconds by default
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    // Initial check
    this.checkHealth();

    // Set up periodic checks
    this.checkInterval = setInterval(async () => {
      await this.checkHealth();
    }, intervalMs);

    console.log(`Database health checks started (interval: ${intervalMs}ms)`);
  }

  stopHealthChecks() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('Database health checks stopped');
    }
  }

  getStatus() {
    return {
      healthy: this.isHealthy,
      lastCheck: this.lastCheck,
      timeSinceLastCheck: Date.now() - this.lastCheck.getTime()
    };
  }
}

module.exports = new DatabaseHealthCheck();