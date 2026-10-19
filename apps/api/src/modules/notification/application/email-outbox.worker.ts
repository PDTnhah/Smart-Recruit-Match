import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Clock } from '../../../common/clock/index.js';
import { loadEnv } from '../../../common/config/env.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import { UserDirectory } from '../../iam/index.js';
import { afterEmailFailure } from '../domain/email-retry.js';
import { MAIL_TRANSPORT, type MailTransport } from '../infrastructure/mailer.js';
import { NotificationRepository } from '../infrastructure/notification.repository.js';
import { EmailRenderer } from './email-renderer.js';

export type EmailOutcome = 'sent' | 'retried' | 'failed' | 'cancelled';

export type OutboxRunReport = Record<EmailOutcome, number>;

/** Emails handled per run; the rest wait for the next tick. */
const BATCH_SIZE = 50;

/** `email_last_error` keeps the start of the message only. */
const ERROR_MAX_LENGTH = 500;

/**
 * Sends the email channel of notifications from the outbox (US-1.7 AC-4, ARCHITECTURE › Tác vụ
 * định kỳ). Each email is handled in its own transaction that locks its row with `SKIP LOCKED`,
 * so instances running at the same time never take the same email, and an SMTP error only
 * touches that row, never the business transaction that created it.
 *
 * Delivery is at least once: if the process dies after the SMTP server accepted the email but
 * before the commit, the row is still PENDING and the email goes out again.
 */
@Injectable()
export class EmailOutboxWorker {
  private readonly logger = new Logger(EmailOutboxWorker.name);
  private readonly enabled = loadEnv().SCHEDULER_ENABLED;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly repository: NotificationRepository,
    private readonly directory: UserDirectory,
    private readonly renderer: EmailRenderer,
    @Inject(MAIL_TRANSPORT) private readonly mail: MailTransport,
    private readonly clock: Clock,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS, { name: 'email-outbox', waitForCompletion: true })
  async tick(): Promise<void> {
    if (!this.enabled) return;
    try {
      await this.runOnce();
    } catch (error) {
      this.logger.error(`email outbox run failed: ${messageOf(error)}`);
    }
  }

  /** Sends up to `limit` due emails; stops early when none is left. */
  async runOnce(limit = BATCH_SIZE): Promise<OutboxRunReport> {
    const report: OutboxRunReport = { sent: 0, retried: 0, failed: 0, cancelled: 0 };
    for (let handled = 0; handled < limit; handled += 1) {
      const outcome = await this.db.transaction((tx) => this.sendNext(tx));
      if (!outcome) break;
      report[outcome] += 1;
    }
    return report;
  }

  private async sendNext(tx: DbTx): Promise<EmailOutcome | null> {
    const now = this.clock.now();
    const email = await this.repository.claimNextEmail(tx, now);
    if (!email) return null;

    const [recipient] = await this.directory.findContacts([email.userId]);
    if (!recipient?.isActive) {
      await this.repository.updateEmail(tx, email.id, {
        emailStatus: 'CANCELLED',
        emailNextAttemptAt: null,
        emailLastError: 'recipient account is inactive or missing',
      });
      return 'cancelled';
    }

    const attempts = email.emailAttempts + 1;
    try {
      const message = this.renderer.render(email, recipient);
      await this.mail.send({ to: recipient.email, ...message });
    } catch (error) {
      const lastError = messageOf(error).slice(0, ERROR_MAX_LENGTH);
      const next = afterEmailFailure(attempts, now);
      if (next.status === 'FAILED') {
        this.logger.error(`email of notification ${email.id} failed after ${attempts} attempts: ${lastError}`);
        await this.repository.updateEmail(tx, email.id, {
          emailStatus: 'FAILED',
          emailAttempts: attempts,
          emailNextAttemptAt: null,
          emailLastError: lastError,
        });
        return 'failed';
      }
      this.logger.warn(`email of notification ${email.id} failed (attempt ${attempts}), retrying later: ${lastError}`);
      await this.repository.updateEmail(tx, email.id, {
        emailStatus: 'PENDING',
        emailAttempts: attempts,
        emailNextAttemptAt: next.nextAttemptAt,
        emailLastError: lastError,
      });
      return 'retried';
    }

    await this.repository.updateEmail(tx, email.id, {
      emailStatus: 'SENT',
      emailAttempts: attempts,
      emailNextAttemptAt: null,
      emailSentAt: now,
      emailLastError: null,
    });
    return 'sent';
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
