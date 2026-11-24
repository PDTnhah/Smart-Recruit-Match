import { defineMachine } from './machine.js';

/**
 * Lifecycle of an allocation round (PRD GĐ7, FR-26, FR-27, US-5.2): the engine's result is a draft
 * the center reviews and adjusts, then publishes. Publishing is final: HR and students see the
 * round's nominations only from then on.
 */
export const ALLOCATION_ROUND_STATES = ['DRAFT', 'PUBLISHED'] as const;

export type AllocationRoundStatus = (typeof ALLOCATION_ROUND_STATES)[number];

export const allocationRoundMachine = defineMachine<AllocationRoundStatus>({
  // Also the audit entity of a round.
  name: 'allocation_round',
  states: ALLOCATION_ROUND_STATES,
  initial: 'DRAFT',
  transitions: { DRAFT: ['PUBLISHED'], PUBLISHED: [] },
});

/** Vietnamese names of the PRD (GĐ7: Dự thảo, công bố). */
export const ALLOCATION_ROUND_STATUS_LABELS: Readonly<Record<AllocationRoundStatus, string>> = {
  DRAFT: 'Dự thảo',
  PUBLISHED: 'Đã công bố',
};
