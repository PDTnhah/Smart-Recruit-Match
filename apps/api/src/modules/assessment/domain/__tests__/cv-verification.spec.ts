import type { CvVerificationEvaluationItem, CvVerificationQuestion } from '@srm/shared';
import { computeCvTrust, draftProblem, foundQuoteOf, NO_ANSWER_REASON, storedEvaluationOf } from '../cv-verification.js';

// FR-25, US-4.8 AC-2, AC-5 (AD-2): code computes the trust index from the verdicts, and checks the
// drafted questions again.

const question = (section: CvVerificationQuestion['claim_ref']['section'], index: number): CvVerificationQuestion => ({
  claim_ref: { section, index },
  claim_label: `${section} ${index}`,
  stem: 'Bạn đã làm gì?',
});

describe('FR-25: CV trust index (US-4.8 AC-5)', () => {
  it('FR-25 CONSISTENT 1, PARTIAL 0.5, INCONSISTENT and NO_ANSWER 0, averaged × 100', () => {
    expect(computeCvTrust(['CONSISTENT', 'CONSISTENT'])).toEqual({ trustX100: 100, level: 'HIGH' });
    expect(computeCvTrust(['PARTIAL', 'INCONSISTENT'])).toEqual({ trustX100: 25, level: 'LOW' });
    expect(computeCvTrust(['NO_ANSWER', 'INCONSISTENT', 'INCONSISTENT'])).toEqual({ trustX100: 0, level: 'LOW' });
  });

  it('FR-25 the mean is rounded half-up', () => {
    // 250 / 3 = 83.33 → 83; 50 / 3 = 16.67 → 17; 150 / 3 = 50.
    expect(computeCvTrust(['CONSISTENT', 'CONSISTENT', 'PARTIAL']).trustX100).toBe(83);
    expect(computeCvTrust(['PARTIAL', 'NO_ANSWER', 'INCONSISTENT']).trustX100).toBe(17);
    expect(computeCvTrust(['CONSISTENT', 'PARTIAL', 'NO_ANSWER']).trustX100).toBe(50);
  });

  it('FR-25 HIGH from 75, MEDIUM from 40, LOW below', () => {
    expect(computeCvTrust(['CONSISTENT', 'PARTIAL'])).toEqual({ trustX100: 75, level: 'HIGH' });
    expect(computeCvTrust(['CONSISTENT', 'PARTIAL', 'INCONSISTENT'])).toEqual({ trustX100: 50, level: 'MEDIUM' });
    expect(computeCvTrust(['CONSISTENT', 'NO_ANSWER', 'NO_ANSWER'])).toEqual({ trustX100: 33, level: 'LOW' });
  });

  it('FR-25 a blank answer is NO_ANSWER whatever the result says, without its quote or reason', () => {
    const item: CvVerificationEvaluationItem = {
      question_id: 7,
      llm_verdict: 'PARTIAL',
      verdict: 'PARTIAL',
      quote: 'phần API',
      quote_score: 100,
      reason: 'Khớp một phần.',
    };
    expect(storedEvaluationOf(null, item)).toEqual({
      verdict: 'NO_ANSWER',
      llmVerdict: null,
      quote: null,
      quoteScore: null,
      reason: NO_ANSWER_REASON,
    });
    expect(storedEvaluationOf('Em làm phần API', item)).toEqual({
      verdict: 'PARTIAL',
      llmVerdict: 'PARTIAL',
      quote: 'phần API',
      quoteScore: 100,
      reason: 'Khớp một phần.',
    });
  });

  it('FR-25 staff see a quote only when it was found in the answer (Invariant 5)', () => {
    const found = { verdict: 'CONSISTENT', llmVerdict: 'CONSISTENT', quote: 'Em dùng Redis', quoteScore: 85, reason: 'Khớp.' } as const;
    expect(foundQuoteOf(found)).toBe('Em dùng Redis');
    expect(foundQuoteOf({ ...found, verdict: 'INCONSISTENT', quoteScore: 84.99 })).toBeNull();
    expect(foundQuoteOf({ ...found, quote: null, quoteScore: null })).toBeNull();
    expect(foundQuoteOf(null)).toBeNull();
  });
});

describe('FR-25: drafted questions (US-4.8 AC-2)', () => {
  it('FR-25 up to the count asked, each about a different CV entry', () => {
    expect(draftProblem([question('PROJECT', 0), question('PROJECT', 1)], 2)).toBeNull();
    expect(draftProblem([question('PROJECT', 0)], 3)).toBeNull();
    expect(draftProblem([question('PROJECT', 0), question('SKILLS_LIST', 0), question('EXPERIENCE', 0)], 2)).toMatch(
      /3 questions for 2/,
    );
    expect(draftProblem([question('EXPERIENCE', 1), question('EXPERIENCE', 1)], 2)).toMatch(/two questions/);
  });
});
