import type { OnApplicationShutdown } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import type { Env } from '../../../common/config/env.js';

/** A rendered email; the sender comes from MAIL_FROM. */
export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Sends one email or throws. Tests replace it with a fake (US-1.7 TASK-1.7.7). */
export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

/**
 * SMTP through nodemailer (ARCHITECTURE › Thư viện chính). In development the SMTP server is
 * Mailpit (compose service `mailpit`, UI on MAILPIT_UI_HOST_PORT). Nothing connects until the
 * first email is sent.
 */
export class SmtpMailTransport implements MailTransport, OnApplicationShutdown {
  private readonly transporter;

  constructor(env: Pick<Env, 'SMTP_HOST' | 'SMTP_PORT' | 'SMTP_USER' | 'SMTP_PASSWORD' | 'MAIL_FROM'>) {
    this.transporter = createTransport(
      {
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? '' } : undefined,
      },
      { from: env.MAIL_FROM },
    );
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail(message);
  }

  onApplicationShutdown(): void {
    this.transporter.close();
  }
}
