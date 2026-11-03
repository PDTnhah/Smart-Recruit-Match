// US-3.2 AC-9 – AC-12 (FR-14, GĐ3, AD-2, NFR-4, CONTEXT D46): the backend scores the assessments of
// the Matching Agent itself and closes the run on the last message of the job. Results are
// delivered as aigateway delivers them, by awaiting `ai.result.MATCH`; the AI Service is not running.
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AiResultMessageSchema,
  CampaignConfigSchema,
  type CvProfile,
  MatchingRunSchema,
  type MatchPairRef,
  type MatchFailedPair,
  scvWeightsOf,
} from '@srm/shared';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { campaigns, jobDescriptions, matchResults, matchRuns } from '../../src/db/schema/index.js';
import { AI_JOB_DISPATCHED, AI_RESULT_EVENTS, type AiJobDispatchedEvent, type AiResultEvent } from '../../src/modules/aigateway/index.js';
import { RecomputeScvService } from '../../src/modules/matching/index.js';
import { pairScv } from '../../src/modules/matching/domain/pair-scv.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn } from '../helpers/auth.js';
import { ownerDatabaseUrl } from '../helpers/db.js';
import { createCampaign, createCompany, createCv, createStudent, TEST_CAMPAIGN_TARGET } from '../helpers/factories.js';
import { captureEvents, createJdInState, inDays, SAMPLE_REQUIREMENTS } from '../helpers/jd.js';

const PROMPT = 'matching/v1';
const MODEL = 'gemini-3.8-flash';

/** A confirmed profile that meets the must-have skill of SAMPLE_REQUIREMENTS through a project. */
const PROFILE: CvProfile = {
  summary: 'Sinh viên năm 3 ngành Công nghệ thông tin.',
  education: [],
  skills: [{ name: 'TypeScript', canonical_name: 'TypeScript', match: 'ALIAS' }],
  projects: [
    {
      name: 'Cổng đăng ký học phần',
      role: 'Backend',
      description: 'Viết REST API bằng TypeScript cho 2 000 sinh viên.',
      technologies: ['TypeScript'],
      start: '2024',
      end: '2024',
    },
  ],
  experience: [],
  languages: [],
  certificates: [],
};

type Pair = MatchPairRef;

const assessment = (score: number) => ({
  project_relevance: {
    score_0_4: score,
    reason: 'Dự án API gần với công việc của vị trí.',
    evidence: ['Viết REST API bằng TypeScript', 'Ứng dụng di động 1 triệu người dùng'],
  },
  strengths: ['Có dự án backend bằng TypeScript.'],
  suggestions: ['Học thêm Docker.'],
  summary: 'Phù hợp ở mức khá.',
});

const item = (pair: Pair, score: number) => ({
  ...pair,
  model: MODEL,
  assessment: assessment(score),
  // As the AI Service checks them: the second quote is not in the CV (AC-8).
  evidence_check: [
    { quote: 'Viết REST API bằng TypeScript', score: 100, matched: true },
    { quote: 'Ứng dụng di động 1 triệu người dùng', score: 41.5, matched: false },
  ],
});

const failed = (pair: Pair, code: string, needsReview = false): MatchFailedPair => ({ ...pair, code, needs_review: needsReview });

describe('GĐ3 matching results (US-3.2)', () => {
  let t: AuthTestApp;
  let center: LoggedIn;
  let dispatched: AiJobDispatchedEvent<'MATCH'>[];
  let owner: Client;

  beforeAll(async () => {
    t = await createAuthTestApp();
    center = await t.loginAs('CENTER');
    dispatched = captureEvents(t.app, AI_JOB_DISPATCHED);
    owner = new Client({ connectionString: ownerDatabaseUrl() });
    await owner.connect();
  });

  afterAll(async () => {
    await t.close();
    await owner.end();
  });

  /** Two confirmed CVs × two approved JDs, every pair eligible and sent (M = 10). */
  async function startRun() {
    const campaign = await createCampaign(t.db, {
      status: 'INTAKE',
      phaseDeadlines: { intake_end: inDays(7), preference_end: inDays(14), testing_end: inDays(21) },
      config: { target: TEST_CAMPAIGN_TARGET },
    });
    const { id: companyId } = await createCompany(t.db);
    const jdA = await createJdInState(t.db, { companyId, campaignId: campaign.id, status: 'APPROVED' });
    const jdB = await createJdInState(t.db, { companyId, campaignId: campaign.id, status: 'APPROVED' });
    for (const gpa of [3.5, 2.8]) {
      const student = await createStudent(t.db, { major: 'Công nghệ thông tin', gpa });
      await createCv(t.db, { studentId: student.id, campaignId: campaign.id, status: 'CONFIRMED', profile: PROFILE, profileMasked: PROFILE });
    }
    const res = await center.agent.post(api(`campaigns/${campaign.id}/matching-runs`)).send().expect(202);
    const run = MatchingRunSchema.parse(res.body);
    const event = dispatched.find((e) => e.jobId === run.jobId);
    if (!event) throw new Error(`job ${run.jobId} was not dispatched`);
    expect(event.job.pairs).toHaveLength(4);
    return { campaign, jdA, jdB, run, job: event.job };
  }

  type Job = Awaited<ReturnType<typeof startRun>>['job'];

  /** One `ai.results` message of the job, checked against the contract as aigateway checks it. */
  const message = (
    job: Job,
    output: { final: boolean; items?: ReturnType<typeof item>[]; failed_pairs?: MatchFailedPair[] },
    status: 'SUCCEEDED' | 'PARTIAL' = 'SUCCEEDED',
  ): AiResultEvent<'MATCH'> => {
    const result = {
      job_id: job.job_id,
      type: 'MATCH' as const,
      status,
      job,
      result: { prompt_version: PROMPT, items: [], failed_pairs: [], ...output },
      error: null,
    };
    return AiResultMessageSchema.parse(result) as AiResultEvent<'MATCH'>;
  };

  const deliver = (result: AiResultEvent<'MATCH'>) => t.app.get(EventEmitter2).emitAsync(AI_RESULT_EVENTS.MATCH, result);

  const rowOf = async (campaignId: number, pair: Pair) => {
    const rows = await t.db
      .select()
      .from(matchResults)
      .where(
        and(
          eq(matchResults.campaignId, campaignId),
          eq(matchResults.cvId, pair.cv_id),
          eq(matchResults.jdId, pair.jd_id),
          eq(matchResults.jdVersion, pair.jd_version),
        ),
      );
    expect(rows).toHaveLength(1);
    return rows[0]!;
  };

  const runOf = async (runId: number) => (await t.db.select().from(matchRuns).where(eq(matchRuns.id, runId)))[0]!;

  /** S_cv as the domain computes it from the stored row, the JD's requirements and the campaign weights. */
  const expectedScv = async (campaignId: number, row: typeof matchResults.$inferSelect) => {
    const [campaign] = await t.db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    const weights = scvWeightsOf(CampaignConfigSchema.parse(campaign!.config));
    const { scvX100, breakdown } = pairScv(
      { criteria: row.criteria!, assessment: row.assessment!, facts: row.facts },
      SAMPLE_REQUIREMENTS,
      weights,
    );
    return { sCv: scvX100 / 100, breakdown };
  };

  it('AD-2 backend computes S_cv; duplicate ai.results is idempotent', async () => {
    const { campaign, run, job } = await startRun();
    const [p1, p2, p3, p4] = job.pairs as [Pair, Pair, Pair, Pair];

    const chunk = message(job, { final: false, items: [item(p1, 3), item(p2, 1)] });
    await deliver(chunk);
    const first = await rowOf(campaign.id, p1);
    expect(first).toMatchObject({ promptVersion: PROMPT, model: MODEL, needsReview: false });
    expect(first.assessment?.project_relevance.score_0_4).toBe(3);
    expect({ sCv: first.sCv, breakdown: first.scvBreakdown }).toEqual(await expectedScv(campaign.id, first));
    // The project score is the only number read from the LLM: 1 instead of 3 gives a lower S_cv.
    expect((await rowOf(campaign.id, p2)).sCv).toBeLessThan(first.sCv!);
    expect(await runOf(run.runId)).toMatchObject({ status: 'RUNNING', pairsScored: 2 });

    // At least once: the same message again changes nothing.
    await deliver(chunk);
    expect(await rowOf(campaign.id, p1)).toEqual(first);
    expect(await runOf(run.runId)).toMatchObject({ status: 'RUNNING', pairsScored: 2 });

    // The last message: p3 expired, p4 refused twice; p1 is listed again by a poller that ran twice.
    const last = message(
      job,
      { final: true, failed_pairs: [failed(p1, 'EXPIRED'), failed(p3, 'EXPIRED'), failed(p4, 'LLM_REFUSAL', true)] },
      'PARTIAL',
    );
    await deliver(last);
    await deliver(last);
    expect(await rowOf(campaign.id, p1)).toEqual(first);
    expect(await rowOf(campaign.id, p3)).toMatchObject({ promptVersion: null, sCv: null, needsReview: false });
    expect(await rowOf(campaign.id, p4)).toMatchObject({ promptVersion: null, sCv: null, needsReview: true });
    const closed = await runOf(run.runId);
    expect(closed).toMatchObject({ status: 'PARTIAL', pairsScored: 2, pairsFailed: 3, errorCode: null });
    expect(closed.finishedAt).not.toBeNull();

    // AC-9: the next run sends the failed pair again, pinned to the prompt, but not the one left to staff.
    const again = MatchingRunSchema.parse(
      (await center.agent.post(api(`campaigns/${campaign.id}/matching-runs`)).send().expect(202)).body,
    );
    const next = dispatched.find((e) => e.jobId === again.jobId)!.job;
    expect(next).toMatchObject({ prompt_version: PROMPT, pairs: [p3] });
  });

  it('AD-2 an assessment of a JD version no longer current is not applied; one of a JD filled since is', async () => {
    const { campaign, jdA, jdB, run, job } = await startRun();
    const stale = job.pairs.find((pair) => pair.jd_id === jdB.id)!;
    const filled = job.pairs.find((pair) => pair.jd_id === jdA.id)!;
    await t.db.update(jobDescriptions).set({ version: 2 }).where(eq(jobDescriptions.id, jdB.id));
    // The AI Service still reads a FILLED JD (core.v_ai_jd_requirements): its assessment counts.
    await t.db.update(jobDescriptions).set({ status: 'FILLED' }).where(eq(jobDescriptions.id, jdA.id));

    await deliver(message(job, { final: false, items: [item(stale, 4), item(filled, 4)] }));
    expect(await rowOf(campaign.id, stale)).toMatchObject({ promptVersion: null, sCv: null, assessment: null });
    const scored = await rowOf(campaign.id, filled);
    expect({ sCv: scored.sCv, breakdown: scored.scvBreakdown }).toEqual(await expectedScv(campaign.id, scored));
    expect(await runOf(run.runId)).toMatchObject({ pairsScored: 1 });
  });

  it('GĐ3 AC-9 an answer that comes before the API has answered still closes its run', async () => {
    // A worker that answers at once: the last message is handled as soon as the broker took the job.
    const events = t.app.get(EventEmitter2);
    const answers: Promise<unknown>[] = [];
    const answer = (event: AiJobDispatchedEvent<'MATCH'>) => {
      const failedPairs = event.job.pairs.map((pair) => failed(pair, 'EXPIRED'));
      answers.push(deliver(message(event.job, { final: true, failed_pairs: failedPairs }, 'PARTIAL')));
    };
    events.on(AI_JOB_DISPATCHED, answer);
    try {
      const { run } = await startRun();
      await Promise.all(answers);
      expect(await runOf(run.runId)).toMatchObject({ status: 'PARTIAL', pairsFailed: 4, jobId: run.jobId });
    } finally {
      events.off(AI_JOB_DISPATCHED, answer);
    }
  });

  it('AD-2 weight change recomputes S_cv without new job', async () => {
    const { campaign, job } = await startRun();
    const [p1] = job.pairs as [Pair];
    await deliver(message(job, { final: true, items: [item(p1, 2)] }));
    const before = await rowOf(campaign.id, p1);
    const jobsBefore = dispatched.length;
    // Only calls of this campaign's jobs: the workers of other test files write ai.llm_calls meanwhile (LESSONS §22).
    const calls = async () => {
      const jobIds = dispatched.filter((e) => e.job.campaign_id === campaign.id).map((e) => e.jobId);
      const { rows } = await owner.query<{ n: string }>('SELECT count(*) AS n FROM ai.llm_calls WHERE job_id = ANY($1::uuid[])', [jobIds]);
      return Number(rows[0]!.n);
    };
    const callsBefore = await calls();

    const weights = {
      scv_weight_must_have: 0.2,
      scv_weight_nice_to_have: 0.1,
      scv_weight_project: 0.5,
      scv_weight_education: 0.1,
      scv_weight_language: 0.1,
    };
    await t.db
      .update(campaigns)
      .set({ config: { ...campaign.config, ...weights } })
      .where(eq(campaigns.id, campaign.id));
    expect(await t.app.get(RecomputeScvService).recompute(campaign.id)).toEqual({ recomputed: 1, kept: 0 });

    const after = await rowOf(campaign.id, p1);
    expect({ sCv: after.sCv, breakdown: after.scvBreakdown }).toEqual(await expectedScv(campaign.id, after));
    expect(after.sCv).not.toBe(before.sCv);
    expect(after.scvBreakdown?.find((r) => r.criterion === 'project')?.weightBp).toBe(5000);
    expect({ assessment: after.assessment, criteria: after.criteria }).toEqual({ assessment: before.assessment, criteria: before.criteria });
    expect(dispatched).toHaveLength(jobsBefore);
    expect(await calls()).toBe(callsBefore);
  });

  it('NFR-4 stored result carries verdicts, evidence and breakdown', async () => {
    const { campaign, job } = await startRun();
    const [p1] = job.pairs as [Pair];
    await deliver(message(job, { final: true, items: [item(p1, 3)] }));
    const row = await rowOf(campaign.id, p1);

    const [typescript] = row.criteria!.must_have;
    expect(typescript).toMatchObject({ skill: 'TypeScript', level_required: 'INTERMEDIATE', verdict: 'PARTIAL', match_kind: 'EXACT', via: null });
    expect(typescript?.evidence).toContain('Cổng đăng ký học phần');
    expect(typescript?.tier).toBeGreaterThan(0);
    expect(typescript?.sources.map((source) => source.section)).toContain('PROJECT');
    expect(row.criteria?.zones).toEqual(expect.any(Array));
    expect(row.criteria).toMatchObject({
      // A JD without a position group counts as the OTHER group (US-3.6), which an IT major is RELATED to.
      education: { major_match: 'RELATED', major_unrecognized: false },
      language: null,
      // One project at INTERMEDIATE is a PARTIAL (US-3.5); no Docker at all.
      gaps: [
        { skill: 'TypeScript', group: 'must_have', levelRequired: 'INTERMEDIATE', verdict: 'PARTIAL' },
        { skill: 'Docker', group: 'nice_to_have', levelRequired: 'BASIC', verdict: 'NOT_MET' },
      ],
    });
    expect(row.assessment).toEqual({ ...assessment(3), evidence_check: item(p1, 3).evidence_check });
    expect(row.scvBreakdown?.map((r) => r.criterion)).toEqual(['must_have', 'nice_to_have', 'project', 'education', 'language']);
    expect(row).toMatchObject({ rulesVersion: job.rules_version, promptVersion: PROMPT, model: MODEL });
  });

  it('GĐ3 AC-9 a job that failed as a whole closes its run FAILED', async () => {
    const { campaign, run, job } = await startRun();
    const failure = AiResultMessageSchema.parse({
      job_id: job.job_id,
      type: 'MATCH',
      status: 'FAILED',
      job,
      result: null,
      error: { code: 'RETRIES_EXHAUSTED', message: 'worker gave up (test)', needs_human: false },
    }) as AiResultEvent<'MATCH'>;
    await deliver(failure);
    expect(await runOf(run.runId)).toMatchObject({ status: 'FAILED', errorCode: 'RETRIES_EXHAUSTED', pairsFailed: 4 });
    for (const pair of job.pairs) expect(await rowOf(campaign.id, pair)).toMatchObject({ promptVersion: null, sCv: null });
    // A result of an unknown job is a no-op.
    const unknown = randomUUID();
    await deliver({ ...failure, job_id: unknown, job: { ...job, job_id: unknown } });
    expect(await runOf(run.runId)).toMatchObject({ status: 'FAILED', pairsFailed: 4 });
  });
});
