import {
  AI_JOB_QUEUES,
  AiResultMessageSchema,
  ESSAY_GRADE_CHUNK_MAX,
  ESSAY_GRADE_MAX_SESSIONS,
  EssayGradeJobSchema,
  EssayGradeOutputSchema,
  GradingResultSchema,
} from '../index.js';

const JOB_ID = '7f6c1e2a-4b8d-4c1e-9a2b-3c4d5e6f7a8b';
const job = { job_id: JOB_ID, exam_session_ids: [11, 12], prompt_version: 'grader/v1' };
const grading = {
  criteria: [
    { index: 0, points: 3, reason: 'Nêu đúng khái niệm chỉ mục.' },
    { index: 1, points: 1, reason: 'Ví dụ còn thiếu điều kiện lọc.' },
  ],
  confidence: 'HIGH',
  flags: [],
};
const item = { session_id: 11, question_id: 40, pass_no: 1, model: 'gemini-3.8-flash', grading };
const output = { prompt_version: 'grader/v1', final: false, items: [item], failed: [] };

describe('US-4.4 AD-5: ai.essay.grade carries session IDs only', () => {
  it('GĐ6 a job names 1 to ESSAY_GRADE_MAX_SESSIONS sessions and the pinned prompt', () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
    expect(EssayGradeJobSchema.parse(job)).toEqual(job);
    expect(EssayGradeJobSchema.safeParse({ ...job, prompt_version: null }).success).toBe(true);
    expect(EssayGradeJobSchema.safeParse({ ...job, exam_session_ids: [] }).success).toBe(false);
    expect(EssayGradeJobSchema.safeParse({ ...job, exam_session_ids: ids(ESSAY_GRADE_MAX_SESSIONS) }).success).toBe(true);
    expect(EssayGradeJobSchema.safeParse({ ...job, exam_session_ids: ids(ESSAY_GRADE_MAX_SESSIONS + 1) }).success).toBe(
      false,
    );
  });

  it('BR-03 a job cannot carry an answer or a student field', () => {
    expect(EssayGradeJobSchema.safeParse({ ...job, answer_text: 'x' }).success).toBe(false);
    expect(EssayGradeJobSchema.safeParse({ ...job, student_id: 7 }).success).toBe(false);
  });
});

describe('US-4.4 AD-2: the Grader grades criteria, code adds them', () => {
  it('GĐ6 AC-3 a grade per criterion with a reason, a confidence and flags', () => {
    expect(GradingResultSchema.parse(grading)).toEqual(grading);
    const flagged = { ...grading, confidence: 'LOW', flags: ['INSTRUCTION_IN_ANSWER'] };
    expect(GradingResultSchema.safeParse(flagged).success).toBe(true);
    expect(GradingResultSchema.safeParse({ ...grading, confidence: 'VERY_HIGH' }).success).toBe(false);
    expect(GradingResultSchema.safeParse({ ...grading, flags: ['OTHER'] }).success).toBe(false);
    expect(GradingResultSchema.safeParse({ ...grading, criteria: [] }).success).toBe(false);
  });

  it('AD-2 a grade carries no total, and points are whole numbers', () => {
    expect(GradingResultSchema.safeParse({ ...grading, total: 4 }).success).toBe(false);
    const half = { ...grading, criteria: [{ index: 0, points: 2.5, reason: 'Gần đúng.' }] };
    expect(GradingResultSchema.safeParse(half).success).toBe(false);
    const blank = { ...grading, criteria: [{ index: 0, points: 2, reason: '  ' }] };
    expect(GradingResultSchema.safeParse(blank).success).toBe(false);
  });

  it('LESSONS §32 points above the rubric are still the right shape: checked against the rubric later', () => {
    const over = { ...grading, criteria: [{ index: 0, points: 99, reason: 'Quá điểm tối đa của tiêu chí.' }] };
    expect(GradingResultSchema.safeParse(over).success).toBe(true);
  });
});

describe('US-4.4 AC-5, AC-7: ESSAY_GRADE output comes in chunks, one entry per pass', () => {
  const parse = (value: unknown) => EssayGradeOutputSchema.safeParse(value);

  it('GĐ6 items and failed passes, at most ESSAY_GRADE_CHUNK_MAX of each per message', () => {
    expect(parse(output).success).toBe(true);
    const failed = { session_id: 11, question_id: 41, pass_no: 2, code: 'LLM_REFUSAL', needs_review: true };
    expect(parse({ ...output, final: true, items: [], failed: [failed] }).success).toBe(true);
    expect(parse({ ...output, items: Array.from({ length: ESSAY_GRADE_CHUNK_MAX + 1 }, () => item) }).success).toBe(
      false,
    );
    expect(parse({ ...output, failed: Array.from({ length: ESSAY_GRADE_CHUNK_MAX + 1 }, () => failed) }).success).toBe(
      false,
    );
  });

  it('GĐ6 a pass is 1 or 2', () => {
    for (const pass of [0, 3, 1.5]) expect(parse({ ...output, items: [{ ...item, pass_no: pass }] }).success).toBe(false);
    expect(parse({ ...output, items: [{ ...item, pass_no: 2 }] }).success).toBe(true);
  });

  it('AD-2 an item carries no score the backend could read', () => {
    expect(parse({ ...output, items: [{ ...item, score: 4 }] }).success).toBe(false);
  });
});

describe('US-4.4 AD-5: ESSAY_GRADE is a job type of its own', () => {
  it('AD-5 the job goes to ai.essay.grade and its result is an ai.results message', () => {
    expect(AI_JOB_QUEUES.ESSAY_GRADE).toBe('ai.essay.grade');
    const failed = { session_id: 12, question_id: 40, pass_no: 2, code: 'LLM_REFUSAL', needs_review: true };
    const message = {
      job_id: JOB_ID,
      type: 'ESSAY_GRADE',
      status: 'PARTIAL',
      job,
      result: { ...output, final: true, failed: [failed] },
      error: null,
    };
    expect(AiResultMessageSchema.safeParse(message).success).toBe(true);
    expect(AiResultMessageSchema.safeParse({ ...message, job: { ...job, job_id: crypto.randomUUID() } }).success).toBe(
      false,
    );
  });
});
