// US-1.5 AC-7 (FR-5, BR-02): the center approves a JD whose requirements HR has confirmed.
// JDs start in PENDING_APPROVAL through the US-1.2 helpers: the HR confirmation step is US-2.3.
import { ApiErrorSchema, JobDescriptionSchema } from '@srm/shared';
import { JD_APPROVED, type JdEvent } from '../../src/modules/company/index.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn } from '../helpers/auth.js';
import { createCompany } from '../helpers/factories.js';
import { captureEvents, createJdInState } from '../helpers/jd.js';
import { auditEntries, readState } from '../helpers/state.js';

describe('BR-02: JD approval (US-1.5 AC-7)', () => {
  let t: AuthTestApp;
  let center: LoggedIn;
  let companyId: number;
  let approved: JdEvent[];

  beforeAll(async () => {
    t = await createAuthTestApp();
    center = await t.loginAs('CENTER');
    companyId = (await createCompany(t.db)).id;
    approved = captureEvents<JdEvent>(t.app, JD_APPROVED);
  });

  afterAll(async () => {
    await t.close();
  });

  const approve = (agent: LoggedIn['agent'], id: number, rowVersion: number) =>
    agent.post(api(`jds/${id}/approve`)).send({ rowVersion });

  it('BR-02: center approves PENDING_APPROVAL JD with audit and emits jd.approved', async () => {
    const jd = await createJdInState(t.db, { companyId, status: 'PENDING_APPROVAL' });
    const res = await approve(center.agent, jd.id, jd.rowVersion).expect(200);
    expect(JobDescriptionSchema.parse(res.body)).toMatchObject({
      status: 'APPROVED',
      rowVersion: jd.rowVersion + 1,
      requirementsReady: true,
    });
    const [entry] = await auditEntries(t.db, 'job_description', jd.id);
    expect(entry).toMatchObject({
      action: 'TRANSITION',
      actorId: center.user.id,
      before: { status: 'PENDING_APPROVAL' },
      after: { status: 'APPROVED' },
      reason: 'JD approved by the center',
    });
    expect(approved).toContainEqual({ jdId: jd.id, campaignId: jd.campaignId, companyId, version: 1 });
  });

  it('BR-02: approving JD in other state returns 422', async () => {
    for (const status of ['DRAFT', 'PENDING_HR_CONFIRMATION', 'APPROVED'] as const) {
      const jd = await createJdInState(t.db, { companyId, status });
      const res = await approve(center.agent, jd.id, jd.rowVersion).expect(422);
      expect(ApiErrorSchema.parse(res.body).code).toBe('INVALID_TRANSITION');
      expect(await readState(t.db, 'jobDescription', jd.id)).toMatchObject({ status });
    }
  });

  it('BR-02: approving JD without confirmed requirements returns 422', async () => {
    const jd = await createJdInState(t.db, { companyId, status: 'PENDING_APPROVAL', requirements: null });
    const res = await approve(center.agent, jd.id, jd.rowVersion).expect(422);
    expect(ApiErrorSchema.parse(res.body)).toMatchObject({
      code: 'TRANSITION_CONDITION_FAILED',
      details: { reasonCode: 'REQUIREMENTS_NOT_CONFIRMED' },
    });
  });

  it('BR-02: HR or STUDENT approving gets 403', async () => {
    const jd = await createJdInState(t.db, { companyId, status: 'PENDING_APPROVAL' });
    for (const caller of [await t.loginAs('HR', { companyId }), await t.loginAs('STUDENT')]) {
      await approve(caller.agent, jd.id, jd.rowVersion).expect(403);
    }
    expect(await readState(t.db, 'jobDescription', jd.id)).toMatchObject({ status: 'PENDING_APPROVAL' });
  });

  it('BR-02: concurrent approvals yield one 409', async () => {
    const jd = await createJdInState(t.db, { companyId, status: 'PENDING_APPROVAL' });
    const statuses = await Promise.all([
      approve(center.agent, jd.id, jd.rowVersion).then((res) => res.status),
      approve(center.agent, jd.id, jd.rowVersion).then((res) => res.status),
    ]);
    expect(statuses.sort()).toEqual([200, 409]);
    expect(await readState(t.db, 'jobDescription', jd.id)).toMatchObject({ status: 'APPROVED', rowVersion: 1 });
    expect(await auditEntries(t.db, 'job_description', jd.id)).toHaveLength(1);
  });

  it('BR-02: approving a missing JD returns 404', async () => {
    await approve(center.agent, 999_999_999, 0).expect(404);
  });
});
