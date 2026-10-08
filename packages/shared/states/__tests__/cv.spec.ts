import { CV_STATES, cvMachine } from '../cv.js';
import { mismatchedPairs } from './pairs.js';

// US-1.2 › Dev notes: ARCHITECTURE › Luồng nộp và phân tích CV.
const LISTED_EDGES = [
  ['PENDING_ANALYSIS', 'PENDING_CONFIRMATION'],
  ['PENDING_CONFIRMATION', 'CONFIRMED'],
] as const;

describe('GĐ2: CV machine allows only listed transitions', () => {
  it('accepts exactly the listed edges among all state pairs', () => {
    expect(CV_STATES).toHaveLength(3);
    expect(mismatchedPairs(cvMachine, LISTED_EDGES)).toEqual([]);
  });

  it('starts in PENDING_ANALYSIS', () => {
    expect(cvMachine.initial).toBe('PENDING_ANALYSIS');
  });
});
