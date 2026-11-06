import type { QuestionGenerationRun } from '@srm/shared';
import type { QuestionGenerationRunRecord } from '../infrastructure/question-generation-runs.repository.js';

/** A generation run as the API shows it (US-4.1 AC-3, AC-11). */
export function runView(run: QuestionGenerationRunRecord): QuestionGenerationRun {
  return {
    runId: run.id,
    status: run.status,
    missingCells: run.missingCells,
    questionsReceived: run.questionsReceived,
    errorCode: run.errorCode,
    createdAt: run.createdAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
  };
}
