// Unit tests for the shared state tables and schemas (pure TypeScript, no Docker).

/** @type {import('jest').Config} */
module.exports = {
  // Not one worker per CPU thread: `pnpm test` runs this next to the API suite (LESSONS §15).
  maxWorkers: '50%',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Sources import siblings with `.js` (nodenext); map them back to the `.ts` sources.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: ['<rootDir>/**/__tests__/**/*.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
