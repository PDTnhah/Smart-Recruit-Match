import type { ExamAnswerValue, ExamOptionLayout } from '@srm/shared';
import { paperQuestionsOf, type QuestionForPaper, savedAnswersOf, storedAnswersOf } from '../exam-paper.js';

// US-4.3 AC-3, AC-7, AC-8 (AGENTS › Invariant 8): what a student sees of a paper, and which of
// their answers `exam_answers` keeps.

const LAYOUT: ExamOptionLayout = {
  '11': [
    { code: 'k3x9aa', index: 2 },
    { code: 'p0q1bb', index: 0 },
    { code: 'zz8m2c', index: 3 },
    { code: 'h7t4dd', index: 1 },
  ],
};

const QUESTIONS = new Map<number, QuestionForPaper>([
  [11, { type: 'MCQ', content: { stem: 'Câu 11?', options: ['O0', 'O1', 'O2', 'O3'] } }],
  [20, { type: 'ESSAY', content: { stem: 'Câu 20.', options: null } }],
]);

describe('GĐ5: exam paper (US-4.3)', () => {
  it('GĐ5 the paper shows options in session order by code only, essays without options', () => {
    expect(paperQuestionsOf([11, 20], LAYOUT, QUESTIONS)).toEqual([
      {
        questionId: 11,
        no: 1,
        part: 'A',
        type: 'MCQ',
        stem: 'Câu 11?',
        options: [
          { code: 'k3x9aa', text: 'O2' },
          { code: 'p0q1bb', text: 'O0' },
          { code: 'zz8m2c', text: 'O3' },
          { code: 'h7t4dd', text: 'O1' },
        ],
      },
      { questionId: 20, no: 2, part: 'B', type: 'ESSAY', stem: 'Câu 20.', options: null },
    ]);
  });

  it('GĐ5 a broken session throws instead of showing a wrong paper', () => {
    expect(() => paperQuestionsOf([12], LAYOUT, QUESTIONS)).toThrow('question 12 not found');
    expect(() => paperQuestionsOf([11], {}, QUESTIONS)).toThrow('no option layout');
    expect(() => paperQuestionsOf([11], { '11': [{ code: 'aaaaaa', index: 4 }] }, QUESTIONS)).toThrow('no option 4');
  });

  it('GĐ5 saved answers come back in paper order, only for the paper', () => {
    const answers = new Map<number, ExamAnswerValue>([
      [20, { text: 'Trả lời' }],
      [11, { optionCode: 'zz8m2c' }],
      [99, { text: 'Không thuộc đề' }],
    ]);
    expect(savedAnswersOf([11, 20], answers)).toEqual([
      { questionId: 11, answer: { optionCode: 'zz8m2c' } },
      { questionId: 20, answer: { text: 'Trả lời' } },
    ]);
  });

  it('GĐ5 closing keeps the original option index and drops what does not fit the paper', () => {
    const answers = new Map<number, ExamAnswerValue>([
      [11, { optionCode: 'zz8m2c' }],
      [20, { text: 'Bài làm' }],
      [99, { optionCode: 'k3x9aa' }],
    ]);
    expect(storedAnswersOf([11, 20], LAYOUT, answers)).toEqual([
      { questionId: 11, answer: { code: 'zz8m2c', option: 3 } },
      { questionId: 20, answer: { text: 'Bài làm' } },
    ]);
    // A code of another session, text for an MCQ, a code for an essay, a blank essay: not answered.
    const misfits = new Map<number, ExamAnswerValue>([
      [11, { optionCode: 'xxxxxx' }],
      [20, { optionCode: 'k3x9aa' }],
    ]);
    expect(storedAnswersOf([11, 20], LAYOUT, misfits)).toEqual([]);
    expect(storedAnswersOf([11], LAYOUT, new Map([[11, { text: 'B' }]]))).toEqual([]);
    expect(storedAnswersOf([20], LAYOUT, new Map([[20, { text: '  \n ' }]]))).toEqual([]);
  });
});
