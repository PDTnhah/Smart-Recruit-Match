import { defineMachine } from './machine.js';

/**
 * Review of a skill the AI found outside the catalogue (FR-13, US-2.5, CONTEXT D39). A new name
 * waits for ADMIN, who approves it into the catalogue (renamed or not), merges it into an existing
 * skill as an alias, or rejects it. Every decision is final; seeded skills start APPROVED.
 */
export const SKILL_STATES = ['PENDING', 'APPROVED', 'REJECTED', 'MERGED'] as const;

export type SkillStatus = (typeof SKILL_STATES)[number];

export const skillMachine = defineMachine<SkillStatus>({
  name: 'skill',
  states: SKILL_STATES,
  initial: 'PENDING',
  transitions: {
    PENDING: ['APPROVED', 'REJECTED', 'MERGED'],
    APPROVED: [],
    REJECTED: [],
    MERGED: [],
  },
});
