module.exports = {
  testEnvironment: 'node',
  transform: {},
  testMatch: ['**/.test-dist/src/**/*.spec.js'],
  setupFilesAfterEnv: ['<rootDir>/test/jest.setup.mjs'],
  coverageProvider: 'v8',
  collectCoverageFrom: [
    '.test-dist/src/**/*.service.js',
    '.test-dist/src/**/guards/*.js',
    '.test-dist/src/config/*.js',
    '.test-dist/src/common/workflow.js',
    '.test-dist/src/common/*pipe.js',
    '.test-dist/src/common/*filter.js',
    '.test-dist/src/common/*interceptor.js',
  ],
  coverageReporters: ['text-summary', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: { statements: 80, branches: 80, functions: 80, lines: 80 },
  },
};
