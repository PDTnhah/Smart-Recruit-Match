import { SubmitQuestionReviewRequestSchema } from '../question-review.js';

// US-4.9 AC-3 (FR-19): an ERROR retires the question, so it needs a reason and the row_version the
// reviewer saw; an OK needs neither.

const issues = (body: unknown) =>
  SubmitQuestionReviewRequestSchema.safeParse(body).error?.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) ?? [];

describe('FR-19 sample review request', () => {
  it('FR-19 AC-3 OK needs only the question', () => {
    expect(issues({ questionId: 5, verdict: 'OK' })).toEqual([]);
  });

  it('FR-19 AC-3 ERROR without a reason (or a blank one) and without row_version is 400 on each field', () => {
    expect(issues({ questionId: 5, verdict: 'ERROR', reason: '   ' })).toEqual([
      'reason: Nêu lý do câu hỏi sai',
      'rowVersion: Tải lại mẫu rồi báo lỗi lại',
    ]);
    expect(issues({ questionId: 5, verdict: 'ERROR', reason: 'Đáp án đúng là C', rowVersion: 2 })).toEqual([]);
    expect(SubmitQuestionReviewRequestSchema.parse({ questionId: 5, verdict: 'ERROR', reason: ' Sai ', rowVersion: 0 }).reason).toBe(
      'Sai',
    );
  });

  it('FR-19 AC-3 the reason check still runs when the question id is invalid (LESSONS §10)', () => {
    expect(issues({ questionId: 0, verdict: 'ERROR', rowVersion: 1 })).toEqual([
      'questionId: Chọn một câu của mẫu',
      'reason: Nêu lý do câu hỏi sai',
    ]);
  });
});
