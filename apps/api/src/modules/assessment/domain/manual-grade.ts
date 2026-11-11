import {
  type ExamAnswerAiGrading,
  type GradingPassKey,
  type ManualGradeCriterion,
  manualGradeCriteriaSchemaFor,
  type ManualGradingAiPass,
  type QuestionRubric,
  type StoredManualGrading,
} from '@srm/shared';
import { parseOrFail } from '../../../common/validation/validation-issues.js';

// A human grade of an essay the Grader handed over (US-4.5 AC-3, AD-2, CONTEXT D54). Pure. The
// grader gives each rubric criterion a whole number of points; code adds them into the answer's
// final score. There is no total to enter.

export interface ManualGrade {
  /** Σ the criterion points × 100 (AGENTS › Invariant 9). */
  finalScoreX100: number;
  stored: StoredManualGrading;
}

/**
 * The grade of `criteria` against the question's rubric, with `manualGradeCriteriaSchemaFor` as the
 * form checks it: one whole number per criterion, in rubric order, from 0 to its `max_points`.
 * Throws 400 VALIDATION_FAILED with paths `criteria.N.points` (`criteria` when one is missing).
 */
export function manualGradeOf(
  rubric: QuestionRubric,
  criteria: readonly ManualGradeCriterion[],
  note: string | null | undefined,
): ManualGrade {
  const parsed = parseOrFail(manualGradeCriteriaSchemaFor(rubric), criteria, 'criteria');
  const graded = parsed.map(({ index, points }) => ({ index, points }));
  const points = graded.reduce((sum, criterion) => sum + criterion.points, 0);
  return { finalScoreX100: points * 100, stored: { criteria: graded, note: note || null } };
}

const PASS_KEYS: readonly GradingPassKey[] = ['1', '2'];

/**
 * Both passes of the Grader as the grader sees them (CONTEXT D54): points, confidence, flags and the
 * reason of each criterion; a failed pass with its code. A pass not in shows nothing.
 */
export function aiPassesOf(grading: ExamAnswerAiGrading | null): ManualGradingAiPass[] {
  return PASS_KEYS.flatMap((key): ManualGradingAiPass[] => {
    const passNo = Number(key);
    const run = grading?.runs[key];
    if (run) {
      return [
        {
          passNo,
          points: run.points,
          confidence: run.grading.confidence,
          flags: [...run.grading.flags],
          criteria: run.grading.criteria.map(({ index, points, reason }) => ({ index, points, reason })),
          failureCode: null,
        },
      ];
    }
    const failure = grading?.failures[key];
    if (failure) return [{ passNo, points: null, confidence: null, flags: [], criteria: [], failureCode: failure.code }];
    return [];
  });
}

/** Place of a question on the paper, from 1 across both parts. */
export function questionNoOf(questionIds: readonly number[], questionId: number): number {
  const index = questionIds.indexOf(questionId);
  if (index < 0) throw new Error(`question ${questionId} is not on the paper`);
  return index + 1;
}
