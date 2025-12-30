/**
 * PPTX Generation Service
 *
 * Creates native, editable PowerPoint presentations using @ant/html2pptx.
 * Uses Playwright to render HTML slides and extract exact positioning for native PPTX elements.
 */

const fs = require('fs').promises;
const path = require('path');
const PptxGenJS = require('pptxgenjs');
const { html2pptx } = require('@ant/html2pptx');
const { v4: uuidv4 } = require('uuid');

// Log Playwright configuration on startup
// Note: @ant/html2pptx uses Playwright internally and doesn't accept executablePath
// Browsers must be installed via `npx playwright install chromium`
console.log(`📊 PPTX Service: Playwright browsers path: ${process.env.PLAYWRIGHT_BROWSERS_PATH || 'default (~/.cache/ms-playwright)'}`);


// Slide dimensions (16:9 aspect ratio)
const SLIDE_WIDTH_PX = 960;
const SLIDE_HEIGHT_PX = 540;

// DoF Brand Colors (without # prefix for PptxGenJS)
const COLORS = {
  primary: '4A9B9B',      // Sea green
  primaryLight: 'A3D5D5', // Light teal
  dark: '2C3E50',         // Dark text
  body: '333333',         // Body text
  muted: '666666',        // Secondary text
  white: 'FFFFFF',
  lightGray: 'F5F5F5',
  gold: 'D4AF37'
};

/**
 * Convert HTML slides to PPTX presentation using @ant/html2pptx
 *
 * @param {string} workspacePath - Path to workspace directory containing HTML files
 * @param {Object} presentationData - Presentation configuration
 * @param {string} presentationData.title - Presentation title
 * @param {string[]} presentationData.slides - Array of HTML file paths (relative to workspace)
 * @param {Object[]} presentationData.charts - Optional chart data for placeholders
 * @returns {Promise<Object>} Result with path to generated PPTX
 */
const convertHtmlToPptx = async (workspacePath, presentationData) => {
  const pptx = new PptxGenJS();

  // Set presentation properties
  pptx.author = presentationData.author || 'Hekmah AI';
  pptx.title = presentationData.title || 'Presentation';
  pptx.company = presentationData.company || 'Department of Finance, Abu Dhabi';

  // Set slide size (16:9) - Must match HTML body dimensions
  pptx.layout = 'LAYOUT_16x9';

  const slides = presentationData.slides || [];
  const charts = presentationData.charts || [];
  const allPlaceholders = [];

  // Process each HTML slide
  for (let i = 0; i < slides.length; i++) {
    const slideHtml = slides[i];

    // If it's HTML content directly, write to temp file
    let htmlFilePath;
    if (slideHtml.trim().startsWith('<') || slideHtml.trim().startsWith('<!')) {
      // It's HTML content - write to temp file
      htmlFilePath = path.join(workspacePath, `slide_${i + 1}_${uuidv4().slice(0, 8)}.html`);
      await fs.writeFile(htmlFilePath, slideHtml, 'utf-8');
    } else {
      // It's a file path
      htmlFilePath = path.isAbsolute(slideHtml) ? slideHtml : path.join(workspacePath, slideHtml);
    }

    try {
      // Convert HTML to PPTX slide using @ant/html2pptx
      const { slide, placeholders } = await html2pptx(htmlFilePath, pptx, {
        tmpDir: workspacePath
      });

      // Track placeholders for chart insertion
      allPlaceholders.push({
        slideIndex: i,
        placeholders: placeholders
      });

      // Add charts to placeholders if provided
      if (charts[i] && placeholders.length > 0) {
        const chartConfig = charts[i];
        const placeholder = placeholders.find(p => p.id === chartConfig.placeholderId) || placeholders[0];

        if (chartConfig.type === 'bar') {
          slide.addChart(pptx.charts.BAR, chartConfig.data, {
            ...placeholder,
            barDir: chartConfig.direction || 'col',
            showTitle: !!chartConfig.title,
            title: chartConfig.title,
            showLegend: chartConfig.showLegend !== false,
            chartColors: chartConfig.colors || [COLORS.primary],
            showCatAxisTitle: !!chartConfig.categoryAxisTitle,
            catAxisTitle: chartConfig.categoryAxisTitle,
            showValAxisTitle: !!chartConfig.valueAxisTitle,
            valAxisTitle: chartConfig.valueAxisTitle
          });
        } else if (chartConfig.type === 'line') {
          slide.addChart(pptx.charts.LINE, chartConfig.data, {
            ...placeholder,
            lineSize: chartConfig.lineSize || 3,
            lineSmooth: chartConfig.smooth !== false,
            showTitle: !!chartConfig.title,
            title: chartConfig.title,
            showLegend: chartConfig.showLegend !== false,
            chartColors: chartConfig.colors || [COLORS.primary, COLORS.gold, COLORS.dark]
          });
        } else if (chartConfig.type === 'pie') {
          slide.addChart(pptx.charts.PIE, chartConfig.data, {
            ...placeholder,
            showPercent: chartConfig.showPercent !== false,
            showLegend: chartConfig.showLegend !== false,
            legendPos: chartConfig.legendPos || 'r',
            chartColors: chartConfig.colors || [COLORS.primary, COLORS.primaryLight, COLORS.dark, COLORS.muted, COLORS.gold]
          });
        } else if (chartConfig.type === 'doughnut') {
          slide.addChart(pptx.charts.DOUGHNUT, chartConfig.data, {
            ...placeholder,
            holeSize: chartConfig.holeSize || 50,
            showPercent: chartConfig.showPercent !== false,
            showLegend: chartConfig.showLegend !== false,
            chartColors: chartConfig.colors || [COLORS.primary, COLORS.primaryLight, COLORS.dark, COLORS.muted]
          });
        }
      }

      console.log(`Slide ${i + 1} converted successfully`);
    } catch (error) {
      console.error(`Error converting slide ${i + 1}:`, error.message);
      throw error;
    }
  }

  // Ensure output directory exists
  const outputDir = path.join(workspacePath, 'output');
  await fs.mkdir(outputDir, { recursive: true });

  // Generate filename
  const sanitizedTitle = (presentationData.title || 'presentation')
    .replace(/[^a-zA-Z0-9-_\s]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50);
  const outputFilename = `${sanitizedTitle}_${uuidv4().slice(0, 8)}.pptx`;
  const outputPath = path.join(outputDir, outputFilename);

  // Write the file
  await pptx.writeFile({ fileName: outputPath });

  console.log(`PPTX generated: ${outputPath}`);

  return {
    success: true,
    path: outputPath,
    filename: outputFilename,
    slideCount: slides.length,
    placeholders: allPlaceholders
  };
};

/**
 * Create a single slide from HTML content
 * Useful for building presentations slide by slide
 */
const addSlideFromHtml = async (pptx, htmlContent, workspacePath, chartConfig = null) => {
  // Write HTML to temp file
  const htmlFilePath = path.join(workspacePath, `temp_slide_${uuidv4().slice(0, 8)}.html`);
  await fs.writeFile(htmlFilePath, htmlContent, 'utf-8');

  try {
    const { slide, placeholders } = await html2pptx(htmlFilePath, pptx, {
      tmpDir: workspacePath
    });

    // Add chart if provided
    if (chartConfig && placeholders.length > 0) {
      const placeholder = placeholders[0];
      const chartType = pptx.charts[chartConfig.type.toUpperCase()] || pptx.charts.BAR;
      slide.addChart(chartType, chartConfig.data, {
        ...placeholder,
        ...chartConfig.options
      });
    }

    // Clean up temp file
    await fs.unlink(htmlFilePath).catch(() => {});

    return { slide, placeholders };
  } catch (error) {
    // Clean up temp file on error
    await fs.unlink(htmlFilePath).catch(() => {});
    throw error;
  }
};

/**
 * Generate DoF-branded CSS variables for slides
 */
const getDofStyleOverrides = () => `
  :root {
    --color-primary: #${COLORS.primary};
    --color-primary-light: #${COLORS.primaryLight};
    --color-primary-dark: #3A8B8B;
    --color-primary-foreground: #${COLORS.white};
    --color-surface: #${COLORS.white};
    --color-surface-foreground: #${COLORS.dark};
    --color-muted: #${COLORS.lightGray};
    --color-muted-foreground: #${COLORS.muted};
    --color-accent: #${COLORS.primaryLight};
    --color-accent-foreground: #${COLORS.dark};
    --color-border: #CCCCCC;
    --font-family-display: Arial, sans-serif;
    --font-family-content: Arial, sans-serif;
  }
`;

/**
 * Create HTML slide template with DoF branding
 */
const createSlideHtml = (bodyContent, customStyles = '') => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Slide</title>
  <style>
    ${getDofStyleOverrides()}
    ${customStyles}
  </style>
</head>
<body>
  ${bodyContent}
</body>
</html>`;

// Legacy function for backward compatibility with old JSON-based approach
const convertToPptx = async (workspacePath, presentationData) => {
  // If slides are JSON objects (old format), convert to HTML
  if (presentationData.slides && presentationData.slides[0] && typeof presentationData.slides[0] === 'object') {
    const htmlSlides = presentationData.slides.map(slideData => {
      return convertJsonSlideToHtml(slideData);
    });
    return convertHtmlToPptx(workspacePath, {
      ...presentationData,
      slides: htmlSlides
    });
  }
  return convertHtmlToPptx(workspacePath, presentationData);
};

/**
 * Convert old JSON slide format to HTML (for backward compatibility)
 */
const convertJsonSlideToHtml = (slideData) => {
  const type = slideData.type || 'bullets';

  switch (type) {
    case 'title':
      return createSlideHtml(`
        <div class="col center h-full" style="background: #${COLORS.primary};">
          <h1 style="color: #${COLORS.white};">${slideData.title || 'Presentation'}</h1>
          ${slideData.subtitle ? `<p class="text-2xl" style="color: #${COLORS.white}; opacity: 0.9;">${slideData.subtitle}</p>` : ''}
          ${slideData.author ? `<p class="text-lg" style="color: #${COLORS.white}; opacity: 0.7; margin-top: 2rem;">${slideData.author}</p>` : ''}
        </div>
      `);

    case 'section':
      return createSlideHtml(`
        <div class="col center h-full bg-muted">
          <h1 style="color: #${COLORS.dark};">${slideData.title || 'Section'}</h1>
          ${slideData.subtitle ? `<p class="text-xl text-muted-foreground">${slideData.subtitle}</p>` : ''}
          <div style="width: 80px; height: 4px; background: #${COLORS.primary}; margin-top: 1rem;"></div>
        </div>
      `);

    case 'bullets':
      return createSlideHtml(`
        <div class="col p-8 gap-lg">
          <h2 style="color: #${COLORS.dark};">${slideData.title || ''}</h2>
          ${slideData.subtitle ? `<p class="text-lg text-muted-foreground">${slideData.subtitle}</p>` : ''}
          ${slideData.keyTakeaway ? `<div class="rounded p-4" style="background: #F0F8F8;"><p class="text-base">${slideData.keyTakeaway}</p></div>` : ''}
          <ul>
            ${(slideData.bullets || []).map(b => `<li>${b}</li>`).join('\n            ')}
          </ul>
        </div>
      `);

    case 'stats':
      const stats = slideData.stats || [];
      return createSlideHtml(`
        <div class="col p-8 gap-lg">
          <h2 style="color: #${COLORS.dark};">${slideData.title || ''}</h2>
          ${slideData.keyTakeaway ? `<div class="rounded p-4" style="background: #F0F8F8;"><p class="text-base">${slideData.keyTakeaway}</p></div>` : ''}
          <div class="row gap-lg justify-center">
            ${stats.map(stat => `
              <div class="col center rounded p-6" style="background: #${COLORS.lightGray}; min-width: 150px;">
                <h1 style="color: #${(stat.color || '#' + COLORS.primary).replace('#', '')};">${stat.value}</h1>
                <p class="text-base text-muted-foreground text-center">${stat.label}</p>
              </div>
            `).join('\n            ')}
          </div>
        </div>
      `);

    case 'two_column':
      return createSlideHtml(`
        <div class="col p-8 gap-lg h-full">
          <h2 style="color: #${COLORS.dark};">${slideData.title || ''}</h2>
          <div class="row gap-lg fill-height">
            <div class="col w-1/2">
              <h3 style="color: #${COLORS.dark};">${slideData.leftColumn?.header || 'Left'}</h3>
              <ul>
                ${(slideData.leftColumn?.bullets || []).map(b => `<li>${b}</li>`).join('\n                ')}
              </ul>
            </div>
            <div style="width: 2px; background: #${COLORS.primaryLight};"></div>
            <div class="col w-1/2">
              <h3 style="color: #${COLORS.dark};">${slideData.rightColumn?.header || 'Right'}</h3>
              <ul>
                ${(slideData.rightColumn?.bullets || []).map(b => `<li>${b}</li>`).join('\n                ')}
              </ul>
            </div>
          </div>
        </div>
      `);

    case 'chart_bar':
    case 'chart_pie':
    case 'chart_line':
      return createSlideHtml(`
        <div class="col p-8 gap-lg h-full">
          <h2 style="color: #${COLORS.dark};">${slideData.title || ''}</h2>
          <div class="placeholder w-full fill-height" id="chart-placeholder"></div>
        </div>
      `);

    case 'quote':
      return createSlideHtml(`
        <div class="col center h-full p-12" style="background: #${COLORS.primary};">
          <p class="text-6xl" style="color: #${COLORS.primaryLight}; font-family: Georgia, serif;">"</p>
          <p class="text-2xl text-center" style="color: #${COLORS.white}; font-style: italic; max-width: 80%;">${slideData.quote || ''}</p>
          ${slideData.attribution ? `<p class="text-lg" style="color: #${COLORS.primaryLight}; margin-top: 1.5rem;">- ${slideData.attribution}</p>` : ''}
        </div>
      `);

    default:
      return createSlideHtml(`
        <div class="col p-8">
          <h2 style="color: #${COLORS.dark};">${slideData.title || 'Slide'}</h2>
          <p>${JSON.stringify(slideData)}</p>
        </div>
      `);
  }
};

module.exports = {
  convertHtmlToPptx,
  convertToPptx,
  addSlideFromHtml,
  createSlideHtml,
  getDofStyleOverrides,
  SLIDE_WIDTH_PX,
  SLIDE_HEIGHT_PX,
  COLORS
};
