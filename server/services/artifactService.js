/**
 * Artifact Service
 *
 * Generic service for creating downloadable artifacts (PPT, Excel, PDF, etc.)
 * from structured data. Supports multiple file formats and provides
 * temporary storage for downloads.
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const PptxGenJS = require('pptxgenjs');
const ExcelJS = require('exceljs');

// Artifacts storage directory
const ARTIFACTS_DIR = path.join(__dirname, '../artifacts');

// Artifact expiration time (1 hour)
const ARTIFACT_EXPIRY_MS = 60 * 60 * 1000;

// Supported artifact types
const ARTIFACT_TYPES = {
  PRESENTATION: 'presentation',
  SPREADSHEET: 'spreadsheet',
  DASHBOARD: 'dashboard',
  DOCUMENT: 'document',
  MARKDOWN: 'markdown',
  JSON: 'json',
  CSV: 'csv'
};

// File extensions by type
const FILE_EXTENSIONS = {
  [ARTIFACT_TYPES.PRESENTATION]: '.pptx',
  [ARTIFACT_TYPES.SPREADSHEET]: '.xlsx',
  [ARTIFACT_TYPES.DASHBOARD]: '.html',
  [ARTIFACT_TYPES.DOCUMENT]: '.docx',
  [ARTIFACT_TYPES.MARKDOWN]: '.md',
  [ARTIFACT_TYPES.JSON]: '.json',
  [ARTIFACT_TYPES.CSV]: '.csv'
};

// MIME types by artifact type
const MIME_TYPES = {
  [ARTIFACT_TYPES.PRESENTATION]: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  [ARTIFACT_TYPES.SPREADSHEET]: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  [ARTIFACT_TYPES.DASHBOARD]: 'text/html',
  [ARTIFACT_TYPES.DOCUMENT]: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  [ARTIFACT_TYPES.MARKDOWN]: 'text/markdown',
  [ARTIFACT_TYPES.JSON]: 'application/json',
  [ARTIFACT_TYPES.CSV]: 'text/csv'
};

// In-memory artifact registry
const artifactRegistry = new Map();

/**
 * Generate a unique artifact ID
 */
const generateArtifactId = () => {
  return crypto.randomBytes(16).toString('hex');
};

/**
 * Ensure artifacts directory exists
 */
const ensureArtifactsDir = async () => {
  try {
    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
};

/**
 * Clean up expired artifacts
 */
const cleanupExpiredArtifacts = async () => {
  const now = Date.now();
  const expiredIds = [];

  for (const [id, artifact] of artifactRegistry.entries()) {
    if (now - artifact.createdAt > ARTIFACT_EXPIRY_MS) {
      expiredIds.push(id);
    }
  }

  for (const id of expiredIds) {
    const artifact = artifactRegistry.get(id);
    if (artifact?.filePath) {
      try {
        await fs.unlink(artifact.filePath);
      } catch (err) {
        console.warn(`Failed to delete expired artifact ${id}:`, err.message);
      }
    }
    artifactRegistry.delete(id);
  }

  if (expiredIds.length > 0) {
    console.log(`🧹 Cleaned up ${expiredIds.length} expired artifacts`);
  }
};

// Run cleanup every 15 minutes
setInterval(cleanupExpiredArtifacts, 15 * 60 * 1000);

/**
 * Create a PowerPoint presentation artifact
 *
 * @param {Object} data - Presentation data
 * @param {string} data.title - Presentation title
 * @param {Array} data.slides - Array of slide objects
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} Artifact metadata
 */
const createPresentation = async (data, options = {}) => {
  await ensureArtifactsDir();

  const pptx = new PptxGenJS();

  // Set presentation properties
  pptx.title = data.title || 'Presentation';
  pptx.author = options.author || 'Hekmah AI';
  pptx.company = options.company || 'Department of Finance, Abu Dhabi';
  pptx.subject = data.subject || 'AI-Generated Presentation';

  // Define master slide with DoF branding
  pptx.defineSlideMaster({
    title: 'DOF_MASTER',
    background: { color: 'FFFFFF' },
    objects: [
      // Header bar
      { rect: { x: 0, y: 0, w: '100%', h: 0.5, fill: { color: 'D4AF37' } } },
      // Footer
      { text: { text: 'Department of Finance, Abu Dhabi', options: { x: 0.5, y: 5.2, w: 5, h: 0.3, fontSize: 8, color: '666666' } } }
    ]
  });

  // Process each slide
  for (const slideData of (data.slides || [])) {
    const slide = pptx.addSlide({ masterName: 'DOF_MASTER' });

    // Add slide title
    if (slideData.title) {
      slide.addText(slideData.title, {
        x: 0.5,
        y: 0.7,
        w: 9,
        h: 0.6,
        fontSize: 24,
        bold: true,
        color: '2C3E50'
      });
    }

    // Add slide content based on type
    if (slideData.type === 'title') {
      // Title slide
      slide.addText(slideData.subtitle || '', {
        x: 0.5,
        y: 2.5,
        w: 9,
        h: 0.5,
        fontSize: 16,
        color: '666666'
      });
      if (slideData.date) {
        slide.addText(slideData.date, {
          x: 0.5,
          y: 3.2,
          w: 9,
          h: 0.4,
          fontSize: 12,
          color: '999999'
        });
      }
    } else if (slideData.type === 'bullets' || slideData.bullets) {
      // Bullet points slide
      const bullets = slideData.bullets || slideData.content || [];
      const bulletText = bullets.map(b => ({
        text: typeof b === 'string' ? b : b.text,
        options: { bullet: true, indentLevel: b.level || 0 }
      }));

      slide.addText(bulletText, {
        x: 0.5,
        y: 1.5,
        w: 9,
        h: 3.5,
        fontSize: 14,
        color: '333333',
        valign: 'top'
      });
    } else if (slideData.type === 'table' || slideData.table) {
      // Table slide
      const tableData = slideData.table || slideData.data || [];
      if (tableData.length > 0) {
        slide.addTable(tableData, {
          x: 0.5,
          y: 1.5,
          w: 9,
          fontSize: 11,
          border: { pt: 0.5, color: 'CCCCCC' },
          fill: { color: 'F9F9F9' },
          valign: 'middle'
        });
      }
    } else if (slideData.content) {
      // Generic text content
      const content = Array.isArray(slideData.content)
        ? slideData.content.join('\n\n')
        : slideData.content;

      slide.addText(content, {
        x: 0.5,
        y: 1.5,
        w: 9,
        h: 3.5,
        fontSize: 14,
        color: '333333',
        valign: 'top'
      });
    }
  }

  // Generate file
  const artifactId = generateArtifactId();
  const fileName = `${sanitizeFileName(data.title || 'presentation')}_${artifactId.slice(0, 8)}${FILE_EXTENSIONS[ARTIFACT_TYPES.PRESENTATION]}`;
  const filePath = path.join(ARTIFACTS_DIR, fileName);

  await pptx.writeFile({ fileName: filePath });

  // Register artifact
  const artifact = {
    id: artifactId,
    type: ARTIFACT_TYPES.PRESENTATION,
    title: data.title || 'Presentation',
    fileName,
    filePath,
    mimeType: MIME_TYPES[ARTIFACT_TYPES.PRESENTATION],
    createdAt: Date.now(),
    slideCount: data.slides?.length || 0
  };

  artifactRegistry.set(artifactId, artifact);
  console.log(`📊 Created presentation artifact: ${artifactId} (${artifact.slideCount} slides)`);

  return artifact;
};

/**
 * Create an Excel spreadsheet artifact
 *
 * @param {Object} data - Spreadsheet data
 * @param {string} data.title - Spreadsheet title
 * @param {Array} data.sheets - Array of sheet objects
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} Artifact metadata
 */
const createSpreadsheet = async (data, options = {}) => {
  await ensureArtifactsDir();

  const workbook = new ExcelJS.Workbook();
  workbook.creator = options.author || 'Hekmah AI';
  workbook.created = new Date();

  // Process each sheet
  for (const sheetData of (data.sheets || [{ name: 'Sheet1', data: data.data || [] }])) {
    const sheet = workbook.addWorksheet(sheetData.name || 'Sheet1');

    // Add headers if provided
    if (sheetData.headers) {
      sheet.addRow(sheetData.headers);
      // Style header row
      sheet.getRow(1).font = { bold: true };
      sheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD4AF37' }
      };
    }

    // Add data rows
    const rows = sheetData.data || sheetData.rows || [];
    for (const row of rows) {
      sheet.addRow(Array.isArray(row) ? row : Object.values(row));
    }

    // Auto-fit columns
    sheet.columns.forEach(column => {
      let maxLength = 10;
      column.eachCell({ includeEmpty: true }, cell => {
        const cellLength = cell.value ? String(cell.value).length : 0;
        if (cellLength > maxLength) {
          maxLength = Math.min(cellLength, 50);
        }
      });
      column.width = maxLength + 2;
    });
  }

  // Generate file
  const artifactId = generateArtifactId();
  const fileName = `${sanitizeFileName(data.title || 'spreadsheet')}_${artifactId.slice(0, 8)}${FILE_EXTENSIONS[ARTIFACT_TYPES.SPREADSHEET]}`;
  const filePath = path.join(ARTIFACTS_DIR, fileName);

  await workbook.xlsx.writeFile(filePath);

  // Register artifact
  const artifact = {
    id: artifactId,
    type: ARTIFACT_TYPES.SPREADSHEET,
    title: data.title || 'Spreadsheet',
    fileName,
    filePath,
    mimeType: MIME_TYPES[ARTIFACT_TYPES.SPREADSHEET],
    createdAt: Date.now(),
    sheetCount: data.sheets?.length || 1
  };

  artifactRegistry.set(artifactId, artifact);
  console.log(`Created spreadsheet artifact: ${artifactId} (${artifact.sheetCount} sheets)`);

  return artifact;
};

/**
 * Create an HTML Dashboard artifact
 *
 * @param {Object} data - Dashboard data
 * @param {string} data.title - Dashboard title
 * @param {string} data.content - Complete HTML content (including <!DOCTYPE html>)
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} Artifact metadata
 */
const createDashboard = async (data, options = {}) => {
  await ensureArtifactsDir();

  // Use provided HTML content directly
  let htmlContent = data.content || data.html || '';

  // If no complete HTML provided, wrap in basic structure
  if (!htmlContent.includes('<!DOCTYPE html>') && !htmlContent.includes('<html')) {
    htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.title || 'Dashboard'}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
      min-height: 100vh;
      padding: 2rem;
    }
    .dashboard-container { max-width: 1400px; margin: 0 auto; }
    .dashboard-header {
      background: linear-gradient(135deg, #B79546 0%, #D4AF37 100%);
      color: white;
      padding: 1.5rem 2rem;
      border-radius: 12px;
      margin-bottom: 2rem;
      box-shadow: 0 4px 20px rgba(183, 149, 70, 0.3);
    }
    .dashboard-header h1 { font-size: 1.75rem; font-weight: 600; }
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; }
    .kpi-card {
      background: white;
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
      border-left: 4px solid #B79546;
    }
    .kpi-label { color: #6c757d; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.5px; }
    .kpi-value { font-size: 2.5rem; font-weight: 700; color: #2c3e50; margin: 0.5rem 0; }
    .kpi-change { font-size: 0.875rem; }
    .kpi-change.positive { color: #22c55e; }
    .kpi-change.negative { color: #ef4444; }
    .chart-container {
      background: white;
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
      margin-bottom: 1.5rem;
    }
    .chart-title { font-size: 1.125rem; font-weight: 600; color: #2c3e50; margin-bottom: 1rem; }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
    }
    .data-table th {
      background: #B79546;
      color: white;
      padding: 1rem;
      text-align: left;
      font-weight: 600;
    }
    .data-table td { padding: 1rem; border-bottom: 1px solid #e9ecef; }
    .data-table tr:hover { background: #f8f9fa; }
  </style>
</head>
<body>
  <div class="dashboard-container">
    <div class="dashboard-header">
      <h1>${data.title || 'Dashboard'}</h1>
    </div>
    ${htmlContent}
  </div>
</body>
</html>`;
  }

  // Generate file
  const artifactId = generateArtifactId();
  const fileName = `${sanitizeFileName(data.title || 'dashboard')}_${artifactId.slice(0, 8)}${FILE_EXTENSIONS[ARTIFACT_TYPES.DASHBOARD]}`;
  const filePath = path.join(ARTIFACTS_DIR, fileName);

  await fs.writeFile(filePath, htmlContent, 'utf-8');

  // Register artifact
  const artifact = {
    id: artifactId,
    type: ARTIFACT_TYPES.DASHBOARD,
    title: data.title || 'Dashboard',
    fileName,
    filePath,
    mimeType: MIME_TYPES[ARTIFACT_TYPES.DASHBOARD],
    createdAt: Date.now()
  };

  artifactRegistry.set(artifactId, artifact);
  console.log(`Created dashboard artifact: ${artifactId}`);

  return artifact;
};

/**
 * Create a Markdown artifact
 *
 * @param {Object} data - Markdown data
 * @param {string} data.title - Document title
 * @param {string} data.content - Markdown content
 * @returns {Promise<Object>} Artifact metadata
 */
const createMarkdown = async (data) => {
  await ensureArtifactsDir();

  const content = data.content || '';
  const artifactId = generateArtifactId();
  const fileName = `${sanitizeFileName(data.title || 'document')}_${artifactId.slice(0, 8)}${FILE_EXTENSIONS[ARTIFACT_TYPES.MARKDOWN]}`;
  const filePath = path.join(ARTIFACTS_DIR, fileName);

  await fs.writeFile(filePath, content, 'utf-8');

  const artifact = {
    id: artifactId,
    type: ARTIFACT_TYPES.MARKDOWN,
    title: data.title || 'Document',
    fileName,
    filePath,
    mimeType: MIME_TYPES[ARTIFACT_TYPES.MARKDOWN],
    createdAt: Date.now()
  };

  artifactRegistry.set(artifactId, artifact);
  console.log(`📝 Created markdown artifact: ${artifactId}`);

  return artifact;
};

/**
 * Create a JSON artifact
 *
 * @param {Object} data - JSON data
 * @param {string} data.title - Document title
 * @param {Object} data.content - JSON content
 * @returns {Promise<Object>} Artifact metadata
 */
const createJSON = async (data) => {
  await ensureArtifactsDir();

  const content = JSON.stringify(data.content || data.data || {}, null, 2);
  const artifactId = generateArtifactId();
  const fileName = `${sanitizeFileName(data.title || 'data')}_${artifactId.slice(0, 8)}${FILE_EXTENSIONS[ARTIFACT_TYPES.JSON]}`;
  const filePath = path.join(ARTIFACTS_DIR, fileName);

  await fs.writeFile(filePath, content, 'utf-8');

  const artifact = {
    id: artifactId,
    type: ARTIFACT_TYPES.JSON,
    title: data.title || 'Data Export',
    fileName,
    filePath,
    mimeType: MIME_TYPES[ARTIFACT_TYPES.JSON],
    createdAt: Date.now()
  };

  artifactRegistry.set(artifactId, artifact);
  console.log(`📋 Created JSON artifact: ${artifactId}`);

  return artifact;
};

/**
 * Create a CSV artifact
 *
 * @param {Object} data - CSV data
 * @param {string} data.title - Document title
 * @param {Array} data.headers - Column headers
 * @param {Array} data.rows - Data rows
 * @returns {Promise<Object>} Artifact metadata
 */
const createCSV = async (data) => {
  await ensureArtifactsDir();

  const rows = [];

  // Add headers
  if (data.headers) {
    rows.push(data.headers.map(h => escapeCSV(h)).join(','));
  }

  // Add data rows
  for (const row of (data.rows || data.data || [])) {
    const values = Array.isArray(row) ? row : Object.values(row);
    rows.push(values.map(v => escapeCSV(v)).join(','));
  }

  const content = rows.join('\n');
  const artifactId = generateArtifactId();
  const fileName = `${sanitizeFileName(data.title || 'export')}_${artifactId.slice(0, 8)}${FILE_EXTENSIONS[ARTIFACT_TYPES.CSV]}`;
  const filePath = path.join(ARTIFACTS_DIR, fileName);

  await fs.writeFile(filePath, content, 'utf-8');

  const artifact = {
    id: artifactId,
    type: ARTIFACT_TYPES.CSV,
    title: data.title || 'Data Export',
    fileName,
    filePath,
    mimeType: MIME_TYPES[ARTIFACT_TYPES.CSV],
    createdAt: Date.now(),
    rowCount: data.rows?.length || data.data?.length || 0
  };

  artifactRegistry.set(artifactId, artifact);
  console.log(`📄 Created CSV artifact: ${artifactId} (${artifact.rowCount} rows)`);

  return artifact;
};

/**
 * Get artifact by ID
 */
const getArtifact = (artifactId) => {
  return artifactRegistry.get(artifactId) || null;
};

/**
 * Get artifact file stream
 */
const getArtifactStream = async (artifactId) => {
  const artifact = getArtifact(artifactId);
  if (!artifact) {
    throw new Error('Artifact not found');
  }

  // Check if file exists
  try {
    await fs.access(artifact.filePath);
  } catch {
    throw new Error('Artifact file not found');
  }

  return {
    artifact,
    stream: require('fs').createReadStream(artifact.filePath)
  };
};

/**
 * Delete an artifact
 */
const deleteArtifact = async (artifactId) => {
  const artifact = getArtifact(artifactId);
  if (!artifact) {
    return false;
  }

  try {
    await fs.unlink(artifact.filePath);
  } catch (err) {
    console.warn(`Failed to delete artifact file:`, err.message);
  }

  artifactRegistry.delete(artifactId);
  return true;
};

/**
 * List all artifacts (for debugging)
 */
const listArtifacts = () => {
  return Array.from(artifactRegistry.values());
};

/**
 * Register an external file as an artifact
 * Used when files are created by other services (like html2pptx)
 *
 * @param {string} filePath - Absolute path to the file
 * @param {string} title - Display title
 * @param {string} type - Artifact type
 * @returns {Promise<Object>} Artifact metadata
 */
const registerExternalFile = async (filePath, title, type = 'presentation') => {
  const fs = require('fs').promises;
  const path = require('path');

  // Verify file exists
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`File not found: ${filePath}`);
  }

  const fileName = path.basename(filePath);
  const artifactId = generateArtifactId();

  // Determine MIME type
  const ext = path.extname(fileName).toLowerCase();
  let mimeType = MIME_TYPES[type];
  if (!mimeType) {
    switch (ext) {
      case '.pptx':
        mimeType = MIME_TYPES[ARTIFACT_TYPES.PRESENTATION];
        break;
      case '.xlsx':
        mimeType = MIME_TYPES[ARTIFACT_TYPES.SPREADSHEET];
        break;
      case '.docx':
        mimeType = MIME_TYPES[ARTIFACT_TYPES.DOCUMENT];
        break;
      case '.html':
      case '.htm':
        mimeType = MIME_TYPES[ARTIFACT_TYPES.DASHBOARD];
        break;
      case '.md':
        mimeType = MIME_TYPES[ARTIFACT_TYPES.MARKDOWN];
        break;
      case '.json':
        mimeType = MIME_TYPES[ARTIFACT_TYPES.JSON];
        break;
      case '.csv':
        mimeType = MIME_TYPES[ARTIFACT_TYPES.CSV];
        break;
      default:
        mimeType = 'application/octet-stream';
    }
  }

  const artifact = {
    id: artifactId,
    type: type,
    title: title,
    fileName: fileName,
    filePath: filePath,
    mimeType: mimeType,
    createdAt: Date.now(),
    external: true
  };

  artifactRegistry.set(artifactId, artifact);
  console.log(`📎 Registered external artifact: ${artifactId} (${fileName})`);

  return artifact;
};

/**
 * Create artifact based on type
 * Main entry point for artifact creation
 */
const createArtifact = async (type, data, options = {}) => {
  console.log(`🎨 Creating artifact of type: ${type}`);

  switch (type) {
    case ARTIFACT_TYPES.PRESENTATION:
    case 'pptx':
    case 'ppt':
    case 'powerpoint':
      return createPresentation(data, options);

    case ARTIFACT_TYPES.SPREADSHEET:
    case 'xlsx':
    case 'excel':
      return createSpreadsheet(data, options);

    case ARTIFACT_TYPES.DASHBOARD:
    case 'html':
    case 'dashboard':
      return createDashboard(data, options);

    case ARTIFACT_TYPES.MARKDOWN:
    case 'md':
    case 'markdown':
      return createMarkdown(data);

    case ARTIFACT_TYPES.JSON:
    case 'json':
      return createJSON(data);

    case ARTIFACT_TYPES.CSV:
    case 'csv':
      return createCSV(data);

    default:
      throw new Error(`Unsupported artifact type: ${type}. Supported types: 'presentation', 'spreadsheet', 'dashboard', 'markdown', 'json', 'csv'. For DOCX, use docxService.createDocx() then registerExternalFile().`);
  }
};

// Helper functions
const sanitizeFileName = (name) => {
  return name
    .replace(/[^a-zA-Z0-9-_\s]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50);
};

const escapeCSV = (value) => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

module.exports = {
  createArtifact,
  createPresentation,
  createSpreadsheet,
  createDashboard,
  getArtifact,
  getArtifactStream,
  deleteArtifact,
  listArtifacts,
  registerExternalFile,
  ARTIFACT_TYPES,
  MIME_TYPES,
  FILE_EXTENSIONS
};
