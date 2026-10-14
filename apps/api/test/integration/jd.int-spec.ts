// US-1.5 AC-4, AC-6 (FR-4, PRD GĐ1): HR posts a JD as a draft, edits it and submits it.
import { ApiErrorSchema, type JobDescription, JobDescriptionSchema } from '@srm/shared';
import { JD_SUBMITTED, type JdEvent } from '../../src/modules/company/index.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn } from '../helpers/auth.js';
import { createCampaign, createCompany } from '../helpers/factories.js';
import { captureEvents, createIntakeCampaign, inDays, jdBody } from '../helpers/jd.js';
import { auditEntries, readState } from '../helpers/state.js';

describe('GĐ1: JD posting and submission (US-1.5 AC-4, AC-6)', () => {
  let t: AuthTestApp;
  let hr: LoggedIn;
  let companyId: number;
  let campaignId: number;
  let submitted: JdEvent[];

  beforeAll(async () => {
    t = await createAuthTestApp();
    companyId = (await createCompany(t.db)).id;
    campaignId = (await createIntakeCampaign(t.db)).id;
    hr = await t.loginAs('HR', { companyId });
    submitted = captureEvents<JdEvent>(t.app, JD_SUBMITTED);
  });

  afterAll(async () => {
    await t.close();
  });

  async function createDraft(overrides: Record<string, unknown> = {}): Promise<JobDescription> {
    const res = await hr.agent.post(api('jds')).send(jdBody(campaignId, overrides)).expect(201);
    return JobDescriptionSchema.parse(res.body);
  }

  it('GĐ1: HR creates JD in DRAFT with company from token', async () => {
    const other = await createCompany(t.db);
    const jd = await createDraft({ companyId: other.id });
    expect(jd).toMatchObject({
      campaignId,
      companyId,
      title: 'Thực tập sinh Backend',
      quota: 3,
      location: 'Hà Nội',
      workMode: 'HYBRID',
      internshipPeriod: '01/2027 – 04/2027',
      allowance: '3 triệu/tháng',
      description: 'Phát triển API bằng NestJS.',
      file: null,
      status: 'DRAFT',
      version: 1,
      rowVersion: 0,
      requirementsReady: false,
    });
    const [entry] = await auditEntries(t.db, 'job_description', jd.id);
    expect(entry).toMatchObject({ action: 'JD_CREATED', actorId: hr.user.id });
  });

  it('GĐ1: creating JD outside INTAKE returns 409 CAMPAIGN_PHASE_MISMATCH', async () => {
    const ended = await createCampaign(t.db, {
      status: 'INTAKE',
      phaseDeadlines: { intake_end: inDays(-1), preference_end: inDays(6), testing_end: inDays(13) },
    });
    const later = await createCampaign(t.db, {
      status: 'PREFERENCE_SELECTION',
      phaseDeadlines: { intake_end: inDays(-1), preference_end: inDays(6), testing_end: inDays(13) },
    });
    for (const campaign of [ended, later]) {
      const res = await hr.agent.post(api('jds')).send(jdBody(campaign.id)).expect(409);
      expect(ApiErrorSchema.parse(res.body).code).toBe('CAMPAIGN_PHASE_MISMATCH');
    }
  });

  it('GĐ1: a draft or missing campaign answers 404 alike, so HR learns nothing about it (CONTEXT D27)', async () => {
    const draft = await createCampaign(t.db, { status: 'DRAFT' });
    for (const id of [draft.id, 999_999_999]) {
      const res = await hr.agent.post(api('jds')).send(jdBody(id)).expect(404);
      expect(ApiErrorSchema.parse(res.body)).toMatchObject({ code: 'ENTITY_NOT_FOUND', details: { entity: 'campaign', id } });
    }
  });

  it('GĐ1: invalid JD fields return 400; only HR creates JDs', async () => {
    await hr.agent.post(api('jds')).send(jdBody(campaignId, { quota: 0 })).expect(400);
    await hr.agent.post(api('jds')).send(jdBody(campaignId, { workMode: 'ANYWHERE' })).expect(400);
    const center = await t.loginAs('CENTER');
    await center.agent.post(api('jds')).send(jdBody(campaignId)).expect(403);
  });

  it('GĐ1: HR edits a draft; fields left out keep their value', async () => {
    const jd = await createDraft();
    const res = await hr.agent
      .patch(api(`jds/${jd.id}`))
      .send({ rowVersion: jd.rowVersion, quota: 5, allowance: null })
      .expect(200);
    expect(JobDescriptionSchema.parse(res.body)).toMatchObject({
      quota: 5,
      allowance: null,
      title: jd.title,
      rowVersion: jd.rowVersion + 1,
      version: 1,
    });
    const [entry] = await auditEntries(t.db, 'job_description', jd.id);
    expect(entry?.action).toBe('JD_UPDATED');
    expect(entry?.before).toMatchObject({ quota: 3 });
    expect(entry?.after).toMatchObject({ quota: 5, allowance: null });
  });

  it('GĐ1: stale row_version on edit returns 409', async () => {
    const jd = await createDraft();
    await hr.agent.patch(api(`jds/${jd.id}`)).send({ rowVersion: jd.rowVersion, quota: 4 }).expect(200);
    const res = await hr.agent.patch(api(`jds/${jd.id}`)).send({ rowVersion: jd.rowVersion, quota: 6 }).expect(409);
    expect(ApiErrorSchema.parse(res.body).code).toBe('ROW_VERSION_CONFLICT');
  });

  it('GĐ1: submit moves DRAFT to PENDING_HR_CONFIRMATION with audit and emits jd.submitted', async () => {
    const jd = await createDraft();
    const res = await hr.agent.post(api(`jds/${jd.id}/submit`)).send({ rowVersion: jd.rowVersion }).expect(200);
    expect(JobDescriptionSchema.parse(res.body)).toMatchObject({
      status: 'PENDING_HR_CONFIRMATION',
      rowVersion: jd.rowVersion + 1,
      requirementsReady: false,
    });
    expect(await readState(t.db, 'jobDescription', jd.id)).toMatchObject({ status: 'PENDING_HR_CONFIRMATION' });
    const [entry] = await auditEntries(t.db, 'job_description', jd.id);
    expect(entry).toMatchObject({
      action: 'TRANSITION',
      actorId: hr.user.id,
      before: { status: 'DRAFT' },
      after: { status: 'PENDING_HR_CONFIRMATION' },
    });
    expect(submitted).toContainEqual({ jdId: jd.id, campaignId, companyId, version: 1 });
  });

  it('GĐ1: submit without content returns 422', async () => {
    const jd = await createDraft({ description: '' });
    expect(jd.description).toBeNull();
    const res = await hr.agent.post(api(`jds/${jd.id}/submit`)).send({ rowVersion: jd.rowVersion }).expect(422);
    expect(ApiErrorSchema.parse(res.body)).toMatchObject({
      code: 'TRANSITION_CONDITION_FAILED',
      details: { reasonCode: 'JD_NO_CONTENT' },
    });
    expect(await readState(t.db, 'jobDescription', jd.id)).toMatchObject({ status: 'DRAFT' });
  });

  it('GĐ1: edit after submit returns 409', async () => {
    const jd = await createDraft();
    const submittedJd = JobDescriptionSchema.parse(
      (await hr.agent.post(api(`jds/${jd.id}/submit`)).send({ rowVersion: jd.rowVersion }).expect(200)).body,
    );
    const res = await hr.agent
      .patch(api(`jds/${jd.id}`))
      .send({ rowVersion: submittedJd.rowVersion, quota: 9 })
      .expect(409);
    expect(ApiErrorSchema.parse(res.body).code).toBe('JD_NOT_EDITABLE');
    // A second submit finds no DRAFT → PENDING edge from the new state.
    const again = await hr.agent
      .post(api(`jds/${jd.id}/submit`))
      .send({ rowVersion: submittedJd.rowVersion })
      .expect(422);
    expect(ApiErrorSchema.parse(again.body).code).toBe('INVALID_TRANSITION');
  });

  it('GĐ1: stale row_version on submit returns 409', async () => {
    const jd = await createDraft();
    await hr.agent.patch(api(`jds/${jd.id}`)).send({ rowVersion: jd.rowVersion, quota: 4 }).expect(200);
    await hr.agent.post(api(`jds/${jd.id}/submit`)).send({ rowVersion: jd.rowVersion }).expect(409);
  });
});
