// US-2.6 (FR-11, BR-01, BR-03, CONTEXT D40): the student reviews, saves and confirms the profile
// the CV Parser read, and reopens it as a new version. CVs are seeded already analysed, with their
// personal data encrypted as the analysis stores it.
import { ApiErrorSchema, type CvProfile, CvProfileViewSchema, skillMatchKey } from '@srm/shared';
import { and, eq, sql } from 'drizzle-orm';
import { Client } from 'pg';
import { loadEnv } from '../../src/common/config/env.js';
import { cvs, skills } from '../../src/db/schema/index.js';
import { AI_JOB_DISPATCHED, type AiJobDispatchedEvent } from '../../src/modules/aigateway/index.js';
import { CV_SUBMITTED, type CvSubmittedEvent } from '../../src/modules/student/index.js';
import { PARSED_PII, PARSED_PII_VALUES, PARSED_PROFILE } from '../helpers/ai-results.js';
import { api, type AuthTestApp, createAuthTestApp } from '../helpers/auth.js';
import { acceptTerms, type LoggedInStudent, loginTargetStudent } from '../helpers/cv.js';
import { aiDatabaseUrl } from '../helpers/db.js';
import { createCampaign, createCv, createSkill, uniqueValue } from '../helpers/factories.js';
import { captureEvents, createIntakeCampaign, inDays } from '../helpers/jd.js';
import { auditEntries } from '../helpers/state.js';

/** The profile as the student edits it: their own name and contacts written into free text. */
function editedProfile(extraSkills: CvProfile['skills'] = []): CvProfile {
  return {
    ...PARSED_PROFILE,
    summary: 'Tôi là Trần Thị Kiểm Thử, email kiem.thu.demo@example.com, sinh 01/02/2004.',
    projects: [
      {
        ...PARSED_PROFILE.projects[0]!,
        description: 'Mã nguồn ở https://github.com/kiemthudemo/library, gọi 0912 000 111.',
      },
    ],
    skills: [...PARSED_PROFILE.skills, ...extraSkills],
  };
}

describe('US-2.6: student profile review and confirmation', () => {
  let t: AuthTestApp;
  let campaignId: number;
  let dispatched: AiJobDispatchedEvent[];
  let submitted: CvSubmittedEvent[];
  const piiKey = loadEnv().PII_ENCRYPTION_KEY;

  beforeAll(async () => {
    t = await createAuthTestApp();
    campaignId = (await createIntakeCampaign(t.db)).id;
    dispatched = captureEvents(t.app, AI_JOB_DISPATCHED);
    submitted = captureEvents(t.app, CV_SUBMITTED);
  });

  afterAll(async () => {
    await t.close();
  });

  /** An analysed CV of `student`, awaiting confirmation, with PARSED_PII encrypted as US-2.4 stores it. */
  async function analysedCv(student: LoggedInStudent, values: Partial<typeof cvs.$inferInsert> = {}) {
    const cv = await createCv(t.db, {
      studentId: student.studentId,
      campaignId,
      status: 'PENDING_CONFIRMATION',
      profile: PARSED_PROFILE,
      profileMasked: PARSED_PROFILE,
      maskedText: '[NAME] Java',
      ...values,
    });
    await t.db
      .update(cvs)
      .set({ pii: sql`pgp_sym_encrypt(${JSON.stringify(PARSED_PII)}::text, ${piiKey}::text)` })
      .where(eq(cvs.id, cv.id));
    return cv;
  }

  const rowOf = async (id: number) => (await t.db.select().from(cvs).where(eq(cvs.id, id)))[0]!;

  const save = (student: LoggedInStudent, body: object, path = 'cvs/me/profile') => student.agent.put(api(path)).send(body);
  const confirm = (student: LoggedInStudent, body: object) => save(student, body, 'cvs/me/profile/confirm');

  /** Whether the AI Service sees the CV in core.v_ai_cv_profile_masked, and with what. */
  async function inMaskedView(cvId: number): Promise<CvProfile | undefined> {
    const ai = new Client({ connectionString: aiDatabaseUrl() });
    await ai.connect();
    try {
      const { rows } = await ai.query<{ profile_masked: CvProfile }>(
        'SELECT profile_masked FROM core.v_ai_cv_profile_masked WHERE cv_id = $1',
        [cvId],
      );
      return rows[0]?.profile_masked;
    } finally {
      await ai.end();
    }
  }

  it('GĐ2 the student reads the active version with what they may do (AC-1)', async () => {
    const student = await loginTargetStudent(t);
    const cv = await analysedCv(student);
    const response = await student.agent.get(api(`cvs/me/profile?campaignId=${campaignId}`)).expect(200);
    expect(CvProfileViewSchema.parse(response.body)).toEqual({
      cvId: cv.id,
      campaignId,
      version: 1,
      status: 'PENDING_CONFIRMATION',
      rowVersion: 0,
      fileName: 'cv.pdf',
      profile: PARSED_PROFILE,
      editable: true,
      canReopen: false,
    });
    const other = await createCampaign(t.db, { status: 'INTAKE' });
    await student.agent.get(api(`cvs/me/profile?campaignId=${other.id}`)).expect(404);
  });

  it('BR-01 lưu nháp không đổi trạng thái (AC-4)', async () => {
    const student = await loginTargetStudent(t);
    const cv = await analysedCv(student);
    const profile = { ...PARSED_PROFILE, languages: [{ language: 'Tiếng Nhật', level: 'N3' }] };

    const response = await save(student, { cvId: cv.id, rowVersion: 0, profile }).expect(200);
    expect(CvProfileViewSchema.parse(response.body)).toMatchObject({
      status: 'PENDING_CONFIRMATION',
      rowVersion: 1,
      profile,
      editable: true,
    });
    const row = await rowOf(cv.id);
    expect([row.status, row.rowVersion, row.profile, row.profileMasked]).toEqual(['PENDING_CONFIRMATION', 1, profile, profile]);
    expect((await auditEntries(t.db, 'cv', cv.id)).map((entry) => entry.action)).toEqual(['CV_PROFILE_SAVED']);

    // The same profile again writes nothing.
    await save(student, { cvId: cv.id, rowVersion: 1, profile }).expect(200);
    expect((await rowOf(cv.id)).rowVersion).toBe(1);
    expect(await inMaskedView(cv.id)).toBeUndefined();
  });

  it('BR-01 xác nhận tạo lại profile_masked, chuyển Đã xác nhận, audit không có PII (AC-5)', async () => {
    const student = await loginTargetStudent(t);
    const cv = await analysedCv(student);
    const profile = editedProfile();

    const response = await confirm(student, { cvId: cv.id, rowVersion: 0, profile }).expect(200);
    expect(CvProfileViewSchema.parse(response.body)).toMatchObject({
      status: 'CONFIRMED',
      rowVersion: 2,
      profile,
      editable: false,
      canReopen: true,
    });

    const row = await rowOf(cv.id);
    expect(row.status).toBe('CONFIRMED');
    // The student's own profile keeps what they wrote; the masked copy has none of it.
    expect(row.profile).toEqual(profile);
    expect(row.profileMasked?.summary).toBe('Tôi là [NAME], email [EMAIL], sinh [DOB].');
    expect(row.profileMasked?.projects[0]?.description).toBe('Mã nguồn ở [LINK], gọi [PHONE].');
    const masked = JSON.stringify(row.profileMasked);
    for (const value of PARSED_PII_VALUES) expect(masked).not.toContain(value);

    const entries = await auditEntries(t.db, 'cv', cv.id);
    expect(entries.map((entry) => [entry.action, entry.actorKind])).toEqual([
      ['TRANSITION', 'USER'],
      ['CV_PROFILE_SAVED', 'USER'],
    ]);
    expect(entries[0]).toMatchObject({ before: { status: 'PENDING_CONFIRMATION' }, after: { status: 'CONFIRMED' } });
    const audit = JSON.stringify(entries);
    for (const value of [...PARSED_PII_VALUES, 'Library API', 'Tiếng Anh']) expect(audit).not.toContain(value);
  });

  it('BR-01 CV chưa xác nhận không có trong v_ai_cv_profile_masked (AC-7)', async () => {
    const student = await loginTargetStudent(t);
    const cv = await analysedCv(student);
    expect(await inMaskedView(cv.id)).toBeUndefined();

    await confirm(student, { cvId: cv.id, rowVersion: 0, profile: editedProfile() }).expect(200);
    const seen = await inMaskedView(cv.id);
    expect(seen).toEqual((await rowOf(cv.id)).profileMasked);
    expect(seen?.summary).toBe('Tôi là [NAME], email [EMAIL], sinh [DOB].');
  });

  it('FR-13 skills are mapped to the catalogue again; the client’s mapping is not trusted (AC-3)', async () => {
    const student = await loginTargetStudent(t);
    const cv = await analysedCv(student);
    const approved = await createSkill(t.db, { canonicalName: uniqueValue('Kotlin'), aliases: [] });
    const typed = approved.canonicalName.toLowerCase();
    const fresh = uniqueValue('Rust embedded');
    const profile = {
      ...PARSED_PROFILE,
      skills: [
        { name: typed, canonical_name: null, match: 'NEW' },
        { name: fresh, canonical_name: 'Java', match: 'ALIAS' },
      ],
    };
    const response = await save(student, { cvId: cv.id, rowVersion: 0, profile }).expect(200);
    expect(CvProfileViewSchema.parse(response.body).profile?.skills).toEqual([
      { name: typed, canonical_name: approved.canonicalName, match: 'ALIAS' },
      { name: fresh, canonical_name: null, match: 'NEW' },
    ]);
  });

  it('FR-13 skills typed outside the catalogue go to the review queue once confirmed (CONTEXT D40)', async () => {
    const student = await loginTargetStudent(t);
    const cv = await analysedCv(student);
    const fresh = uniqueValue('Rust embedded');
    const withName = 'kiemthudemo-toolkit';
    const profile = editedProfile([
      { name: fresh, canonical_name: null, match: 'NEW' },
      { name: withName, canonical_name: null, match: 'NEW' },
    ]);
    const pendingNamed = (name: string) =>
      t.db.select().from(skills).where(eq(skills.nameKey, skillMatchKey(name)));

    await save(student, { cvId: cv.id, rowVersion: 0, profile }).expect(200);
    expect(await pendingNamed(fresh)).toEqual([]);

    await confirm(student, { cvId: cv.id, rowVersion: 1, profile }).expect(200);
    const [queued] = await pendingNamed(fresh);
    expect(queued).toMatchObject({ canonicalName: fresh, status: 'PENDING' });
    expect((await auditEntries(t.db, 'skill', queued!.id))[0]).toMatchObject({
      action: 'SKILL_PROPOSED',
      after: { source: 'CV_PROFILE', jobId: null },
    });
    // BR-03: a name holding the student's personal data is masked, so it is not queued.
    expect((await rowOf(cv.id)).profileMasked?.skills.at(-1)?.name).toBe('[LINK]-toolkit');
    expect(await pendingNamed('[LINK]-toolkit')).toEqual([]);
    expect(await pendingNamed(withName)).toEqual([]);
  });

  it('409 khi row_version cũ (AC-6)', async () => {
    const student = await loginTargetStudent(t);
    const cv = await analysedCv(student);
    const profile = editedProfile();
    await save(student, { cvId: cv.id, rowVersion: 0, profile }).expect(200);

    // Another tab saved first; this one still holds row_version 0. Nothing is written.
    const stale = await confirm(student, { cvId: cv.id, rowVersion: 0, profile: PARSED_PROFILE });
    expect([stale.status, ApiErrorSchema.parse(stale.body).code]).toEqual([409, 'ROW_VERSION_CONFLICT']);
    const row = await rowOf(cv.id);
    expect([row.status, row.rowVersion, row.profile]).toEqual(['PENDING_CONFIRMATION', 1, profile]);
  });

  it('409 khi một bản tải lên mới đã thay phiên bản đang mở (AC-6)', async () => {
    const student = await loginTargetStudent(t);
    // Version 1 lost `active` to version 2, as an upload leaves it: row_version bumped.
    const replaced = await analysedCv(student, { active: false, rowVersion: 1 });
    await createCv(t.db, { studentId: student.studentId, campaignId, version: 2 });
    const profile = editedProfile();

    const onScreen = await save(student, { cvId: replaced.id, rowVersion: 0, profile });
    expect([onScreen.status, ApiErrorSchema.parse(onScreen.body).code]).toEqual([409, 'ROW_VERSION_CONFLICT']);
    const current = await confirm(student, { cvId: replaced.id, rowVersion: 1, profile });
    expect([current.status, ApiErrorSchema.parse(current.body).code]).toEqual([409, 'CV_PROFILE_NOT_EDITABLE']);
    const row = await rowOf(replaced.id);
    expect([row.status, row.rowVersion, row.profile]).toEqual(['PENDING_CONFIRMATION', 1, PARSED_PROFILE]);
  });

  it('BR-03 an entry over its limit once masked is a 400 on that field, and nothing is stored', async () => {
    const student = await loginTargetStudent(t);
    const cv = await analysedCv(student);
    // "Nam Định" (8 characters) becomes [HOMETOWN] (10): a summary of 3000 ends up with 3002.
    const summary = `Quê Nam Định. ${'a'.repeat(2986)}`;
    expect(summary).toHaveLength(3000);

    const response = await confirm(student, { cvId: cv.id, rowVersion: 0, profile: { ...PARSED_PROFILE, summary } }).expect(400);
    const error = ApiErrorSchema.parse(response.body);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details?.issues).toEqual([{ path: 'profile.summary', message: expect.stringContaining('[NAME]') as string }]);
    const row = await rowOf(cv.id);
    expect([row.status, row.rowVersion, row.profile]).toEqual(['PENDING_CONFIRMATION', 0, PARSED_PROFILE]);
  });

  it('GĐ2 quá hạn nộp CV không xác nhận được (AC-8)', async () => {
    const closed = await createCampaign(t.db, {
      status: 'INTAKE',
      phaseDeadlines: { intake_end: inDays(-1), preference_end: inDays(7), testing_end: inDays(14) },
    });
    const student = await loginTargetStudent(t);
    const cv = await analysedCv(student, { campaignId: closed.id });

    const view = await student.agent.get(api(`cvs/me/profile?campaignId=${closed.id}`)).expect(200);
    expect(CvProfileViewSchema.parse(view.body)).toMatchObject({ editable: false, canReopen: false });
    for (const response of [
      await save(student, { cvId: cv.id, rowVersion: 0, profile: editedProfile() }),
      await confirm(student, { cvId: cv.id, rowVersion: 0, profile: editedProfile() }),
      await student.agent.post(api('cvs/me/profile/reopen')).send({ cvId: cv.id, rowVersion: 0 }),
    ]) {
      expect([response.status, ApiErrorSchema.parse(response.body).code]).toEqual([409, 'CAMPAIGN_PHASE_MISMATCH']);
    }
    const row = await rowOf(cv.id);
    expect([row.status, row.rowVersion, row.profile]).toEqual(['PENDING_CONFIRMATION', 0, PARSED_PROFILE]);
  });

  it('NFR-1 vai trò khác 403; URL file của SV khác 404 (AC-9)', async () => {
    const owner = await loginTargetStudent(t);
    const cv = await analysedCv(owner);
    const body = { cvId: cv.id, rowVersion: 0, profile: editedProfile() };

    for (const role of ['HR', 'CENTER', 'ADMIN'] as const) {
      const { agent } = await t.loginAs(role);
      await agent.get(api(`cvs/me/profile?campaignId=${campaignId}`)).expect(403);
      await agent.put(api('cvs/me/profile')).send(body).expect(403);
      await agent.put(api('cvs/me/profile/confirm')).send(body).expect(403);
      await agent.post(api('cvs/me/profile/reopen')).send({ cvId: cv.id, rowVersion: 0 }).expect(403);
    }
    await t.http().get(api(`cvs/me/profile?campaignId=${campaignId}`)).expect(401);
    await t.http().put(api('cvs/me/profile/confirm')).send(body).expect(401);

    const other = await loginTargetStudent(t);
    await save(other, body).expect(404);
    await confirm(other, body).expect(404);
    await other.agent.post(api('cvs/me/profile/reopen')).send({ cvId: cv.id, rowVersion: 0 }).expect(404);
    await other.agent.get(api(`files/cv:${cv.id}/url`)).expect(404);
    await owner.agent.get(api(`files/cv:${cv.id}/url`)).expect(200);
    expect((await rowOf(cv.id)).rowVersion).toBe(0);
  });

  it('BR-01 sửa lại tạo phiên bản mới ở Chờ SV xác nhận, không gọi AI (AC-12)', async () => {
    const student = await loginTargetStudent(t);
    const cv = await analysedCv(student);
    await student.agent
      .post(api('cvs/me/profile/reopen'))
      .send({ cvId: cv.id, rowVersion: 0 })
      .expect(409)
      .expect((response) => expect(ApiErrorSchema.parse(response.body).code).toBe('CV_PROFILE_NOT_EDITABLE'));
    await confirm(student, { cvId: cv.id, rowVersion: 0, profile: editedProfile() }).expect(200);
    const confirmed = await rowOf(cv.id);
    const dispatchedBefore = dispatched.length;

    // Like an upload, a new version needs consent to the current terms.
    await student.agent
      .post(api('cvs/me/profile/reopen'))
      .send({ cvId: cv.id, rowVersion: confirmed.rowVersion })
      .expect(403)
      .expect((response) => expect(ApiErrorSchema.parse(response.body).code).toBe('CONSENT_REQUIRED'));
    await acceptTerms(student.agent, campaignId).expect(200);

    const response = await student.agent
      .post(api('cvs/me/profile/reopen'))
      .send({ cvId: cv.id, rowVersion: confirmed.rowVersion })
      .expect(201);
    const view = CvProfileViewSchema.parse(response.body);
    expect(view).toMatchObject({
      version: 2,
      status: 'PENDING_CONFIRMATION',
      profile: confirmed.profile,
      editable: true,
      canReopen: false,
    });

    const [old, reopened] = [await rowOf(cv.id), await rowOf(view.cvId)];
    expect([old.status, old.active]).toEqual(['CONFIRMED', false]);
    expect(reopened).toMatchObject({
      studentId: student.studentId,
      campaignId,
      version: 2,
      status: 'PENDING_CONFIRMATION',
      active: true,
      fileKey: confirmed.fileKey,
      fileName: confirmed.fileName,
      profile: confirmed.profile,
      profileMasked: confirmed.profileMasked,
      maskedText: confirmed.maskedText,
      analysisModel: confirmed.analysisModel,
      analysisErrorCode: null,
    });
    expect(Buffer.compare(reopened.pii!, confirmed.pii!)).toBe(0);
    expect((await auditEntries(t.db, 'cv', reopened.id)).map((entry) => entry.action)).toEqual([
      'CV_PROFILE_REOPENED',
      'TRANSITION',
    ]);
    expect((await auditEntries(t.db, 'cv', cv.id))[0]?.action).toBe('CV_SUPERSEDED');

    // No analysis: neither cv.submitted nor an AI job for the new version.
    expect(submitted.some((event) => event.cvId === reopened.id)).toBe(false);
    expect(dispatched.slice(dispatchedBefore).some((event) => event.type === 'CV_PARSE')).toBe(false);
    // Matching skips the CV until the student confirms again.
    expect(await inMaskedView(cv.id)).toBeUndefined();
    expect(await inMaskedView(reopened.id)).toBeUndefined();
    await confirm(student, { cvId: reopened.id, rowVersion: view.rowVersion, profile: editedProfile() }).expect(200);
    expect(await inMaskedView(reopened.id)).toBeDefined();

    const active = await t.db
      .select({ id: cvs.id })
      .from(cvs)
      .where(and(eq(cvs.studentId, student.studentId), eq(cvs.active, true)));
    expect(active).toEqual([{ id: reopened.id }]);
  });
});
