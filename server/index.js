const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mysql = require('mysql2');
const path = require('path');

// Load environment variables from root directory
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Security headers - OWASP best practices
app.use((req, res, next) => {
  // Clickjacking protection - prevent iframe embedding
  res.setHeader('X-Frame-Options', 'DENY');

  // Modern clickjacking protection (CSP Level 2)
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");

  // Prevent MIME sniffing attacks
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // XSS protection (legacy browsers)
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Referrer policy - limit information leakage
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  next();
});

// Serve static files from React build
const buildPath = path.join(__dirname, '..', 'build');
app.use(express.static(buildPath));
console.log(`Serving static files from: ${buildPath}`);

// Database connection - using compatibility layer
const db = require('./config/database-mysql-compat');
const dbHealthCheck = require('./utils/db-health-check');
const { runMigrations } = require('./utils/migrate');
const offlineJwtVerifier = require('./services/offlineJwtVerifier');

// Import routes
const { router: authRoutes } = require('./routes/auth');
const microsoftAuthRoutes = require('./routes/microsoftAuth');
const useCaseRoutes = require('./routes/useCases');
const categoryRoutes = require('./routes/categories');
const departmentRoutes = require('./routes/departments');
const strategicPillarRoutes = require('./routes/strategicPillars');
const strategicGoalRoutes = require('./routes/strategicGoals');
const outcomesRoutes = require('./routes/outcomes');
const realtimeRoutes = require('./routes/realtime');
const intelligentChatRoutes = require('./routes/intelligentChat');
const configRoutes = require('./routes/config');
const commentsRoutes = require('./routes/comments');
const associationsRoutes = require('./routes/associations');
const likesRoutes = require('./routes/likes');
const domainRoutes = require('./routes/domains');
const userPreferencesRoutes = require('./routes/userPreferences');
const agentRoutes = require('./routes/agents');
const agentTypesRoutes = require('./routes/agentTypes');
const agentAssociationsRoutes = require('./routes/agentAssociations');
const agentLikesRoutes = require('./routes/agentLikes');
const auditLogsRoutes = require('./routes/auditLogs');
const tagsRoutes = require('./routes/tags');
const dataSensitivityLevelsRoutes = require('./routes/dataSensitivityLevels');
const skillsRoutes = require('./routes/skills');
const artifactsRoutes = require('./routes/artifacts');
const analyticsRoutes = require('./routes/analytics');

// Routes
console.log('Setting up routes...');
app.use('/api/config', configRoutes); // Config route should be public (no auth)
app.use('/api/auth', authRoutes);
app.use('/api/microsoft-auth', microsoftAuthRoutes);
app.use('/api/domains', domainRoutes);
app.use('/api/user-preferences', userPreferencesRoutes);
app.use('/api/use-cases', useCaseRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/strategic-pillars', strategicPillarRoutes);
app.use('/api/strategic-goals', strategicGoalRoutes);
app.use('/api/outcomes', outcomesRoutes);
app.use('/api/realtime', realtimeRoutes);
app.use('/api/chat', intelligentChatRoutes);
app.use('/api/skills', skillsRoutes);
app.use('/api/artifacts', artifactsRoutes);
app.use('/api', commentsRoutes);
app.use('/api', associationsRoutes);
app.use('/api', likesRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/agent-types', agentTypesRoutes);
app.use('/api', agentAssociationsRoutes);
app.use('/api', agentLikesRoutes);
app.use('/api/audit-logs', auditLogsRoutes);
app.use('/api/tags', tagsRoutes);
app.use('/api/data-sensitivity-levels', dataSensitivityLevelsRoutes);
app.use('/api/analytics', analyticsRoutes);
console.log('Routes set up successfully');

// Health check endpoint (enhanced for Azure App Service)
app.get('/api/health', async (req, res) => {
  try {
    // Check database connectivity
    await db.promise().query('SELECT 1');
    const dbStatus = dbHealthCheck.getStatus();
    res.json({ 
      status: 'healthy',
      message: 'Server is running',
      database: 'connected',
      dbHealthCheck: dbStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Health check failed:', error);
    const dbStatus = dbHealthCheck.getStatus();
    res.status(503).json({ 
      status: 'unhealthy',
      message: 'Server is running but database connection failed',
      database: 'disconnected',
      dbHealthCheck: dbStatus,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Simple health check endpoint (for basic liveness probe)
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Serve React app for all non-API routes (client-side routing)
app.get('*', (req, res) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'API route not found' });
  } else {
    res.sendFile(path.join(buildPath, 'index.html'));
  }
});

// Start server after running migrations
async function startServer() {
  try {
    // Run database migrations before starting the server
    console.log('\n=== Starting Application ===');
    await runMigrations();

    // Check JWKS JWT verifier initialization
    console.log('\n=== Checking JWT Verification Service ===');
    if (offlineJwtVerifier) {
      console.log('✅ JWT verifier initialized - will fetch JWKS keys dynamically at runtime');
      console.log('   Keys will be fetched from Microsoft on first authentication attempt');
    } else {
      console.warn('⚠️  WARNING: JWT verifier not initialized!');
    }

    // Start the Express server
    app.listen(PORT, () => {
      console.log('\n=== Server Started Successfully ===');
      console.log(`Server running on port ${PORT}`);
      console.log(`Frontend available at: http://localhost:${PORT}`);
      console.log(`API Health check at: http://localhost:${PORT}/api/health`);
      console.log(`Static files being served from: ${buildPath}`);

      // Start database health checks
      dbHealthCheck.startHealthChecks(30000); // Check every 30 seconds
      console.log('Database health monitoring started');
      console.log('=== Application Ready ===\n');
    });
  } catch (error) {
    console.error('\n=== FATAL ERROR: Failed to start application ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('\nThe application will not start until migrations complete successfully.');
    console.error('Please check the database connection and migration files.\n');
    process.exit(1); // Exit with error code to signal failure to container orchestrator
  }
}

// Start the server
startServer();

module.exports = app;