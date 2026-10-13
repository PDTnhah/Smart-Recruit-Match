import { checkApprovable, checkSubmittable, JD_REASON_CODES } from '../jd-checks.js';

describe('GĐ1: JD submit check (US-1.5 AC-6)', () => {
  it('GĐ1: a description alone is enough', () => {
    expect(checkSubmittable({ rawText: 'Mô tả công việc', fileKey: null })).toEqual({ ok: true });
  });

  it('GĐ1: a file alone is enough', () => {
    expect(checkSubmittable({ rawText: null, fileKey: 'jd/1/a.pdf' })).toEqual({ ok: true });
  });

  it.each([null, '', '   \n'])('GĐ1: no file and description %p is refused', (rawText) => {
    expect(checkSubmittable({ rawText, fileKey: null })).toEqual({ ok: false, reasonCode: JD_REASON_CODES.NO_CONTENT });
  });
});

describe('BR-02: JD approval check (US-1.5 AC-7)', () => {
  it('BR-02: confirmed requirements allow approval', () => {
    expect(checkApprovable({ requirementsReady: true })).toEqual({ ok: true });
  });

  it('BR-02: missing requirements block approval', () => {
    expect(checkApprovable({ requirementsReady: false })).toEqual({
      ok: false,
      reasonCode: JD_REASON_CODES.REQUIREMENTS_NOT_CONFIRMED,
    });
  });
});
