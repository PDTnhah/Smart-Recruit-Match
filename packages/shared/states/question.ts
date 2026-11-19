import { jobDescriptionMachine, type JobDescriptionStatus } from './job-description.js';
import { defineMachine, reachableFrom } from './machine.js';

/** JD states with a question bank: approved by the center, and every state after (BR-02, US-4.1). */
export const QUESTION_BANK_JD_STATES: readonly JobDescriptionStatus[] = reachableFrom(jobDescriptionMachine, 'APPROVED');

/**
 * Lifecycle of a question of the bank (ARCHITECTURE › Các bảng chính › `questions`, US-4.2 AC-5,
 * US-4.10, CONTEXT D50, D60). A draft of the Test Generator passed the checks of code: it is usable
 * as it is. When CENTER runs the Validator, its verdict makes the draft VALIDATED or REJECTED. An
 * exam draws DRAFT and VALIDATED questions, until they are RETIRED (US-4.6, US-4.9, US-4.11).
 */
export const QUESTION_STATES = ['DRAFT', 'VALIDATED', 'REJECTED', 'RETIRED'] as const;

export type QuestionStatus = (typeof QUESTION_STATES)[number];

/** States of a question an exam may draw and a cell counts (US-4.10 AC-1, AC-4, CONTEXT D60). */
export const USABLE_QUESTION_STATES = ['DRAFT', 'VALIDATED'] as const satisfies readonly QuestionStatus[];

export const questionMachine = defineMachine<QuestionStatus>({
  name: 'question',
  states: QUESTION_STATES,
  initial: 'DRAFT',
  transitions: {
    DRAFT: ['VALIDATED', 'REJECTED', 'RETIRED'],
    VALIDATED: ['RETIRED'],
    REJECTED: [],
    RETIRED: [],
  },
});
