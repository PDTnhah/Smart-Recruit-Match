import type { StudentAudience } from '../domain/visibility.js';

/**
 * Port through which the campaign module learns a student's cohort and major (CONTEXT D27). The
 * student module depends on campaign (US-1.6 calls `assertPhase`), so campaign cannot import it
 * back; instead StudentModule registers its lookup with `CampaignService.useStudentAudience`.
 * Returns null for an unknown student.
 */
export type StudentAudienceLookup = (studentId: number) => Promise<StudentAudience | null>;
