import { defineMachine } from './machine.js';

/**
 * Lifecycle of a JD's question bank (PRD GĐ5 bước 4, US-4.2 AC-6, US-4.10 AC-4, CONTEXT D50, D60).
 * CENTER locks an OPEN bank once every cell holds enough usable questions (DRAFT or VALIDATED); a
 * locked bank is never opened again. After locking, a retired question raises the bank's `version`
 * instead.
 */
export const QUESTION_BANK_STATES = ['OPEN', 'LOCKED'] as const;

export type QuestionBankStatus = (typeof QUESTION_BANK_STATES)[number];

export const questionBankMachine = defineMachine<QuestionBankStatus>({
  // Also the audit entity of the bank (apps/api assessment/domain/audit-actions.ts).
  name: 'question_bank',
  states: QUESTION_BANK_STATES,
  initial: 'OPEN',
  transitions: { OPEN: ['LOCKED'], LOCKED: [] },
});
