/**
 * Code Execution Service
 *
 * Provides sandboxed code execution for Claude agent skills.
 * Supports JavaScript execution for html2pptx workflow.
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Workspace directory for skill execution
const WORKSPACE_ROOT = path.join(__dirname, '..', 'workspace');

/**
 * Validate and sanitize a path to prevent path traversal attacks
 * @param {string} sessionId - The session ID
 * @param {string} relativePath - The relative path to validate
 * @returns {string} The sanitized full path
 * @throws {Error} If path traversal is detected
 */
const validatePath = (sessionId, relativePath) => {
  // Sanitize session ID - only allow alphanumeric and hyphens
  if (!/^[a-zA-Z0-9\-_]+$/.test(sessionId)) {
    throw new Error('Invalid session ID: contains disallowed characters');
  }

  const workspacePath = path.join(WORKSPACE_ROOT, sessionId);
  const fullPath = path.resolve(workspacePath, relativePath);

  // Ensure the resolved path is still within the workspace
  if (!fullPath.startsWith(workspacePath + path.sep) && fullPath !== workspacePath) {
    throw new Error('Path traversal detected: access denied');
  }

  return fullPath;
};

/**
 * Initialize workspace for a session
 */
const initWorkspace = async (sessionId) => {
  // Validate session ID to prevent path traversal
  if (!/^[a-zA-Z0-9\-_]+$/.test(sessionId)) {
    throw new Error('Invalid session ID: contains disallowed characters');
  }

  const workspacePath = path.join(WORKSPACE_ROOT, sessionId);
  await fs.mkdir(workspacePath, { recursive: true });
  await fs.mkdir(path.join(workspacePath, 'slides'), { recursive: true });
  await fs.mkdir(path.join(workspacePath, 'output'), { recursive: true });
  await fs.mkdir(path.join(workspacePath, 'thumbnails'), { recursive: true });
  return workspacePath;
};

/**
 * Clean up workspace after session
 */
const cleanupWorkspace = async (sessionId) => {
  // Validate session ID to prevent path traversal
  if (!/^[a-zA-Z0-9\-_]+$/.test(sessionId)) {
    throw new Error('Invalid session ID: contains disallowed characters');
  }

  const workspacePath = path.join(WORKSPACE_ROOT, sessionId);
  try {
    await fs.rm(workspacePath, { recursive: true, force: true });
  } catch (err) {
    console.warn(`Failed to cleanup workspace ${sessionId}:`, err.message);
  }
};

/**
 * Write a file to the workspace
 */
const writeFile = async (sessionId, relativePath, content) => {
  // Validate path to prevent traversal attacks
  const fullPath = validatePath(sessionId, relativePath);

  // Ensure directory exists
  await fs.mkdir(path.dirname(fullPath), { recursive: true });

  await fs.writeFile(fullPath, content, 'utf-8');
  return { success: true, path: relativePath };
};

/**
 * Read a file from the workspace
 */
const readFile = async (sessionId, relativePath) => {
  // Validate path to prevent traversal attacks
  const fullPath = validatePath(sessionId, relativePath);

  const content = await fs.readFile(fullPath, 'utf-8');
  return { success: true, content };
};

/**
 * Read a file as base64 (for images)
 */
const readFileBase64 = async (sessionId, relativePath) => {
  // Validate path to prevent traversal attacks
  const fullPath = validatePath(sessionId, relativePath);

  const content = await fs.readFile(fullPath);
  return { success: true, base64: content.toString('base64') };
};

/**
 * List files in workspace directory
 */
const listFiles = async (sessionId, relativePath = '') => {
  // Validate path to prevent traversal attacks
  const fullPath = validatePath(sessionId, relativePath || '.');

  const entries = await fs.readdir(fullPath, { withFileTypes: true });
  const files = entries.map(entry => ({
    name: entry.name,
    type: entry.isDirectory() ? 'directory' : 'file',
    path: path.join(relativePath, entry.name)
  }));

  return { success: true, files };
};

/**
 * Execute JavaScript code in the workspace context
 */
const executeJavaScript = async (sessionId, code, timeout = 30000) => {
  const workspacePath = path.join(WORKSPACE_ROOT, sessionId);

  // Create a wrapper script that executes the code
  const wrapperCode = `
const fs = require('fs');
const path = require('path');
const workspacePath = ${JSON.stringify(workspacePath)};

// Change to workspace directory
process.chdir(workspacePath);

// Execute user code
(async () => {
  try {
    ${code}
  } catch (error) {
    console.error('Execution error:', error.message);
    process.exit(1);
  }
})();
`;

  const scriptPath = path.join(workspacePath, '_exec_' + uuidv4() + '.js');
  await fs.writeFile(scriptPath, wrapperCode);

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';

    const proc = spawn('node', [scriptPath], {
      cwd: workspacePath,
      timeout: timeout,
      env: { ...process.env, NODE_PATH: path.join(__dirname, '..', '..', 'node_modules') }
    });

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', async (code) => {
      // Clean up script file
      try {
        await fs.unlink(scriptPath);
      } catch (e) {}

      resolve({
        success: code === 0,
        exitCode: code,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });

    proc.on('error', async (err) => {
      try {
        await fs.unlink(scriptPath);
      } catch (e) {}

      resolve({
        success: false,
        error: err.message,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });
  });
};

/**
 * Get workspace path for direct file operations
 */
const getWorkspacePath = (sessionId) => {
  return path.join(WORKSPACE_ROOT, sessionId);
};

module.exports = {
  initWorkspace,
  cleanupWorkspace,
  writeFile,
  readFile,
  readFileBase64,
  listFiles,
  executeJavaScript,
  getWorkspacePath,
  WORKSPACE_ROOT
};
