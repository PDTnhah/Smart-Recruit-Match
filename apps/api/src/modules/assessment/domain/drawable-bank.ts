import type {
  ExamBlueprint,
  QuestionAnswerKey,
  QuestionContent,
  QuestionDifficulty,
  QuestionRubric,
  QuestionType,
} from '@srm/shared';

// What other modules read of a locked question bank (US-4.2 AC-7, AC-8, CONTEXT D50).

/** A VALIDATED question an exam may draw. */
export interface DrawableQuestion {
  id: number;
  type: QuestionType;
  skill: string;
  difficulty: QuestionDifficulty;
  /** What a student may see. */
  content: QuestionContent;
  /** Server only: grading reads it, a student never does (AGENTS › Invariant 8). */
  answerKey: QuestionAnswerKey;
  /** Essays only; server only, like the answer key. */
  rubric: QuestionRubric | null;
}

/** A locked bank as an exam is drawn from it; `version` goes with every exam drawn (US-4.3). */
export interface DrawableBank {
  bankId: number;
  version: number;
  blueprint: ExamBlueprint;
  questions: DrawableQuestion[];
}

/** A question just retired, and the version of its bank after it. */
export interface RetiredQuestion {
  questionId: number;
  rowVersion: number;
  bankId: number;
  bankVersion: number;
}
