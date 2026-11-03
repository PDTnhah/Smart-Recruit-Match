// US-3.2 AC-15 (FR-14, GĐ3, AD-2, AD-5, CONTEXT D42, D46): a matching run end to end, backend →
// RabbitMQ → AI Service worker (container built from ai-service/: Matching Agent, batch mode, the
// poller) → ai.results → backend, on 3 students × 4 JDs. The worker runs LLM_PROVIDER=fixture.
//
// The recorded replies are ai-service/tests/fixtures/llm/matching/<key>.json, keyed by the rendered
// prompt (ai-service/app/llm/providers/fixture_provider.py): a change to the prompt, to the verdicts
// code writes into it or to the data below needs new ones. A pair without one fails
// LLM_FIXTURE_MISSING, and this test writes its request to <tmpdir>/srm-matching-fixtures/<key>.json:
// fill `responses` there and copy the file to that directory.
import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { CampaignConfigSchema, type CvProfile, type JdRequirements, MatchingRunSchema, scvWeightsOf } from '@srm/shared';
import { eq } from 'drizzle-orm';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from 'pg';
import type { StartedTestContainer } from 'testcontainers';
import { matchResults, matchRuns } from '../../src/db/schema/index.js';
import { pairScv } from '../../src/modules/matching/domain/pair-scv.js';
import { createVhost, type RabbitVhost, startAiWorker } from '../helpers/ai-results.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn } from '../helpers/auth.js';
import { ownerDatabaseUrl } from '../helpers/db.js';
import { createCampaign, createCompany, createCv, createStudent, TEST_CAMPAIGN_TARGET } from '../helpers/factories.js';
import { createJdInState, inDays, testS3 } from '../helpers/jd.js';
import { waitFor } from '../helpers/notifications.js';

const LLM_LOGS_BUCKET = 'llm-logs';
const MISSING_REPLIES_DIR = path.join(tmpdir(), 'srm-matching-fixtures');

const project = (name: string, role: string, description: string, technologies: string[]) => ({
  name,
  role,
  description,
  technologies,
  start: '2024',
  end: '2025',
});

const profile = (summary: string, skills: string[], projects: CvProfile['projects']): CvProfile => ({
  summary,
  education: [],
  skills: skills.map((name) => ({ name, canonical_name: name, match: 'ALIAS' as const })),
  projects,
  experience: [],
  languages: [],
  certificates: [],
});

/**
 * S1 uses Java only through Spring Boot (Spring Boot ⇒ Spring Framework ⇒ Java) and knows MySQL,
 * of PostgreSQL's family; S2 builds React front ends and lists Java; S3 only scripts in Python.
 * The quotes of the recorded replies come from these texts, except one fabricated for S1 × JD1.
 */
const STUDENTS = {
  S1: {
    gpa: 3.6,
    profile: profile('Sinh viên năm 4 ngành Công nghệ thông tin, định hướng backend.', ['Spring Boot', 'MySQL', 'Docker'], [
      project(
        'Hệ thống quản lý thư viện',
        'Backend',
        'Xây dựng REST API quản lý mượn trả sách bằng Spring Boot và MySQL, đóng gói bằng Docker.',
        ['Spring Boot', 'MySQL', 'Docker'],
      ),
    ]),
  },
  S2: {
    gpa: 3,
    profile: profile('Sinh viên năm 3, thích làm giao diện web.', ['React', 'Java'], [
      project('Trang bán sách', 'Frontend', 'Làm giao diện trang bán sách bằng React, gọi API có sẵn.', ['React']),
    ]),
  },
  S3: {
    gpa: 2.5,
    profile: profile('Sinh viên năm 3 ngành Hệ thống thông tin.', ['Python'], [
      project('Thống kê điểm thi', 'Thành viên', 'Viết script Python thống kê điểm thi của lớp.', ['Python']),
    ]),
  },
} as const;

const noConditions: JdRequirements['hard_conditions'] = { majors: [], min_study_year: null, min_gpa: null, required_languages: [] };

const JDS: Record<'JD1' | 'JD2' | 'JD3' | 'JD4', JdRequirements> = {
  JD1: {
    must_have: [{ skill: 'Java', level: 'INTERMEDIATE', weight: 3 }],
    nice_to_have: [{ skill: 'Docker', level: 'BASIC', weight: 1 }],
    hard_conditions: noConditions,
    preferred_languages: [],
  },
  JD2: { must_have: [{ skill: 'PostgreSQL', level: 'BASIC', weight: 2 }], nice_to_have: [], hard_conditions: noConditions, preferred_languages: [] },
  JD3: { must_have: [{ skill: 'React', level: 'BASIC', weight: 2 }], nice_to_have: [], hard_conditions: noConditions, preferred_languages: [] },
  // GPA ≥ 3.5: only S1 passes the hard filter.
  JD4: {
    must_have: [{ skill: 'Java', level: 'BASIC', weight: 1 }],
    nice_to_have: [],
    hard_conditions: { ...noConditions, min_gpa: 3.5 },
    preferred_languages: [],
  },
};

type StudentName = keyof typeof STUDENTS;
type JdName = keyof typeof JDS;

describe('GĐ3 matching end to end with the AI Service (US-3.2)', () => {
  let vhost: RabbitVhost;
  let worker: StartedTestContainer;
  let t: AuthTestApp;
  let center: LoggedIn;
  let owner: Client;
  let s3: S3Client;

  beforeAll(async () => {
    vhost = await createVhost(`matching-e2e-${process.pid}`);
    // Read when the app is built; only this file's app consumes this vhost's ai.results.
    process.env.RABBITMQ_URL = vhost.url;
    t = await createAuthTestApp();
    center = await t.loginAs('CENTER');
    owner = new Client({ connectionString: ownerDatabaseUrl() });
    await owner.connect();
    s3 = testS3();
    const amqp = t.app.get(AmqpConnection);
    await waitFor(() => Promise.resolve(amqp.connected ? true : undefined), 30_000);
    // A batch of the fixture provider ends at once; the poller looks every second.
    worker = await startAiWorker(vhost, { LLM_BATCH_POLL_SECONDS: '1' });
  }, 900_000);

  afterAll(async () => {
    await t?.close();
    await worker?.stop();
    await owner?.end();
    await vhost?.remove();
  });

  /**
   * The requests of the job the fixture provider had no reply for, read from their llm-logs files
   * and written to MISSING_REPLIES_DIR with the scenario of each; their paths.
   */
  async function writeMissingReplies(jobId: string, scenarioOf: (batchKey: string) => string): Promise<string[]> {
    const { rows } = await owner.query<{ log_key: string }>(
      "SELECT log_key FROM ai.llm_calls WHERE job_id = $1 AND outcome = 'API_ERROR' ORDER BY log_key",
      [jobId],
    );
    const written: string[] = [];
    for (const { log_key: logKey } of rows) {
      const object = await s3.send(new GetObjectCommand({ Bucket: LLM_LOGS_BUCKET, Key: logKey }));
      const log = JSON.parse(await object.Body!.transformToString()) as {
        error: string | null;
        batch: { key: string };
        request: unknown;
      };
      const fixture = /^FIXTURE_MISSING: no LLM fixture at (\S+)$/.exec(log.error ?? '')?.[1];
      if (!fixture) continue;
      mkdirSync(MISSING_REPLIES_DIR, { recursive: true });
      const file = path.join(MISSING_REPLIES_DIR, path.posix.basename(fixture));
      writeFileSync(file, `${JSON.stringify({ scenario: scenarioOf(log.batch.key), request: log.request, responses: [] }, null, 2)}\n`);
      written.push(file);
    }
    return written;
  }

  it('GĐ3 end-to-end matching with AI fixture mode', async () => {
    const campaign = await createCampaign(t.db, {
      status: 'INTAKE',
      phaseDeadlines: { intake_end: inDays(7), preference_end: inDays(14), testing_end: inDays(21) },
      config: { target: TEST_CAMPAIGN_TARGET },
    });
    const { id: companyId } = await createCompany(t.db);
    const jdIds = {} as Record<JdName, number>;
    for (const name of Object.keys(JDS) as JdName[]) {
      jdIds[name] = (await createJdInState(t.db, { companyId, campaignId: campaign.id, status: 'APPROVED', requirements: JDS[name] })).id;
    }
    const cvIds = {} as Record<StudentName, number>;
    for (const name of Object.keys(STUDENTS) as StudentName[]) {
      const { gpa, profile: cvProfile } = STUDENTS[name];
      const student = await createStudent(t.db, { major: 'Công nghệ thông tin', gpa });
      const maskedText = [cvProfile.summary, ...cvProfile.projects.map((p) => `${p.name}: ${p.description}`)].join('\n');
      cvIds[name] = (
        await createCv(t.db, {
          studentId: student.id,
          campaignId: campaign.id,
          status: 'CONFIRMED',
          profile: cvProfile,
          profileMasked: cvProfile,
          maskedText,
        })
      ).id;
    }
    const nameOfCv = new Map(Object.entries(cvIds).map(([name, id]) => [id, name]));
    const nameOfJd = new Map(Object.entries(jdIds).map(([name, id]) => [id, name]));
    const scenarioOf = (batchKey: string) => {
      const [cvId, , jdId] = batchKey.split('_').map(Number);
      return `${nameOfCv.get(cvId!)} × ${nameOfJd.get(jdId!)}`;
    };

    const res = await center.agent.post(api(`campaigns/${campaign.id}/matching-runs`)).send().expect(202);
    const run = MatchingRunSchema.parse(res.body);
    expect(run).toMatchObject({ pairsTotal: 12, pairsIneligible: 2, pairsSent: 10 });

    // The consumer handles messages side by side (prefetch): the last one may close the run while
    // the chunk of assessments is still being stored, so wait for every pair too.
    const finished = await waitFor(async () => {
      const [row] = await t.db.select().from(matchRuns).where(eq(matchRuns.id, run.runId));
      return row && row.status !== 'RUNNING' && row.pairsScored + row.pairsFailed >= row.pairsSent ? row : undefined;
    }, 120_000);
    expect(await writeMissingReplies(run.jobId!, scenarioOf)).toEqual([]);
    expect(finished).toMatchObject({ status: 'SUCCEEDED', pairsScored: 10, pairsFailed: 0 });

    const rows = await t.db.select().from(matchResults).where(eq(matchResults.campaignId, campaign.id));
    const rowOf = (student: StudentName, jd: JdName) => {
      const row = rows.find((r) => r.cvId === cvIds[student] && r.jdId === jdIds[jd]);
      if (!row) throw new Error(`no row for ${student} × ${jd}`);
      return row;
    };

    // Hard filter (US-3.1): the reason is stored, nothing was sent.
    for (const student of ['S2', 'S3'] as const) {
      expect(rowOf(student, 'JD4')).toMatchObject({
        eligible: false,
        promptVersion: null,
        sCv: null,
        ineligibleReasons: [{ code: 'GPA_BELOW_MIN', required: 3.5, actual: STUDENTS[student].gpa }],
      });
    }

    // Skill matching through the taxonomy (US-3.5): Java through Spring Boot, PostgreSQL through MySQL.
    expect(rowOf('S1', 'JD1').criteria?.must_have[0]).toMatchObject({ skill: 'Java', match_kind: 'IMPLIED', via: 'Spring Boot' });
    expect(rowOf('S1', 'JD2').criteria?.must_have[0]).toMatchObject({ skill: 'PostgreSQL', match_kind: 'FAMILY', via: 'MySQL' });

    // Every eligible pair: the LLM part with S_cv code computed from it (US-3.1, AD-2).
    const weights = scvWeightsOf(CampaignConfigSchema.parse(campaign.config));
    const eligible = rows.filter((r) => r.eligible);
    expect(eligible).toHaveLength(10);
    for (const row of eligible) {
      expect(row).toMatchObject({ promptVersion: 'matching/v1', model: 'gemini-3.8-flash', needsReview: false });
      const jd = Object.entries(jdIds).find(([, id]) => id === row.jdId)![0] as JdName;
      const { scvX100, breakdown } = pairScv({ criteria: row.criteria!, assessment: row.assessment!, facts: row.facts }, JDS[jd], weights);
      expect({ sCv: row.sCv, breakdown: row.scvBreakdown }).toEqual({ sCv: scvX100 / 100, breakdown });
    }

    // The fabricated quote is flagged, and the project score stays as the LLM gave it (CONTEXT D46).
    const fabricated = rowOf('S1', 'JD1').assessment!;
    expect(fabricated.project_relevance.score_0_4).toBe(3);
    expect(fabricated.evidence_check.map((check) => check.matched)).toEqual([true, false]);

    // AC-14: one ai.llm_calls row per request of the batch.
    const { rows: calls } = await owner.query<{ agent: string; batch_id: string | null; outcome: string }>(
      'SELECT agent, batch_id, outcome FROM ai.llm_calls WHERE job_id = $1',
      [run.jobId],
    );
    expect(calls).toHaveLength(10);
    expect(calls.every((call) => call.agent === 'matching' && call.batch_id !== null && call.outcome === 'SUCCEEDED')).toBe(true);
  });
});
