import { explainOutcome, studentOutcome } from '../explain.js';
import { prdPairs, prdSnapshot, rankKey } from './prd-snapshot.js';

// US-5.2 AC-13 (NFR-4). The PRD result: A = Bình; B = Chi, An; C = Dũng.
const PRD_HELD = new Map([
  ['A', ['Bình']],
  ['B', ['Chi', 'An']],
  ['C', ['Dũng']],
]);

describe('explainOutcome (US-5.2 AC-13)', () => {
  it('NFR-4 PRD example: An is told A was full with higher-ranked students', () => {
    const outcome = explainOutcome(prdSnapshot(), PRD_HELD, 'An');
    expect(outcome.nominatedJdId).toBe('B');
    expect(outcome.items).toEqual([
      {
        jdId: 'A',
        preferenceRank: 1,
        reason: 'FULL_WITH_HIGHER_RANKED',
        exclusionReasons: [],
        sFinal: 8800,
        capacity: 1,
        held: 1,
        lowestHeld: { studentId: 'Bình', studentCode: 'SV02', sFinal: 9200 },
      },
    ]);
    // Bình holds NV1: nothing above it to explain.
    expect(explainOutcome(prdSnapshot(), PRD_HELD, 'Bình').items).toEqual([]);
  });

  it('NFR-4 student view hides other students’ scores', () => {
    const view = studentOutcome(explainOutcome(prdSnapshot(), PRD_HELD, 'An'));
    expect(view).toEqual({
      nominatedJdId: 'B',
      items: [{ jdId: 'A', preferenceRank: 1, reason: 'FULL_WITH_HIGHER_RANKED', exclusionReasons: [], sFinal: 8800 }],
    });
    expect(JSON.stringify(view)).not.toMatch(/9200|SV02|Bình/);
  });

  it('every preference of an unassigned student: zero capacity, not eligible, manual adjustment, demoted', () => {
    const snapshot = prdSnapshot({
      pairs: [
        ...prdPairs(),
        { ...prdPairs()[0]!, studentId: 'Em', jdId: 'Z', preferenceRank: 1, rankKey: rankKey('Em', 9900) },
        { ...prdPairs()[0]!, studentId: 'Em', jdId: 'C', preferenceRank: 3, rankKey: rankKey('Em', 9000) },
        { ...prdPairs()[0]!, studentId: 'Em', jdId: 'B', preferenceRank: 4, rankKey: rankKey('Em', 9900, { demoted: true }) },
      ],
      excluded: [
        { studentId: 'Em', jdId: 'A', preferenceRank: 2, reasons: ['BELOW_THETA_TEST'], hardFilterCodes: [], sCv: 6000, sTest: 3000, sFinal: 4200 },
      ],
      capacity: [
        ...prdSnapshot().capacity,
        { jdId: 'Z', capacity: 0, quota: 0, accepted: 0, inProcess: 0, k: 1, jdStatus: 'APPROVED' },
      ],
    });
    // The center took Dũng off C: C has a free seat Em would have had.
    const held = new Map([...PRD_HELD, ['C', []]]);
    expect(explainOutcome(snapshot, held, 'Em').items.map((item) => [item.jdId, item.reason, item.exclusionReasons])).toEqual([
      ['Z', 'ZERO_CAPACITY', []],
      ['A', 'NOT_ELIGIBLE', ['BELOW_THETA_TEST']],
      ['C', 'MANUAL_ADJUSTMENT', []],
      ['B', 'DEMOTED', []],
    ]);
  });
});
