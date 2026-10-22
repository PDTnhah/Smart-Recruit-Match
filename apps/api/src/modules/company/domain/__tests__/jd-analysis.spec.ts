import { type AnalysedJd, decideAnalysisResult } from '../jd-analysis.js';

const waiting: AnalysedJd = {
  status: 'PENDING_HR_CONFIRMATION',
  version: 2,
  analysisStatus: 'PENDING',
  requirementsReady: false,
};

describe('GĐ1: applying a JD_ANALYZE result (US-2.3 AC-4 to AC-6, CONTEXT D35)', () => {
  it('GĐ1 a result for the awaited version is applied', () => {
    expect(decideAnalysisResult(waiting, { status: 'SUCCEEDED', jdVersion: 2 })).toBe('APPLY_SUCCESS');
    expect(decideAnalysisResult(waiting, { status: 'FAILED', jdVersion: 2 })).toBe('APPLY_FAILURE');
  });

  it('GĐ1 bỏ qua kết quả của phiên bản cũ', () => {
    expect(decideAnalysisResult(waiting, { status: 'SUCCEEDED', jdVersion: 1 })).toBe('IGNORE');
    expect(decideAnalysisResult(waiting, { status: 'FAILED', jdVersion: 1 })).toBe('IGNORE');
  });

  it('GĐ1 bỏ qua kết quả trùng: the proposal is already stored', () => {
    const settled = { ...waiting, analysisStatus: 'SUCCEEDED' as const, requirementsReady: true };
    expect(decideAnalysisResult(settled, { status: 'SUCCEEDED', jdVersion: 2 })).toBe('IGNORE');
    expect(decideAnalysisResult(settled, { status: 'FAILED', jdVersion: 2 })).toBe('IGNORE');
  });

  it('GĐ1 bỏ qua kết quả trùng: a second failure changes nothing', () => {
    const failed = { ...waiting, analysisStatus: 'FAILED' as const };
    expect(decideAnalysisResult(failed, { status: 'FAILED', jdVersion: 2 })).toBe('IGNORE');
  });

  it('GĐ1 a proposal after a failed dispatch still applies while HR has typed nothing', () => {
    const failed = { ...waiting, analysisStatus: 'FAILED' as const };
    expect(decideAnalysisResult(failed, { status: 'SUCCEEDED', jdVersion: 2 })).toBe('APPLY_SUCCESS');
    expect(decideAnalysisResult({ ...failed, requirementsReady: true }, { status: 'SUCCEEDED', jdVersion: 2 })).toBe(
      'IGNORE',
    );
  });

  it('GĐ1 a late result never overwrites requirements HR entered by hand', () => {
    const typedByHr = { ...waiting, requirementsReady: true };
    expect(decideAnalysisResult(typedByHr, { status: 'SUCCEEDED', jdVersion: 2 })).toBe('IGNORE');
    expect(decideAnalysisResult(typedByHr, { status: 'FAILED', jdVersion: 2 })).toBe('IGNORE');
  });

  it.each(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'RECRUITING', 'FILLED', 'CLOSED'] as const)(
    'GĐ1 a JD already %s takes no analysis result',
    (status) => {
      expect(decideAnalysisResult({ ...waiting, status }, { status: 'SUCCEEDED', jdVersion: 2 })).toBe('IGNORE');
    },
  );

  it('GĐ1 a JD never sent for analysis (before 0.9.0) takes no result', () => {
    expect(decideAnalysisResult({ ...waiting, analysisStatus: null }, { status: 'SUCCEEDED', jdVersion: 2 })).toBe('IGNORE');
  });

  it('GĐ1 a PARTIAL result counts as a proposal', () => {
    expect(decideAnalysisResult(waiting, { status: 'PARTIAL', jdVersion: 2 })).toBe('APPLY_SUCCESS');
  });
});
