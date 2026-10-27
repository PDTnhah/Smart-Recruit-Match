// US-1.6 AC-2…AC-5, AC-7 (FR-6, NFR-2, PRD GĐ2, CONTEXT D30): a student who accepted the terms
// submits a real PDF/DOCX of at most 5 MB while the campaign is in INTAKE. Each upload is a new
// version awaiting analysis, stored encrypted in `cv-files`; nothing is stored for a refused one.
import { ApiErrorSchema, CvListSchema, CvSchema, MAX_UPLOAD_BYTES } from '@srm/shared';
import { Clock } from '../../src/common/clock/index.js';
import { consents } from '../../src/db/schema/index.js';
import { CV_SUBMITTED, type CvSubmittedEvent } from '../../src/modules/student/index.js';
import { api, type AuthTestApp, createAuthTestApp } from '../helpers/auth.js';
import {
  acceptTerms,
  cvObjectKeys,
  cvRows,
  headCvObject,
  type LoggedInStudent,
  loginTargetStudent,
  submitCv,
} from '../helpers/cv.js';
import { createCampaign } from '../helpers/factories.js';
import { FakeClock } from '../helpers/fake-clock.js';
import { captureEvents, createIntakeCampaign, fixtureFile, inDays, testS3 } from '../helpers/jd.js';
import { auditEntries } from '../helpers/state.js';

describe('GĐ2: CV submission (US-1.6 AC-2…AC-5, AC-7)', () => {
  let t: AuthTestApp;
  let submitted: CvSubmittedEvent[];
  const clock = new FakeClock();
  const s3 = testS3();

  beforeAll(async () => {
    t = await createAuthTestApp({ configure: (b) => b.overrideProvider(Clock).useValue(clock) });
    submitted = captureEvents<CvSubmittedEvent>(t.app, CV_SUBMITTED);
  });

  afterAll(async () => {
    s3.destroy();
    await t.close();
  });

  beforeEach(() => {
    clock.set(new Date());
  });

  /** A target student who accepted the terms for a fresh campaign in INTAKE. */
  async function readyStudent(): Promise<{ student: LoggedInStudent; campaignId: number }> {
    const student = await loginTargetStudent(t);
    const campaignId = (await createIntakeCampaign(t.db)).id;
    await acceptTerms(student.agent, campaignId).expect(200);
    return { student, campaignId };
  }

  it('NFR-2: upload without consent returns 403 CONSENT_REQUIRED and stores nothing', async () => {
    const student = await loginTargetStudent(t);
    const campaign = await createIntakeCampaign(t.db);
    const res = await submitCv(student.agent, campaign.id, fixtureFile('sample.pdf'), 'cv.pdf').expect(403);
    expect(ApiErrorSchema.parse(res.body).code).toBe('CONSENT_REQUIRED');
    expect(await cvObjectKeys(s3, student.studentId)).toEqual([]);
    expect(await cvRows(t.db, student.studentId, campaign.id)).toEqual([]);
  });

  it('GĐ2: valid PDF returns 202, stored encrypted in cv-files, status PENDING_ANALYSIS, emits cv.submitted', async () => {
    for (const [fixture, name, ext] of [
      ['sample.pdf', 'CV Nguyễn Văn A.pdf', 'pdf'],
      ['sample.docx', 'cv-tieng-viet.docx', 'docx'],
    ] as const) {
      const { student, campaignId } = await readyStudent();
      const other = await loginTargetStudent(t);
      // A student id in the body is ignored: the student always comes from the token (AC-3).
      const res = await submitCv(student.agent, campaignId, fixtureFile(fixture), name)
        .field('studentId', String(other.studentId))
        .expect(202);
      const cv = CvSchema.parse(res.body);
      expect(cv).toMatchObject({ campaignId, version: 1, status: 'PENDING_ANALYSIS', active: true, fileName: name });

      const [row] = await cvRows(t.db, student.studentId, campaignId);
      expect(row).toMatchObject({ id: cv.id, studentId: student.studentId, version: 1, active: true });
      expect(row!.fileKey).toMatch(new RegExp(`^cv/${student.studentId}/${campaignId}/[0-9a-f-]{36}\\.${ext}$`));
      expect(await cvRows(t.db, other.studentId, campaignId)).toEqual([]);

      const head = await headCvObject(s3, row!.fileKey);
      expect(head.ServerSideEncryption).toBe('AES256');
      expect(head.ContentLength).toBe(fixtureFile(fixture).length);

      expect(submitted).toContainEqual({ cvId: cv.id, cvVersion: 1, campaignId, studentId: student.studentId });
      const [entry] = await auditEntries(t.db, 'cv', cv.id);
      expect(entry).toMatchObject({ action: 'CV_SUBMITTED', actorId: student.user.id });
      expect(entry?.after).toMatchObject({ version: 1, type: ext, active: true });
      // The file name may hold the student's name; the append-only log never stores it (NFR-2).
      expect(entry?.after).not.toHaveProperty('fileName');
    }
  });

  it('GĐ2: fake .pdf returns 415 and 6 MB file returns 413 with nothing stored', async () => {
    const { student, campaignId } = await readyStudent();
    for (const fixture of ['fake.pdf', 'plain.zip']) {
      const res = await submitCv(student.agent, campaignId, fixtureFile(fixture), 'cv.pdf').expect(415);
      expect(ApiErrorSchema.parse(res.body).code).toBe('UNSUPPORTED_FILE_TYPE');
    }
    const big = Buffer.concat([fixtureFile('sample.pdf'), Buffer.alloc(6 * 1024 * 1024 - 607, 0x20)]);
    expect(big.length).toBeGreaterThan(MAX_UPLOAD_BYTES);
    const res = await submitCv(student.agent, campaignId, big, 'big.pdf').expect(413);
    expect(ApiErrorSchema.parse(res.body).code).toBe('FILE_TOO_LARGE');

    expect(await cvObjectKeys(s3, student.studentId)).toEqual([]);
    expect(await cvRows(t.db, student.studentId, campaignId)).toEqual([]);
  });

  it('GĐ2: a request without a file returns 400', async () => {
    const { student, campaignId } = await readyStudent();
    await student.agent.post(api('cvs')).field('campaignId', String(campaignId)).expect(400);
    expect(await cvRows(t.db, student.studentId, campaignId)).toEqual([]);
  });

  it('BR-01: new upload creates version n+1 and deactivates previous version in one transaction', async () => {
    const { student, campaignId } = await readyStudent();
    const first = CvSchema.parse(
      (await submitCv(student.agent, campaignId, fixtureFile('sample.pdf'), 'v1.pdf').expect(202)).body,
    );
    const second = CvSchema.parse(
      (await submitCv(student.agent, campaignId, fixtureFile('sample.docx'), 'v2.docx').expect(202)).body,
    );
    expect(second).toMatchObject({ version: 2, active: true, status: 'PENDING_ANALYSIS', fileName: 'v2.docx' });

    const rows = await cvRows(t.db, student.studentId, campaignId);
    expect(rows.map((row) => [row.id, row.version, row.active])).toEqual([
      [first.id, 1, false],
      [second.id, 2, true],
    ]);
    // Older versions keep their file (AC-5).
    expect((await cvObjectKeys(s3, student.studentId, campaignId)).sort()).toEqual(
      rows.map((row) => row.fileKey).sort(),
    );

    const [superseded] = await auditEntries(t.db, 'cv', first.id);
    expect(superseded).toMatchObject({ action: 'CV_SUPERSEDED', before: { active: true }, after: { active: false } });
    expect(submitted).toContainEqual({ cvId: second.id, cvVersion: 2, campaignId, studentId: student.studentId });

    const list = CvListSchema.parse((await student.agent.get(api('cvs/me')).query({ campaignId }).expect(200)).body);
    expect(list.items.map((cv) => [cv.id, cv.version, cv.active])).toEqual([
      [second.id, 2, true],
      [first.id, 1, false],
    ]);
  });

  it('GĐ2: upload outside INTAKE returns 409 CAMPAIGN_PHASE_MISMATCH', async () => {
    // Past intake_end: refused even before the scheduler moves the campaign (CONTEXT D27).
    const { student, campaignId } = await readyStudent();
    clock.advance({ days: 8 });
    const late = await submitCv(student.agent, campaignId, fixtureFile('sample.pdf'), 'cv.pdf').expect(409);
    expect(ApiErrorSchema.parse(late.body).code).toBe('CAMPAIGN_PHASE_MISMATCH');

    // A later phase, with a consent given while the campaign was in INTAKE.
    const later = await createCampaign(t.db, {
      status: 'PREFERENCE_SELECTION',
      phaseDeadlines: { intake_end: inDays(-1), preference_end: inDays(7), testing_end: inDays(14) },
    });
    await t.db.insert(consents).values({
      studentId: student.studentId,
      campaignId: later.id,
      termsVersion: 1,
      termsSha256: '0'.repeat(64),
      acceptedAt: new Date(),
    });
    const closed = await submitCv(student.agent, later.id, fixtureFile('sample.pdf'), 'cv.pdf').expect(409);
    expect(ApiErrorSchema.parse(closed.body).code).toBe('CAMPAIGN_PHASE_MISMATCH');

    expect(await cvObjectKeys(s3, student.studentId)).toEqual([]);
  });

  it('GĐ2: student outside campaign target gets 404', async () => {
    const outsider = await loginTargetStudent(t, { major: 'Kinh tế' });
    const campaign = await createIntakeCampaign(t.db);
    const res = await submitCv(outsider.agent, campaign.id, fixtureFile('sample.pdf'), 'cv.pdf').expect(404);
    expect(ApiErrorSchema.parse(res.body).code).toBe('ENTITY_NOT_FOUND');

    // A campaign not opened yet is invisible to students, like a missing one (CONTEXT D27, D30).
    const student = await loginTargetStudent(t);
    const draft = await createCampaign(t.db);
    await submitCv(student.agent, draft.id, fixtureFile('sample.pdf'), 'cv.pdf').expect(404);

    expect(await cvObjectKeys(s3, outsider.studentId)).toEqual([]);
    expect(await cvObjectKeys(s3, student.studentId)).toEqual([]);
  });

  it('GĐ2: only students submit CVs', async () => {
    const campaign = await createIntakeCampaign(t.db);
    for (const role of ['CENTER', 'HR', 'ADMIN'] as const) {
      const { agent } = await t.loginAs(role);
      await submitCv(agent, campaign.id, fixtureFile('sample.pdf'), 'cv.pdf').expect(403);
      await agent.get(api('cvs/me')).expect(403);
    }
  });
});
