import { Inject, Injectable, Logger } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/tokens.js';

@Injectable()
export class DatabaseHealthIndicator {
  private readonly logger = new Logger(DatabaseHealthIndicator.name);

  constructor(
    private readonly indicator: HealthIndicatorService,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  async isHealthy<const Key extends string>(key: Key) {
    const session = this.indicator.check(key);
    try {
      await this.pool.query('SELECT 1');
      return session.up();
    } catch (error) {
      // /api/health is public: log the driver error, return a generic message.
      this.logger.error(`database check failed: ${error instanceof Error ? error.message : String(error)}`);
      return session.down({ message: 'database unreachable' });
    }
  }
}
