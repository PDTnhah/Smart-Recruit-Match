import type { NotificationContent } from '@srm/shared';

/**
 * Whether an email still says something true when the worker gets to it. A retried reminder must
 * not tell a student about a deadline that has already passed, nor an opening email invite CVs
 * after intake closed; such emails are cancelled instead (CONTEXT D31).
 */
export function emailStillRelevant(content: NotificationContent, now: Date): boolean {
  switch (content.type) {
    case 'CAMPAIGN_OPENED':
      return Date.parse(content.payload.intakeEnd) > now.getTime();
    case 'DEADLINE_REMINDER':
      return Date.parse(content.payload.deadline) > now.getTime();
    case 'HR_INVITED':
      // Checked against iam when the link is issued: no pending invitation, no email.
      return true;
    case 'JD_REQUIREMENTS_READY':
    case 'JD_ANALYSIS_FAILED':
    case 'JD_REQUIREMENTS_VERSIONED':
      // Shown in the app only; never queued as email (CONTEXT D35).
      return false;
  }
}
