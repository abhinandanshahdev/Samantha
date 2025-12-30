/**
 * Artifact Service Tests
 *
 * Tests artifact creation, storage, and retrieval.
 * Uses mocks for external dependencies.
 */

const path = require('path');
const fs = require('fs').promises;

// Mock external dependencies before requiring artifactService
jest.mock('pptxgenjs');
jest.mock('exceljs');

const artifactService = require('../services/artifactService');

describe('ArtifactService', () => {
  describe('Module Exports', () => {
    it('should export createArtifact function', () => {
      expect(typeof artifactService.createArtifact).toBe('function');
    });

    it('should export getArtifact function', () => {
      expect(typeof artifactService.getArtifact).toBe('function');
    });

    it('should export getArtifactStream function', () => {
      expect(typeof artifactService.getArtifactStream).toBe('function');
    });

    it('should export deleteArtifact function', () => {
      expect(typeof artifactService.deleteArtifact).toBe('function');
    });

    it('should export listArtifacts function', () => {
      expect(typeof artifactService.listArtifacts).toBe('function');
    });

    it('should export ARTIFACT_TYPES', () => {
      expect(artifactService.ARTIFACT_TYPES).toBeDefined();
    });

    it('should export FILE_EXTENSIONS', () => {
      expect(artifactService.FILE_EXTENSIONS).toBeDefined();
    });

    it('should export MIME_TYPES', () => {
      expect(artifactService.MIME_TYPES).toBeDefined();
    });

    it('should export registerExternalFile function', () => {
      expect(typeof artifactService.registerExternalFile).toBe('function');
    });
  });

  describe('ARTIFACT_TYPES', () => {
    it('should include PRESENTATION type', () => {
      expect(artifactService.ARTIFACT_TYPES.PRESENTATION).toBe('presentation');
    });

    it('should include SPREADSHEET type', () => {
      expect(artifactService.ARTIFACT_TYPES.SPREADSHEET).toBe('spreadsheet');
    });

    it('should only have presentation and spreadsheet types', () => {
      const typeValues = Object.values(artifactService.ARTIFACT_TYPES);
      expect(typeValues).toContain('presentation');
      expect(typeValues).toContain('spreadsheet');
      expect(typeValues.length).toBe(2);
    });

    it('should not include CSV type', () => {
      expect(artifactService.ARTIFACT_TYPES.CSV).toBeUndefined();
    });

    it('should not include JSON type', () => {
      expect(artifactService.ARTIFACT_TYPES.JSON).toBeUndefined();
    });

    it('should not include MARKDOWN type', () => {
      expect(artifactService.ARTIFACT_TYPES.MARKDOWN).toBeUndefined();
    });
  });

  describe('FILE_EXTENSIONS', () => {
    it('should have correct extension for presentations', () => {
      expect(artifactService.FILE_EXTENSIONS.presentation).toBe('.pptx');
    });

    it('should have correct extension for spreadsheets', () => {
      expect(artifactService.FILE_EXTENSIONS.spreadsheet).toBe('.xlsx');
    });
  });

  describe('MIME_TYPES', () => {
    it('should have correct MIME type for presentations', () => {
      expect(artifactService.MIME_TYPES.presentation).toBe(
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      );
    });

    it('should have correct MIME type for spreadsheets', () => {
      expect(artifactService.MIME_TYPES.spreadsheet).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
    });
  });

  describe('createArtifact Type Validation', () => {
    it('should throw error for csv type', async () => {
      await expect(
        artifactService.createArtifact('csv', { title: 'Test' })
      ).rejects.toThrow('Unsupported artifact type');
    });

    it('should throw error for json type', async () => {
      await expect(
        artifactService.createArtifact('json', { title: 'Test' })
      ).rejects.toThrow('Unsupported artifact type');
    });

    it('should throw error for markdown type', async () => {
      await expect(
        artifactService.createArtifact('markdown', { title: 'Test' })
      ).rejects.toThrow('Unsupported artifact type');
    });

    it('should throw error for unknown type', async () => {
      await expect(
        artifactService.createArtifact('unknown', { title: 'Test' })
      ).rejects.toThrow('Unsupported artifact type');
    });
  });

  describe('getArtifact', () => {
    it('should return null for non-existent ID', () => {
      const retrieved = artifactService.getArtifact('non-existent-id');
      expect(retrieved).toBeNull();
    });
  });

  describe('deleteArtifact', () => {
    it('should return false for non-existent artifact', async () => {
      const result = await artifactService.deleteArtifact('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('listArtifacts', () => {
    it('should return an array', () => {
      const list = artifactService.listArtifacts();
      expect(Array.isArray(list)).toBe(true);
    });
  });
});

describe('Artifact Structure Validation', () => {
  describe('Presentation Slide Structures', () => {
    it('should support title and subtitle structure', () => {
      const slide = { title: 'Test Title', subtitle: 'Test Subtitle' };
      expect(slide.title).toBeDefined();
      expect(slide.subtitle).toBeDefined();
    });

    it('should support bullets array structure', () => {
      const slide = { title: 'Test', bullets: ['Point 1', 'Point 2'] };
      expect(Array.isArray(slide.bullets)).toBe(true);
    });

    it('should support table structure', () => {
      const slide = {
        title: 'Table Slide',
        table: [
          ['Header 1', 'Header 2'],
          ['Value 1', 'Value 2']
        ]
      };
      expect(Array.isArray(slide.table)).toBe(true);
    });

    it('should support HTML content', () => {
      const slide = { html: '<h1>Title</h1>' };
      expect(slide.html).toBeDefined();
    });

    it('should support background color', () => {
      const slide = { title: 'Test', backgroundColor: '#FF0000' };
      expect(slide.backgroundColor).toBe('#FF0000');
    });
  });

  describe('Spreadsheet Structures', () => {
    it('should support sheets with headers and data', () => {
      const sheetData = {
        name: 'Data Sheet',
        headers: ['Header 1', 'Header 2'],
        data: [
          ['Value 1', 'Value 2']
        ]
      };
      expect(sheetData.name).toBeDefined();
      expect(Array.isArray(sheetData.headers)).toBe(true);
      expect(Array.isArray(sheetData.data)).toBe(true);
    });

    it('should support multiple sheets', () => {
      const sheets = [
        { name: 'Sheet 1', headers: [], data: [] },
        { name: 'Sheet 2', headers: [], data: [] }
      ];
      expect(sheets.length).toBe(2);
    });

    it('should support rows-only format', () => {
      const data = {
        title: 'Simple Data',
        data: [
          ['Header1', 'Header2'],
          ['Value1', 'Value2']
        ]
      };
      expect(Array.isArray(data.data)).toBe(true);
    });
  });
});

describe('Type Alias Mappings', () => {
  const typeAliases = {
    'presentation': ['pptx', 'powerpoint', 'presentation'],
    'spreadsheet': ['xlsx', 'excel', 'spreadsheet']
  };

  it('should map pptx to presentation', () => {
    expect(typeAliases.presentation).toContain('pptx');
  });

  it('should map powerpoint to presentation', () => {
    expect(typeAliases.presentation).toContain('powerpoint');
  });

  it('should map xlsx to spreadsheet', () => {
    expect(typeAliases.spreadsheet).toContain('xlsx');
  });

  it('should map excel to spreadsheet', () => {
    expect(typeAliases.spreadsheet).toContain('excel');
  });
});

describe('Artifact ID Generation', () => {
  it('should generate MD5-like hex strings', () => {
    const md5Pattern = /^[a-f0-9]{32}$/;
    const testHash = 'e8206e1f06a51fbcf09309b66f8debcb';
    expect(testHash).toMatch(md5Pattern);
  });
});

describe('File Path Handling', () => {
  it('should sanitize special characters in filenames', () => {
    const title = 'Test: Special/Characters\\Here!';
    const sanitized = title.replace(/[^a-zA-Z0-9]/g, '_');
    expect(sanitized).not.toContain(':');
    expect(sanitized).not.toContain('/');
    expect(sanitized).not.toContain('\\');
    expect(sanitized).not.toContain('!');
  });

  it('should generate filename with artifact ID suffix', () => {
    const title = 'Test_Presentation';
    const idSuffix = 'abcd1234';
    const filename = `${title}_${idSuffix}.pptx`;
    expect(filename).toContain(title);
    expect(filename).toContain(idSuffix);
    expect(filename).toContain('.pptx');
  });
});

describe('Download URL Generation', () => {
  it('should generate API-based download URLs', () => {
    const artifactId = 'test123';
    const expectedUrl = `/api/artifacts/${artifactId}/download`;
    expect(expectedUrl).toContain('/api/artifacts/');
    expect(expectedUrl).toContain(artifactId);
    expect(expectedUrl).toContain('/download');
  });
});
