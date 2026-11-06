import { jobDescriptionMachine, type JobDescriptionStatus } from './job-description.js';
import { defineMachine, reachableFrom } from './machine.js';

/** JD states with a question bank: approved by the center, and every state after (BR-02, US-4.1). */
export const QUESTION_BANK_JD_STATES: readonly JobDescriptionStatus[] = reachableFrom(jobDescriptionMachine, 'APPROVED');

/**
 * Lifecycle of a question of the bank (ARCHITECTURE › Các bảng chính › `questions`). US-4.1 drafts
 * questions only; the Validator of US-4.2 adds the states after DRAFT and their transitions.
 */
export const QUESTION_STATES = ['DRAFT'] as const;

export type QuestionStatus = (typeof QUESTION_STATES)[number];

export const questionMachine = defineMachine<QuestionStatus>({
  name: 'question',
  states: QUESTION_STATES,
  initial: 'DRAFT',
  transitions: { DRAFT: [] },
});
