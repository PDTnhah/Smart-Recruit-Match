import { INTERVIEW_STATES, interviewMachine } from '../interview.js';
import { OFFER_STATES, offerMachine } from '../offer.js';
import { mismatchedPairs } from './pairs.js';

describe('GĐ9 interview and offer lifecycles (US-5.4)', () => {
  it('FR-30 the student confirms or asks once for another time; HR moves it and records the result', () => {
    expect(INTERVIEW_STATES).toEqual(['SCHEDULED', 'CONFIRMED', 'RESCHEDULE_REQUESTED', 'DONE']);
    expect(interviewMachine.initial).toBe('SCHEDULED');
    expect(
      mismatchedPairs(interviewMachine, [
        ['SCHEDULED', 'CONFIRMED'],
        ['SCHEDULED', 'RESCHEDULE_REQUESTED'],
        ['SCHEDULED', 'DONE'],
        ['CONFIRMED', 'SCHEDULED'],
        ['CONFIRMED', 'RESCHEDULE_REQUESTED'],
        ['CONFIRMED', 'DONE'],
        ['RESCHEDULE_REQUESTED', 'SCHEDULED'],
        ['RESCHEDULE_REQUESTED', 'DONE'],
      ]),
    ).toEqual([]);
  });

  it('FR-31 an offer is answered once: accepted, declined or expired', () => {
    expect(OFFER_STATES).toEqual(['PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED']);
    expect(offerMachine.initial).toBe('PENDING');
    expect(
      mismatchedPairs(offerMachine, [
        ['PENDING', 'ACCEPTED'],
        ['PENDING', 'DECLINED'],
        ['PENDING', 'EXPIRED'],
      ]),
    ).toEqual([]);
  });
});
