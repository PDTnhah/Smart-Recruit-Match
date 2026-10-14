// US-1.6 AC-1 (NFR-2, PRD GĐ2 step 1, CONTEXT D30): a student accepts a versioned text of the
// data-processing terms for a campaign in INTAKE; the record keeps the version, the hash of the
// exact text and the time, with an audit entry.
import { ApiErrorSchema, ConsentListSchema, ConsentSchema, CURRENT_TERMS } from '@srm/shared';
import { eq } from 'drizzle-orm';
import { Clock } from '../../src/common/clock/index.js';
import { consents } from '../../src/db/schema/index.js';
import { termsSha256 } from '../../src/modules/student/domain/terms.js';
import { api, type AuthTestApp, createAuthTestApp } from '../helpers/auth.js';
import { acceptTerms, loginTargetStudent } from '../helpers/cv.js';
import { createCampaign } from '../helpers/factories.js';
import { FakeClock } from '../helpers/fake-clock.js';
import { createIntakeCampaign, inDays } from '../helpers/jd.js';
import { auditEntries } from '../helpers/state.js';

describe('NFR-2: consent to the data-processing terms (US-1.6 AC-1)', () => {
  let t: AuthTestApp;
  const clock = new FakeClock();

  beforeAll(async () => {
    t = await createAuthTestApp({ configure: (b) => b.overrideProvider(Clock).useValue(clock) });
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(() => {
    clock.set(new Date());
  });

  it('NFR-2: student consent records terms version and timestamp with audit', async () => {
    const student = await loginTargetStudent(t);
    const campaign = await createIntakeCampaign(t.db);

    const before = ConsentListSchema.parse((await student.agent.get(api('me/consents')).expect(200)).body);
    expect(before).toEqual({ currentTermsVersion: CURRENT_TERMS.version, items: [] });

    const res = await acceptTerms(student.agent, campaign.id).expect(200);
    expect(ConsentSchema.parse(res.body)).toEqual({
      campaignId: campaign.id,
      termsVersion: CURRENT_TERMS.version,
      acceptedAt: clock.now().toISOString(),
    });

    const [row] = await t.db.select().from(consents).where(eq(consents.studentId, student.studentId));
    expect(row).toMatchObject({
      campaignId: campaign.id,
      termsVersion: CURRENT_TERMS.version,
      termsSha256: termsSha256(CURRENT_TERMS),
      acceptedAt: clock.now(),
    });

    const [entry] = await auditEntries(t.db, 'consent', row!.id);
    expect(entry).toMatchObject({ action: 'CONSENT_ACCEPTED', actorKind: 'USER', actorId: student.user.id });
    expect(entry?.after).toMatchObject({ campaignId: campaign.id, termsVersion: CURRENT_TERMS.version });

    const after = ConsentListSchema.parse((await student.agent.get(api('me/consents')).expect(200)).body);
    expect(after.items).toEqual([ConsentSchema.parse(res.body)]);
  });

  it('NFR-2: accepting again returns the first consent and writes no second audit entry', async () => {
    const student = await loginTargetStudent(t);
    const campaign = await createIntakeCampaign(t.db);
    const first = ConsentSchema.parse((await acceptTerms(student.agent, campaign.id).expect(200)).body);

    clock.advance({ minutes: 10 });
    const again = ConsentSchema.parse((await acceptTerms(student.agent, campaign.id).expect(200)).body);
    expect(again).toEqual(first);

    const rows = await t.db.select().from(consents).where(eq(consents.studentId, student.studentId));
    expect(rows).toHaveLength(1);
    expect(await auditEntries(t.db, 'consent', rows[0]!.id)).toHaveLength(1);
  });

  it('NFR-2: consent is per campaign: another campaign needs its own', async () => {
    const student = await loginTargetStudent(t);
    const [a, b] = [await createIntakeCampaign(t.db), await createIntakeCampaign(t.db)];
    await acceptTerms(student.agent, a.id).expect(200);
    const list = ConsentListSchema.parse((await student.agent.get(api('me/consents')).expect(200)).body);
    expect(list.items.map((item) => item.campaignId)).toEqual([a.id]);
    expect(list.items.map((item) => item.campaignId)).not.toContain(b.id);
  });

  it('NFR-2: a terms version other than the current one returns 409 TERMS_OUTDATED', async () => {
    const student = await loginTargetStudent(t);
    const campaign = await createIntakeCampaign(t.db);
    const res = await acceptTerms(student.agent, campaign.id, CURRENT_TERMS.version + 1).expect(409);
    expect(ApiErrorSchema.parse(res.body).code).toBe('TERMS_OUTDATED');
    expect(await t.db.select().from(consents).where(eq(consents.studentId, student.studentId))).toEqual([]);
  });

  it('NFR-2: consent outside INTAKE returns 409 CAMPAIGN_PHASE_MISMATCH', async () => {
    const student = await loginTargetStudent(t);
    const later = await createCampaign(t.db, {
      status: 'PREFERENCE_SELECTION',
      phaseDeadlines: { intake_end: inDays(-1), preference_end: inDays(7), testing_end: inDays(14) },
    });
    const res = await acceptTerms(student.agent, later.id).expect(409);
    expect(ApiErrorSchema.parse(res.body).code).toBe('CAMPAIGN_PHASE_MISMATCH');

    const intake = await createIntakeCampaign(t.db);
    clock.advance({ days: 8 }); // past intake_end, before the scheduler moves the campaign
    expect(ApiErrorSchema.parse((await acceptTerms(student.agent, intake.id).expect(409)).body).code).toBe(
      'CAMPAIGN_PHASE_MISMATCH',
    );
  });

  it('NFR-2: a DRAFT campaign and a campaign outside the target answer 404', async () => {
    const student = await loginTargetStudent(t);
    const draft = await createCampaign(t.db);
    await acceptTerms(student.agent, draft.id).expect(404);

    const outsider = await loginTargetStudent(t, { cohort: 'K60' });
    const campaign = await createIntakeCampaign(t.db);
    await acceptTerms(outsider.agent, campaign.id).expect(404);
    await acceptTerms(student.agent, 999_999_999).expect(404);
  });

  it('NFR-2: each student sees only their own consents; other roles get 403', async () => {
    const [x, y] = [await loginTargetStudent(t), await loginTargetStudent(t)];
    const campaign = await createIntakeCampaign(t.db);
    await acceptTerms(x.agent, campaign.id).expect(200);
    expect(ConsentListSchema.parse((await y.agent.get(api('me/consents')).expect(200)).body).items).toEqual([]);

    const { agent: center } = await t.loginAs('CENTER');
    await center.get(api('me/consents')).expect(403);
    await acceptTerms(center, campaign.id).expect(403);
  });
});
