/** Audit actions written by the matching module (US-3.3, CONTEXT D47). */
export const MATCHING_AUDIT_ACTIONS = {
  /** A student saved a new preference list; before and after are `{ campaignId, items }`. */
  PREFERENCES_REPLACED: 'PREFERENCES_REPLACED',
  /** The system gave preferences to a student who chose none by the deadline (Q6). */
  PREFERENCES_AUTO_ASSIGNED: 'PREFERENCES_AUTO_ASSIGNED',
} as const;

/** Audit entity of a whole preference list; its `entity_id` is the student id. */
export const PREFERENCE_LIST_ENTITY = 'preference_list';

/** Audit reason of a preference closed because its test was not taken by `testing_end` (BR-06, US-4.3 AC-10). */
export const TEST_NOT_TAKEN_REASON = 'TEST_NOT_TAKEN';
