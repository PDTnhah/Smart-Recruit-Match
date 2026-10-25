import { defineMachine } from './machine.js';

/**
 * CV lifecycle (ARCHITECTURE › Luồng nộp và phân tích CV): Chờ phân tích → Chờ SV xác nhận → Đã xác nhận.
 * US-2.4 adds Lỗi phân tích (CONTEXT D37): the CV Parser failed and the student is asked to upload
 * again. A failed CV goes back to PENDING_ANALYSIS only through the re-dispatch command, and on to
 * PENDING_CONFIRMATION when a result arrives after a dispatch reported failed but taken by the
 * broker (as for JDs, D35).
 */
export const CV_STATES = ['PENDING_ANALYSIS', 'PENDING_CONFIRMATION', 'CONFIRMED', 'ANALYSIS_FAILED'] as const;

export type CvStatus = (typeof CV_STATES)[number];

export const cvMachine = defineMachine<CvStatus>({
  name: 'cv',
  states: CV_STATES,
  initial: 'PENDING_ANALYSIS',
  transitions: {
    PENDING_ANALYSIS: ['PENDING_CONFIRMATION', 'ANALYSIS_FAILED'],
    PENDING_CONFIRMATION: ['CONFIRMED'],
    CONFIRMED: [],
    ANALYSIS_FAILED: ['PENDING_ANALYSIS', 'PENDING_CONFIRMATION'],
  },
});
