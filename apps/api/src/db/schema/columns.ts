// Column and constraint helpers shared by the core tables. Each helper returns a fresh builder,
// because Drizzle builders must not be reused across tables.
import { type SQL, sql } from 'drizzle-orm';
import { type AnyPgColumn, bigint, check, integer, timestamp } from 'drizzle-orm/pg-core';

/** Business tables use bigint identity keys (US-1.2 Dev notes); values stay below 2^53. */
export const id = () => bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity();

/** Foreign key column holding another table's bigint id. */
export const ref = (name: string) => bigint(name, { mode: 'number' });

export const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/** `updated_at` is set to the database's now() on every Drizzle update that does not set it. */
export const timestamps = () => ({
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  updatedAt: timestamptz('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`now()`),
});

/** Optimistic lock for lifecycle tables (AD-8); only `transitionTo` and versioned updates bump it. */
export const rowVersion = () => integer('row_version').notNull().default(0);

const CONSTANT = /^[A-Z][A-Z_]*$/;

/** SQL literal list such as `'A', 'B'`. Values are spliced into DDL, so only UPPER_SNAKE constants pass. */
export function inList(values: readonly string[]): SQL {
  for (const value of values) {
    if (!CONSTANT.test(value)) throw new Error(`Refusing to inline non-constant value: ${value}`);
  }
  return sql.raw(values.map((value) => `'${value}'`).join(', '));
}

/** Enumerations are `text` + CHECK (not PostgreSQL ENUM), so adding a value is a one-line migration. */
export function oneOf(name: string, column: AnyPgColumn, values: readonly string[]) {
  return check(name, sql`${column} in (${inList(values)})`);
}
