import type { InterviewView, OfferView, StaffInterviewView } from '@srm/shared';
import type { InterviewRecord, OfferRecord } from '../infrastructure/interview.repository.js';

const iso = (value: Date | null) => value?.toISOString() ?? null;

/** What the student reads of an interview: never HR's note on the result. */
export function interviewView(row: InterviewRecord): InterviewView {
  return {
    interviewId: row.id,
    nominationId: row.nominationId,
    status: row.status,
    scheduledAt: row.scheduledAt.toISOString(),
    mode: row.mode,
    location: row.location,
    confirmedAt: iso(row.confirmedAt),
    rescheduleRequestedAt: iso(row.rescheduleRequestedAt),
    rescheduleNote: row.rescheduleNote,
    result: row.result,
    resultAt: iso(row.resultAt),
    rowVersion: row.rowVersion,
  };
}

/** What HR and the center read of an interview. */
export function staffInterviewView(row: InterviewRecord): StaffInterviewView {
  return { ...interviewView(row), resultNote: row.resultNote };
}

export function offerView(row: OfferRecord): OfferView {
  return {
    offerId: row.id,
    nominationId: row.nominationId,
    status: row.status,
    sentAt: row.sentAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    respondedAt: iso(row.respondedAt),
    rowVersion: row.rowVersion,
  };
}
