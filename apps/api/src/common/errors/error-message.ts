/** The message of a caught value, for logs and stored error notes; non-Error values are stringified. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
