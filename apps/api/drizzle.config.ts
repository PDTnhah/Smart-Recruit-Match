// drizzle-kit config, used only by `db:generate` (SQL migrations from src/db/schema).
// Migrations are applied by src/db/migrate.ts (compose `migrate` service, test global setup), not by the kit.
// No `schemaFilter`: it only affects push/pull, and generate already emits every schema it finds.
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  strict: true,
  verbose: true,
});
