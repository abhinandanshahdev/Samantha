/**
 * PDF Service
 *
 * Provides PDF text extraction with two approaches:
 * 1. pdftotext (poppler-utils) - preferred, better layout preservation (Docker/production)
 * 2. pdf-parse (Node.js) - fallback for local development without system dependencies
 */

const fs = require('fs').promises;
const { spawn } = require('child_process');

// Check if pdftotext is available (cached)
let pdftotextAvailable = null;

const checkPdftotext = () => {
  if (pdftotextAvailable !== null) return Promise.resolve(pdftotextAvailable);

  return new Promise((resolve) => {
    const proc = spawn('pdftotext', ['-v']);
    proc.on('error', () => {
      pdftotextAvailable = false;
      resolve(false);
    });
    proc.on('close', (code) => {
      pdftotextAvailable = true;
      resolve(true);
    });
  });
};

/**
 * Extract text from PDF using pdftotext (poppler-utils)
 */
const extractWithPdftotext = async (pdfPath, outputPath, options = {}) => {
  const { layout = true, firstPage, lastPage } = options;

  return new Promise((resolve, reject) => {
    const args = [];

    if (layout) {
      args.push('-layout');
    }
    if (firstPage) {
      args.push('-f', String(firstPage));
    }
    if (lastPage) {
      args.push('-l', String(lastPage));
    }

    args.push(pdfPath, outputPath);

    const proc = spawn('pdftotext', args);

    let stderr = '';
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', async (code) => {
      if (code === 0) {
        try {
          const content = await fs.readFile(outputPath, 'utf-8');
          resolve({ success: true, content, path: outputPath, method: 'pdftotext' });
        } catch (err) {
          reject(new Error(`Failed to read output: ${err.message}`));
        }
      } else {
        reject(new Error(`pdftotext failed: ${stderr || 'Unknown error'}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to run pdftotext: ${err.message}`));
    });
  });
};

/**
 * Extract text from PDF using pdf-parse (Node.js library)
 */
const extractWithPdfParse = async (pdfBuffer) => {
  const { PDFParse } = require('pdf-parse');

  try {
    const parser = new PDFParse({ data: pdfBuffer });
    const textResult = await parser.getText();
    const info = await parser.getInfo();
    await parser.destroy();

    return {
      success: true,
      content: textResult.text || textResult,
      pageCount: info.numPages || info.total || 0,
      info: info,
      method: 'pdf-parse'
    };
  } catch (err) {
    throw new Error(`pdf-parse failed: ${err.message}`);
  }
};

/**
 * Extract text from a PDF file
 * Tries pdftotext first (better layout), falls back to pdf-parse
 *
 * @param {string} pdfPath - Path to the PDF file
 * @param {string} outputPath - Path for output text file (used by pdftotext)
 * @param {Object} options - Options like layout preservation
 * @returns {Promise<Object>} Result with extracted text
 */
const extractTextFromPdf = async (pdfPath, outputPath, options = {}) => {
  const hasPdftotext = await checkPdftotext();

  if (hasPdftotext) {
    try {
      return await extractWithPdftotext(pdfPath, outputPath, options);
    } catch (err) {
      console.warn('pdftotext failed, falling back to pdf-parse:', err.message);
    }
  }

  // Fallback to pdf-parse
  const pdfBuffer = await fs.readFile(pdfPath);
  return await extractWithPdfParse(pdfBuffer);
};

/**
 * Extract text directly from a PDF buffer (for Azure Blob downloads)
 * Uses pdf-parse since we already have the buffer
 *
 * @param {Buffer} pdfBuffer - PDF file as buffer
 * @returns {Promise<Object>} Result with extracted text
 */
const extractTextFromPdfBuffer = async (pdfBuffer) => {
  const hasPdftotext = await checkPdftotext();

  if (hasPdftotext) {
    // Write to temp file and use pdftotext for better layout
    const os = require('os');
    const path = require('path');
    const tempDir = path.join(os.tmpdir(), 'samantha-pdf');
    await fs.mkdir(tempDir, { recursive: true });

    const tempInput = path.join(tempDir, `input_${Date.now()}.pdf`);
    const tempOutput = path.join(tempDir, `output_${Date.now()}.txt`);

    try {
      await fs.writeFile(tempInput, pdfBuffer);
      const result = await extractWithPdftotext(tempInput, tempOutput, { layout: true });

      // Cleanup
      await fs.unlink(tempInput).catch(() => {});
      await fs.unlink(tempOutput).catch(() => {});

      return result;
    } catch (err) {
      // Cleanup on error
      await fs.unlink(tempInput).catch(() => {});
      await fs.unlink(tempOutput).catch(() => {});
      console.warn('pdftotext failed, falling back to pdf-parse:', err.message);
    }
  }

  // Fallback to pdf-parse (works directly with buffer)
  return await extractWithPdfParse(pdfBuffer);
};

/**
 * Get PDF metadata using pdfinfo (poppler-utils)
 * Falls back to pdf-parse metadata if pdfinfo not available
 *
 * @param {string|Buffer} pdfPathOrBuffer - Path to PDF or buffer
 * @returns {Promise<Object>} PDF metadata
 */
const getPdfInfo = async (pdfPathOrBuffer) => {
  const hasPdftotext = await checkPdftotext();

  if (hasPdftotext && typeof pdfPathOrBuffer === 'string') {
    return new Promise((resolve, reject) => {
      const proc = spawn('pdfinfo', [pdfPathOrBuffer]);

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          const info = {};
          const lines = stdout.split('\n');
          for (const line of lines) {
            const colonIndex = line.indexOf(':');
            if (colonIndex > 0) {
              const key = line.substring(0, colonIndex).trim().toLowerCase().replace(/\s+/g, '_');
              const value = line.substring(colonIndex + 1).trim();
              info[key] = value;
            }
          }
          resolve({ success: true, info, method: 'pdfinfo' });
        } else {
          reject(new Error(`pdfinfo failed: ${stderr || 'Unknown error'}`));
        }
      });

      proc.on('error', (err) => {
        reject(err);
      });
    });
  }

  // Fallback: use pdf-parse for metadata
  const { PDFParse } = require('pdf-parse');
  const buffer = typeof pdfPathOrBuffer === 'string'
    ? await fs.readFile(pdfPathOrBuffer)
    : pdfPathOrBuffer;

  const parser = new PDFParse({ data: buffer });
  const info = await parser.getInfo();
  await parser.destroy();

  return {
    success: true,
    info: {
      pages: info.numPages || info.total || 0,
      ...info
    },
    method: 'pdf-parse'
  };
};

module.exports = {
  extractTextFromPdf,
  extractTextFromPdfBuffer,
  getPdfInfo,
  checkPdftotext
};
