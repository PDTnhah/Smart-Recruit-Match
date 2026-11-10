/**
 * A hook of the threshold sweep (US-4.4 AC-14, CONTEXT D53): sessions whose preference must not
 * turn BELOW_THRESHOLD yet, e.g. while an appeal of US-4.6 is open. US-4.6 provides its own; until
 * then nothing is held.
 */
export interface ThresholdHolds {
  /** The sessions among `sessionIds` to leave as they are on this run. */
  heldSessionIds(sessionIds: readonly number[]): Promise<Set<number>>;
}

/** Injection token of ThresholdHolds. */
export const THRESHOLD_HOLDS = Symbol('THRESHOLD_HOLDS');

/** Holds nothing back. */
export const NO_THRESHOLD_HOLDS: ThresholdHolds = {
  heldSessionIds: () => Promise.resolve(new Set<number>()),
};
