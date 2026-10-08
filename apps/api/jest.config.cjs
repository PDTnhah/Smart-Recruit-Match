// Two Jest projects: fast unit tests (no Docker) and integration tests backed by testcontainers.
// A project's globalSetup only runs when at least one of its tests is selected, so
// `pnpm test:unit` never starts a container.

/** @type {import('jest').Config} */
const common = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Source files import siblings with `.js` (nodenext); map them back to the `.ts` sources.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@srm/shared$': '<rootDir>/../../packages/shared/index.ts',
    '^@srm/shared/(.*)$': '<rootDir>/../../packages/shared/$1/index.ts',
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '<rootDir>/test/fixtures/'],
};

/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      ...common,
      displayName: 'unit',
      testMatch: ['<rootDir>/src/**/*.spec.ts'],
    },
    {
      ...common,
      displayName: 'integration',
      testMatch: ['<rootDir>/test/integration/**/*.int-spec.ts'],
      globalSetup: '<rootDir>/test/setup/global-setup.ts',
      globalTeardown: '<rootDir>/test/setup/global-teardown.ts',
      testTimeout: 120_000,
    },
  ],
};
