/**
 * Jest setup file for server tests
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.ANTHROPIC_API_KEY = 'test-api-key';
process.env.CLAUDE_MODEL = 'claude-sonnet-4-20250514';

// Increase timeout for async operations
jest.setTimeout(30000);

// Mock console.log/error during tests (optional - uncomment to suppress logs)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   error: jest.fn(),
//   warn: jest.fn(),
// };

// Clean up after all tests
afterAll(async () => {
  // Allow any pending promises to resolve
  await new Promise(resolve => setTimeout(resolve, 100));
});
