/** Audit actions of the allocation module (US-5.2, BR-10, BR-17). */
export const ALLOCATION_AUDIT_ACTIONS = {
  /** The first run of a round; `after` counts what it stored. */
  ROUND_RUN: 'ALLOCATION_ROUND_RUN',
  /** A draft run again (AC-6): its nominations and manual adjustments are replaced. */
  ROUND_RERUN: 'ALLOCATION_ROUND_RERUN',
  NOMINATION_ADDED: 'NOMINATION_ADDED',
  NOMINATION_REMOVED: 'NOMINATION_REMOVED',
  NOMINATION_MOVED: 'NOMINATION_MOVED',
} as const;

/** Audit entity of a nomination: the name of `nominationMachine`. */
export const NOMINATION_ENTITY = 'nomination';

/** Reason of the round's DRAFT → PUBLISHED and of its preferences' moves (AC-10). */
export const ROUND_PUBLISHED_REASON = 'ALLOCATION_ROUND_PUBLISHED';
