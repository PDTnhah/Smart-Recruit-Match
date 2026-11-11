import {
  GradingQueueQuerySchema,
  ManualGradeRequestSchema,
  manualGradeCriteriaSchemaFor,
  manualGradeFormSchemaFor,
  ManualGradingDetailSchema,
} from '../manual-grading.js';

const rubric = [
  { criterion: 'Nêu đúng khái niệm', max_points: 3 },
  { criterion: 'Có ví dụ', max_points: 2 },
];

const issuesOf = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  (result.error?.issues ?? []).map((issue) => [issue.path.join('.'), issue.message]);

describe('US-4.5 AC-3: criteria of a manual grade follow the rubric (AD-2, CONTEXT D54)', () => {
  const schema = manualGradeCriteriaSchemaFor(rubric);

  it('GĐ6 accepts one whole number per criterion, from 0 to its max_points', () => {
    const criteria = [
      { index: 0, points: 0 },
      { index: 1, points: 2 },
    ];
    expect(schema.parse(criteria)).toEqual(criteria);
    expect(schema.safeParse([{ index: 0, points: 3 }, { index: 1, points: 0 }]).success).toBe(true);
  });

  it('GĐ6 reports every criterion out of range or not whole at once, at N.points', () => {
    const result = schema.safeParse([
      { index: 0, points: 3.5 },
      { index: 1, points: 3 },
    ]);
    expect(issuesOf(result)).toEqual([
      ['0.points', 'Điểm phải là số nguyên'],
      ['1.points', 'Tối đa 2 điểm'],
    ]);
    expect(issuesOf(schema.safeParse([{ index: 0, points: -1 }, { index: 1, points: Number.NaN }]))).toEqual([
      ['0.points', 'Điểm không được âm'],
      ['1.points', 'Nhập điểm cho tiêu chí này'],
    ]);
  });

  it('GĐ6 rejects a missing or an extra criterion at the tuple, and criteria out of order', () => {
    expect(issuesOf(schema.safeParse([{ index: 0, points: 1 }]))).toEqual([['', 'Phải chấm đủ 2 tiêu chí của rubric']]);
    expect(
      issuesOf(
        schema.safeParse([
          { index: 0, points: 1 },
          { index: 1, points: 1 },
          { index: 2, points: 1 },
        ]),
      ),
    ).toEqual([['', 'Phải chấm đủ 2 tiêu chí của rubric']]);
    expect(
      issuesOf(
        schema.safeParse([
          { index: 1, points: 1 },
          { index: 0, points: 1 },
        ]),
      ).map(([path]) => path),
    ).toEqual(['0.index', '1.index']);
  });

  it('GĐ6 the form schema keeps the criterion errors while the note is too long (LESSONS §10)', () => {
    const result = manualGradeFormSchemaFor(rubric).safeParse({
      criteria: [
        { index: 0, points: 4 },
        { index: 1, points: 1 },
      ],
      note: 'x'.repeat(1_001),
    });
    expect(issuesOf(result).map(([path]) => path)).toEqual(['criteria.0.points', 'note']);
  });
});

describe('US-4.5 AC-3: the request body is checked for shape before the rubric', () => {
  it('GĐ6 takes the row version, the criteria and an optional trimmed note', () => {
    const body = ManualGradeRequestSchema.parse({ rowVersion: 0, criteria: [{ index: 0, points: 1 }], note: '  ổn  ' });
    expect(body.note).toBe('ổn');
    expect(ManualGradeRequestSchema.parse({ rowVersion: 2, criteria: [{ index: 0, points: 1 }] }).note).toBeUndefined();
  });

  it('GĐ6 rejects no criteria, a fractional point, or a missing row version', () => {
    expect(ManualGradeRequestSchema.safeParse({ rowVersion: 0, criteria: [] }).success).toBe(false);
    expect(ManualGradeRequestSchema.safeParse({ rowVersion: 0, criteria: [{ index: 0, points: 0.5 }] }).success).toBe(false);
    expect(ManualGradeRequestSchema.safeParse({ criteria: [{ index: 0, points: 1 }] }).success).toBe(false);
  });
});

describe('US-4.5 AC-1, AC-2: queue query and detail (BR-03)', () => {
  it('GĐ6 the queue pages by session, 20 by default, at most 50, and filters by a known reason', () => {
    expect(GradingQueueQuerySchema.parse({})).toEqual({ limit: 20, offset: 0 });
    expect(GradingQueueQuerySchema.parse({ reason: 'RUNS_DIVERGE', limit: '5', offset: '10' })).toEqual({
      reason: 'RUNS_DIVERGE',
      limit: 5,
      offset: 10,
    });
    expect(GradingQueueQuerySchema.safeParse({ limit: '51' }).success).toBe(false);
    expect(GradingQueueQuerySchema.safeParse({ reason: 'OTHER' }).success).toBe(false);
  });

  it('BR-03 the detail serializer drops any key outside the whitelist', () => {
    const detail = {
      answerId: 7,
      sessionId: 31,
      rowVersion: 0,
      jdTitle: 'Backend Intern',
      companyName: 'Công ty A',
      questionNo: 11,
      skill: 'SQL',
      stem: 'Khi nào nên tạo chỉ mục?',
      rubric: [{ criterion: 'Nêu đúng khái niệm', maxPoints: 3 }],
      maxPoints: 3,
      sampleAnswer: 'Khi truy vấn lọc theo cột đó thường xuyên.',
      answerText: 'Khi bảng lớn.',
      reasons: ['RUNS_DIVERGE'],
      aiPasses: [{ passNo: 1, points: 2, confidence: 'HIGH', flags: [], criteria: [], failureCode: null }],
      manualGrade: null,
    };
    const parsed = ManualGradingDetailSchema.parse({ ...detail, studentId: 5, studentCode: 'SV001', fullName: 'A' });
    expect(parsed).toEqual(detail);
  });
});
