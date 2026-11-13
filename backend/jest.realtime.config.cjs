const base = require('./jest.config.cjs');
module.exports = {
  ...base,
  testMatch: ['**/.test-dist/test/realtime.e2e-spec.js'],
  testTimeout: 15000,
  coverageThreshold: {},
};
