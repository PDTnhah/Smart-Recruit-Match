import { selectTopM } from './select-top-m.js';

// What a matching run does with each CV × JD pair (US-3.2 AC-1, AC-4, AC-6, AC-9, CONTEXT D46).
// Pure: the service reads which pairs are already scored, then writes and sends what this decides.

/** A pair by IDs and versions; with the rules and the prompt, the key of its stored result (AC-4). */
export interface PairKey {
  cvId: number;
  cvVersion: number;
  jdId: number;
  jdVersion: number;
}

export const pairKeyOf = (pair: PairKey): string => `${pair.cvId}/${pair.cvVersion}/${pair.jdId}/${pair.jdVersion}`;

export interface JudgedPair extends PairKey {
  eligible: boolean;
  /** skill_fit × 100; null when the pair failed the hard filter. */
  skillFitX100: number | null;
}

/**
 * - CACHED: already scored with these versions, the rules and the pinned prompt; left as it is.
 * - INELIGIBLE: failed the hard filter; stored with its reasons.
 * - SKIPPED: outside the top M of its CV; stored, never sent.
 * - REVIEW: in the top M, but the LLM refused it twice; stored, not sent again.
 * - SEND: in the top M, waiting for the Matching Agent.
 */
export type PairAction = 'CACHED' | 'INELIGIBLE' | 'SKIPPED' | 'REVIEW' | 'SEND';

export interface CvPlanInput<P extends JudgedPair> {
  /** Every pair of one CV, one per JD. */
  pairs: readonly P[];
  topM: number;
  /** Keys of the pairs already scored with these rules and the pinned prompt. */
  done: ReadonlySet<string>;
  /** Keys of the waiting pairs the LLM refused twice. */
  review: ReadonlySet<string>;
}

/**
 * The action for each pair of one CV, in the order given. The top M is ranked over every pair that
 * passed the hard filter, scored ones included, so a new JD with a better skill_fit takes the place
 * of a weaker one; a scored pair that drops out keeps its score.
 */
export function planCvPairs<P extends JudgedPair>({ pairs, topM, done, review }: CvPlanInput<P>): {
  pair: P;
  action: PairAction;
}[] {
  const candidates = pairs.flatMap((pair) =>
    pair.eligible && pair.skillFitX100 !== null ? [{ jdId: pair.jdId, skillFitX100: pair.skillFitX100, pair }] : [],
  );
  const top = new Set(selectTopM(candidates, topM).map((candidate) => candidate.pair));
  const actionOf = (pair: P): PairAction => {
    const key = pairKeyOf(pair);
    if (done.has(key)) return 'CACHED';
    if (!pair.eligible) return 'INELIGIBLE';
    if (!top.has(pair)) return 'SKIPPED';
    return review.has(key) ? 'REVIEW' : 'SEND';
  };
  return pairs.map((pair) => ({ pair, action: actionOf(pair) }));
}
