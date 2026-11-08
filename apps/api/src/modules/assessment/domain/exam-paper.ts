import {
  EXAM_PART_OF_TYPE,
  type ExamAnswerValue,
  type ExamOptionLayout,
  type ExamQuestion,
  type ExamSavedAnswer,
  type ExamStoredAnswer,
  type QuestionContent,
  type QuestionType,
} from '@srm/shared';

// What a student sees of a paper and what is kept of their answers (US-4.3 AC-3, AC-7, AC-8,
// AGENTS › Invariant 8). Pure: the caller reads the session, the questions and Redis.

/** What the paper shows of a question: never its answer key, rubric or explanation. */
export interface QuestionForPaper {
  type: QuestionType;
  content: QuestionContent;
}

/**
 * The questions in display order with the options in this session's order, each shown by its opaque
 * code only. A question missing from `questions`, or a layout that names an option the question
 * does not have, is a broken session: it throws.
 */
export function paperQuestionsOf(
  questionIds: readonly number[],
  layout: ExamOptionLayout,
  questions: ReadonlyMap<number, QuestionForPaper>,
): ExamQuestion[] {
  return questionIds.map((questionId, index) => {
    const question = questions.get(questionId);
    if (!question) throw new Error(`paper: question ${questionId} not found`);
    let options: ExamQuestion['options'] = null;
    if (question.type === 'MCQ') {
      const slots = layout[String(questionId)];
      if (!slots) throw new Error(`paper: question ${questionId} has no option layout`);
      options = slots.map((slot) => {
        const text = question.content.options?.[slot.index];
        if (text === undefined) throw new Error(`paper: question ${questionId} has no option ${slot.index}`);
        return { code: slot.code, text };
      });
    }
    return {
      questionId,
      no: index + 1,
      part: EXAM_PART_OF_TYPE[question.type],
      type: question.type,
      stem: question.content.stem,
      options,
    };
  });
}

/** The saved answers of the paper's questions, in display order. */
export function savedAnswersOf(
  questionIds: readonly number[],
  answers: ReadonlyMap<number, ExamAnswerValue>,
): ExamSavedAnswer[] {
  return questionIds.flatMap((questionId) => {
    const answer = answers.get(questionId);
    return answer ? [{ questionId, answer }] : [];
  });
}

export interface StoredAnswerRow {
  questionId: number;
  answer: ExamStoredAnswer;
}

/**
 * AC-8: the rows `exam_answers` keeps of a closing session. Only answers that fit the paper: an
 * option code of the question's own layout, stored with the original index grading reads (US-4.4),
 * or the text of an essay; a blank essay counts as not answered.
 */
export function storedAnswersOf(
  questionIds: readonly number[],
  layout: ExamOptionLayout,
  answers: ReadonlyMap<number, ExamAnswerValue>,
): StoredAnswerRow[] {
  return questionIds.flatMap((questionId): StoredAnswerRow[] => {
    const answer = answers.get(questionId);
    if (!answer) return [];
    const slots = layout[String(questionId)];
    if (slots) {
      if (!('optionCode' in answer)) return [];
      const slot = slots.find((candidate) => candidate.code === answer.optionCode);
      return slot ? [{ questionId, answer: { code: slot.code, option: slot.index } }] : [];
    }
    if (!('text' in answer) || answer.text.trim() === '') return [];
    return [{ questionId, answer: { text: answer.text } }];
  });
}
