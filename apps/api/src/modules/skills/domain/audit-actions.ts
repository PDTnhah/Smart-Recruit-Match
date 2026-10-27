/** Audit actions written by the skills module; status changes use `TRANSITION` (AD-8). */
export const SKILLS_AUDIT_ACTIONS = {
  /** A CV or JD result named a skill outside the catalogue; it awaits ADMIN (system actor, AC-5). */
  SKILL_PROPOSED: 'SKILL_PROPOSED',
  /** The skill normalizer suggested a name and group (system actor; model and prompt in `after`). */
  SKILL_SUGGESTED: 'SKILL_SUGGESTED',
  /** ADMIN set the catalogue name, group and aliases; the TRANSITION entry to APPROVED follows. */
  SKILL_APPROVED: 'SKILL_APPROVED',
  /** ADMIN merged the skill into an approved one; the TRANSITION entry to MERGED follows. */
  SKILL_MERGED: 'SKILL_MERGED',
  /** A merge added spellings to the aliases of the target skill. */
  SKILL_ALIASES_ADDED: 'SKILL_ALIASES_ADDED',
} as const;

/** Why `transitionTo` moved a skill, stored in audit_logs.reason. */
export const SKILL_REVIEW_REASONS = {
  APPROVED: 'Approved into the skill catalogue by ADMIN',
  MERGED: 'Merged into an approved skill by ADMIN',
  REJECTED: 'Rejected by ADMIN',
} as const;

/** reasonCode of a merge whose target is not an approved skill. */
export const MERGE_TARGET_NOT_APPROVED = 'MERGE_TARGET_NOT_APPROVED';
