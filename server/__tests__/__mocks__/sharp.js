/**
 * Mock for sharp module
 * Used in Jest tests to avoid native module loading issues
 */

const mockSharpInstance = {
  resize: jest.fn().mockReturnThis(),
  extend: jest.fn().mockReturnThis(),
  composite: jest.fn().mockReturnThis(),
  png: jest.fn().mockReturnThis(),
  jpeg: jest.fn().mockReturnThis(),
  webp: jest.fn().mockReturnThis(),
  toFile: jest.fn().mockResolvedValue({ width: 1280, height: 720 }),
  toBuffer: jest.fn().mockResolvedValue(Buffer.from('mock-image-data')),
  metadata: jest.fn().mockResolvedValue({ width: 1280, height: 720, format: 'png' })
};

const sharp = jest.fn().mockImplementation((input) => {
  return mockSharpInstance;
});

// Static methods
sharp.cache = jest.fn();
sharp.concurrency = jest.fn();
sharp.counters = jest.fn().mockReturnValue({ queue: 0, process: 0 });
sharp.simd = jest.fn().mockReturnValue(true);
sharp.versions = { vips: '8.0.0', sharp: '0.34.0' };

module.exports = sharp;
