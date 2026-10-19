import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationContentSchema } from '@srm/shared';
import { Clock } from '../../../common/clock/index.js';
import { loadEnv } from '../../../common/config/env.js';
import { errorMessage } from '../../../common/errors/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import { InvitationService, UserDirectory } from '../../iam/index.js';
import { emailStillRelevant } from '../domain/email-relevance.js';
import { afterEmailFailure } from '../domain/email-retry.js';
import { MAIL_TRANSPORT, type MailTransport } from '../infrastructure/mailer.js';
import { NotificationRepository, type OutboxEmail } from '../infrastructure/notification.repository.js';
import { EmailRenderer, type InvitationLink } from './email-renderer.js';

export type EmailOutcome = 'sent' | 'retried' | 'failed' | 'cancelled';

export type OutboxRunReport = Record<EmailOutcome, number>;

/**
 * Emails handled per run. Runs never overlap (`waitForCompletion`), so a large batch, such as a
 * campaign opening for thousands of students, drains in a few ticks over a pooled SMTP connection.
 */
const BATCH_SIZE = 500;

/** `email_last_error` keeps the start of the message only. */
const ERROR_MAX_LENGTH = 500;

/**
 * Sends the email channel of notifications from the outbox (US-1.7 AC-4, ARCHITECTURE › Tác vụ
 * định kỳ). Each email is handled in its own transaction that locks its row with `SKIP LOCKED`,
 * so instances running at the same time never take the same email, and an SMTP error only
 * touches that row, never the business transaction that created it. SMTP timeouts (mailer.ts)
 * bound how long a row and its connection stay held.
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
    private readonly invitations: InvitationService,
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
      this.logger.error(`email outbox run failed: ${errorMessage(error)}`);
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
    if (!recipient?.isActive) return this.cancel(tx, email, 'recipient account is inactive or missing');

    const attempts = email.emailAttempts + 1;
    try {
      const content = NotificationContentSchema.parse(email);
      if (!emailStillRelevant(content, now)) return await this.cancel(tx, email, 'out of date: the deadline has passed');
      let invitation: InvitationLink | undefined;
      if (content.type === 'HR_INVITED') {
        invitation = (await this.invitations.currentInvitationLink(email.userId)) ?? undefined;
        if (!invitation) return await this.cancel(tx, email, 'no pending invitation: accepted or withdrawn');
      }
      const message = this.renderer.render(content, recipient, { invitation });
      await this.mail.send({ to: recipient.email, ...message });
    } catch (error) {
      return this.recordFailure(tx, email, attempts, now, error);
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

  private async cancel(tx: DbTx, email: OutboxEmail, reason: string): Promise<EmailOutcome> {
    await this.repository.updateEmail(tx, email.id, {
      emailStatus: 'CANCELLED',
      emailNextAttemptAt: null,
      emailLastError: reason,
    });
    return 'cancelled';
  }

  private async recordFailure(
    tx: DbTx,
    email: OutboxEmail,
    attempts: number,
    now: Date,
    error: unknown,
  ): Promise<EmailOutcome> {
    const lastError = errorMessage(error).slice(0, ERROR_MAX_LENGTH);
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
}
