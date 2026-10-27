/** DI token for the shared `pg.Pool` (health checks, raw driver access). */
export const PG_POOL = Symbol('PG_POOL');

/** DI token for the Drizzle database bound to the `core` schema. */
export const DRIZZLE = Symbol('DRIZZLE');
