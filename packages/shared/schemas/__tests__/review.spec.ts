import { HrDecisionRequestSchema } from '../review.js';

// US-5.3 AC-6 (BR-12): a rejection needs a reason of the catalogue and a note; an invitation needs
// neither.

const issues = (body: unknown) =>
  HrDecisionRequestSchema.safeParse(body).error?.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) ?? [];

describe('BR-12 HR decision request', () => {
  it('BR-12 INVITE needs only the row version', () => {
    expect(issues({ decision: 'INVITE', rowVersion: 1 })).toEqual([]);
  });

  it('BR-12 REJECT without a reason or a note (or a blank one) fails on each field', () => {
    expect(issues({ decision: 'REJECT', rowVersion: 1 })).toEqual(['reasonCode: Chọn lý do từ chối', 'note: Nhập ghi chú']);
    expect(issues({ decision: 'REJECT', rowVersion: 1, reasonCode: 'MISSING_SKILLS', note: '   ' })).toEqual([
      'note: Nhập ghi chú',
    ]);
    expect(issues({ decision: 'REJECT', rowVersion: 1, reasonCode: 'MISSING_SKILLS', note: 'Thiếu SQL' })).toEqual([]);
  });

  it('BR-12 a reason outside the catalogue fails', () => {
    expect(issues({ decision: 'REJECT', rowVersion: 1, reasonCode: 'TOO_YOUNG', note: 'x' })).toEqual([
      'reasonCode: Chọn lý do từ chối',
    ]);
  });
});
