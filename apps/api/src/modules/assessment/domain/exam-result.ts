import type {
  ExamAnswerAiGrading,
  ExamResultCriterion,
  ExamResultEssay,
  ExamResultSkill,
  QuestionRubric,
  StoredSkillScore,
} from '@srm/shared';
import { rubricPoints } from './essay-pass.js';

// What a student sees of their graded essays (US-4.4 AC-12, AGENTS › Invariant 8). Pure. A
// whitelist: the stem the student saw, points, and the Grader's reasons by criterion number. Never
// the rubric's words, the answer key or the sample answer.

/** An essay of the paper with what grading stored for it; no answer row means a blank answer. */
export interface ResultEssayInput {
  questionId: number;
  /** Place of the question on the paper, from 1 across both parts. */
  no: number;
  stem: string;
  rubric: QuestionRubric;
  answer: { finalScore: number | null; needsHuman: boolean; aiGrading: ExamAnswerAiGrading | null } | null;
}

/**
 * One essay of the result. The criteria are shown only when the Grader's two passes are the final
 * score: each criterion's points are the mean of the two passes, its reason the first pass's. A
 * blank answer scores 0; one graded by staff (US-4.5) shows its score without criteria.
 */
export function resultEssayOf(input: ResultEssayInput): ExamResultEssay {
  const maxPoints = rubricPoints(input.rubric);
  const base = { questionId: input.questionId, no: input.no, stem: input.stem, maxPoints };
  const { answer } = input;
  if (!answer) return { ...base, points: 0, criteria: [] };
  const points = answer.finalScore ?? 0;
  const first = answer.aiGrading?.runs['1'];
  const second = answer.aiGrading?.runs['2'];
  if (answer.needsHuman || !first || !second) return { ...base, points, criteria: [] };
  const criteria = input.rubric.map((criterion, index): ExamResultCriterion => {
    const one = first.grading.criteria.find((graded) => graded.index === index);
    const two = second.grading.criteria.find((graded) => graded.index === index);
    return {
      no: index + 1,
      points: ((one?.points ?? 0) + (two?.points ?? 0)) / 2,
      maxPoints: criterion.max_points,
      reason: one?.reason ?? '',
    };
  });
  return { ...base, points, criteria };
}

/** `exam_sessions.skill_scores` on the 0–100 scale. */
export function resultSkillsOf(stored: readonly StoredSkillScore[]): ExamResultSkill[] {
  return stored.map(({ skill, scoreX100 }) => ({ skill, score: scoreX100 === null ? null : scoreX100 / 100 }));
}
