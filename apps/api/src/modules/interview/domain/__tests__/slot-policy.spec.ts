import { addCalendarDays, freePlaces, interviewOutcome, isFilled, reserveAllowed, resolvePassResult } from '../slot-policy.js';

describe('GĐ9 places of a JD (US-5.4)', () => {
  it('BR-14 PASSED beyond remaining quota becomes RESERVE', () => {
    expect(resolvePassResult({ quota: 3, accepted: 1, passed: 1 })).toBe('PASSED');
    // A + P = Q: the last place is offered already.
    expect(resolvePassResult({ quota: 3, accepted: 1, passed: 2 })).toBe('RESERVE');
    expect(resolvePassResult({ quota: 2, accepted: 2, passed: 0 })).toBe('RESERVE');
    expect(resolvePassResult({ quota: 0, accepted: 0, passed: 0 })).toBe('RESERVE');
  });

  it('BR-13 HR result maps to the nomination state; ABSENT counts as FAILED', () => {
    const open = { quota: 2, accepted: 0, passed: 0 };
    const full = { quota: 2, accepted: 1, passed: 1 };
    expect(interviewOutcome('PASSED', open)).toEqual({ outcome: 'PASSED', reservedForQuota: false });
    expect(interviewOutcome('PASSED', full)).toEqual({ outcome: 'RESERVE', reservedForQuota: true });
    expect(interviewOutcome('RESERVE', open)).toEqual({ outcome: 'RESERVE', reservedForQuota: false });
    expect(interviewOutcome('FAILED', open)).toEqual({ outcome: 'INTERVIEW_FAILED', reservedForQuota: false });
    expect(interviewOutcome('ABSENT', open)).toEqual({ outcome: 'INTERVIEW_FAILED', reservedForQuota: false });
  });

  it('BR-14 HR picks RESERVE only when no place is left', () => {
    expect(reserveAllowed({ quota: 2, accepted: 0, passed: 1 })).toBe(false);
    expect(reserveAllowed({ quota: 2, accepted: 1, passed: 1 })).toBe(true);
  });

  it('BR-16 a freed place lets up as many reserves as places are left; a full JD closes them', () => {
    expect(freePlaces({ quota: 3, accepted: 1, passed: 1 })).toBe(1);
    expect(freePlaces({ quota: 1, accepted: 1, passed: 1 })).toBe(0);
    expect(isFilled({ quota: 2, accepted: 1 })).toBe(false);
    expect(isFilled({ quota: 2, accepted: 2 })).toBe(true);
  });

  it('GĐ9 T_offer counts calendar days', () => {
    expect(addCalendarDays(new Date('2026-11-27T10:00:00Z'), 3).toISOString()).toBe('2026-11-30T10:00:00.000Z');
  });
});
