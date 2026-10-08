// Module boundary rules for apps/api (AGENTS › Invariant 13, ARCHITECTURE › Core Backend).
// Paths are matched generically ("modules/<m>/...") so the same rules also run against the
// deliberate violations in apps/api/test/fixtures/depcruise-violation (see scripts/check-depcruise-fixture.sh).

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-no-framework',
      comment:
        'domain/ is plain TypeScript: no NestJS, no Drizzle. Keep frameworks in api/, application/, infrastructure/.',
      severity: 'error',
      from: { path: '(^|/)modules/[^/]+/domain/' },
      to: { path: '(^|/)(@nestjs/|drizzle-orm)' },
    },
    {
      name: 'no-cross-module-internals',
      comment:
        "A module may only use another module through its public entry modules/<m>/index.ts (exported services) or events.",
      severity: 'error',
      from: { path: '(^|/)modules/([^/]+)/' },
      to: {
        path: '(^|/)modules/[^/]+/',
        pathNot: ['(^|/)modules/$2/', '(^|/)modules/[^/]+/index\\.ts$'],
      },
    },
    {
      name: 'no-circular',
      severity: 'warn',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    // Do not follow into node_modules, but do NOT exclude it: excluding drops the edge itself,
    // and then `domain/ -> @nestjs/*` would never be reported.
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)dist/' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.js', '.json'],
    },
  },
};
