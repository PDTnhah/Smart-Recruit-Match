import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Pool } from 'pg';
import { Clock } from '../../../common/clock/index.js';
import { loadEnv } from '../../../common/config/env.js';
import { ADVISORY_LOCK_KEYS, withAdvisoryLock } from '../../../common/scheduling/advisory-lock.js';
import { PG_POOL } from '../../../db/tokens.js';
import { DeadlineReminderRegistry } from './deadline-reminder.registry.js';
import { NotificationService } from './notification.service.js';

export interface ReminderRunReport {
  /** False when another instance held the advisory lock; nothing was done. */
  acquired: boolean;
  /** One entry per batch; `created` is 0 when every recipient had already been reminded. */
  batches: { source: string; dedupeKey: string; created: number }[];
}

/**
 * Reminds people of deadlines that are near (US-1.7 AC-6, ARCHITECTURE › Tác vụ định kỳ). Runs
 * every 5 minutes under a PostgreSQL advisory lock; the time comes from `Clock`. Running it again,
 * or on two instances, sends nothing twice: each batch has a dedupe key, unique per recipient.
 */
@Injectable()
export class DeadlineReminderScheduler {
  private readonly logger = new Logger(DeadlineReminderScheduler.name);
  private readonly enabled = loadEnv().SCHEDULER_ENABLED;

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly registry: DeadlineReminderRegistry,
    private readonly notifications: NotificationService,
    private readonly clock: Clock,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'deadline-reminder', waitForCompletion: true })
  async tick(): Promise<void> {
    if (!this.enabled) return;
    try {
      await this.runOnce();
    } catch (error) {
      this.logger.error(`deadline reminder run failed: ${messageOf(error)}`);
    }
  }

  async runOnce(): Promise<ReminderRunReport> {
    const run = await withAdvisoryLock(this.pool, ADVISORY_LOCK_KEYS.DEADLINE_REMINDER, () => this.remindDue());
    return run.acquired ? { acquired: true, batches: run.result } : { acquired: false, batches: [] };
  }

  private async remindDue(): Promise<ReminderRunReport['batches']> {
    const now = this.clock.now();
    const done: ReminderRunReport['batches'] = [];
    for (const source of this.registry.list()) {
      let batches;
      try {
        batches = await source.collect(now);
      } catch (error) {
        // One broken source must not stop the others.
        this.logger.error(`reminder source ${source.name} failed: ${messageOf(error)}`);
        continue;
      }
      for (const batch of batches) {
        try {
          const pending = await this.notifications.notify({
            ...batch.content,
            userIds: batch.userIds,
            channels: batch.channels,
            dedupeKey: batch.dedupeKey,
          });
          done.push({ source: source.name, dedupeKey: batch.dedupeKey, created: pending.count });
        } catch (error) {
          this.logger.error(`reminder ${batch.dedupeKey} failed: ${messageOf(error)}`);
        }
      }
    }
    return done;
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
