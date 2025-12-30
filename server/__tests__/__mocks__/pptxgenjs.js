/**
 * Mock for pptxgenjs module
 * Used in Jest tests to avoid dynamic import issues
 */

class PptxGenJS {
  constructor() {
    this.slides = [];
    this.title = '';
    this.author = '';
    this.company = '';
    this.subject = '';
    this.layout = 'LAYOUT_16x9';
    this.masters = [];
  }

  addSlide(options) {
    const slide = {
      addText: jest.fn().mockReturnThis(),
      addImage: jest.fn().mockReturnThis(),
      addTable: jest.fn().mockReturnThis(),
      addShape: jest.fn().mockReturnThis(),
      addChart: jest.fn().mockReturnThis(),
      background: null,
      options: options || {}
    };
    this.slides.push(slide);
    return slide;
  }

  defineSlideMaster(masterDef) {
    this.masters.push(masterDef);
    return this;
  }

  defineLayout(layout) {
    this.layout = layout;
    return this;
  }

  async writeFile(options) {
    // Mock write - return the path or buffer based on options
    if (options && options.fileName) {
      return options.fileName;
    }
    return Buffer.from('mock-pptx-content');
  }

  async write(outputType) {
    if (outputType === 'base64') {
      return Buffer.from('mock-pptx-content').toString('base64');
    }
    if (outputType === 'nodebuffer') {
      return Buffer.from('mock-pptx-content');
    }
    return 'mock-pptx-content';
  }
}

module.exports = PptxGenJS;
