// Public entry of the assessment module (CONTEXT D22): other code imports only from here.
export { AssessmentModule } from './assessment.module.js';
export { QuestionBankService } from './application/question-bank.service.js';
export type { DrawableBank, DrawableQuestion, RetiredQuestion } from './domain/drawable-bank.js';
// Pure blueprint and question helpers, for the locked question bank seed (US-4.2 AC-9).
export { type BlueprintCellRef, buildDefaultBlueprint, cellsOf } from './domain/blueprint.js';
export { toStoredQuestion } from './domain/stored-question.js';
