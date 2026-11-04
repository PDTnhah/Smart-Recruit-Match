// Shared setup for the shortlist and preference tests of US-3.3: a campaign in preference
// selection, approved JDs, confirmed CVs and stored match results, written directly (the matching
// run itself is US-3.2's test).
import type { CampaignStatus, IneligibleReason } from '@srm/shared';
import { matchResults } from '../../src/db/schema/index.js';
import type { Database } from '../../src/db/types.js';
import { createCampaign, createCompany, createCv, createMatchResult, TEST_CAMPAIGN_TARGET } from './factories.js';
import { createJdInState, inDays } from './jd.js';

/** A campaign in PREFERENCE_SELECTION (by default) with `preference_end` a week ahead; N_NV 3, θ_cv 50. */
export function createPreferenceCampaign(
  db: Database,
  options: { status?: CampaignStatus; preferenceEnd?: string; config?: Record<string, unknown> } = {},
) {
  return createCampaign(db, {
    status: options.status ?? 'PREFERENCE_SELECTION',
    phaseDeadlines: {
      intake_end: inDays(-1),
      preference_end: options.preferenceEnd ?? inDays(7),
      testing_end: inDays(14),
    },
    config: { target: TEST_CAMPAIGN_TARGET, n_nv: 3, theta_cv: 50, ...options.config },
  });
}

/** `count` approved JDs of one new company in the campaign, by id. */
export async function createApprovedJds(db: Database, campaignId: number, count: number) {
  const { id: companyId } = await createCompany(db);
  const jds = [];
  for (let i = 0; i < count; i += 1) jds.push(await createJdInState(db, { companyId, campaignId, status: 'APPROVED' }));
  return jds;
}

export interface CvRef {
  id: number;
  version: number;
  studentId: number;
  campaignId: number;
}

/** The student's active CV in the campaign, CONFIRMED unless told otherwise. */
export function createConfirmedCv(db: Database, studentId: number, campaignId: number, values: Parameters<typeof createCv>[1] = {}) {
  return createCv(db, { studentId, campaignId, status: 'CONFIRMED', ...values });
}

/** A scored result of the pair at S_cv `sCv` (eligible, prompt `matching/v1`). */
export function scorePair(db: Database, cv: CvRef, jd: { id: number; version: number }, sCv: number, values: Partial<typeof matchResults.$inferInsert> = {}) {
  return createMatchResult(db, {
    campaignId: cv.campaignId,
    studentId: cv.studentId,
    cvId: cv.id,
    cvVersion: cv.version,
    jdId: jd.id,
    jdVersion: jd.version,
    ...values,
    sCv,
  });
}

/** A pair that failed the hard filter. */
export function rejectPair(db: Database, cv: CvRef, jd: { id: number; version: number }, reasons: IneligibleReason[]) {
  return createMatchResult(db, {
    campaignId: cv.campaignId,
    studentId: cv.studentId,
    cvId: cv.id,
    cvVersion: cv.version,
    jdId: jd.id,
    jdVersion: jd.version,
    eligible: false,
    ineligibleReasons: reasons,
    criteria: null,
    skillFit: null,
    sCv: null,
  });
}

/** An eligible pair without S_cv: outside the top M (`skipped`) or waiting for the LLM. */
export function waitingPair(db: Database, cv: CvRef, jd: { id: number; version: number }, values: { skipped?: boolean; needsReview?: boolean } = {}) {
  return createMatchResult(db, {
    campaignId: cv.campaignId,
    studentId: cv.studentId,
    cvId: cv.id,
    cvVersion: cv.version,
    jdId: jd.id,
    jdVersion: jd.version,
    skippedByPrefilter: values.skipped ?? false,
    needsReview: values.needsReview ?? false,
    sCv: null,
  });
}
