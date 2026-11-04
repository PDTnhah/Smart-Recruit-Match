import {
  type IneligibleReason,
  type MatchCodeCriteria,
  type ScvBreakdownRow,
  type StoredMatchAssessment,
  toHundredths,
} from '@srm/shared';
import { type ShortlistCandidate, selectShortlist } from './shortlist.js';

// What one student sees of a campaign's results (FR-15, US-3.3 AC-1, AC-2, AC-4, CONTEXT D47). Pure:
// the GET of the shortlist, the check of a preference list (BR-04), the auto-assignment of Q6 and
// the preference reminder all read "on the shortlist" from here, so they cannot disagree.

/**
 * What decides a stored result's bucket and its place on the shortlist: no verdicts, no
 * explanation. Q6 and the reminder read only this much of a whole campaign.
 */
export interface ShortlistKeyRow {
  cvId: number;
  cvVersion: number;
  jdId: number;
  jdVersion: number;
  eligible: boolean;
  skippedByPrefilter: boolean;
  needsReview: boolean;
  promptVersion: string | null;
  sCv: number | null;
}

/** A stored result as the shortlist shows it (`core.match_results`, US-3.2). */
export interface ShortlistRow extends ShortlistKeyRow {
  ineligibleReasons: IneligibleReason[];
  criteria: MatchCodeCriteria | null;
  assessment: StoredMatchAssessment | null;
  scvBreakdown: ScvBreakdownRow[] | null;
}

/** A JD the student may be suggested: approved, still recruiting, at its current version. */
export interface CurrentJd {
  jdId: number;
  jdVersion: number;
}

export interface ShortlistViewInput<J extends CurrentJd, R extends ShortlistKeyRow = ShortlistRow> {
  /** The student's active, confirmed CV. */
  cv: { cvId: number; cvVersion: number };
  /** By JD id. */
  jds: readonly J[];
  /** Rows of the campaign with the current rules, waiting or scored with the pinned prompt. */
  rows: readonly R[];
  pinnedPrompt: string | null;
  thetaCv: number;
}

/** A pair with its S_cv and everything that explains it. */
export interface ScoredPair<J extends CurrentJd> {
  jd: J;
  jdId: number;
  eligible: true;
  scvX100: number;
  criteria: MatchCodeCriteria;
  assessment: StoredMatchAssessment;
  breakdown: ScvBreakdownRow[];
}

export interface ShortlistView<J extends CurrentJd> {
  /** Eligible with S_cv ≥ θ_cv, best first, equal S_cv by JD id (`selectShortlist`). */
  shortlist: ScoredPair<J>[];
  /** Failed the hard filter, by JD id, with one reason per failed condition. */
  ineligible: { jd: J; reasons: IneligibleReason[] }[];
  /** Eligible and scored, S_cv below θ_cv. */
  belowThreshold: number;
  /** Eligible, never to be scored by this campaign's runs: outside the top M, or left to staff. */
  notScored: number;
  /** No result for this CV and JD version yet, or waiting for the LLM. */
  pending: number;
  /** Whether any current JD has a result for this CV: none means the CV is still to be scored. */
  judged: boolean;
}

/** Where one current JD stands for the CV; `row` is the result that put it there. */
type Bucket<R> =
  | { kind: 'scored'; row: R }
  | { kind: 'ineligible'; row: R }
  | { kind: 'notScored' }
  | { kind: 'pending' };

/**
 * Sorts every current JD into one bucket. A row counts only for the CV version given, the JD's
 * current version, and (when scored) the campaign's pinned prompt (CONTEXT D46); a scored row wins
 * over a waiting one of the same pair. Older rows stay in the table and are ignored (BR-18).
 */
function bucketsOf<J extends CurrentJd, R extends ShortlistKeyRow>(
  input: ShortlistViewInput<J, R>,
): { buckets: { jd: J; bucket: Bucket<R> }[]; judged: boolean } {
  const { cv, pinnedPrompt } = input;
  const rowsByJd = new Map<number, R[]>();
  for (const row of input.rows) {
    if (row.cvId !== cv.cvId || row.cvVersion !== cv.cvVersion) continue;
    const rows = rowsByJd.get(row.jdId);
    if (rows) rows.push(row);
    else rowsByJd.set(row.jdId, [row]);
  }

  let judged = false;
  const buckets = input.jds.map((jd) => {
    const rows = (rowsByJd.get(jd.jdId) ?? []).filter((row) => row.jdVersion === jd.jdVersion);
    if (rows.length > 0) judged = true;
    return { jd, bucket: bucketOf(rows, pinnedPrompt) };
  });
  return { buckets, judged };
}

function bucketOf<R extends ShortlistKeyRow>(rows: readonly R[], pinnedPrompt: string | null): Bucket<R> {
  const result = pinnedPrompt === null ? undefined : rows.find((row) => row.promptVersion === pinnedPrompt);
  if (result) return { kind: 'scored', row: result };
  const waiting = rows.find((row) => row.promptVersion === null);
  if (!waiting) return { kind: 'pending' };
  if (!waiting.eligible) return { kind: 'ineligible', row: waiting };
  if (waiting.skippedByPrefilter || waiting.needsReview) return { kind: 'notScored' };
  return { kind: 'pending' };
}

/** Everything one student sees of the campaign's results (AC-1, AC-2, AC-4). */
export function shortlistView<J extends CurrentJd>(input: ShortlistViewInput<J>): ShortlistView<J> {
  const { buckets, judged } = bucketsOf(input);
  const view: ShortlistView<J> = { shortlist: [], ineligible: [], belowThreshold: 0, notScored: 0, pending: 0, judged };
  const scored: ScoredPair<J>[] = [];
  for (const { jd, bucket } of buckets) {
    if (bucket.kind === 'scored') scored.push(scoredPair(jd, bucket.row));
    else if (bucket.kind === 'ineligible') view.ineligible.push({ jd, reasons: bucket.row.ineligibleReasons });
    else if (bucket.kind === 'notScored') view.notScored += 1;
    else view.pending += 1;
  }
  view.shortlist = selectShortlist(scored, input.thetaCv);
  view.belowThreshold = scored.length - view.shortlist.length;
  return view;
}

/** What Q6 and the reminder need of one student: the shortlist's JD ids in order, and the JDs still to be scored. */
export interface ShortlistSummary {
  jdIds: number[];
  /** As `ShortlistView.pending`. */
  pending: number;
}

/** The shortlist of `shortlistView` from the lean rows: the same buckets, the same order. */
export function shortlistSummary<J extends CurrentJd>(input: ShortlistViewInput<J, ShortlistKeyRow>): ShortlistSummary {
  const scored: ShortlistCandidate[] = [];
  let pending = 0;
  for (const { jd, bucket } of bucketsOf(input).buckets) {
    if (bucket.kind === 'scored') scored.push({ jdId: jd.jdId, eligible: true, scvX100: scvX100Of(bucket.row) });
    else if (bucket.kind === 'pending') pending += 1;
  }
  return { jdIds: selectShortlist(scored, input.thetaCv).map((candidate) => candidate.jdId), pending };
}

/** The JD ids of the shortlist in its order: what a preference list may hold (BR-04). */
export function shortlistJdIds<J extends CurrentJd>(view: ShortlistView<J>): number[] {
  return view.shortlist.map((pair) => pair.jdId);
}

// A scored row has its code verdicts, the LLM part and S_cv (CHECKs of match_results, US-3.2).
function scoredPair<J extends CurrentJd>(jd: J, row: ShortlistRow): ScoredPair<J> {
  if (row.criteria === null || row.assessment === null || row.scvBreakdown === null) {
    throw new Error(`match result of cv ${row.cvId} × jd ${row.jdId}: scored without its verdicts`);
  }
  return {
    jd,
    jdId: jd.jdId,
    eligible: true,
    scvX100: scvX100Of(row),
    criteria: row.criteria,
    assessment: row.assessment,
    breakdown: row.scvBreakdown,
  };
}

function scvX100Of(row: ShortlistKeyRow): number {
  if (!row.eligible || row.sCv === null) {
    throw new Error(`match result of cv ${row.cvId} × jd ${row.jdId}: scored without its verdicts`);
  }
  return toHundredths(row.sCv);
}
