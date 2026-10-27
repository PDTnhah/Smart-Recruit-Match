import { CV_STATES } from '@srm/shared';
import { type AnalysedCv, decideCvParseResult } from '../cv-analysis.js';

const waiting: AnalysedCv = { status: 'PENDING_ANALYSIS', version: 2, active: true };

describe('GĐ2: applying a CV_PARSE result (US-2.4 AC-9 to AC-11, CONTEXT D37)', () => {
  it('GĐ2 a result for the awaited version is applied', () => {
    expect(decideCvParseResult(waiting, { succeeded: true, cvVersion: 2 })).toBe('APPLY_SUCCESS');
    expect(decideCvParseResult(waiting, { succeeded: false, cvVersion: 2 })).toBe('APPLY_FAILURE');
  });

  it('GĐ2 bỏ qua kết quả của phiên bản cũ: the student uploaded a newer CV', () => {
    const replaced = { ...waiting, active: false };
    expect(decideCvParseResult(replaced, { succeeded: true, cvVersion: 2 })).toBe('IGNORE');
    expect(decideCvParseResult(replaced, { succeeded: false, cvVersion: 2 })).toBe('IGNORE');
  });

  it('GĐ2 bỏ qua kết quả mang phiên bản khác của dòng CV', () => {
    expect(decideCvParseResult(waiting, { succeeded: true, cvVersion: 1 })).toBe('IGNORE');
  });

  it('GĐ2 bỏ qua kết quả trùng: the profile is already stored', () => {
    const settled = { ...waiting, status: 'PENDING_CONFIRMATION' as const };
    expect(decideCvParseResult(settled, { succeeded: true, cvVersion: 2 })).toBe('IGNORE');
    expect(decideCvParseResult(settled, { succeeded: false, cvVersion: 2 })).toBe('IGNORE');
  });

  it('GĐ2 bỏ qua kết quả trùng: a second failure changes nothing', () => {
    const failed = { ...waiting, status: 'ANALYSIS_FAILED' as const };
    expect(decideCvParseResult(failed, { succeeded: false, cvVersion: 2 })).toBe('IGNORE');
  });

  it('GĐ2 a profile after a failed dispatch still applies', () => {
    const failed = { ...waiting, status: 'ANALYSIS_FAILED' as const };
    expect(decideCvParseResult(failed, { succeeded: true, cvVersion: 2 })).toBe('APPLY_SUCCESS');
  });

  it('GĐ2 a confirmed CV never takes an analysis result', () => {
    const confirmed = { ...waiting, status: 'CONFIRMED' as const };
    expect(decideCvParseResult(confirmed, { succeeded: true, cvVersion: 2 })).toBe('IGNORE');
  });

  it('GĐ2 only an active CV in PENDING_ANALYSIS or ANALYSIS_FAILED is ever changed', () => {
    for (const status of CV_STATES) {
      for (const active of [true, false]) {
        for (const succeeded of [true, false]) {
          const decision = decideCvParseResult({ status, version: 1, active }, { succeeded, cvVersion: 1 });
          if (decision !== 'IGNORE') {
            expect(active).toBe(true);
            expect(['PENDING_ANALYSIS', 'ANALYSIS_FAILED']).toContain(status);
          }
        }
      }
    }
  });
});
