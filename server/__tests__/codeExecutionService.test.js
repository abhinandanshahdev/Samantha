/**
 * Code Execution Service Tests
 *
 * Tests workspace management and code execution functionality
 */

const path = require('path');
const fs = require('fs').promises;
const codeExecutionService = require('../services/codeExecutionService');

describe('CodeExecutionService', () => {
  let testSessionId;

  beforeEach(() => {
    testSessionId = `test-session-${Date.now()}`;
  });

  afterEach(async () => {
    // Clean up test workspace
    try {
      await codeExecutionService.cleanupWorkspace(testSessionId);
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('initWorkspace', () => {
    it('should create workspace directory with required subdirectories', async () => {
      const workspacePath = await codeExecutionService.initWorkspace(testSessionId);

      // Verify workspace path format
      expect(workspacePath).toContain(testSessionId);

      // Verify directories were created
      const slidesDir = path.join(workspacePath, 'slides');
      const outputDir = path.join(workspacePath, 'output');
      const thumbnailsDir = path.join(workspacePath, 'thumbnails');

      const slidesStats = await fs.stat(slidesDir);
      const outputStats = await fs.stat(outputDir);
      const thumbnailsStats = await fs.stat(thumbnailsDir);

      expect(slidesStats.isDirectory()).toBe(true);
      expect(outputStats.isDirectory()).toBe(true);
      expect(thumbnailsStats.isDirectory()).toBe(true);
    });

    it('should return correct workspace path', async () => {
      const workspacePath = await codeExecutionService.initWorkspace(testSessionId);
      const expectedPath = codeExecutionService.getWorkspacePath(testSessionId);

      expect(workspacePath).toBe(expectedPath);
    });
  });

  describe('writeFile and readFile', () => {
    beforeEach(async () => {
      await codeExecutionService.initWorkspace(testSessionId);
    });

    it('should write and read text files correctly', async () => {
      const testContent = 'Hello, World!';
      const relativePath = 'test.txt';

      const writeResult = await codeExecutionService.writeFile(testSessionId, relativePath, testContent);
      expect(writeResult.success).toBe(true);
      expect(writeResult.path).toBe(relativePath);

      const readResult = await codeExecutionService.readFile(testSessionId, relativePath);
      expect(readResult.success).toBe(true);
      expect(readResult.content).toBe(testContent);
    });

    it('should create nested directories when writing files', async () => {
      const testContent = '<html></html>';
      const relativePath = 'slides/nested/slide1.html';

      const writeResult = await codeExecutionService.writeFile(testSessionId, relativePath, testContent);
      expect(writeResult.success).toBe(true);

      const readResult = await codeExecutionService.readFile(testSessionId, relativePath);
      expect(readResult.content).toBe(testContent);
    });

    it('should handle special characters in content', async () => {
      const testContent = '日本語テスト\n特殊文字: @#$%^&*()';
      const relativePath = 'unicode.txt';

      await codeExecutionService.writeFile(testSessionId, relativePath, testContent);
      const readResult = await codeExecutionService.readFile(testSessionId, relativePath);

      expect(readResult.content).toBe(testContent);
    });
  });

  describe('readFileBase64', () => {
    beforeEach(async () => {
      await codeExecutionService.initWorkspace(testSessionId);
    });

    it('should read binary files as base64', async () => {
      // Write a small "binary" file (simulating image data)
      const binaryContent = Buffer.from([0x89, 0x50, 0x4E, 0x47]); // PNG magic bytes
      const relativePath = 'test.png';
      const workspacePath = codeExecutionService.getWorkspacePath(testSessionId);

      await fs.writeFile(path.join(workspacePath, relativePath), binaryContent);

      const result = await codeExecutionService.readFileBase64(testSessionId, relativePath);
      expect(result.success).toBe(true);
      expect(result.base64).toBe(binaryContent.toString('base64'));
    });
  });

  describe('listFiles', () => {
    beforeEach(async () => {
      await codeExecutionService.initWorkspace(testSessionId);
    });

    it('should list files in root directory', async () => {
      await codeExecutionService.writeFile(testSessionId, 'file1.txt', 'content1');
      await codeExecutionService.writeFile(testSessionId, 'file2.txt', 'content2');

      const result = await codeExecutionService.listFiles(testSessionId);

      expect(result.success).toBe(true);
      expect(Array.isArray(result.files)).toBe(true);

      const fileNames = result.files.map(f => f.name);
      expect(fileNames).toContain('file1.txt');
      expect(fileNames).toContain('file2.txt');
      expect(fileNames).toContain('slides'); // Directory created by init
    });

    it('should list files in subdirectory', async () => {
      await codeExecutionService.writeFile(testSessionId, 'slides/slide1.html', '<html></html>');
      await codeExecutionService.writeFile(testSessionId, 'slides/slide2.html', '<html></html>');

      const result = await codeExecutionService.listFiles(testSessionId, 'slides');

      expect(result.success).toBe(true);
      const fileNames = result.files.map(f => f.name);
      expect(fileNames).toContain('slide1.html');
      expect(fileNames).toContain('slide2.html');
    });

    it('should distinguish between files and directories', async () => {
      await codeExecutionService.writeFile(testSessionId, 'test.txt', 'content');

      const result = await codeExecutionService.listFiles(testSessionId);

      const file = result.files.find(f => f.name === 'test.txt');
      const dir = result.files.find(f => f.name === 'slides');

      expect(file.type).toBe('file');
      expect(dir.type).toBe('directory');
    });
  });

  describe('executeJavaScript', () => {
    beforeEach(async () => {
      await codeExecutionService.initWorkspace(testSessionId);
    });

    it('should execute simple JavaScript code', async () => {
      const code = 'console.log("Hello from test");';
      const result = await codeExecutionService.executeJavaScript(testSessionId, code);

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Hello from test');
    });

    it('should have access to workspacePath variable', async () => {
      const code = 'console.log("Path:", workspacePath);';
      const result = await codeExecutionService.executeJavaScript(testSessionId, code);

      expect(result.success).toBe(true);
      expect(result.stdout).toContain(testSessionId);
    });

    it('should be able to use fs module', async () => {
      const code = `
        fs.writeFileSync(path.join(workspacePath, 'exec-test.txt'), 'executed');
        console.log('File written');
      `;
      const result = await codeExecutionService.executeJavaScript(testSessionId, code);

      expect(result.success).toBe(true);

      // Verify file was created
      const fileResult = await codeExecutionService.readFile(testSessionId, 'exec-test.txt');
      expect(fileResult.content).toBe('executed');
    });

    it('should return error for failing code', async () => {
      const code = 'throw new Error("Test error");';
      const result = await codeExecutionService.executeJavaScript(testSessionId, code);

      expect(result.success).toBe(false);
      expect(result.stderr).toContain('Test error');
    });

    it('should handle async code', async () => {
      const code = `
        const delay = ms => new Promise(r => setTimeout(r, ms));
        await delay(100);
        console.log('Async complete');
      `;
      const result = await codeExecutionService.executeJavaScript(testSessionId, code);

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('Async complete');
    });
  });

  describe('cleanupWorkspace', () => {
    it('should remove workspace directory and all contents', async () => {
      await codeExecutionService.initWorkspace(testSessionId);
      await codeExecutionService.writeFile(testSessionId, 'test.txt', 'content');

      const workspacePath = codeExecutionService.getWorkspacePath(testSessionId);

      // Verify workspace exists
      const statsBefore = await fs.stat(workspacePath);
      expect(statsBefore.isDirectory()).toBe(true);

      // Cleanup
      await codeExecutionService.cleanupWorkspace(testSessionId);

      // Verify workspace is removed
      await expect(fs.stat(workspacePath)).rejects.toThrow();
    });

    it('should not throw error for non-existent workspace', async () => {
      // Should not throw
      await expect(
        codeExecutionService.cleanupWorkspace('non-existent-session')
      ).resolves.not.toThrow();
    });
  });

  describe('getWorkspacePath', () => {
    it('should return consistent path for same sessionId', () => {
      const path1 = codeExecutionService.getWorkspacePath(testSessionId);
      const path2 = codeExecutionService.getWorkspacePath(testSessionId);

      expect(path1).toBe(path2);
    });

    it('should include sessionId in path', () => {
      const workspacePath = codeExecutionService.getWorkspacePath(testSessionId);
      expect(workspacePath).toContain(testSessionId);
    });
  });
});
