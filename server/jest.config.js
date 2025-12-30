/**
 * Jest configuration for server-side testing
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: [
    'services/**/*.js',
    '!services/**/*.test.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['./__tests__/setup.js'],
  testTimeout: 30000,
  verbose: true,
  // Handle dynamic imports and native modules
  moduleNameMapper: {
    '^pptxgenjs$': '<rootDir>/__tests__/__mocks__/pptxgenjs.js',
    '^sharp$': '<rootDir>/__tests__/__mocks__/sharp.js',
    '^exceljs$': '<rootDir>/__tests__/__mocks__/exceljs.js',
    '^@anthropic-ai/claude-agent-sdk$': '<rootDir>/__tests__/__mocks__/@anthropic-ai/claude-agent-sdk.js'
  },
  // Force exit after tests complete
  forceExit: true,
  // Detect open handles
  detectOpenHandles: false
};
