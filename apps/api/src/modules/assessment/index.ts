// Public entry of the assessment module (CONTEXT D22): other code imports only from here.
export { AssessmentModule } from './assessment.module.js';
export { QuestionBankService } from './application/question-bank.service.js';
// The exam room (US-4.3): grading (US-4.4) listens to the event; tests drive the sweep.
export { ExamScheduler, type ExamSweepReport } from './application/exam-scheduler.js';
export { ExamSessionService } from './application/exam-session.service.js';
export { EXAM_SESSION_CLOSED, type ExamSessionClosedEvent } from './domain/events.js';
export type { DrawableBank, DrawableQuestion, RetiredQuestion } from './domain/drawable-bank.js';
// Pure blueprint and question helpers, for the locked question bank seed (US-4.2 AC-9).
export { type BlueprintCellRef, buildDefaultBlueprint, cellsOf } from './domain/blueprint.js';
export { toStoredQuestion } from './domain/stored-question.js';
