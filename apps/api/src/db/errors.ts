// PostgreSQL error helpers. Drizzle wraps driver errors, so the pg fields sit on `cause`.

interface PgErrorFields {
  code?: unknown;
  constraint?: unknown;
}

function pgFields(error: unknown): PgErrorFields | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const fields = error as PgErrorFields & { cause?: unknown };
  if (typeof fields.code === 'string') return fields;
  return pgFields(fields.cause);
}

/** Name of the unique constraint a statement violated (SQLSTATE 23505), or null. */
export function uniqueViolation(error: unknown): string | null {
  const fields = pgFields(error);
  return fields?.code === '23505' && typeof fields.constraint === 'string' ? fields.constraint : null;
}
