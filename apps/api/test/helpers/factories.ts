// Minimal valid rows for the core tables. Test files share one database and run in parallel,
// so every unique column gets a fresh value.
import type { Database } from '../../src/db/types.js';
import { type CvProfile, type CvStatus, type MatchCodeCriteria, type Role, skillMatchKey } from '@srm/shared';
import {
  campaigns,
  companies,
  cvs,
  jobDescriptions,
  matchResults,
  preferences,
  skills,
  students,
  users,
} from '../../src/db/schema/index.js';
import { RULES_VERSION } from '../../src/modules/matching/domain/rules-version.js';

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
  skills: [{ name: 'SQL', canonical_name: 'SQL', match: 'ALIAS' }],
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

/**
 * A `skills` row, APPROVED in group OTHER unless told otherwise; the name gets a unique suffix and
 * `name_key` follows it. Pass `group: null` for a PENDING one.
 */
export async function createSkill(db: Database, values: Partial<typeof skills.$inferInsert> = {}) {
  const canonicalName = values.canonicalName ?? uniqueValue('Skill');
  const [row] = await db
    .insert(skills)
    .values({
      status: 'APPROVED',
      group: 'OTHER',
      ...values,
      canonicalName,
      nameKey: skillMatchKey(canonicalName),
      aliasKeys: (values.aliases ?? []).map(skillMatchKey),
    })
    .returning();
  return row!;
}

/**
 * A preference (an application, US-3.3) of a new student for a new JD unless told otherwise, rank 1
 * in PENDING_TEST by default. The JD is created in the campaign, so the row is consistent.
 */
export async function createPreference(db: Database, values: Partial<typeof preferences.$inferInsert> = {}) {
  const campaignId = values.campaignId ?? (await createCampaign(db)).id;
  const [studentId, jdId] = await Promise.all([
    values.studentId ?? createStudent(db).then((row) => row.id),
    values.jdId ?? createJobDescription(db, { campaignId }).then((row) => row.id),
  ]);
  const [row] = await db
    .insert(preferences)
    .values({ rank: 1, ...values, campaignId, studentId, jdId })
    .returning();
  return row!;
}

/** Code verdicts of an eligible pair with no skill, language or major gap (US-3.2 CHECKs). */
export const SAMPLE_MATCH_CRITERIA: MatchCodeCriteria = {
  must_have: [],
  nice_to_have: [],
  education: { major_match: 'EXACT', major_unrecognized: false },
  language: null,
  zones: [],
  gaps: [],
};

type MatchResultValues = Partial<Omit<typeof matchResults.$inferInsert, 'sCv'>> &
  Pick<typeof matchResults.$inferInsert, 'campaignId' | 'studentId' | 'cvId' | 'jdId'> & {
    /** S_cv of a scored pair; null for a pair waiting for the LLM. */
    sCv?: number | null;
  };

/** The LLM part of a scored pair (US-3.2 CHECKs: it comes whole, with S_cv). */
function llmPart(sCv: number): Partial<typeof matchResults.$inferInsert> {
  return {
    promptVersion: 'matching/v1',
    model: 'fixture',
    assessment: {
      project_relevance: { score_0_4: 3, reason: 'Dự án web phù hợp.', evidence: [] },
      strengths: ['Có dự án web'],
      suggestions: ['Học thêm Docker'],
      summary: 'Khá phù hợp.',
      evidence_check: [],
    },
    sCv,
    scvBreakdown: [],
  };
}

/**
 * A `match_results` row for a CV × JD pair with the current rules (US-3.2). By default the pair is
 * eligible and scored with `matching/v1` at S_cv 70; pass `eligible: false` with
 * `ineligibleReasons`, or `sCv: null` for a pair waiting for the LLM.
 */
export async function createMatchResult(db: Database, values: MatchResultValues) {
  const { sCv = 70, ...rest } = values;
  const eligible = rest.eligible ?? true;
  const scored = eligible && sCv !== null && !rest.skippedByPrefilter && !rest.needsReview;
  const [row] = await db
    .insert(matchResults)
    .values({
      cvVersion: 1,
      jdVersion: 1,
      rulesVersion: RULES_VERSION,
      facts: { major: 'CNTT', yearOfStudy: 3, gpa4: 3.2, languageCertificates: [] },
      criteria: eligible ? SAMPLE_MATCH_CRITERIA : null,
      skillFit: eligible ? 50 : null,
      ...(scored ? llmPart(sCv) : {}),
      ...rest,
      eligible,
    })
    .returning();
  return row!;
}
