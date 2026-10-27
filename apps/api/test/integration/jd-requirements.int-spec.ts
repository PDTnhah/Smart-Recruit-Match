// US-2.3 (FR-9, FR-10, BR-02, BR-11, BR-18, CONTEXT D35): results of the JD Analyzer, HR's
// confirmation of the normalised requirements and their versions once a JD is approved.
// Results are delivered as aigateway delivers them, by awaiting `ai.result.JD_ANALYZE`.
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ApiErrorSchema,
  type JdRequirements,
  JdRequirementsViewSchema,
  JobDescriptionSchema,
  SERVER_EVENTS,
} from '@srm/shared';
import { eq } from 'drizzle-orm';
import { Client } from 'pg';
import { jobDescriptions } from '../../src/db/schema/index.js';
import {
  AI_JOB_DISPATCHED,
  AI_RESULT_EVENTS,
  AiGatewayService,
  type AiJobDispatchedEvent,
  type AiResultEvent,
} from '../../src/modules/aigateway/index.js';
import { JD_REQUIREMENTS_VERSIONED, type JdRequirementsVersionedEvent } from '../../src/modules/company/index.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn } from '../helpers/auth.js';
import { aiDatabaseUrl } from '../helpers/db.js';
import { createCampaign } from '../helpers/factories.js';
import { createTwoCompanyFixture, type TwoCompanyFixture } from '../helpers/fixtures.js';
import { captureEvents, createIntakeCampaign, createJdInState, inDays, jdBody, SAMPLE_REQUIREMENTS } from '../helpers/jd.js';
import { notificationsOf, waitFor } from '../helpers/notifications.js';
import { listen, openEventStream } from '../helpers/sse.js';
import { auditEntries, readState } from '../helpers/state.js';

const JOB_ID = '0b6f4f2c-1d1e-4c3a-9f2b-7a8e5d4c3b2a';

const PROPOSED: JdRequirements = {
  must_have: [
    { skill: 'Java', level: 'ADVANCED', weight: 5 },
    { skill: 'Spring Boot', level: 'INTERMEDIATE', weight: 4 },
  ],
  nice_to_have: [{ skill: 'Docker', level: 'BASIC', weight: 2 }],
  hard_conditions: { majors: ['Công nghệ thông tin'], min_study_year: 3, min_gpa: null, required_languages: [] },
};

const TYPED_BY_HR: JdRequirements = {
  must_have: [{ skill: 'SQL', level: 'BASIC', weight: 3 }],
  nice_to_have: [],
  hard_conditions: { majors: [], min_study_year: null, min_gpa: 2.5, required_languages: ['Tiếng Anh (TOEIC 500)'] },
};

describe('US-2.3: JD analysis and requirement confirmation', () => {
  let t: AuthTestApp;
  let fx: TwoCompanyFixture;
  let center: LoggedIn;
  let intakeCampaignId: number;
  let testingCampaignId: number;
  let dispatched: AiJobDispatchedEvent<'JD_ANALYZE'>[];
  let versioned: JdRequirementsVersionedEvent[];

  beforeAll(async () => {
    t = await createAuthTestApp();
    fx = await createTwoCompanyFixture(t);
    center = await t.loginAs('CENTER');
    intakeCampaignId = (await createIntakeCampaign(t.db)).id;
    testingCampaignId = (
      await createCampaign(t.db, {
        status: 'TESTING',
        phaseDeadlines: { intake_end: inDays(-14), preference_end: inDays(-7), testing_end: inDays(7) },
      })
    ).id;
    dispatched = captureEvents(t.app, AI_JOB_DISPATCHED);
    versioned = captureEvents(t.app, JD_REQUIREMENTS_VERSIONED);
  });

  afterAll(async () => {
    await t.close();
  });

  /** A submitted JD of company A whose analysis is awaited. */
  const awaitingAnalysis = () =>
    createJdInState(t.db, {
      companyId: fx.companyA.id,
      campaignId: intakeCampaignId,
      status: 'PENDING_HR_CONFIRMATION',
      analysisStatus: 'PENDING',
    });

  const succeeded = (jdId: number, version = 1, requirements: unknown = PROPOSED): AiResultEvent<'JD_ANALYZE'> =>
    ({
      job_id: JOB_ID,
      type: 'JD_ANALYZE',
      status: 'SUCCEEDED',
      job: { job_id: JOB_ID, jd_id: jdId, jd_version: version },
      result: {
        prompt_version: 'jd_analyzer/v1',
        model: 'gemini-3.8-flash',
        jd_id: jdId,
        jd_version: version,
        requirements,
        position_group: 'BACKEND',
        new_skills: [],
        hidden_text_detected: true,
      },
      error: null,
    }) as AiResultEvent<'JD_ANALYZE'>;

  const failed = (jdId: number, version = 1): AiResultEvent<'JD_ANALYZE'> => ({
    job_id: JOB_ID,
    type: 'JD_ANALYZE',
    status: 'FAILED',
    job: { job_id: JOB_ID, jd_id: jdId, jd_version: version },
    result: null,
    error: { code: 'LLM_REFUSED', message: 'refused', needs_human: true },
  });

  /** As the ai.results consumer does: awaits every listener (CONTEXT D33). */
  const deliver = (result: AiResultEvent<'JD_ANALYZE'>) =>
    t.app.get(EventEmitter2).emitAsync(AI_RESULT_EVENTS.JD_ANALYZE, result);

  const analysisOf = async (id: number) => {
    const [row] = await t.db
      .select({
        status: jobDescriptions.status,
        version: jobDescriptions.version,
        rowVersion: jobDescriptions.rowVersion,
        requirements: jobDescriptions.requirements,
        positionGroup: jobDescriptions.positionGroup,
        analysisStatus: jobDescriptions.analysisStatus,
        analysisModel: jobDescriptions.analysisModel,
        analysisPromptVersion: jobDescriptions.analysisPromptVersion,
        hiddenTextFlag: jobDescriptions.hiddenTextFlag,
      })
      .from(jobDescriptions)
      .where(eq(jobDescriptions.id, id));
    return row!;
  };

  const getRequirements = (agent: LoggedIn['agent'], id: number) => agent.get(api(`jds/${id}/requirements`));
  const save = (agent: LoggedIn['agent'], id: number, body: object) => agent.put(api(`jds/${id}/requirements`)).send(body);
  const confirm = (agent: LoggedIn['agent'], id: number, body: object) =>
    agent.put(api(`jds/${id}/requirements/confirm`)).send(body);

  describe('analysis (AC-1, AC-4 to AC-6)', () => {
    it('GĐ1 gửi JD đặt PENDING và dispatch job JD_ANALYZE', async () => {
      const created = JobDescriptionSchema.parse(
        (await fx.hrA.agent.post(api('jds')).send(jdBody(intakeCampaignId)).expect(201)).body,
      );
      const res = await fx.hrA.agent.post(api(`jds/${created.id}/submit`)).send({ rowVersion: created.rowVersion }).expect(200);
      expect(JobDescriptionSchema.parse(res.body)).toMatchObject({
        status: 'PENDING_HR_CONFIRMATION',
        analysisStatus: 'PENDING',
        requirementsReady: false,
      });
      const event = await waitFor(() => Promise.resolve(dispatched.find((e) => e.job.jd_id === created.id)));
      expect(event).toMatchObject({ type: 'JD_ANALYZE', job: { jd_id: created.id, jd_version: 1 } });
      expect(Object.keys(event.job).sort()).toEqual(['jd_id', 'jd_version', 'job_id']);
    });

    it('GĐ1 job không gửi được thì phân tích lỗi ngay, HR được báo', async () => {
      const gateway = t.app.get(AiGatewayService);
      const spy = jest.spyOn(gateway, 'dispatch').mockRejectedValueOnce(new Error('broker unreachable'));
      try {
        const created = JobDescriptionSchema.parse(
          (await fx.hrA.agent.post(api('jds')).send(jdBody(intakeCampaignId)).expect(201)).body,
        );
        await fx.hrA.agent.post(api(`jds/${created.id}/submit`)).send({ rowVersion: created.rowVersion }).expect(200);
        await waitFor(async () => ((await analysisOf(created.id)).analysisStatus === 'FAILED' ? true : undefined));
        const [entry] = await auditEntries(t.db, 'job_description', created.id);
        expect(entry).toMatchObject({ action: 'JD_ANALYSIS_FAILED', actorKind: 'SYSTEM', reason: 'JD analysis failed: DISPATCH_FAILED' });
        const notices = await notificationsOf(t.db, fx.hrA.user.id);
        expect(notices.some((n) => n.type === 'JD_ANALYSIS_FAILED' && n.payload.jdId === created.id)).toBe(true);

        // The broker had taken the job after all: its proposal still reaches HR.
        await deliver(succeeded(created.id));
        expect(await analysisOf(created.id)).toMatchObject({ analysisStatus: 'SUCCEEDED', requirements: PROPOSED });
        const types = (await notificationsOf(t.db, fx.hrA.user.id))
          .filter((n) => n.payload.jdId === created.id)
          .map((n) => n.type);
        expect(types).toEqual(['JD_ANALYSIS_FAILED', 'JD_REQUIREMENTS_READY']);
      } finally {
        spy.mockRestore();
      }
    });

    it('GĐ1 kết quả AI lưu yêu cầu, giữ trạng thái, có audit và thông báo', async () => {
      const jd = await awaitingAnalysis();
      const stream = await openEventStream(await listen(t.app), fx.hrA.accessToken);
      try {
        await stream.next((e) => e.event === SERVER_EVENTS.READY);
        await deliver(succeeded(jd.id));

        expect(await analysisOf(jd.id)).toEqual({
          status: 'PENDING_HR_CONFIRMATION',
          version: 1,
          rowVersion: jd.rowVersion + 1,
          requirements: PROPOSED,
          positionGroup: 'BACKEND',
          analysisStatus: 'SUCCEEDED',
          analysisModel: 'gemini-3.8-flash',
          analysisPromptVersion: 'jd_analyzer/v1',
          hiddenTextFlag: true,
        });
        const entries = await auditEntries(t.db, 'job_description', jd.id);
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({
          action: 'JD_REQUIREMENTS_PROPOSED',
          actorKind: 'SYSTEM',
          after: { requirements: PROPOSED, analysisModel: 'gemini-3.8-flash', analysisPromptVersion: 'jd_analyzer/v1', jobId: JOB_ID },
        });
        const [notice] = (await notificationsOf(t.db, fx.hrA.user.id)).filter((n) => n.payload.jdId === jd.id);
        expect(notice).toMatchObject({ type: 'JD_REQUIREMENTS_READY', channels: ['IN_APP'], emailStatus: null });
        expect((await notificationsOf(t.db, fx.hrB.user.id)).some((n) => n.payload.jdId === jd.id)).toBe(false);
        const pushed = await stream.next((e) => e.event === SERVER_EVENTS.JD_ANALYSIS);
        expect(pushed.data).toEqual({ jdId: jd.id, analysisStatus: 'SUCCEEDED' });
      } finally {
        stream.close();
      }

      const view = JdRequirementsViewSchema.parse((await getRequirements(fx.hrA.agent, jd.id).expect(200)).body);
      expect(view).toMatchObject({ requirements: PROPOSED, positionGroup: 'BACKEND', editMode: 'IN_PLACE', canConfirm: true });
      expect(JobDescriptionSchema.parse((await fx.hrA.agent.get(api(`jds/${jd.id}`)).expect(200)).body)).toMatchObject({
        requirementsReady: true,
        hiddenTextDetected: true,
      });
    });

    it('GĐ1 bỏ qua kết quả trùng, phiên bản cũ hoặc đến sau khi HR nhập tay', async () => {
      const duplicate = await awaitingAnalysis();
      await deliver(succeeded(duplicate.id));
      await deliver(succeeded(duplicate.id));
      await deliver(failed(duplicate.id));
      expect((await analysisOf(duplicate.id)).rowVersion).toBe(duplicate.rowVersion + 1);
      expect(await auditEntries(t.db, 'job_description', duplicate.id)).toHaveLength(1);

      const stale = await awaitingAnalysis();
      await deliver(succeeded(stale.id, 2));
      expect(await analysisOf(stale.id)).toMatchObject({ analysisStatus: 'PENDING', requirements: null, rowVersion: stale.rowVersion });
      expect(await auditEntries(t.db, 'job_description', stale.id)).toHaveLength(0);

      const typed = await awaitingAnalysis();
      await save(fx.hrA.agent, typed.id, { rowVersion: typed.rowVersion, requirements: TYPED_BY_HR, positionGroup: 'DATA_AI' }).expect(200);
      await deliver(succeeded(typed.id));
      expect(await analysisOf(typed.id)).toMatchObject({ requirements: TYPED_BY_HR, positionGroup: 'DATA_AI', analysisModel: null });
      expect((await auditEntries(t.db, 'job_description', typed.id)).map((e) => e.action)).toEqual(['JD_REQUIREMENTS_UPDATED']);
    });

    it('AC-12 a failed analysis of a file with hidden text still flags the JD for the center', async () => {
      const jd = await awaitingAnalysis();
      const result = failed(jd.id);
      await deliver({ ...result, error: { ...result.error!, hidden_text_detected: true } });
      expect(await analysisOf(jd.id)).toMatchObject({ analysisStatus: 'FAILED', hiddenTextFlag: true });
      const view = JdRequirementsViewSchema.parse((await getRequirements(center.agent, jd.id).expect(200)).body);
      expect(view.hiddenTextDetected).toBe(true);
    });

    it('GĐ1 kết quả có kỹ năng trùng giữa hai nhóm bị coi là lỗi, HR nhập tay', async () => {
      const jd = await awaitingAnalysis();
      const duplicated = { ...PROPOSED, nice_to_have: [{ skill: 'java', level: 'BASIC', weight: 1 }] };
      await deliver(succeeded(jd.id, 1, duplicated));
      expect(await analysisOf(jd.id)).toMatchObject({ analysisStatus: 'FAILED', requirements: null });
    });

    it('GĐ1 phân tích lỗi đặt FAILED, HR nhập tay và xác nhận được', async () => {
      const jd = await awaitingAnalysis();
      await deliver(failed(jd.id));
      expect(await analysisOf(jd.id)).toMatchObject({
        status: 'PENDING_HR_CONFIRMATION',
        analysisStatus: 'FAILED',
        requirements: null,
        hiddenTextFlag: false,
      });
      const notices = (await notificationsOf(t.db, fx.hrA.user.id)).filter((n) => n.payload.jdId === jd.id);
      expect(notices.map((n) => n.type)).toEqual(['JD_ANALYSIS_FAILED']);

      const view = JdRequirementsViewSchema.parse((await getRequirements(fx.hrA.agent, jd.id).expect(200)).body);
      expect(view).toMatchObject({ requirements: null, analysisStatus: 'FAILED', canConfirm: true });
      await confirm(fx.hrA.agent, jd.id, { rowVersion: view.rowVersion, requirements: TYPED_BY_HR, positionGroup: 'OTHER' }).expect(200);
      expect(await analysisOf(jd.id)).toMatchObject({ status: 'PENDING_APPROVAL', requirements: TYPED_BY_HR, positionGroup: 'OTHER' });
    });
  });

  describe('confirmation (AC-7 to AC-10)', () => {
    it('BR-02 HR xác nhận chuyển Chờ Trung tâm duyệt, audit cùng giao dịch', async () => {
      const jd = await awaitingAnalysis();
      await deliver(succeeded(jd.id));
      const edited: JdRequirements = { ...PROPOSED, must_have: [{ skill: 'Java', level: 'INTERMEDIATE', weight: 4 }] };
      const res = await confirm(fx.hrA.agent, jd.id, {
        rowVersion: jd.rowVersion + 1,
        requirements: edited,
        positionGroup: 'BACKEND',
      }).expect(200);
      expect(JdRequirementsViewSchema.parse(res.body)).toMatchObject({
        status: 'PENDING_APPROVAL',
        requirements: edited,
        editMode: 'READ_ONLY',
        canConfirm: false,
      });
      const [transition, confirmed] = await auditEntries(t.db, 'job_description', jd.id);
      expect(transition).toMatchObject({
        action: 'TRANSITION',
        actorId: fx.hrA.user.id,
        before: { status: 'PENDING_HR_CONFIRMATION' },
        after: { status: 'PENDING_APPROVAL' },
      });
      expect(confirmed).toMatchObject({
        action: 'JD_REQUIREMENTS_CONFIRMED',
        actorId: fx.hrA.user.id,
        before: { requirements: PROPOSED },
        after: { requirements: edited },
      });
    });

    it('GĐ1 409 khi row_version cũ', async () => {
      const jd = await awaitingAnalysis();
      await deliver(succeeded(jd.id)); // the AI result bumped row_version under HR's open form
      const res = await confirm(fx.hrA.agent, jd.id, {
        rowVersion: jd.rowVersion,
        requirements: TYPED_BY_HR,
        positionGroup: 'BACKEND',
      }).expect(409);
      expect(ApiErrorSchema.parse(res.body).code).toBe('ROW_VERSION_CONFLICT');
      expect(await analysisOf(jd.id)).toMatchObject({ status: 'PENDING_HR_CONFIRMATION', requirements: PROPOSED });
      expect(await auditEntries(t.db, 'job_description', jd.id)).toHaveLength(1);
    });

    it('GĐ1 the API validates with the shared schema: a skill in both groups is 400 (AC-7)', async () => {
      const jd = await awaitingAnalysis();
      const body = {
        rowVersion: jd.rowVersion,
        requirements: { ...TYPED_BY_HR, nice_to_have: [{ skill: ' sql ', level: 'BASIC', weight: 1 }] },
        positionGroup: 'BACKEND',
      };
      const res = await confirm(fx.hrA.agent, jd.id, body).expect(400);
      expect(ApiErrorSchema.parse(res.body).code).toBe('VALIDATION_FAILED');
      expect((await readState(t.db, 'jobDescription', jd.id)).status).toBe('PENDING_HR_CONFIRMATION');
    });

    it('GĐ1 HR không sửa yêu cầu khi đợt đã rời INTAKE', async () => {
      const jd = await createJdInState(t.db, {
        companyId: fx.companyA.id,
        campaignId: testingCampaignId,
        status: 'PENDING_HR_CONFIRMATION',
        analysisStatus: 'FAILED',
      });
      const res = await save(fx.hrA.agent, jd.id, { rowVersion: jd.rowVersion, requirements: TYPED_BY_HR, positionGroup: 'BA' }).expect(409);
      expect(ApiErrorSchema.parse(res.body)).toMatchObject({
        code: 'JD_REQUIREMENTS_NOT_EDITABLE',
        details: { reasonCode: 'CAMPAIGN_NOT_IN_INTAKE' },
      });
    });

    it('BR-11 HR công ty khác nhận 404, sinh viên nhận 403, chưa đăng nhập 401', async () => {
      const jd = await awaitingAnalysis();
      await deliver(succeeded(jd.id));
      const body = { rowVersion: jd.rowVersion + 1, requirements: TYPED_BY_HR, positionGroup: 'BACKEND' };

      for (const res of [
        await getRequirements(fx.hrB.agent, jd.id),
        await save(fx.hrB.agent, jd.id, body),
        await confirm(fx.hrB.agent, jd.id, body),
      ]) {
        expect(res.status).toBe(404);
        expect(JSON.stringify(res.body)).not.toContain('Spring Boot');
      }
      await getRequirements(fx.studentX.agent, jd.id).expect(403);
      await confirm(fx.studentX.agent, jd.id, body).expect(403);
      await t.http().get(api(`jds/${jd.id}/requirements`)).expect(401);

      // The center reads, but never edits or confirms for HR (AC-9).
      const view = JdRequirementsViewSchema.parse((await getRequirements(center.agent, jd.id).expect(200)).body);
      expect(view).toMatchObject({ requirements: PROPOSED, editMode: 'READ_ONLY', canConfirm: false });
      await confirm(center.agent, jd.id, body).expect(403);
      const res = await save(center.agent, jd.id, body).expect(409);
      expect(ApiErrorSchema.parse(res.body).details).toMatchObject({ reasonCode: 'REQUIREMENTS_CONFIRMED_BY_HR' });
      expect(await analysisOf(jd.id)).toMatchObject({ requirements: PROPOSED, rowVersion: jd.rowVersion + 1 });
    });

    it('BR-02 JD chưa xác nhận hoặc chưa duyệt không có trong v_ai_jd_requirements', async () => {
      const ai = new Client({ connectionString: aiDatabaseUrl() });
      await ai.connect();
      try {
        const visible = async (id: number) =>
          (await ai.query('SELECT 1 FROM core.v_ai_jd_requirements WHERE jd_id = $1', [id])).rowCount === 1;

        const jd = await awaitingAnalysis();
        await deliver(succeeded(jd.id));
        expect(await visible(jd.id)).toBe(false);
        const confirmed = JdRequirementsViewSchema.parse(
          (await confirm(fx.hrA.agent, jd.id, { rowVersion: jd.rowVersion + 1, requirements: PROPOSED, positionGroup: 'BACKEND' }).expect(200))
            .body,
        );
        expect(await visible(jd.id)).toBe(false);
        await center.agent.post(api(`jds/${jd.id}/approve`)).send({ rowVersion: confirmed.rowVersion }).expect(200);
        expect(await visible(jd.id)).toBe(true);
        const { rows } = await ai.query<{ requirements: unknown; version: number }>(
          'SELECT requirements, version FROM core.v_ai_jd_requirements WHERE jd_id = $1',
          [jd.id],
        );
        expect(rows).toEqual([{ requirements: PROPOSED, version: 1 }]);
      } finally {
        await ai.end();
      }
    });
  });

  describe('versions (AC-11, BR-18)', () => {
    const approvedJd = () =>
      createJdInState(t.db, {
        companyId: fx.companyA.id,
        campaignId: testingCampaignId,
        status: 'APPROVED',
        requirements: SAMPLE_REQUIREMENTS,
      });

    it('BR-18 sửa JD đã duyệt tạo phiên bản mới và phát sự kiện', async () => {
      const jd = await approvedJd();
      const res = await save(fx.hrA.agent, jd.id, {
        rowVersion: jd.rowVersion,
        requirements: TYPED_BY_HR,
        positionGroup: 'DATA_AI',
      }).expect(200);
      expect(JdRequirementsViewSchema.parse(res.body)).toMatchObject({
        status: 'APPROVED',
        version: 2,
        requirements: TYPED_BY_HR,
        editMode: 'NEW_VERSION',
      });
      const [entry] = await auditEntries(t.db, 'job_description', jd.id);
      expect(entry).toMatchObject({
        action: 'JD_REQUIREMENTS_VERSIONED',
        actorId: fx.hrA.user.id,
        before: { version: 1, requirements: SAMPLE_REQUIREMENTS },
        after: { version: 2, requirements: TYPED_BY_HR, positionGroup: 'DATA_AI' },
      });
      expect(versioned).toContainEqual({
        jdId: jd.id,
        campaignId: testingCampaignId,
        companyId: fx.companyA.id,
        fromVersion: 1,
        toVersion: 2,
      });
      const notices = (await notificationsOf(t.db, center.user.id)).filter((n) => n.payload.jdId === jd.id);
      expect(notices).toMatchObject([{ type: 'JD_REQUIREMENTS_VERSIONED', payload: { version: 2 } }]);
    });

    it('BR-18 the center versions an approved JD too; an unchanged save writes nothing', async () => {
      const jd = await approvedJd();
      const first = JdRequirementsViewSchema.parse(
        (await save(center.agent, jd.id, { rowVersion: jd.rowVersion, requirements: TYPED_BY_HR, positionGroup: 'BA' }).expect(200))
          .body,
      );
      expect(first.version).toBe(2);
      const again = JdRequirementsViewSchema.parse(
        (await save(center.agent, jd.id, { rowVersion: first.rowVersion, requirements: TYPED_BY_HR, positionGroup: 'BA' }).expect(200))
          .body,
      );
      expect([again.version, again.rowVersion]).toEqual([2, first.rowVersion]);
      expect(await auditEntries(t.db, 'job_description', jd.id)).toHaveLength(1);
    });

    it('BR-18 sửa trước khi mở test không tăng phiên bản', async () => {
      const jd = await awaitingAnalysis();
      await deliver(succeeded(jd.id));
      const res = await save(fx.hrA.agent, jd.id, {
        rowVersion: jd.rowVersion + 1,
        requirements: TYPED_BY_HR,
        positionGroup: 'BACKEND',
      }).expect(200);
      expect(JdRequirementsViewSchema.parse(res.body)).toMatchObject({ version: 1, requirements: TYPED_BY_HR });
      expect((await auditEntries(t.db, 'job_description', jd.id))[0]).toMatchObject({
        action: 'JD_REQUIREMENTS_UPDATED',
        before: { requirements: PROPOSED, version: 1 },
        after: { requirements: TYPED_BY_HR, version: 1 },
      });
      expect(versioned.some((e) => e.jdId === jd.id)).toBe(false);
    });

    it('BR-18 a JD awaiting approval or closed is read only', async () => {
      for (const status of ['PENDING_APPROVAL', 'CLOSED'] as const) {
        const jd = await createJdInState(t.db, { companyId: fx.companyA.id, campaignId: intakeCampaignId, status });
        const res = await save(fx.hrA.agent, jd.id, { rowVersion: jd.rowVersion, requirements: TYPED_BY_HR, positionGroup: 'BA' }).expect(409);
        expect(ApiErrorSchema.parse(res.body).code).toBe('JD_REQUIREMENTS_NOT_EDITABLE');
      }
    });
  });
});
