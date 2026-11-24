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
    case 'CV_ANALYSIS_FAILED':
      // A failure stays true; asking to upload again is harmless after a newer upload (D37).
      return true;
    case 'PREFERENCES_AUTO_ASSIGNED':
      // A fact about the list; the student may change nothing after the deadline anyway (D47).
      return true;
    case 'JD_LOW_PREFERENCES':
      // Preferences are final once the alert is sent; the counts stay true (D48).
      return true;
    case 'EXAM_NOT_TAKEN':
      // A closed preference stays closed (BR-06, D51).
      return true;
    case 'EXAM_RESULT_PUBLISHED':
      // Published results stay published; an appeal changes a score, not that results exist (D53).
      return true;
    case 'CAMPAIGN_DEADLINES_CHANGED':
      // Worth reading while one of the new deadlines is still ahead (D56).
      return content.payload.deadlines.some((move) => Date.parse(move.after) > now.getTime());
    case 'CAMPAIGN_CANCELLED':
      // CANCELLED is final (D56).
      return true;
    case 'JD_REQUIREMENTS_READY':
    case 'JD_ANALYSIS_FAILED':
    case 'JD_REQUIREMENTS_VERSIONED':
    case 'CV_PROFILE_READY':
    case 'CV_NEEDS_ATTENTION':
    case 'NOMINATIONS_PUBLISHED':
    case 'HR_REVIEW_DUE_SOON':
    case 'HR_REVIEW_OVERDUE':
    case 'SUPPLEMENT_REQUESTED':
      // Shown in the app only; never queued as email (CONTEXT D35, D37, D64, D65).
      return false;
  }
}
