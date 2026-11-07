import { jobDescriptionMachine, type JobDescriptionStatus } from './job-description.js';
import { defineMachine, reachableFrom } from './machine.js';

/** JD states with a question bank: approved by the center, and every state after (BR-02, US-4.1). */
export const QUESTION_BANK_JD_STATES: readonly JobDescriptionStatus[] = reachableFrom(jobDescriptionMachine, 'APPROVED');

/**
 * Lifecycle of a question of the bank (ARCHITECTURE › Các bảng chính › `questions`, US-4.2 AC-5,
 * CONTEXT D50). A draft of the Test Generator is VALIDATED or REJECTED by the verdict of the
 * Validator; only a VALIDATED question is drawn for an exam, until it is RETIRED (US-4.6, US-4.9).
 */
export const QUESTION_STATES = ['DRAFT', 'VALIDATED', 'REJECTED', 'RETIRED'] as const;

export type QuestionStatus = (typeof QUESTION_STATES)[number];

export const questionMachine = defineMachine<QuestionStatus>({
  name: 'question',
  states: QUESTION_STATES,
  initial: 'DRAFT',
  transitions: {
    DRAFT: ['VALIDATED', 'REJECTED'],
    VALIDATED: ['RETIRED'],
    REJECTED: [],
    RETIRED: [],
  },
});
