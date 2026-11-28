import type { InterviewResult } from '@srm/shared';

/** The places of a JD at one moment (BR-14, BR-15): its quota and the nominations that hold one. */
export interface SlotFacts {
  quota: number;
  /** Nominations ACCEPTED: the student took the internship. */
  accepted: number;
  /** Nominations PASSED: an offer waits for the student's answer. */
  passed: number;
}

/** Where an interview result moves the nomination (GĐ9 step 2). */
export type InterviewOutcome = 'PASSED' | 'RESERVE' | 'INTERVIEW_FAILED';

/**
 * BR-14: a PASSED result takes a place only while accepted + PASSED stay below the quota (the
 * quota still left once accepted ones are taken off); otherwise the student goes to the reserve
 * list. Counts are integers, so the comparison is exact.
 */
export function resolvePassResult(facts: SlotFacts): 'PASSED' | 'RESERVE' {
  return facts.accepted + facts.passed < facts.quota ? 'PASSED' : 'RESERVE';
}

/**
 * AC-3, AC-4: HR's result → the nomination's state. ABSENT is handled as FAILED (GĐ9 step 2);
 * `reservedForQuota` tells HR a PASSED became RESERVE because no place was left.
 */
export function interviewOutcome(
  result: InterviewResult,
  facts: SlotFacts,
): { outcome: InterviewOutcome; reservedForQuota: boolean } {
  switch (result) {
    case 'PASSED': {
      const outcome = resolvePassResult(facts);
      return { outcome, reservedForQuota: outcome === 'RESERVE' };
    }
    case 'RESERVE':
      return { outcome: 'RESERVE', reservedForQuota: false };
    case 'FAILED':
    case 'ABSENT':
      return { outcome: 'INTERVIEW_FAILED', reservedForQuota: false };
  }
}

/** AC-7: how many reserves a freed place lets up (places not accepted nor offered), never negative. */
export function freePlaces(facts: SlotFacts): number {
  return Math.max(0, facts.quota - facts.accepted - facts.passed);
}

/**
 * BR-14 (CONTEXT D66): HR may put a student on the reserve list only once no place is left. With a
 * place free, a student who meets the bar is PASSED and gets the offer, so no place waits empty.
 */
export function reserveAllowed(facts: SlotFacts): boolean {
  return freePlaces(facts) === 0;
}

/** BR-15, AC-9: the JD has accepted its quota; no place can be freed again, so reserves close. */
export function isFilled(facts: Pick<SlotFacts, 'quota' | 'accepted'>): boolean {
  return facts.accepted >= facts.quota;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** T_offer and the reserve's time are calendar days (CONTEXT D66): `days` × 24 hours after `from`. */
export function addCalendarDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS);
}
