import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { loadEnv } from '../common/config/env.js';
import * as schema from './schema/index.js';
import { DRIZZLE, PG_POOL } from './tokens.js';
import type { Database } from './types.js';

// The environment is read inside the factory, not at import time, so tests can override
// PG_POOL without a DATABASE_URL.
function createPool(): Pool {
  const pool = new Pool({ connectionString: loadEnv().DATABASE_URL, connectionTimeoutMillis: 5_000 });
  // An idle client losing its connection must not crash the process; the next query reconnects.
  pool.on('error', (error) => new Logger('Database').error(`idle client error: ${error.message}`));
  return pool;
}

@Global()
@Module({
  providers: [
    { provide: PG_POOL, useFactory: createPool },
    {
      provide: DRIZZLE,
      inject: [PG_POOL],
      useFactory: (pool: Pool): Database => drizzle({ client: pool, schema }),
    },
  ],
  exports: [PG_POOL, DRIZZLE],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
