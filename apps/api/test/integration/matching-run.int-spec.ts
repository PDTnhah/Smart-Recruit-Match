// US-3.2 AC-1–AC-4, AC-13 (FR-14, GĐ3, BR-01, BR-02, BR-18, CONTEXT D46): a matching run stores the
// code part of every CV × JD pair and sends the top M pairs not yet scored as IDs only. The AI
// Service is not running here: the job stays in its queue (AC-15 runs it end to end).
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ApiErrorSchema,
  type CampaignStatus,
  type JdRequirements,
  MatchingRunSchema,
  MatchRunJobSchema,
  type Role,
} from '@srm/shared';
import { and, eq } from 'drizzle-orm';
import { cvs, jobDescriptions, matchResults, matchRuns } from '../../src/db/schema/index.js';
import { AI_JOB_DISPATCHED, type AiJobDispatchedEvent } from '../../src/modules/aigateway/index.js';
import { CAMPAIGN_PHASE_CHANGED, type CampaignPhaseChangedEvent } from '../../src/modules/campaign/index.js';
import { RULES_VERSION } from '../../src/modules/matching/domain/rules-version.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn } from '../helpers/auth.js';
import { createCampaign, createCompany, createCv, createStudent, TEST_CAMPAIGN_TARGET } from '../helpers/factories.js';
import { captureEvents, createJdInState, inDays, SAMPLE_REQUIREMENTS } from '../helpers/jd.js';
import { waitFor } from '../helpers/notifications.js';

const MIN_GPA_3: JdRequirements = {
  ...SAMPLE_REQUIREMENTS,
  hard_conditions: { ...SAMPLE_REQUIREMENTS.hard_conditions, min_gpa: 3 },
};

const ASSESSMENT = {
  project_relevance: { score_0_4: 3, reason: 'Dự án web', evidence: [] },
  strengths: [],
  suggestions: [],
  summary: 'Phù hợp.',
  evidence_check: [],
};

describe('GĐ3 matching runs (US-3.2)', () => {
  let t: AuthTestApp;
  let center: LoggedIn;
  let dispatched: AiJobDispatchedEvent<'MATCH'>[];

  beforeAll(async () => {
    t = await createAuthTestApp();
    center = await t.loginAs('CENTER');
    dispatched = captureEvents(t.app, AI_JOB_DISPATCHED);
  });

  afterAll(async () => {
    await t.close();
  });

  /**
   * A campaign with M = 1: two confirmed CVs (GPA 3.5 and 2.0) and three approved JDs, the first
   * asking GPA ≥ 3; plus a CV awaiting confirmation, an inactive CV and a JD awaiting approval,
   * which must stay out of every pair (BR-01, BR-02). Equal skill_fit, so the smallest JD id wins.
   */
  async function seed(status: CampaignStatus = 'INTAKE') {
    const campaign = await createCampaign(t.db, {
      status,
      phaseDeadlines: { intake_end: inDays(status === 'INTAKE' ? 7 : -1), preference_end: inDays(14), testing_end: inDays(21) },
      config: { target: TEST_CAMPAIGN_TARGET, match_top_m: 1 },
    });
    const { id: companyId } = await createCompany(t.db);
    const jd = (requirements: JdRequirements, jdStatus: 'APPROVED' | 'PENDING_APPROVAL' = 'APPROVED') =>
      createJdInState(t.db, { companyId, campaignId: campaign.id, status: jdStatus, requirements });
    const jdA = await jd(MIN_GPA_3);
    const jdB = await jd(SAMPLE_REQUIREMENTS);
    const jdC = await jd(SAMPLE_REQUIREMENTS);
    await jd(SAMPLE_REQUIREMENTS, 'PENDING_APPROVAL');
    const student = (gpa: number) => createStudent(t.db, { major: 'Công nghệ thông tin', gpa });
    const [good, weak, unconfirmed] = [await student(3.5), await student(2), await student(3.9)];
    const cv = (studentId: number, change: Partial<typeof cvs.$inferInsert> = {}) =>
      createCv(t.db, { studentId, campaignId: campaign.id, status: 'CONFIRMED', ...change });
    await cv(good.id, { active: false });
    const cvGood = await cv(good.id, { version: 2 });
    const cvWeak = await cv(weak.id);
    await cv(unconfirmed.id, { status: 'PENDING_CONFIRMATION' });
    return { campaign, jdA, jdB, jdC, cvGood, cvWeak };
  }

  const start = (campaignId: number, as: LoggedIn = center) => as.agent.post(api(`campaigns/${campaignId}/matching-runs`)).send();

  const rowsOf = (campaignId: number) =>
    t.db.select().from(matchResults).where(eq(matchResults.campaignId, campaignId)).orderBy(matchResults.cvId, matchResults.jdId);

  const jobOf = (jobId: string) => {
    const event = dispatched.find((e) => e.jobId === jobId);
    if (!event) throw new Error(`job ${jobId} was not dispatched`);
    return event.job;
  };

  /** What the result of US-3.2 AC-10 will write: the LLM part of a waiting row. */
  const scoreRow = (campaignId: number, cvId: number, jdId: number, promptVersion = 'matching/v1') =>
    t.db
      .update(matchResults)
      .set({ promptVersion, model: 'fixture', assessment: ASSESSMENT, sCv: 70, scvBreakdown: [] })
      .where(and(eq(matchResults.campaignId, campaignId), eq(matchResults.cvId, cvId), eq(matchResults.jdId, jdId)));

  const closeRuns = (campaignId: number) =>
    t.db
      .update(matchRuns)
      .set({ status: 'SUCCEEDED', finishedAt: new Date() })
      .where(and(eq(matchRuns.campaignId, campaignId), eq(matchRuns.status, 'RUNNING')));

  it('GĐ3 matching run: hard-filter rejects stored, code part saved, top-M pairs published as IDs only', async () => {
    const { campaign, jdA, jdB, jdC, cvGood, cvWeak } = await seed();
    const res = await start(campaign.id).expect(202);
    const run = MatchingRunSchema.parse(res.body);
    expect(run).toMatchObject({
      status: 'RUNNING',
      rulesVersion: RULES_VERSION,
      promptVersion: null,
      pairsTotal: 6,
      pairsIneligible: 1,
      pairsSkipped: 3,
      pairsCached: 0,
      pairsSent: 2,
    });

    const job = jobOf(run.jobId!);
    expect(MatchRunJobSchema.parse(job)).toEqual({
      job_id: run.jobId,
      campaign_id: campaign.id,
      rules_version: RULES_VERSION,
      prompt_version: null,
      pairs: [
        { cv_id: cvGood.id, cv_version: 2, jd_id: jdA.id, jd_version: 1 },
        { cv_id: cvWeak.id, cv_version: 1, jd_id: jdB.id, jd_version: 1 },
      ],
    });

    const rows = await rowsOf(campaign.id);
    expect(rows.map((r) => [r.cvId, r.jdId, r.eligible, r.skippedByPrefilter])).toEqual([
      [cvGood.id, jdA.id, true, false],
      [cvGood.id, jdB.id, true, true],
      [cvGood.id, jdC.id, true, true],
      [cvWeak.id, jdA.id, false, false],
      [cvWeak.id, jdB.id, true, false],
      [cvWeak.id, jdC.id, true, true],
    ]);
    const rejected = rows.find((r) => !r.eligible)!;
    expect(rejected).toMatchObject({ criteria: null, skillFit: null, sCv: null });
    expect(rejected.ineligibleReasons).toEqual([{ code: 'GPA_BELOW_MIN', required: 3, actual: 2 }]);
    for (const row of rows.filter((r) => r.eligible)) {
      expect(row).toMatchObject({ rulesVersion: RULES_VERSION, promptVersion: null, sCv: null, assessment: null });
      expect(row.criteria?.must_have.map((v) => v.skill)).toEqual(['TypeScript']);
      expect(row.skillFit).toEqual(expect.any(Number));
      expect(row.facts).toMatchObject({ major: 'Công nghệ thông tin', languageCertificates: [] });
    }
    const [stored] = await t.db.select().from(matchRuns).where(eq(matchRuns.id, run.runId));
    expect(stored).toMatchObject({ jobId: run.jobId, status: 'RUNNING', actorKind: 'USER', actorId: center.user.id });
    expect(stored?.dispatchedAt).toBeInstanceOf(Date);
  });

  it('BR-01 BR-02 only confirmed CVs and approved JDs are paired', async () => {
    const { campaign, jdA, jdB, jdC, cvGood, cvWeak } = await seed();
    await start(campaign.id).expect(202);
    const rows = await rowsOf(campaign.id);
    expect(new Set(rows.map((r) => r.cvId))).toEqual(new Set([cvGood.id, cvWeak.id]));
    expect(new Set(rows.map((r) => r.jdId))).toEqual(new Set([jdA.id, jdB.id, jdC.id]));
  });

  it('BR-18 cached pairs skipped, new versions sent, prompt pinned per campaign, unique index blocks duplicates', async () => {
    const { campaign, jdA, jdB, cvGood, cvWeak } = await seed();
    await start(campaign.id).expect(202);
    // The result of (good, A) came back; (weak, B) failed and waits.
    await scoreRow(campaign.id, cvGood.id, jdA.id);
    await closeRuns(campaign.id);

    const again = MatchingRunSchema.parse((await start(campaign.id).expect(202)).body);
    expect(again).toMatchObject({ promptVersion: 'matching/v1', pairsCached: 1, pairsSent: 1 });
    expect(jobOf(again.jobId!)).toMatchObject({
      prompt_version: 'matching/v1',
      pairs: [{ cv_id: cvWeak.id, jd_id: jdB.id }],
    });
    await closeRuns(campaign.id);

    // A new version of JD A (BR-18): the scored row stays, the new version is sent.
    await t.db.update(jobDescriptions).set({ version: 2 }).where(eq(jobDescriptions.id, jdA.id));
    const third = MatchingRunSchema.parse((await start(campaign.id).expect(202)).body);
    expect(jobOf(third.jobId!).pairs).toEqual([
      { cv_id: cvGood.id, cv_version: 2, jd_id: jdA.id, jd_version: 2 },
      { cv_id: cvWeak.id, cv_version: 1, jd_id: jdB.id, jd_version: 1 },
    ]);
    const versionsOfA = (await rowsOf(campaign.id))
      .filter((r) => r.cvId === cvGood.id && r.jdId === jdA.id)
      .sort((a, b) => a.jdVersion - b.jdVersion);
    expect(versionsOfA.map((r) => [r.jdVersion, r.promptVersion, r.sCv])).toEqual([
      [1, 'matching/v1', 70],
      [2, null, null],
    ]);

    const [waiting] = (await rowsOf(campaign.id)).filter((r) => r.jdVersion === 2);
    const copy = { ...waiting!, id: undefined, createdAt: undefined, updatedAt: undefined };
    await expect(t.db.insert(matchResults).values(copy)).rejects.toMatchObject({
      cause: { code: '23505', constraint: 'match_results_pair_versions_key' },
    });
  });

  it('GĐ3 AC-9 a pair left to staff is not sent again', async () => {
    const { campaign, cvWeak, jdB } = await seed();
    await start(campaign.id).expect(202);
    await t.db
      .update(matchResults)
      .set({ needsReview: true })
      .where(and(eq(matchResults.cvId, cvWeak.id), eq(matchResults.jdId, jdB.id)));
    await closeRuns(campaign.id);
    const again = MatchingRunSchema.parse((await start(campaign.id).expect(202)).body);
    expect(jobOf(again.jobId!).pairs.map((p) => p.cv_id)).not.toContain(cvWeak.id);
  });

  it('GĐ3 a run with nothing to send ends at once, without a job', async () => {
    const { campaign } = await seed();
    await t.db.update(cvs).set({ active: false }).where(eq(cvs.campaignId, campaign.id));
    const run = MatchingRunSchema.parse((await start(campaign.id).expect(202)).body);
    expect(run).toMatchObject({ status: 'SUCCEEDED', jobId: null, pairsTotal: 0, pairsSent: 0 });
    expect((await start(campaign.id).expect(202)).body).toMatchObject({ status: 'SUCCEEDED' });
  });

  it('matching run: non-CENTER 403, wrong phase 409, concurrent run 409', async () => {
    const { campaign } = await seed();
    for (const role of ['STUDENT', 'HR', 'ADMIN'] as Role[]) {
      await start(campaign.id, await t.loginAs(role)).expect(403);
    }

    const testing = await seed('TESTING');
    const wrongPhase = await start(testing.campaign.id).expect(409);
    expect(ApiErrorSchema.parse(wrongPhase.body)).toMatchObject({ code: 'CAMPAIGN_PHASE_MISMATCH' });

    await start(campaign.id).expect(202);
    const concurrent = await start(campaign.id).expect(409);
    expect(ApiErrorSchema.parse(concurrent.body)).toMatchObject({
      code: 'MATCHING_RUN_IN_PROGRESS',
      details: { campaignId: campaign.id },
    });
    const runs = await t.db.select().from(matchRuns).where(eq(matchRuns.campaignId, campaign.id));
    expect(runs.map((r) => r.status)).toEqual(['RUNNING']);
    await expect(
      t.db.insert(matchRuns).values({
        campaignId: campaign.id,
        status: 'RUNNING',
        actorKind: 'SYSTEM',
        rulesVersion: RULES_VERSION,
        pairsTotal: 0,
        pairsIneligible: 0,
        pairsSkipped: 0,
        pairsCached: 0,
        pairsSent: 0,
      }),
    ).rejects.toMatchObject({ cause: { code: '23505', constraint: 'match_runs_campaign_running_key' } });
  });

  it('GĐ3 matching run starts on INTAKE → PREFERENCE_SELECTION', async () => {
    const { campaign } = await seed('PREFERENCE_SELECTION');
    const other = await seed('TESTING');
    const events = t.app.get(EventEmitter2);
    const changed = (campaignId: number, from: CampaignStatus, to: CampaignStatus): CampaignPhaseChangedEvent => ({
      campaignId,
      from,
      to,
      actorKind: 'SYSTEM',
    });
    events.emit(CAMPAIGN_PHASE_CHANGED, changed(other.campaign.id, 'PREFERENCE_SELECTION', 'TESTING'));
    events.emit(CAMPAIGN_PHASE_CHANGED, changed(campaign.id, 'INTAKE', 'PREFERENCE_SELECTION'));

    const run = await waitFor(async () => {
      const [row] = await t.db.select().from(matchRuns).where(eq(matchRuns.campaignId, campaign.id));
      return row?.jobId ? row : undefined;
    });
    expect(run).toMatchObject({ actorKind: 'SYSTEM', actorId: null, status: 'RUNNING', pairsSent: 2 });
    expect(await t.db.select().from(matchRuns).where(eq(matchRuns.campaignId, other.campaign.id))).toEqual([]);
  });
});
