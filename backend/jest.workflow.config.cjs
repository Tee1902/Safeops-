const base = require('./jest.config.cjs');
module.exports = {
  ...base,
  testMatch: [
    '**/.test-dist/test/app.e2e-spec.js',
    '**/.test-dist/test/migrations.e2e-spec.js',
  ],
  testTimeout: 30000,
  coverageThreshold: {},
};
