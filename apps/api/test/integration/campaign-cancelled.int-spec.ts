// US-1.10 AC-7 (FR-41, CONTEXT D56): a cancelled campaign is hidden from students and HR and stops
// every action, while its data stays. Campaigns are cancelled through the API; their deadlines are
// ahead in real time, so no scheduler of another file ever moves them.
import { ApiErrorSchema, CampaignListSchema, JobDescriptionSchema, MyExamsResponseSchema } from '@srm/shared';
import { eq } from 'drizzle-orm';
import { consents, jobDescriptions } from '../../src/db/schema/index.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn } from '../helpers/auth.js';
import { acceptTerms, loginTargetStudent, submitCv } from '../helpers/cv.js';
import { createExamFixture } from '../helpers/exam.js';
import { createCompany } from '../helpers/factories.js';
import { createIntakeCampaign, createJdInState, fixtureFile, jdBody } from '../helpers/jd.js';
import { BANK_REQUIREMENTS } from '../helpers/question-bank.js';
import { createApprovedJds, createConfirmedCv, createPreferenceCampaign } from '../helpers/shortlist.js';
import { readState } from '../helpers/state.js';

describe('FR-41: a cancelled campaign (US-1.10 AC-7)', () => {
  let t: AuthTestApp;
  let center: LoggedIn;

  beforeAll(async () => {
    t = await createAuthTestApp();
    center = await t.loginAs('CENTER');
  });

  afterAll(async () => {
    await t.close();
  });

  async function cancel(campaignId: number): Promise<void> {
    const { rowVersion } = await readState(t.db, 'campaign', campaignId);
    await center.agent
      .post(api(`campaigns/${campaignId}/cancel`))
      .send({ rowVersion, reason: 'Không tổ chức đợt này' })
      .expect(200);
  }

  const listedIds = async (viewer: LoggedIn) =>
    CampaignListSchema.parse((await viewer.agent.get(api('campaigns')).expect(200)).body).items.map((c) => c.id);

  const codeOf = (body: unknown) => ApiErrorSchema.parse(body).code;

  it('FR-41: students and HR no longer see it; center and admin still do', async () => {
    const campaign = await createIntakeCampaign(t.db);
    const company = await createCompany(t.db);
    const [student, hr, admin] = await Promise.all([
      loginTargetStudent(t),
      t.loginAs('HR', { companyId: company.id }),
      t.loginAs('ADMIN'),
    ]);
    await student.agent.get(api(`campaigns/${campaign.id}`)).expect(200);
    await hr.agent.get(api(`campaigns/${campaign.id}`)).expect(200);

    await cancel(campaign.id);
    for (const viewer of [student, hr]) {
      const res = await viewer.agent.get(api(`campaigns/${campaign.id}`)).expect(404);
      expect(codeOf(res.body)).toBe('ENTITY_NOT_FOUND');
      expect(await listedIds(viewer)).not.toContain(campaign.id);
    }
    for (const viewer of [center, admin]) {
      await viewer.agent.get(api(`campaigns/${campaign.id}`)).expect(200);
      expect(await listedIds(viewer)).toContain(campaign.id);
    }
  });

  it('FR-41: consents, CVs, JDs, preferences and matching runs are refused; what was saved stays', async () => {
    const intake = await createIntakeCampaign(t.db);
    const company = await createCompany(t.db);
    const [student, other, hr] = await Promise.all([
      loginTargetStudent(t),
      loginTargetStudent(t),
      t.loginAs('HR', { companyId: company.id }),
    ]);
    await acceptTerms(student.agent, intake.id).expect(200);
    const jd = JobDescriptionSchema.parse((await hr.agent.post(api('jds')).send(jdBody(intake.id)).expect(201)).body);

    await cancel(intake.id);
    // Students and HR no longer see the campaign: actions naming it answer 404, as for any hidden one.
    expect(codeOf((await acceptTerms(other.agent, intake.id).expect(404)).body)).toBe('ENTITY_NOT_FOUND');
    await submitCv(student.agent, intake.id, fixtureFile('sample.pdf'), 'cv.pdf').expect(404);
    await hr.agent.post(api('jds')).send(jdBody(intake.id)).expect(404);
    // Actions on its records check the phase.
    const edit = await hr.agent.patch(api(`jds/${jd.id}`)).send({ rowVersion: jd.rowVersion, title: 'Tên mới' }).expect(409);
    expect(codeOf(edit.body)).toBe('CAMPAIGN_PHASE_MISMATCH');
    const run = await center.agent.post(api(`campaigns/${intake.id}/matching-runs`)).send({}).expect(409);
    expect(codeOf(run.body)).toBe('CAMPAIGN_PHASE_MISMATCH');

    const selecting = await createPreferenceCampaign(t.db);
    const [approved] = await createApprovedJds(t.db, selecting.id, 1);
    await createConfirmedCv(t.db, student.studentId, selecting.id);
    await cancel(selecting.id);
    const save = await student.agent
      .put(api('me/preferences'))
      .send({ campaignId: selecting.id, preferences: [{ jdId: approved!.id, rank: 1 }] })
      .expect(409);
    expect(codeOf(save.body)).toBe('CAMPAIGN_PHASE_MISMATCH');

    // Nothing was deleted (CONTEXT D56).
    expect(await t.db.select().from(consents).where(eq(consents.campaignId, intake.id))).toHaveLength(1);
    const [stored] = await t.db.select().from(jobDescriptions).where(eq(jobDescriptions.id, jd.id));
    expect(stored).toMatchObject({ campaignId: intake.id, title: jd.title, status: 'DRAFT' });
  });

  it('FR-41: no JD approval or question generation (no AI work), no exams page for students', async () => {
    const campaign = await createIntakeCampaign(t.db);
    const { id: companyId } = await createCompany(t.db);
    const pending = await createJdInState(t.db, { companyId, campaignId: campaign.id, status: 'PENDING_APPROVAL' });
    const approved = await createJdInState(t.db, {
      companyId,
      campaignId: campaign.id,
      status: 'APPROVED',
      requirements: BANK_REQUIREMENTS,
    });
    const { student } = await createExamFixture(t, { campaignId: campaign.id, now: new Date() });
    const before = MyExamsResponseSchema.parse((await student.agent.get(api('me/exams')).expect(200)).body);
    expect(before.campaign?.id).toBe(campaign.id);

    await cancel(campaign.id);
    const approve = await center.agent.post(api(`jds/${pending.id}/approve`)).send({ rowVersion: pending.rowVersion });
    expect(approve.status).toBe(409);
    expect(codeOf(approve.body)).toBe('CAMPAIGN_PHASE_MISMATCH');
    const generate = await center.agent.post(api(`jds/${approved.id}/question-bank/generate`)).send().expect(409);
    expect(codeOf(generate.body)).toBe('CAMPAIGN_PHASE_MISMATCH');
    expect((await readState(t.db, 'jobDescription', pending.id)).status).toBe('PENDING_APPROVAL');

    // The campaign is hidden, so its tests are too; nothing about it reaches the page.
    const after = MyExamsResponseSchema.parse((await student.agent.get(api('me/exams')).expect(200)).body);
    expect(after).toMatchObject({ campaign: null, items: [] });
  });

  it('FR-41: a newer cancelled campaign does not hide the tests of an older one still in testing', async () => {
    const now = new Date();
    const testing = await createExamFixture(t, { now });
    const newer = await createIntakeCampaign(t.db);
    expect(newer.id).toBeGreaterThan(testing.campaignId);
    await createExamFixture(t, { campaignId: newer.id, now, student: testing.student });
    await cancel(newer.id);

    const page = MyExamsResponseSchema.parse((await testing.student.agent.get(api('me/exams')).expect(200)).body);
    expect(page.campaign?.id).toBe(testing.campaignId);
    expect(page.items.map((item) => item.preferenceId)).toEqual([testing.preferenceId]);
  });
});
