const base = require('./jest.config.cjs');
module.exports = {
  ...base,
  testMatch: ['**/.test-dist/test/features.e2e-spec.js'],
  testTimeout: 30000,
  coverageThreshold: {},
};
