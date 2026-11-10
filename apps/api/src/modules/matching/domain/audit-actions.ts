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

/** Audit reason of a preference whose test results are published with its S_final (US-4.4 AC-11). */
export const TEST_GRADED_REASON = 'TEST_GRADED';

/** Audit reason of a preference below θ_test once the appeal window has passed (BR-07, US-4.4 AC-14). */
export const BELOW_THETA_TEST_REASON = 'BELOW_THETA_TEST';
