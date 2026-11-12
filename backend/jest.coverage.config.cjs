const base = require('./jest.config.cjs');
module.exports = {
  ...base,
  testMatch: [
    '**/.test-dist/src/**/*.spec.js',
    '**/.test-dist/test/*.e2e-spec.js',
  ],
  testTimeout: 30000,
};
