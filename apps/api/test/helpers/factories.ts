// Minimal valid rows for the core tables. Test files share one database and run in parallel,
// so every unique column gets a fresh value.
import type { Database } from '../../src/db/types.js';
import type { CvProfile, CvStatus, Role } from '@srm/shared';
import { campaigns, companies, cvs, jobDescriptions, students, users } from '../../src/db/schema/index.js';

let sequence = 0;

/** A value unique across parallel Jest workers. */
export function uniqueValue(prefix: string): string {
  sequence += 1;
  return `${prefix}-${process.pid}-${Date.now()}-${sequence}`;
}

export async function createCompany(db: Database, values: Partial<typeof companies.$inferInsert> = {}) {
  const [row] = await db
    .insert(companies)
    .values({ name: uniqueValue('company'), ...values })
    .returning();
  return row!;
}

export async function createStudent(db: Database, values: Partial<typeof students.$inferInsert> = {}) {
  const [row] = await db
    .insert(students)
    .values({ studentCode: uniqueValue('sv'), fullName: 'Nguyễn Văn A', ...values })
    .returning();
  return row!;
}

/** Target stored in campaigns.config.target by default (CONTEXT D27). */
export const TEST_CAMPAIGN_TARGET = { cohorts: ['K66'], majors: ['CNTT'] };

/** A campaign whose config parses (target + PRD defaults) and with no deadlines unless given. */
export async function createCampaign(db: Database, values: Partial<typeof campaigns.$inferInsert> = {}) {
  const [row] = await db
    .insert(campaigns)
    .values({ name: uniqueValue('campaign'), config: { target: TEST_CAMPAIGN_TARGET }, ...values })
    .returning();
  return row!;
}

export async function createJobDescription(
  db: Database,
  values: Partial<typeof jobDescriptions.$inferInsert> = {},
) {
  const [campaignId, companyId] = await Promise.all([
    values.campaignId ?? createCampaign(db).then((row) => row.id),
    values.companyId ?? createCompany(db).then((row) => row.id),
  ]);
  const [row] = await db
    .insert(jobDescriptions)
    .values({ title: 'Backend Intern', quota: 2, ...values, campaignId, companyId })
    .returning();
  return row!;
}

/** A small profile in the shape of CvProfile (US-2.4); no personal data. */
export const SAMPLE_CV_PROFILE: CvProfile = {
  summary: null,
  education: [],
  skills: [{ name: 'SQL' }],
  projects: [],
  experience: [],
  languages: [],
  certificates: [],
};

/**
 * What the cvs CHECKs require of a CV in `status` (US-2.4): an analysed CV has its profile, pii
 * (placeholder bytes here, not pgcrypto output), model and source; a failed one has its code.
 */
function analysisFor(status: CvStatus | undefined): Partial<typeof cvs.$inferInsert> {
  if (status === 'PENDING_CONFIRMATION' || status === 'CONFIRMED') {
    return {
      profile: SAMPLE_CV_PROFILE,
      profileMasked: SAMPLE_CV_PROFILE,
      pii: Buffer.from('test-pii'),
      analysisSource: 'TEXT_PDF',
      analysisModel: 'fixture',
      analysisPromptVersion: 'cv_parser/v1',
    };
  }
  return status === 'ANALYSIS_FAILED' ? { analysisErrorCode: 'TEST_FAILURE' } : {};
}

export async function createCv(db: Database, values: Partial<typeof cvs.$inferInsert> = {}) {
  const [studentId, campaignId] = await Promise.all([
    values.studentId ?? createStudent(db).then((row) => row.id),
    values.campaignId ?? createCampaign(db).then((row) => row.id),
  ]);
  const [row] = await db
    .insert(cvs)
    .values({
      fileKey: uniqueValue('cv-files/cv'),
      fileName: 'cv.pdf',
      ...analysisFor(values.status),
      ...values,
      studentId,
      campaignId,
    })
    .returning();
  return row!;
}

/** A `users` row. HR needs `companyId` and STUDENT needs `studentId` (users CHECKs). */
export async function createUser(
  db: Database,
  values: Partial<typeof users.$inferInsert> & { role: Role },
) {
  const [row] = await db
    .insert(users)
    .values({ email: `${uniqueValue('user')}@test.local`, fullName: 'Người dùng thử', ...values })
    .returning();
  return row!;
}
