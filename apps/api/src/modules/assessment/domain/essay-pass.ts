import type {
  ExamAnswerAiGrading,
  ExamSessionFlag,
  GradingPassKey,
  GradingResult,
  QuestionRubric,
  StoredGradingFailure,
  StoredGradingRun,
} from '@srm/shared';
import type { PassOutcome } from './needs-human.js';

// The Grader's passes over one essay answer as `exam_answers.ai_grading` keeps them (US-4.4 AC-4,
// AC-5, CONTEXT D53). Pure. Each pass is written once, whatever order the messages arrive in; the
// backend checks the points against the rubric again before it stores them (LESSONS §32).

/** A pass whose criteria do not follow the rubric, or give more than a criterion is worth. */
export const GRADING_OUT_OF_RANGE = 'GRADING_OUT_OF_RANGE';

/** Pass number of the contract (1 or 2) as the key of `ai_grading`. */
export function passKeyOf(passNo: number): GradingPassKey {
  if (passNo === 1) return '1';
  if (passNo === 2) return '2';
  throw new Error(`essay grading: pass ${passNo} is not 1 or 2`);
}

/** Σ the rubric's `max_points`: what the essay is worth. */
export function rubricPoints(rubric: QuestionRubric): number {
  return rubric.reduce((sum, criterion) => sum + criterion.max_points, 0);
}

/**
 * Why a grade does not fit the rubric, or null when it does: one criterion per rubric criterion,
 * in rubric order, each within 0 and its `max_points`.
 */
export function rubricProblem(grading: GradingResult, rubric: QuestionRubric): string | null {
  const indexes = grading.criteria.map((criterion) => criterion.index);
  if (indexes.length !== rubric.length || indexes.some((index, position) => index !== position)) {
    return `criteria [${indexes.join(', ')}] do not follow the ${rubric.length} rubric criteria`;
  }
  for (const criterion of grading.criteria) {
    const max = rubric[criterion.index]!.max_points;
    if (criterion.points < 0 || criterion.points > max) {
      return `criterion ${criterion.index}: ${criterion.points} points of at most ${max}`;
    }
  }
  return null;
}

/** Σ the criterion points of a grade: the pass's points, added by code (AD-2). */
export function passPoints(grading: GradingResult): number {
  return grading.criteria.reduce((sum, criterion) => sum + criterion.points, 0);
}

export type PassEntry = { kind: 'RUN'; run: StoredGradingRun } | { kind: 'FAILURE'; failure: StoredGradingFailure };

/**
 * `ai_grading` with the pass added, or null when the pass is already there (graded or failed): a
 * redelivered or late message changes nothing.
 */
export function withPass(
  current: ExamAnswerAiGrading | null,
  key: GradingPassKey,
  entry: PassEntry,
): ExamAnswerAiGrading | null {
  const grading: ExamAnswerAiGrading = current ?? { runs: {}, failures: {} };
  if (grading.runs[key] !== undefined || grading.failures[key] !== undefined) return null;
  return entry.kind === 'RUN'
    ? { ...grading, runs: { ...grading.runs, [key]: entry.run } }
    : { ...grading, failures: { ...grading.failures, [key]: entry.failure } };
}

/** The two passes as `decideNeedsHuman` reads them; a pass not in yet is null. */
export function passOutcomes(grading: ExamAnswerAiGrading | null): [PassOutcome | null, PassOutcome | null] {
  const outcome = (key: GradingPassKey): PassOutcome | null => {
    const run = grading?.runs[key];
    if (run) return { kind: 'GRADED', points: run.points, confidence: run.grading.confidence, flags: run.grading.flags };
    return grading?.failures[key] ? { kind: 'FAILED' } : null;
  };
  return [outcome('1'), outcome('2')];
}

/**
 * `exam_sessions.flags` with the Grader's flags of these answers added, each (code, question) once,
 * in the order they come (AC-4). Null when nothing is new.
 */
export function withGraderFlags(
  current: readonly ExamSessionFlag[],
  answers: readonly { questionId: number; grading: ExamAnswerAiGrading | null }[],
): ExamSessionFlag[] | null {
  const flags = [...current];
  const seen = new Set(flags.map((flag) => `${flag.code}:${flag.questionId}`));
  for (const { questionId, grading } of answers) {
    for (const run of Object.values(grading?.runs ?? {})) {
      for (const code of run.grading.flags) {
        const key = `${code}:${questionId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        flags.push({ code, questionId });
      }
    }
  }
  return flags.length === current.length ? null : flags;
}
