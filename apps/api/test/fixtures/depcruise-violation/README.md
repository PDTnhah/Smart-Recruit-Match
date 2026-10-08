# Fixture: deliberate module-boundary violations

Not compiled, linted or tested. `pnpm depcruise:fixture` runs dependency-cruiser on this folder and
expects both rules to fire:

- `modules/alpha/domain/scoring.ts` imports `@nestjs/common` and `drizzle-orm` → `domain-no-framework`.
- `modules/alpha/application/alpha.service.ts` imports `modules/beta/application/beta.service.ts`
  directly instead of `modules/beta/index.ts` → `no-cross-module-internals`.
