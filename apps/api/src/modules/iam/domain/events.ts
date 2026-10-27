// Events of the iam module, published with @nestjs/event-emitter after the transaction commits
// (CONTEXT D28). Listeners should declare `{ async: true }` so they never affect the change.

/** An HR account was invited or re-invited. US-1.7 emails the link (prefixing the web origin). */
export const HR_INVITED = 'hr.invited';

export interface HrInvitedEvent {
  userId: number;
  companyId: number;
  email: string;
  fullName: string | null;
  /** `/accept-invitation#<token>`, relative to the web origin. */
  invitationPath: string;
  expiresAt: string;
}
