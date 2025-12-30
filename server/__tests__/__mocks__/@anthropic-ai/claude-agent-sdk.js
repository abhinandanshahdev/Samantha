/**
 * Mock for @anthropic-ai/claude-agent-sdk
 * Used in Jest tests to avoid ESM import issues
 */

const query = jest.fn().mockImplementation((model, client) => ({
  model,
  client,
  tools: [],
  addTools: jest.fn().mockReturnThis(),
  system: jest.fn().mockReturnThis(),
  prompt: jest.fn().mockReturnThis(),
  run: jest.fn().mockResolvedValue({ content: 'mock response' })
}));

const tool = jest.fn().mockImplementation((name, description, schema, handler) => ({
  name,
  description,
  schema,
  handler
}));

const createSdkMcpServer = jest.fn().mockImplementation(() => ({
  tools: [],
  addTool: jest.fn(),
  start: jest.fn(),
  close: jest.fn()
}));

module.exports = {
  query,
  tool,
  createSdkMcpServer
};
