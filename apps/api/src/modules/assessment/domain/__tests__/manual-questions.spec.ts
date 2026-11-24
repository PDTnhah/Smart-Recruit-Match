import {
  type ExamBlueprint,
  MANUAL_QUESTION_IMPORT_MAX_ROWS,
  type ManualQuestionInput,
  QUESTION_BANK_MAX_DRAFTS,
  QUESTION_IMPORT_HEADERS,
} from '@srm/shared';
import { type ExistingQuestion, type ImportCell, planManualQuestions, readImportSheet, stemKey } from '../manual-questions.js';

// US-4.13 AC-2, AC-4 (FR-42): a question added by hand passes the rules of `submit_questions()`,
// and a file is read row by row into such questions, each problem at its column.

const BLUEPRINT: ExamBlueprint = {
  duration_minutes: 45,
  parts: {
    A: { weight_percent: 60, question_count: 1, cells: [{ skill: 'Java', difficulty: 'EASY', count: 1 }] },
    B: { weight_percent: 40, question_count: 1, cells: [{ skill: 'SQL', difficulty: 'MEDIUM', count: 1 }] },
  },
};

const mcq = (stem: string, skill = 'Java'): ManualQuestionInput => ({
  type: 'MCQ',
  skill,
  difficulty: 'EASY',
  stem,
  options: ['a', 'b', 'c', 'd'],
  correctOption: 1,
  explanation: 'Vì b.',
});

const existing = (stem: string, status: ExistingQuestion['status'] = 'DRAFT'): ExistingQuestion => ({
  type: 'MCQ',
  skill: 'java',
  difficulty: 'EASY',
  status,
  stem,
});

const codes = (plan: ReturnType<typeof planManualQuestions>) => plan.issues.map((issue) => `${issue.index}:${issue.code}`);

describe('FR-42 rules of a question added by hand', () => {
  it('FR-42 AC-2 a question of a blueprint cell is stored with the skill as the cell writes it', () => {
    const plan = planManualQuestions([mcq('Câu 1', ' JAVA ')], { blueprint: BLUEPRINT, existing: [] });
    expect(plan.issues).toEqual([]);
    expect(plan.rows).toEqual([
      {
        index: 0,
        row: {
          type: 'MCQ',
          skill: 'Java',
          difficulty: 'EASY',
          content: { stem: 'Câu 1', options: ['a', 'b', 'c', 'd'] },
          answerKey: { correct_option: 1, explanation: 'Vì b.', sample_answer: null },
          rubric: null,
        },
      },
    ]);
  });

  it('FR-42 AC-2 UNKNOWN_CELL: the type, skill and difficulty match no cell (an MCQ of the essay cell neither)', () => {
    const plan = planManualQuestions([mcq('Câu 1', 'Git'), mcq('Câu 2', 'SQL')], { blueprint: BLUEPRINT, existing: [] });
    expect(codes(plan)).toEqual(['0:UNKNOWN_CELL', '1:UNKNOWN_CELL']);
    expect(plan.issues[0]).toMatchObject({ field: 'skill', message: 'Ma trận đề không có ô Trắc nghiệm – Git – Dễ' });
  });

  it('FR-42 AC-2 CELL_FULL counts 5× the cell, rejected questions aside, and the questions before it in the save', () => {
    const four = ['x1', 'x2', 'x3', 'x4'].map((stem) => existing(stem));
    const plan = planManualQuestions([mcq('Câu 1'), mcq('Câu 2')], {
      blueprint: BLUEPRINT,
      existing: [...four, existing('bị loại', 'REJECTED')],
    });
    expect(codes(plan)).toEqual(['1:CELL_FULL']);
    expect(plan.rows.map((row) => row.index)).toEqual([0]);
  });

  it('FR-42 AC-2 BANK_FULL counts every question of the bank, whatever its status', () => {
    const full = Array.from({ length: QUESTION_BANK_MAX_DRAFTS }, (_, i) => ({ ...existing(`q${i}`, 'REJECTED'), skill: 'Git' }));
    expect(codes(planManualQuestions([mcq('Câu 1')], { blueprint: BLUEPRINT, existing: full }))).toEqual(['0:BANK_FULL']);
  });

  it('FR-42 AC-2 DUPLICATE: a stem of the bank (any status) or of an earlier question, normalised like stem_key', () => {
    const plan = planManualQuestions([mcq('Biến  final là GÌ?'), mcq('Câu mới'), mcq(' câu   MỚI ')], {
      blueprint: BLUEPRINT,
      existing: [existing('biến final là gì?', 'REJECTED')],
    });
    expect(plan.issues).toEqual([
      { index: 0, field: 'stem', code: 'DUPLICATE', message: 'Trùng đề với một câu đã có trong ngân hàng' },
      { index: 2, field: 'stem', code: 'DUPLICATE', message: 'Trùng đề với câu 2' },
    ]);
    expect(stemKey('Ａ b')).toBe('a b');
  });
});

const text = (value: string): ImportCell => ({ text: value, formula: false });
const HEADER = QUESTION_IMPORT_HEADERS.map(text);

/** Rows 1, 2, 3… of a sheet. */
const read = (...grid: (readonly ImportCell[])[]) => readImportSheet(grid.map((cells, i) => ({ row: i + 1, cells })));

/** A row of the template, by header; the other columns empty. */
const row = (values: Record<string, string | ImportCell>): ImportCell[] =>
  QUESTION_IMPORT_HEADERS.map((header) => {
    const value = values[header];
    return value === undefined ? text('') : typeof value === 'string' ? text(value) : value;
  });

const MCQ_ROW = {
  Loại: 'Trắc nghiệm',
  'Kỹ năng': 'Java',
  'Độ khó': 'Dễ',
  Đề: 'Từ khóa nào khai báo hằng?',
  'Phương án A': 'final',
  'Phương án B': 'const',
  'Phương án C': 'static',
  'Phương án D': 'var',
  'Đáp án đúng': 'a',
  'Giải thích': 'final.',
};

const ESSAY_ROW = {
  Loại: 'tự luận',
  'Kỹ năng': 'SQL',
  'Độ khó': 'MEDIUM',
  Đề: 'Viết truy vấn.',
  'Đáp án mẫu': 'SELECT 1;',
  'Giải thích': 'Kiểm tra JOIN.',
  'Tiêu chí 1': 'Đúng cú pháp',
  'Điểm 1': '4',
  'Tiêu chí 3': 'Có giải thích',
  'Điểm 3': '6',
};

describe('FR-42 reading an import file', () => {
  it('FR-42 AC-4 labels and codes of any case become enums, A–D an index, filled criteria pairs the rubric', () => {
    const result = read(HEADER, row(MCQ_ROW), row({}), row(ESSAY_ROW));
    expect(result).toMatchObject({
      ok: true,
      rows: [
        { row: 2, issues: [], question: { type: 'MCQ', difficulty: 'EASY', correctOption: 0, options: ['final', 'const', 'static', 'var'] } },
        {
          row: 4,
          issues: [],
          question: {
            type: 'ESSAY',
            difficulty: 'MEDIUM',
            rubric: [
              { criterion: 'Đúng cú pháp', maxPoints: 4 },
              { criterion: 'Có giải thích', maxPoints: 6 },
            ],
          },
        },
      ],
    });
  });

  it('FR-42 AC-4 each problem is reported at its column, once; such a row has no question', () => {
    const result = read(
      HEADER,
      row({ ...MCQ_ROW, 'Đáp án đúng': 'E', 'Phương án C': 'final', 'Độ khó': 'Rất khó' }),
      row({ ...ESSAY_ROW, 'Điểm 3': '2,5', 'Tiêu chí 1': '' }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.rows.map((r) => [r.question, r.issues.map((issue) => `${issue.column}: ${issue.message}`)])).toEqual([
      [
        null,
        [
          'Độ khó: Độ khó là "Dễ", "Trung bình" hoặc "Khó"',
          'Đáp án đúng: Đáp án đúng là A, B, C hoặc D',
          'Phương án C: Trùng với phương án A',
        ],
      ],
      [null, ['Điểm 3: Điểm là số nguyên', 'Tiêu chí 1: Nhập tiêu chí']],
    ]);
  });

  it('FR-42 AC-4 a formula is an error in any column, and never read', () => {
    const formula = { text: '', formula: true };
    const result = read(HEADER, row({ ...MCQ_ROW, Đề: formula, 'Tiêu chí 2': formula }));
    if (!result.ok) throw new Error(result.error);
    expect(result.rows[0]).toMatchObject({
      question: null,
      issues: [
        { column: 'Đề', code: 'FORMULA' },
        { column: 'Tiêu chí 2', code: 'FORMULA' },
      ],
    });
  });

  it('FR-42 AC-4 file errors: a missing header, no row, too many rows', () => {
    const headers = QUESTION_IMPORT_HEADERS.filter((header) => header !== 'Đề' && !header.endsWith(' 10')).map(text);
    expect(read(headers, row(MCQ_ROW))).toEqual({ ok: false, error: 'MISSING_COLUMNS', columns: ['Đề'] });
    expect(read(HEADER, row({}))).toEqual({ ok: false, error: 'NO_ROWS' });
    expect(read()).toMatchObject({ ok: false, error: 'MISSING_COLUMNS' });
    const many = Array.from({ length: MANUAL_QUESTION_IMPORT_MAX_ROWS + 1 }, () => row(MCQ_ROW));
    expect(read(HEADER, ...many)).toEqual({ ok: false, error: 'TOO_MANY_ROWS' });
    expect(read(HEADER, ...many.slice(1))).toMatchObject({ ok: true });
  });
});
