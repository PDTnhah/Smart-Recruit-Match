import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from './application.js';
import { defineMachine } from './machine.js';

/**
 * Lifecycle of a nomination, one student put forward to one JD by an allocation round (US-5.2,
 * CONTEXT D64). It is the part of the application lifecycle (`application.ts`) from "Được đề cử"
 * on, with the same codes and edges, so the preference of the pair and its nomination always move
 * together (US-5.3, US-5.4). A nomination of a draft round is already NOMINATED, so BR-08 holds at
 * the database from the draft on; HR and students see it only once the round is published.
 */
export const NOMINATION_STATES = [
  'NOMINATED',
  'INTERVIEW',
  'HR_REJECTED',
  'PASSED',
  'RESERVE',
  'INTERVIEW_FAILED',
  'ACCEPTED',
  'DECLINED',
  'CLOSED',
] as const satisfies readonly ApplicationStatus[];

export type NominationStatus = (typeof NOMINATION_STATES)[number];

export const nominationMachine = defineMachine<NominationStatus>({
  name: 'nomination',
  states: NOMINATION_STATES,
  initial: 'NOMINATED',
  transitions: {
    NOMINATED: ['INTERVIEW', 'HR_REJECTED'],
    INTERVIEW: ['PASSED', 'RESERVE', 'INTERVIEW_FAILED'],
    HR_REJECTED: [],
    PASSED: ['ACCEPTED', 'DECLINED'],
    RESERVE: ['PASSED', 'CLOSED'],
    INTERVIEW_FAILED: [],
    ACCEPTED: [],
    DECLINED: [],
    CLOSED: [],
  },
});

/**
 * BR-08: a student has at most one nomination in these states at a time. The partial unique index
 * `nominations_active_student_key` lists the same codes (AGENTS › Invariant 11).
 */
export const NOMINATION_ACTIVE_STATES = [
  'NOMINATED',
  'INTERVIEW',
  'PASSED',
  'RESERVE',
] as const satisfies readonly NominationStatus[];

/** The names of the application lifecycle, shown to students, HR and the center alike. */
export const NOMINATION_STATUS_LABELS: Readonly<Record<NominationStatus, string>> = Object.fromEntries(
  NOMINATION_STATES.map((state) => [state, APPLICATION_STATUS_LABELS[state]]),
) as Record<NominationStatus, string>;
