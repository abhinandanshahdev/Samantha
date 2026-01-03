/**
 * DOCX Service
 *
 * Provides Word document generation using the docx library.
 * Similar to html2pptxService but for Word documents.
 */

const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  Header,
  Footer,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
  WidthType,
  ShadingType,
  VerticalAlign,
  PageNumber,
  LevelFormat,
  TableOfContents,
  PageBreak
} = require('docx');
const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

// Default professional document colors (neutral)
const DEFAULT_COLORS = {
  primary: '2C3E50',      // Dark blue-gray for headings
  secondary: '34495E',    // Lighter blue-gray
  accent: '3498DB',       // Blue accent
  gray: '666666',
  black: '000000',
  white: 'FFFFFF',
  lightGray: 'F5F5F5',
  tableHeader: 'E8F4F8',  // Light blue-gray
  highlight: 'FFF9E6'     // Light yellow for highlights
};

/**
 * Create a professional Word document
 * @param {string} workspacePath - Path to workspace directory
 * @param {Object} options - Document options
 * @param {Object} options.colors - Custom color overrides (primary, secondary, accent, etc.)
 * @param {string} options.font - Custom font family (default: Arial)
 * @returns {Object} Result with path and filename
 */
const createDocx = async (workspacePath, options) => {
  const {
    title,
    subtitle,
    author,
    sections = [],
    includeTableOfContents = false,
    headerText,
    footerText,
    colors = {},
    font = 'Arial'
  } = options;

  // Merge custom colors with defaults
  const DOC_COLORS = { ...DEFAULT_COLORS, ...colors };

  // Build numbering configurations for lists
  const numberingConfigs = [
    {
      reference: 'bullet-list',
      levels: [{
        level: 0,
        format: LevelFormat.BULLET,
        text: '\u2022',
        alignment: AlignmentType.LEFT,
        style: {
          paragraph: {
            indent: { left: 720, hanging: 360 }
          }
        }
      }]
    },
    {
      reference: 'numbered-list',
      levels: [{
        level: 0,
        format: LevelFormat.DECIMAL,
        text: '%1.',
        alignment: AlignmentType.LEFT,
        style: {
          paragraph: {
            indent: { left: 720, hanging: 360 }
          }
        }
      }]
    }
  ];

  // Add unique numbered list references for each section that needs one
  let numberedListCounter = 0;
  sections.forEach(section => {
    if (section.content) {
      section.content.forEach(item => {
        if (item.type === 'numbered') {
          numberedListCounter++;
          numberingConfigs.push({
            reference: `numbered-list-${numberedListCounter}`,
            levels: [{
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 720, hanging: 360 }
                }
              }
            }]
          });
          item._listRef = `numbered-list-${numberedListCounter}`;
        }
      });
    }
  });

  // Build document children
  const documentChildren = [];

  // Add title
  if (title) {
    documentChildren.push(
      new Paragraph({
        heading: HeadingLevel.TITLE,
        children: [new TextRun({ text: title })]
      })
    );
  }

  // Add subtitle
  if (subtitle) {
    documentChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
        children: [new TextRun({ text: subtitle, italics: true, color: DOC_COLORS.gray })]
      })
    );
  }

  // Add table of contents
  if (includeTableOfContents) {
    documentChildren.push(
      new TableOfContents('Table of Contents', {
        hyperlink: true,
        headingStyleRange: '1-3'
      }),
      new Paragraph({ children: [new PageBreak()] })
    );
  }

  // Add sections
  for (const section of sections) {
    // Add section heading
    if (section.heading) {
      const headingLevel = section.level === 2 ? HeadingLevel.HEADING_2 :
                          section.level === 3 ? HeadingLevel.HEADING_3 :
                          HeadingLevel.HEADING_1;
      documentChildren.push(
        new Paragraph({
          heading: headingLevel,
          children: [new TextRun({ text: section.heading })]
        })
      );
    }

    // Add section content
    if (section.content) {
      for (const item of section.content) {
        const contentElements = buildContentElement(item, numberingConfigs, DOC_COLORS);
        documentChildren.push(...contentElements);
      }
    }
  }

  // Build the document
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: font, size: 22 } // 11pt
        }
      },
      paragraphStyles: [
        {
          id: 'Title',
          name: 'Title',
          basedOn: 'Normal',
          run: { size: 48, bold: true, color: DOC_COLORS.primary, font: font },
          paragraph: { spacing: { before: 240, after: 120 }, alignment: AlignmentType.CENTER }
        },
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 36, bold: true, color: DOC_COLORS.primary, font: font },
          paragraph: { spacing: { before: 360, after: 240 }, outlineLevel: 0 }
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 28, bold: true, color: DOC_COLORS.secondary, font: font },
          paragraph: { spacing: { before: 240, after: 180 }, outlineLevel: 1 }
        },
        {
          id: 'Heading3',
          name: 'Heading 3',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 24, bold: true, color: DOC_COLORS.gray, font: font },
          paragraph: { spacing: { before: 180, after: 120 }, outlineLevel: 2 }
        }
      ]
    },
    numbering: {
      config: numberingConfigs
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
        }
      },
      headers: headerText ? {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: headerText, color: DOC_COLORS.gray, size: 20 })]
          })]
        })
      } : undefined,
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: footerText ? [
              new TextRun({ text: footerText, color: DOC_COLORS.gray, size: 18 }),
              new TextRun({ text: '  |  Page ', color: DOC_COLORS.gray, size: 18 }),
              new TextRun({ children: [PageNumber.CURRENT], color: DOC_COLORS.gray, size: 18 }),
              new TextRun({ text: ' of ', color: DOC_COLORS.gray, size: 18 }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], color: DOC_COLORS.gray, size: 18 })
            ] : [
              new TextRun({ text: 'Page ', color: DOC_COLORS.gray, size: 18 }),
              new TextRun({ children: [PageNumber.CURRENT], color: DOC_COLORS.gray, size: 18 }),
              new TextRun({ text: ' of ', color: DOC_COLORS.gray, size: 18 }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], color: DOC_COLORS.gray, size: 18 })
            ]
          })]
        })
      },
      children: documentChildren
    }]
  });

  // Generate the document
  const buffer = await Packer.toBuffer(doc);

  // Save to workspace
  const outputDir = path.join(workspacePath, 'output');
  await fs.mkdir(outputDir, { recursive: true });

  const sanitizedTitle = (title || 'document').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
  const filename = `${sanitizedTitle}_${Date.now()}.docx`;
  const outputPath = path.join(outputDir, filename);

  await fs.writeFile(outputPath, buffer);

  return {
    success: true,
    path: outputPath,
    filename: filename,
    sectionCount: sections.length
  };
};

/**
 * Build content elements from structured content
 */
function buildContentElement(item, numberingConfigs, DOC_COLORS) {
  const elements = [];

  switch (item.type) {
    case 'paragraph':
      elements.push(
        new Paragraph({
          spacing: { after: 200 },
          children: [new TextRun({ text: item.text })]
        })
      );
      break;

    case 'bullet':
      if (item.items && Array.isArray(item.items)) {
        for (const bulletItem of item.items) {
          elements.push(
            new Paragraph({
              numbering: { reference: 'bullet-list', level: 0 },
              children: [new TextRun({ text: bulletItem })]
            })
          );
        }
      }
      break;

    case 'numbered':
      if (item.items && Array.isArray(item.items)) {
        const listRef = item._listRef || 'numbered-list';
        for (const numberedItem of item.items) {
          elements.push(
            new Paragraph({
              numbering: { reference: listRef, level: 0 },
              children: [new TextRun({ text: numberedItem })]
            })
          );
        }
      }
      break;

    case 'table':
      elements.push(buildTable(item, DOC_COLORS));
      elements.push(new Paragraph({ spacing: { after: 200 }, children: [] })); // Space after table
      break;

    case 'highlight':
      elements.push(
        new Paragraph({
          spacing: { before: 200, after: 200 },
          shading: { fill: DOC_COLORS.highlight, type: ShadingType.CLEAR },
          indent: { left: 360, right: 360 },
          children: [
            item.title ? new TextRun({ text: item.title + ': ', bold: true, color: DOC_COLORS.primary }) : null,
            new TextRun({ text: item.text })
          ].filter(Boolean)
        })
      );
      break;

    case 'pagebreak':
      elements.push(new Paragraph({ children: [new PageBreak()] }));
      break;

    default:
      // Treat unknown types as paragraphs
      if (item.text) {
        elements.push(
          new Paragraph({
            spacing: { after: 200 },
            children: [new TextRun({ text: item.text })]
          })
        );
      }
  }

  return elements;
}

/**
 * Build a table from structured data
 */
function buildTable(item, DOC_COLORS) {
  const { headers = [], rows = [] } = item;
  const columnCount = headers.length || (rows[0] ? rows[0].length : 2);
  const columnWidth = Math.floor(9360 / columnCount); // 9360 DXA = 6.5 inches usable width

  const tableBorder = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
  const cellBorders = { top: tableBorder, bottom: tableBorder, left: tableBorder, right: tableBorder };

  const tableRows = [];

  // Header row
  if (headers.length > 0) {
    tableRows.push(
      new TableRow({
        tableHeader: true,
        children: headers.map(header =>
          new TableCell({
            borders: cellBorders,
            width: { size: columnWidth, type: WidthType.DXA },
            shading: { fill: DOC_COLORS.primary, type: ShadingType.CLEAR },
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: header, bold: true, color: DOC_COLORS.white })]
            })]
          })
        )
      })
    );
  }

  // Data rows
  for (const row of rows) {
    tableRows.push(
      new TableRow({
        children: row.map(cell =>
          new TableCell({
            borders: cellBorders,
            width: { size: columnWidth, type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({
              children: [new TextRun({ text: String(cell) })]
            })]
          })
        )
      })
    );
  }

  return new Table({
    columnWidths: Array(columnCount).fill(columnWidth),
    rows: tableRows
  });
}

/**
 * Extract text from a DOCX file using pandoc
 * @param {string} docxPath - Path to the DOCX file
 * @param {string} outputPath - Path for output markdown file
 * @param {Object} options - Options like trackChanges
 * @returns {Promise<Object>} Result with extracted text
 */
const extractTextFromDocx = async (docxPath, outputPath, options = {}) => {
  const { trackChanges = 'all' } = options;

  return new Promise((resolve, reject) => {
    const args = ['--track-changes=' + trackChanges, docxPath, '-o', outputPath];
    const proc = spawn('pandoc', args);

    let stderr = '';
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', async (code) => {
      if (code === 0) {
        try {
          const content = await fs.readFile(outputPath, 'utf-8');
          resolve({ success: true, content, path: outputPath });
        } catch (err) {
          reject(new Error(`Failed to read output: ${err.message}`));
        }
      } else {
        reject(new Error(`pandoc failed: ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to run pandoc: ${err.message}`));
    });
  });
};

/**
 * Unpack a DOCX file for raw XML editing
 * @param {string} docxPath - Path to the DOCX file
 * @param {string} outputDir - Directory to unpack to
 * @returns {Promise<Object>} Result with unpacked path and suggested RSID
 */
const unpackDocx = async (docxPath, outputDir) => {
  const scriptPath = path.join(__dirname, '..', 'skills', 'dof-docx', 'ooxml', 'scripts', 'unpack.py');

  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [scriptPath, docxPath, outputDir]);

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
        // Extract suggested RSID from output
        const rsidMatch = stdout.match(/Suggested RSID.*:\s*([A-F0-9]+)/i);
        const suggestedRsid = rsidMatch ? rsidMatch[1] : null;

        resolve({
          success: true,
          path: outputDir,
          suggestedRsid,
          message: stdout.trim()
        });
      } else {
        reject(new Error(`unpack.py failed: ${stderr || stdout}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to run unpack.py: ${err.message}`));
    });
  });
};

/**
 * Pack an unpacked directory back into a DOCX file
 * @param {string} inputDir - Directory with unpacked DOCX contents
 * @param {string} outputPath - Path for output DOCX file
 * @returns {Promise<Object>} Result with output path
 */
const packDocx = async (inputDir, outputPath) => {
  const scriptPath = path.join(__dirname, '..', 'skills', 'dof-docx', 'ooxml', 'scripts', 'pack.py');

  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [scriptPath, inputDir, outputPath]);

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
        resolve({
          success: true,
          path: outputPath,
          message: stdout.trim() || 'Document packed successfully'
        });
      } else {
        reject(new Error(`pack.py failed: ${stderr || stdout}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to run pack.py: ${err.message}`));
    });
  });
};

module.exports = {
  createDocx,
  extractTextFromDocx,
  unpackDocx,
  packDocx,
  DEFAULT_COLORS
};
