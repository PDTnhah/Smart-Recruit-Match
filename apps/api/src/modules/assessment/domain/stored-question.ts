import type {
  GeneratedQuestion,
  QuestionAnswerKey,
  QuestionContent,
  QuestionDifficulty,
  QuestionRubric,
  QuestionType,
} from '@srm/shared';

/** A draft as `core.questions` stores it (US-4.1 AC-9); the bank id comes from the run. */
export interface StoredQuestion {
  draftId: number;
  type: QuestionType;
  skill: string;
  difficulty: QuestionDifficulty;
  content: QuestionContent;
  answerKey: QuestionAnswerKey;
  rubric: QuestionRubric | null;
  model: string;
  promptVersion: string;
}

/**
 * Splits a draft into what a student may see and what never leaves the server (AGENTS ›
 * Invariant 8): the stem and option texts in `content`; the correct option, the explanation and
 * the model answer in `answer_key`. The AI Service has checked each draft (US-4.1 AC-7); a
 * multiple-choice draft without exactly one correct option is still refused here, since the
 * answer key could not say which one it is.
 */
export function toStoredQuestion(question: GeneratedQuestion): StoredQuestion | null {
  const base = {
    draftId: question.draft_id,
    type: question.type,
    skill: question.skill,
    difficulty: question.difficulty,
    model: question.model,
    promptVersion: question.prompt_version,
  };
  if (question.type === 'ESSAY') {
    return {
      ...base,
      content: { stem: question.stem, options: null },
      answerKey: { correct_option: null, explanation: question.explanation, sample_answer: question.sample_answer },
      rubric: question.rubric,
    };
  }
  const correct = question.options.flatMap((option, index) => (option.correct ? [index] : []));
  if (correct.length !== 1) return null;
  return {
    ...base,
    content: { stem: question.stem, options: question.options.map((option) => option.text) },
    answerKey: { correct_option: correct[0] ?? null, explanation: question.explanation, sample_answer: null },
    rubric: null,
  };
}
