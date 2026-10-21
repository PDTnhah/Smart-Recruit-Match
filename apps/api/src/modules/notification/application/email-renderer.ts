import { Injectable } from '@nestjs/common';
import { type CampaignDeadlineKey, type EmailNotificationType, isEmailNotificationType, type NotificationContent } from '@srm/shared';
import Handlebars from 'handlebars';
import { loadEnv } from '../../../common/config/env.js';
import type { UserContact } from '../../iam/index.js';
import type { MailMessage } from '../infrastructure/mailer.js';
import { EMAIL_TEMPLATES, HTML_LAYOUT } from '../templates/templates.js';

/** What the student still has to do before each deadline, and the page where they do it. */
const DEADLINE_TASKS: Record<CampaignDeadlineKey, { task: string; path: string }> = {
  intake_end: { task: 'nộp CV', path: '/sv/cv' },
  preference_end: { task: 'chọn nguyện vọng', path: '/sv/preferences' },
  testing_end: { task: 'làm bài test', path: '/sv/exams' },
};

/** Emails show Vietnam time, the time zone of the school, whatever the server runs in. */
const DATE_TIME = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Line breaks in a header value; a name typed with one must not start a new header. */
const LINE_BREAKS = /[\r\n]+/g;

/** 08/10/2026 14:05, as the web shows dates (DESIGN.md §10). */
export function formatVietnamTime(iso: string): string {
  const parts = Object.fromEntries(DATE_TIME.formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

type Template = Handlebars.TemplateDelegate<Record<string, string>>;

/** A link to an HR's current invitation, issued by iam when the email is sent (CONTEXT D31). */
export interface InvitationLink {
  invitationPath: string;
  expiresAt: string;
}

interface Compiled {
  subject: Template;
  html: Template;
  text: Template;
}

/**
 * Turns a notification into an email (US-1.7 AC-4). Links are absolute, built from WEB_ORIGIN.
 * The worker parses the stored row first: a damaged row fails (retried, then FAILED) rather than
 * sending a broken email.
 */
@Injectable()
export class EmailRenderer {
  private readonly webOrigin = loadEnv().WEB_ORIGIN;
  private readonly handlebars = Handlebars.create();
  private readonly layout = this.handlebars.compile(HTML_LAYOUT, { strict: true });
  private readonly compiled = new Map<EmailNotificationType, Compiled>();

  render(
    content: NotificationContent,
    recipient: UserContact,
    links: { invitation?: InvitationLink } = {},
  ): Omit<MailMessage, 'to'> {
    const { type } = content;
    // Unreachable for rows written through notify, which refuses EMAIL for these types.
    if (!isEmailNotificationType(type)) throw new Error(`${type} is shown in the app only, never emailed`);
    const context = { recipientName: recipient.fullName ?? recipient.email, ...this.contextOf(content, links) };
    const template = this.templateOf(type);
    const subject = template.subject(context).replace(LINE_BREAKS, ' ');
    return {
      subject,
      html: this.layout({ subject, body: template.html(context) }),
      text: template.text(context),
    };
  }

  private contextOf(content: NotificationContent, links: { invitation?: InvitationLink }): Record<string, string> {
    switch (content.type) {
      case 'CAMPAIGN_OPENED':
        return {
          campaignName: content.payload.campaignName,
          intakeEnd: formatVietnamTime(content.payload.intakeEnd),
          link: `${this.webOrigin}${DEADLINE_TASKS.intake_end.path}`,
        };
      case 'HR_INVITED':
        if (!links.invitation) throw new Error('an invitation email needs the current invitation link');
        return {
          expiresAt: formatVietnamTime(links.invitation.expiresAt),
          link: `${this.webOrigin}${links.invitation.invitationPath}`,
        };
      case 'DEADLINE_REMINDER': {
        const { task, path } = DEADLINE_TASKS[content.payload.deadlineKey];
        return {
          task,
          campaignName: content.payload.campaignName,
          deadline: formatVietnamTime(content.payload.deadline),
          link: `${this.webOrigin}${path}`,
        };
      }
      case 'JD_REQUIREMENTS_READY':
      case 'JD_ANALYSIS_FAILED':
      case 'JD_REQUIREMENTS_VERSIONED':
        throw new Error(`${content.type} is shown in the app only, never emailed`);
    }
  }

  private templateOf(type: EmailNotificationType): Compiled {
    let compiled = this.compiled.get(type);
    if (!compiled) {
      const source = EMAIL_TEMPLATES[type];
      compiled = {
        // Subject and plain text are not HTML: no escaping, so "&" stays "&".
        subject: this.handlebars.compile(source.subject, { strict: true, noEscape: true }),
        html: this.handlebars.compile(source.html, { strict: true }),
        text: this.handlebars.compile(source.text, { strict: true, noEscape: true }),
      };
      this.compiled.set(type, compiled);
    }
    return compiled;
  }
}
