import { defineMachine } from './machine.js';

/**
 * CV lifecycle (ARCHITECTURE › Luồng nộp và phân tích CV): Chờ phân tích → Chờ SV xác nhận → Đã xác nhận.
 * The analysis-failed state is not in the spec yet; US-2.4 adds it.
 */
export const CV_STATES = ['PENDING_ANALYSIS', 'PENDING_CONFIRMATION', 'CONFIRMED'] as const;

export type CvStatus = (typeof CV_STATES)[number];

export const cvMachine = defineMachine<CvStatus>({
  name: 'cv',
  states: CV_STATES,
  initial: 'PENDING_ANALYSIS',
  transitions: {
    PENDING_ANALYSIS: ['PENDING_CONFIRMATION'],
    PENDING_CONFIRMATION: ['CONFIRMED'],
    CONFIRMED: [],
  },
});
