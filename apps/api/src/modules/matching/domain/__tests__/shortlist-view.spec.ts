import type { MatchCodeCriteria, StoredMatchAssessment } from '@srm/shared';
import fc from 'fast-check';
import {
  type ShortlistKeyRow,
  type ShortlistRow,
  shortlistJdIds,
  shortlistSummary,
  shortlistView,
} from '../shortlist-view.js';

const CRITERIA: MatchCodeCriteria = {
  must_have: [],
  nice_to_have: [],
  education: { major_match: 'EXACT', major_unrecognized: false },
  language: null,
  zones: [],
  gaps: [],
};

const ASSESSMENT: StoredMatchAssessment = {
  project_relevance: { score_0_4: 2, reason: 'Có dự án', evidence: [] },
  strengths: [],
  suggestions: [],
  summary: 'Phù hợp.',
  evidence_check: [],
};

const CV = { cvId: 1, cvVersion: 2 };

/** A row of CV 1 version 2 against a JD at version 1, waiting for the LLM unless `sCv` is given. */
function row(jdId: number, overrides: Partial<ShortlistRow> = {}): ShortlistRow {
  const scored = overrides.sCv !== undefined && overrides.sCv !== null;
  return {
    cvId: CV.cvId,
    cvVersion: CV.cvVersion,
    jdId,
    jdVersion: 1,
    eligible: true,
    ineligibleReasons: [],
    criteria: CRITERIA,
    skippedByPrefilter: false,
    needsReview: false,
    promptVersion: scored ? 'matching/v1' : null,
    assessment: scored ? ASSESSMENT : null,
    sCv: null,
    scvBreakdown: scored ? [] : null,
    ...overrides,
  };
}

const jd = (jdId: number, jdVersion = 1) => ({ jdId, jdVersion, title: `JD ${jdId}` });

const view = (rows: ShortlistRow[], jds = [jd(1), jd(2), jd(3), jd(4), jd(5), jd(6)], pinnedPrompt: string | null = 'matching/v1') =>
  shortlistView({ cv: CV, jds, rows, pinnedPrompt, thetaCv: 50 });

describe('GĐ3 shortlist view (US-3.3 AC-1, AC-2, AC-4)', () => {
  it('GĐ3 shortlist: eligible JDs with S_cv >= theta, best first; every other JD in one bucket', () => {
    const result = view([
      row(1, { sCv: 62 }),
      row(2, { sCv: 81.5 }),
      row(3, { sCv: 49.99 }), // below θ_cv
      row(4, { eligible: false, criteria: null, ineligibleReasons: [{ code: 'GPA_BELOW_MIN', required: 3, actual: 2.5 }] }),
      row(5, { skippedByPrefilter: true }),
      // JD 6 waits for the LLM.
      row(6),
    ]);
    expect(shortlistJdIds(result)).toEqual([2, 1]);
    expect(result.shortlist[0]).toMatchObject({ jdId: 2, scvX100: 8150, jd: { title: 'JD 2' } });
    expect(result.ineligible).toEqual([{ jd: jd(4), reasons: [{ code: 'GPA_BELOW_MIN', required: 3, actual: 2.5 }] }]);
    expect({ below: result.belowThreshold, notScored: result.notScored, pending: result.pending }).toEqual({
      below: 1,
      notScored: 1,
      pending: 1,
    });
    expect(result.judged).toBe(true);
  });

  it('GĐ3 shortlist: only the current CV version, JD version and pinned prompt count (BR-18, CONTEXT D46)', () => {
    const result = view(
      [
        row(1, { sCv: 90, cvVersion: 1 }), // an older CV version
        row(2, { sCv: 90, jdVersion: 1 }), // JD 2 is at version 2 now
        row(3, { sCv: 90, promptVersion: 'matching/v0' }), // scored with another prompt
        row(3), // and waiting under the pinned one
        row(4, { needsReview: true }), // left to staff
      ],
      [jd(1), jd(2, 2), jd(3), jd(4)],
    );
    expect(result.shortlist).toEqual([]);
    expect({ notScored: result.notScored, pending: result.pending }).toEqual({ notScored: 1, pending: 3 });
  });

  it('GĐ3 shortlist: a scored row wins over a waiting row of the same pair', () => {
    const result = view([row(1), row(1, { sCv: 70 })], [jd(1)]);
    expect(shortlistJdIds(result)).toEqual([1]);
    expect(result.pending).toBe(0);
  });

  it('GĐ3 shortlist: scoring in progress vs empty shortlist vs no result yet', () => {
    // No row for this CV: nothing judged, every JD pending.
    const none = view([], [jd(1), jd(2)]);
    expect({ judged: none.judged, pending: none.pending }).toEqual({ judged: false, pending: 2 });
    // Judged, nothing reaches θ_cv: an empty shortlist, not "still scoring".
    const empty = view([row(1, { sCv: 20 })], [jd(1)]);
    expect({ judged: empty.judged, shortlist: empty.shortlist, below: empty.belowThreshold }).toEqual({
      judged: true,
      shortlist: [],
      below: 1,
    });
    // No JD at all.
    expect(view([], []).pending).toBe(0);
    // No prompt pinned yet: no row is scored.
    expect(view([row(1, { sCv: 80 })], [jd(1)], null).shortlist).toEqual([]);
  });

  it('a scored row without its verdicts is refused rather than shown half-explained', () => {
    expect(() => view([row(1, { sCv: 70, assessment: null })], [jd(1)])).toThrow('scored without its verdicts');
  });

  it('GĐ4 Q6 and the reminder read the same shortlist from the lean rows (property)', () => {
    const keyOf = (full: ShortlistRow): ShortlistKeyRow => ({
      cvId: full.cvId,
      cvVersion: full.cvVersion,
      jdId: full.jdId,
      jdVersion: full.jdVersion,
      eligible: full.eligible,
      skippedByPrefilter: full.skippedByPrefilter,
      needsReview: full.needsReview,
      promptVersion: full.promptVersion,
      sCv: full.sCv,
    });
    const rowArb = fc
      .record({
        jdId: fc.integer({ min: 1, max: 6 }),
        cvVersion: fc.constantFrom(1, 2),
        jdVersion: fc.constantFrom(1, 2),
        kind: fc.constantFrom('scored', 'otherPrompt', 'waiting', 'ineligible', 'skipped', 'review'),
        sCv: fc.integer({ min: 0, max: 10_000 }).map((hundredths) => hundredths / 100),
      })
      .map(({ jdId, cvVersion, jdVersion, kind, sCv }) => {
        const at = { cvVersion, jdVersion };
        if (kind === 'scored') return row(jdId, { ...at, sCv });
        if (kind === 'otherPrompt') return row(jdId, { ...at, sCv, promptVersion: 'matching/v0' });
        if (kind === 'ineligible') return row(jdId, { ...at, eligible: false, criteria: null });
        if (kind === 'skipped') return row(jdId, { ...at, skippedByPrefilter: true });
        if (kind === 'review') return row(jdId, { ...at, needsReview: true });
        return row(jdId, at);
      });
    const jds = [jd(1), jd(2, 2), jd(3), jd(4), jd(5, 2), jd(6)];

    fc.assert(
      fc.property(fc.array(rowArb, { maxLength: 24 }), fc.constantFrom('matching/v1', null), (rows, pinnedPrompt) => {
        const full = shortlistView({ cv: CV, jds, rows, pinnedPrompt, thetaCv: 50 });
        const lean = shortlistSummary({ cv: CV, jds, rows: rows.map(keyOf), pinnedPrompt, thetaCv: 50 });
        expect(lean).toEqual({ jdIds: shortlistJdIds(full), pending: full.pending });
      }),
    );
  });
});
