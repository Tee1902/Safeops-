const base = require('./jest.config.cjs');
module.exports = {
  ...base,
  testMatch: ['**/.test-dist/test/foundation.e2e-spec.js'],
  coverageThreshold: {},
};
