// US-2.4 AC-1, AC-9 to AC-11, AC-14 (FR-11, BR-03, NFR-3, CONTEXT D37): the student module sends
// CV_PARSE after an upload, stores the CV Parser's result with the personal data encrypted by
// pgcrypto, moves the CV with transitionTo, and tells the student and the center. Results are
// delivered as aigateway delivers them, by awaiting `ai.result.CV_PARSE`.
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApiErrorSchema, CenterCvListSchema, CvListSchema, CvSchema, SERVER_EVENTS } from '@srm/shared';
import { eq, sql } from 'drizzle-orm';
import { consents, cvs } from '../../src/db/schema/index.js';
import {
  AI_JOB_DISPATCHED,
  AI_RESULT_EVENTS,
  AiGatewayService,
  type AiJobDispatchedEvent,
  type AiResultEvent,
} from '../../src/modules/aigateway/index.js';
import { CV_ANALYSIS_SETTLED, CvAnalysisService, type CvAnalysisSettledEvent } from '../../src/modules/student/index.js';
import { cvParseFailed, cvParseSucceeded, PARSED_PII, PARSED_PII_VALUES, PARSED_PROFILE } from '../helpers/ai-results.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn } from '../helpers/auth.js';
import { acceptTerms, type LoggedInStudent, loginTargetStudent, submitCv } from '../helpers/cv.js';
import { createCv, createStudent } from '../helpers/factories.js';
import { captureEvents, createIntakeCampaign, fixtureFile } from '../helpers/jd.js';
import { notificationsOf, waitFor } from '../helpers/notifications.js';
import { listen, openEventStream } from '../helpers/sse.js';
import { auditEntries } from '../helpers/state.js';

const PII_KEY = process.env.PII_ENCRYPTION_KEY!;

describe('US-2.4: CV analysis results', () => {
  let t: AuthTestApp;
  let center: LoggedIn;
  let dispatched: AiJobDispatchedEvent<'CV_PARSE'>[];
  let settled: CvAnalysisSettledEvent[];

  beforeAll(async () => {
    t = await createAuthTestApp();
    center = await t.loginAs('CENTER');
    dispatched = captureEvents(t.app, AI_JOB_DISPATCHED);
    settled = captureEvents(t.app, CV_ANALYSIS_SETTLED);
  });

  afterAll(async () => {
    await t.close();
  });

  /** As the ai.results consumer does: awaits every listener (CONTEXT D33). */
  const deliver = (result: AiResultEvent<'CV_PARSE'>) => t.app.get(EventEmitter2).emitAsync(AI_RESULT_EVENTS.CV_PARSE, result);

  /** A logged-in target student with a CV awaiting analysis in a campaign of its own. */
  async function awaitingCv(values: Parameters<typeof createCv>[1] = {}) {
    const student = await loginTargetStudent(t);
    const campaign = await createIntakeCampaign(t.db);
    const cv = await createCv(t.db, { studentId: student.studentId, campaignId: campaign.id, ...values });
    return { student, campaign, cv };
  }

  const rowOf = async (id: number) => (await t.db.select().from(cvs).where(eq(cvs.id, id)))[0]!;

  const settledFor = (cvId: number) => waitFor(() => Promise.resolve(settled.find((event) => event.cvId === cvId)));

  /** Notifications of the users about one CV, once the async listener has written them. */
  const noticesAbout = (cvId: number, count: number, ...userIds: number[]) =>
    waitFor(async () => {
      const rows = (await notificationsOf(t.db, ...userIds)).filter((n) => (n.payload as { cvId?: number }).cvId === cvId);
      return rows.length >= count ? rows : undefined;
    });

  describe('dispatch (AC-1)', () => {
    async function readyStudent(): Promise<{ student: LoggedInStudent; campaignId: number }> {
      const student = await loginTargetStudent(t);
      const campaignId = (await createIntakeCampaign(t.db)).id;
      await acceptTerms(student.agent, campaignId).expect(200);
      return { student, campaignId };
    }

    it('GĐ2 nộp CV dispatch job CV_PARSE', async () => {
      const { student, campaignId } = await readyStudent();
      const res = await submitCv(student.agent, campaignId, fixtureFile('sample.pdf'), 'cv.pdf').expect(202);
      const cv = CvSchema.parse(res.body);
      expect(cv.status).toBe('PENDING_ANALYSIS');

      const event = await waitFor(() => Promise.resolve(dispatched.find((e) => e.job.cv_id === cv.id)));
      const row = await rowOf(cv.id);
      expect(event).toMatchObject({ type: 'CV_PARSE', job: { cv_id: cv.id, cv_version: 1, file_key: row.fileKey } });
      // IDs only: the CV itself is read from MinIO by the AI Service (AD-5).
      expect(Object.keys(event.job).sort()).toEqual(['cv_id', 'cv_version', 'file_key', 'job_id']);
      expect(row.status).toBe('PENDING_ANALYSIS');
    });

    it('GĐ2 job không gửi được thì CV lỗi phân tích ngay, SV và Trung tâm được báo', async () => {
      const gateway = t.app.get(AiGatewayService);
      const spy = jest.spyOn(gateway, 'dispatch').mockRejectedValueOnce(new Error('broker unreachable'));
      try {
        const { student, campaignId } = await readyStudent();
        const res = await submitCv(student.agent, campaignId, fixtureFile('sample.pdf'), 'cv.pdf').expect(202);
        const cv = CvSchema.parse(res.body);
        await settledFor(cv.id);
        expect(await rowOf(cv.id)).toMatchObject({ status: 'ANALYSIS_FAILED', analysisErrorCode: 'DISPATCH_FAILED' });
        const [failed] = await noticesAbout(cv.id, 1, student.user.id);
        expect(failed).toMatchObject({ type: 'CV_ANALYSIS_FAILED', channels: ['IN_APP', 'EMAIL'] });
        const [attention] = await noticesAbout(cv.id, 1, center.user.id);
        expect(attention).toMatchObject({ type: 'CV_NEEDS_ATTENTION', payload: { reason: 'ANALYSIS_FAILED' } });

        // The broker had taken the job after all: its profile still reaches the student.
        const row = await rowOf(cv.id);
        await deliver(cvParseSucceeded(row));
        expect((await rowOf(cv.id)).status).toBe('PENDING_CONFIRMATION');
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('success (AC-9)', () => {
    it('BR-03 pii mã hóa pgcrypto, audit không chứa PII, CV chuyển Chờ SV xác nhận', async () => {
      const { student, cv } = await awaitingCv();
      const stream = await openEventStream(await listen(t.app), student.accessToken);
      try {
        await stream.next((e) => e.event === SERVER_EVENTS.READY);
        await deliver(cvParseSucceeded(cv));

        const row = await rowOf(cv.id);
        expect(row).toMatchObject({
          status: 'PENDING_CONFIRMATION',
          version: 1,
          rowVersion: cv.rowVersion + 2,
          profile: PARSED_PROFILE,
          profileMasked: PARSED_PROFILE,
          maskedText: '[NAME]\nEmail: [EMAIL]\nJava, Spring Boot',
          analysisSource: 'TEXT_PDF',
          analysisModel: 'gemini-3.8-flash',
          analysisPromptVersion: 'cv_parser/v1',
          hiddenTextFlag: false,
        });
        // NFR-3: the column holds pgcrypto output, readable only with the key.
        const stored = row.pii!.toString('latin1');
        for (const value of PARSED_PII_VALUES) expect(stored).not.toContain(value);
        const decrypted = await t.db.execute<{ pii: string }>(
          sql`select pgp_sym_decrypt(pii, ${PII_KEY}) as pii from core.cvs where id = ${cv.id}`,
        );
        expect(JSON.parse(decrypted.rows[0]!.pii)).toEqual(PARSED_PII);
        await expect(
          t.db.execute(sql`select pgp_sym_decrypt(pii, ${'a-wrong-key-of-enough-length-0000'}) from core.cvs where id = ${cv.id}`),
        ).rejects.toThrow();

        // AC-9: audit in the same transaction, metadata only (newest first: the data, then the transition).
        const entries = await auditEntries(t.db, 'cv', cv.id);
        expect(entries.map((e) => [e.action, e.actorKind])).toEqual([
          ['TRANSITION', 'SYSTEM'],
          ['CV_ANALYSED', 'SYSTEM'],
        ]);
        expect(entries[0]).toMatchObject({ before: { status: 'PENDING_ANALYSIS' }, after: { status: 'PENDING_CONFIRMATION' } });
        expect(entries[1]!.after).toMatchObject({ source: 'TEXT_PDF', model: 'gemini-3.8-flash', promptVersion: 'cv_parser/v1' });
        const audit = JSON.stringify(entries);
        for (const value of PARSED_PII_VALUES) expect(audit).not.toContain(value);
        expect(audit).not.toContain('Spring Boot');

        // The student is told in the app only, and the page refreshes over SSE.
        const [ready] = await noticesAbout(cv.id, 1, student.user.id);
        expect(ready).toMatchObject({ type: 'CV_PROFILE_READY', channels: ['IN_APP'] });
        const event = await stream.next((e) => e.event === SERVER_EVENTS.CV_ANALYSIS);
        expect(event.data).toEqual({ cvId: cv.id, status: 'PENDING_CONFIRMATION' });
      } finally {
        stream.close();
      }
    });

    it('GĐ2 CV có chữ ẩn: lưu cờ, Trung tâm được báo dù phân tích được', async () => {
      const { student, cv } = await awaitingCv();
      await deliver(cvParseSucceeded(cv, { hidden_text_detected: true }));
      expect(await rowOf(cv.id)).toMatchObject({ status: 'PENDING_CONFIRMATION', hiddenTextFlag: true });
      const [attention] = await noticesAbout(cv.id, 1, center.user.id);
      expect(attention).toMatchObject({ type: 'CV_NEEDS_ATTENTION', channels: ['IN_APP'], payload: { reason: 'HIDDEN_TEXT' } });
      expect((await noticesAbout(cv.id, 1, student.user.id)).map((n) => n.type)).toEqual(['CV_PROFILE_READY']);
    });

    it('GĐ2 a scan stores no masked text', async () => {
      const { cv } = await awaitingCv();
      await deliver(cvParseSucceeded(cv, { source: 'SCANNED_PDF', masked_text: null }));
      expect(await rowOf(cv.id)).toMatchObject({ status: 'PENDING_CONFIRMATION', analysisSource: 'SCANNED_PDF', maskedText: null });
    });
  });

  describe('duplicates and replaced versions (AC-10)', () => {
    it('GĐ2 bỏ qua kết quả trùng hoặc của phiên bản cũ', async () => {
      const { student, cv } = await awaitingCv();
      const result = cvParseSucceeded(cv);
      await deliver(result);
      const after = await rowOf(cv.id);
      await deliver(result);
      await deliver(cvParseFailed(cv));
      expect(await rowOf(cv.id)).toEqual(after);
      expect(await auditEntries(t.db, 'cv', cv.id)).toHaveLength(2);

      // A newer upload replaced this version: its late result changes nothing.
      const old = await createCv(t.db, { studentId: student.studentId, active: false, version: 1 });
      await deliver(cvParseSucceeded(old));
      await deliver(cvParseFailed(old));
      expect(await rowOf(old.id)).toEqual(old);
      expect(await auditEntries(t.db, 'cv', old.id)).toEqual([]);

      // A result naming another version of the row is not this CV's.
      const other = await awaitingCv();
      await deliver(cvParseSucceeded({ ...other.cv, version: 2 }));
      expect(await rowOf(other.cv.id)).toEqual(other.cv);
    });
  });

  describe('failure (AC-11)', () => {
    it('GĐ2 phân tích lỗi chuyển trạng thái lỗi và báo SV', async () => {
      const { student, campaign, cv } = await awaitingCv();
      await deliver(cvParseFailed(cv, { code: 'LLM_REFUSED', hidden_text_detected: true }));

      expect(await rowOf(cv.id)).toMatchObject({
        status: 'ANALYSIS_FAILED',
        analysisErrorCode: 'LLM_REFUSED',
        hiddenTextFlag: true,
        profile: null,
        pii: null,
      });
      const [transition, entry] = await auditEntries(t.db, 'cv', cv.id);
      expect(entry).toMatchObject({ action: 'CV_ANALYSIS_FAILED', reason: 'CV analysis failed: LLM_REFUSED' });
      expect(transition).toMatchObject({ action: 'TRANSITION', after: { status: 'ANALYSIS_FAILED' } });

      // The student is asked to upload again, in the app and by email; the center is told.
      const [failed] = await noticesAbout(cv.id, 1, student.user.id);
      expect(failed).toMatchObject({ type: 'CV_ANALYSIS_FAILED', channels: ['IN_APP', 'EMAIL'] });
      expect(failed!.payload).toEqual({ cvId: cv.id, campaignId: campaign.id, campaignName: campaign.name });
      await noticesAbout(cv.id, 1, center.user.id);

      // The student sees "Lỗi phân tích" on the CV.
      const mine = await student.agent.get(api('cvs/me')).query({ campaignId: campaign.id }).expect(200);
      expect(CvListSchema.parse(mine.body).items[0]).toMatchObject({ id: cv.id, status: 'ANALYSIS_FAILED' });
    });

    it('GĐ2 kết quả không đúng CV được coi là lỗi', async () => {
      const { cv } = await awaitingCv();
      const result = cvParseSucceeded(cv);
      await deliver({ ...result, result: { ...result.result!, cv_id: cv.id + 100_000 } });
      expect(await rowOf(cv.id)).toMatchObject({ status: 'ANALYSIS_FAILED', analysisErrorCode: 'INVALID_RESULT' });
    });

    it('GĐ2 Trung tâm thấy CV cần xử lý; HR và SV nhận 403', async () => {
      const { campaign, cv, student } = await awaitingCv();
      await deliver(cvParseFailed(cv, { code: 'CV_NO_TEXT' }));
      const fine = await createCv(t.db, { campaignId: campaign.id, status: 'PENDING_CONFIRMATION' });
      const hidden = await createCv(t.db, { campaignId: campaign.id, status: 'PENDING_CONFIRMATION', hiddenTextFlag: true });

      const all = CenterCvListSchema.parse(
        (await center.agent.get(api('cvs')).query({ campaignId: campaign.id }).expect(200)).body,
      );
      expect(all.items.map((item) => item.id).sort()).toEqual([cv.id, fine.id, hidden.id].sort());
      const attention = CenterCvListSchema.parse(
        (await center.agent.get(api('cvs')).query({ campaignId: campaign.id, attention: 'true' }).expect(200)).body,
      );
      expect(attention.items.map((item) => item.id).sort()).toEqual([cv.id, hidden.id].sort());
      expect(attention.items.find((item) => item.id === cv.id)).toMatchObject({
        studentId: student.studentId,
        status: 'ANALYSIS_FAILED',
        analysisErrorCode: 'CV_NO_TEXT',
        hiddenTextDetected: false,
      });
      expect(attention.items.find((item) => item.id === hidden.id)).toMatchObject({
        hiddenTextDetected: true,
        analysisErrorCode: null,
      });

      const hr = await t.loginAs('HR');
      for (const agent of [hr.agent, student.agent]) {
        const res = await agent.get(api('cvs')).expect(403);
        expect(ApiErrorSchema.parse(res.body).code).toBe('FORBIDDEN');
      }
      await center.agent.get(api('cvs')).query({ attention: 'yes' }).expect(400);
    });
  });

  describe('re-dispatch command (TASK-2.4.5.1)', () => {
    it('GĐ2 chạy bù gửi job cho CV đang chờ, --retry-failed gửi lại CV lỗi', async () => {
      const campaign = await createIntakeCampaign(t.db);
      const pending = await createCv(t.db, { campaignId: campaign.id });
      const failed = await createCv(t.db, { campaignId: campaign.id, status: 'ANALYSIS_FAILED' });
      const replaced = await createCv(t.db, { campaignId: campaign.id, active: false });
      const service = t.app.get(CvAnalysisService);
      const sentFor = (id: number) => dispatched.filter((event) => event.job.cv_id === id).length;

      expect(await service.redispatchPending({ campaignId: campaign.id, retryFailed: false })).toEqual({
        dispatched: 1,
        failed: 0,
      });
      expect([sentFor(pending.id), sentFor(failed.id), sentFor(replaced.id)]).toEqual([1, 0, 0]);

      expect(await service.redispatchPending({ campaignId: campaign.id, retryFailed: true })).toEqual({
        dispatched: 2,
        failed: 0,
      });
      expect([sentFor(pending.id), sentFor(failed.id), sentFor(replaced.id)]).toEqual([2, 1, 0]);
      expect((await rowOf(failed.id)).status).toBe('PENDING_ANALYSIS');
      const [entry] = await auditEntries(t.db, 'cv', failed.id);
      expect(entry).toMatchObject({ action: 'TRANSITION', actorKind: 'SYSTEM', reason: 'Analysis re-dispatched by command' });
    });
  });

  describe('terms v2 (AC-14)', () => {
    it('NFR-2 đồng ý điều khoản v1 không còn đủ để nộp CV', async () => {
      const student = await loginTargetStudent(t);
      const campaign = await createIntakeCampaign(t.db);
      await t.db.insert(consents).values({
        studentId: student.studentId,
        campaignId: campaign.id,
        termsVersion: 1,
        termsSha256: '54964d1e5eb5f8ffc8b080f222f59512be1a9479df8bec8ada1a37221bc817d2',
        acceptedAt: new Date(),
      });
      const res = await submitCv(student.agent, campaign.id, fixtureFile('sample.pdf'), 'cv.pdf').expect(403);
      expect(ApiErrorSchema.parse(res.body)).toMatchObject({ code: 'CONSENT_REQUIRED' });

      await acceptTerms(student.agent, campaign.id, 2).expect(200);
      await submitCv(student.agent, campaign.id, fixtureFile('sample.pdf'), 'cv.pdf').expect(202);
    });
  });

  it('GĐ2 a student without an account still gets the analysis stored', async () => {
    const student = await createStudent(t.db);
    const cv = await createCv(t.db, { studentId: student.id });
    await deliver(cvParseSucceeded(cv));
    await settledFor(cv.id);
    expect((await rowOf(cv.id)).status).toBe('PENDING_CONFIRMATION');
  });
});
