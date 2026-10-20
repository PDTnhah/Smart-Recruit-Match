// Two Jest projects: fast unit tests (no Docker) and integration tests backed by testcontainers.
// A project's globalSetup only runs when at least one of its tests is selected, so
// `pnpm test:unit` never starts a container.

/** @type {import('jest').Config} */
const common = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
    // promise-breaker 7 (used by amqp-connection-manager 5 under @golevelup/nestjs-rabbitmq) ships
    // ESM only. Node 22 loads it through require(esm); Jest does not, so compile just this package
    // to CommonJS (LESSONS §9).
    '[\\\\/]promise-breaker[\\\\/].+\\.js$': [
      'ts-jest',
      { tsconfig: { allowJs: true, module: 'commonjs', target: 'es2022' }, isolatedModules: true },
    ],
  },
  transformIgnorePatterns: ['[\\\\/]node_modules[\\\\/](?!\\.pnpm[\\\\/]promise-breaker@|promise-breaker[\\\\/])'],
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
      // Not `testTimeout`: Jest ignores it inside a project (LESSONS §11).
      setupFilesAfterEnv: ['<rootDir>/test/setup/timeout.ts'],
    },
  ],
};
