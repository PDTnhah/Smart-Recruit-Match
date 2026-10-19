// A MailTransport for tests (US-1.7 TASK-1.7.7): records what would be sent, can be made to fail
// or to take time. Override the provider: `b.overrideProvider(MAIL_TRANSPORT).useValue(mail)`.
import type { MailMessage, MailTransport } from '../../src/modules/notification/infrastructure/mailer.js';

export class FakeMailTransport implements MailTransport {
  readonly sent: MailMessage[] = [];
  /** When set, every send throws this, like an SMTP server refusing the connection. */
  failure: Error | null = null;
  /** Time each send takes, to make concurrent workers overlap. */
  delayMs = 0;

  async send(message: MailMessage): Promise<void> {
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    if (this.failure) throw this.failure;
    this.sent.push(message);
  }

  to(address: string): MailMessage[] {
    return this.sent.filter((message) => message.to === address);
  }
}
