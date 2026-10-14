// Shared setup for the consent and CV tests of US-1.6: students inside a campaign's target, their
// consent, multipart CV uploads and a look into the `cv-files` bucket.
import type { S3Client } from '@aws-sdk/client-s3';
import { CURRENT_TERMS } from '@srm/shared';
import { and, eq } from 'drizzle-orm';
import { BUCKETS } from '../../src/common/storage/index.js';
import { cvs } from '../../src/db/schema/index.js';
import type { Database } from '../../src/db/types.js';
import { api, type AuthTestApp, type LoggedIn, type TestAgent } from './auth.js';
import { createStudent, TEST_CAMPAIGN_TARGET } from './factories.js';
import { headObject, objectKeys } from './jd.js';

export interface LoggedInStudent extends LoggedIn {
  studentId: number;
}

/**
 * A student whose cohort and major match TEST_CAMPAIGN_TARGET, logged in. The `loginAs` default
 * student has neither, so sees no campaign (CONTEXT D27).
 */
export async function loginTargetStudent(
  t: AuthTestApp,
  audience: { cohort?: string; major?: string } = {},
): Promise<LoggedInStudent> {
  const student = await createStudent(t.db, {
    cohort: TEST_CAMPAIGN_TARGET.cohorts[0],
    major: TEST_CAMPAIGN_TARGET.majors[0],
    ...audience,
  });
  return { ...(await t.loginAs('STUDENT', { studentId: student.id })), studentId: student.id };
}

/** `POST /api/me/consents` for the current terms. */
export function acceptTerms(agent: TestAgent, campaignId: number, termsVersion = CURRENT_TERMS.version) {
  return agent.post(api('me/consents')).send({ campaignId, termsVersion });
}

/** `POST /api/cvs` as multipart; the content type is generic so only the bytes decide (AC-4). */
export function submitCv(agent: TestAgent, campaignId: number, content: Buffer, filename: string) {
  return agent
    .post(api('cvs'))
    .field('campaignId', String(campaignId))
    .attach('file', content, { filename, contentType: 'application/octet-stream' });
}

/** Object keys a student has in `cv-files` for a campaign. */
export function cvObjectKeys(s3: S3Client, studentId: number, campaignId?: number): Promise<string[]> {
  return objectKeys(s3, BUCKETS.CV_FILES, campaignId === undefined ? `cv/${studentId}/` : `cv/${studentId}/${campaignId}/`);
}

export function headCvObject(s3: S3Client, key: string) {
  return headObject(s3, BUCKETS.CV_FILES, key);
}

/** Every `cvs` row of a student in a campaign, oldest version first. */
export async function cvRows(db: Database, studentId: number, campaignId: number) {
  const rows = await db
    .select()
    .from(cvs)
    .where(and(eq(cvs.studentId, studentId), eq(cvs.campaignId, campaignId)));
  return rows.sort((a, b) => a.version - b.version);
}
