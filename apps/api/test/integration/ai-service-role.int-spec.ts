// US-2.1 AC-8, AC-9 (AD-4, CONTEXT D33): the AI Service's database role reads `core` only through
// the PII-free views and writes only `ai`; the API's role writes `core` and only reads `ai`.
// US-2.2 AC-5 (CONTEXT D34): ai.llm_calls takes the row the AI Service writes for each LLM call.
// US-2.5 AC-5 (CONTEXT D39): the skill catalogue views, and ai.embeddings.
// US-3.2 AC-5, AC-17 (CONTEXT D46): the pairs awaiting the Matching Agent, and ai.llm_batches.
// US-4.1 AC-6 (CONTEXT D49): the question banks not yet locked, and ai.question_drafts; ai_service
// cannot write core.questions (the core tables loop below).
// US-4.2 AC-5 (CONTEXT D50): ai.question_validations, insert only.
// US-4.4 AC-3 (CONTEXT D53): the essay answers awaiting the Grader, without the student.
import {
  CV_STATES,
  JOB_DESCRIPTION_STATES,
  SKILL_STATES,
  cvMachine,
  jobDescriptionMachine,
  reachableFrom,
  skillMachine,
  type CvStatus,
  type JobDescriptionStatus,
  type MatchCodeCriteria,
  type SkillStatus,
} from '@srm/shared';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { aiDatabaseUrl, createTestDb, ownerDatabaseUrl, type TestDb } from '../helpers/db.js';
import { examAnswers, examSessions, matchResults, questionBanks, questions } from '../../src/db/schema/index.js';
import { createBank } from '../helpers/exam.js';
import { createCv, createJobDescription, createStudent, SAMPLE_CV_PROFILE } from '../helpers/factories.js';
import { SAMPLE_REQUIREMENTS } from '../helpers/jd.js';

const CV_VIEW = 'core.v_ai_cv_profile_masked';
const JD_VIEW = 'core.v_ai_jd_requirements';
const JD_SOURCE_VIEW = 'core.v_ai_jd_source';
const SKILLS_VIEW = 'core.v_ai_skills';
const SKILL_CANDIDATES_VIEW = 'core.v_ai_skill_candidates';
const MATCH_PAIRS_VIEW = 'core.v_ai_match_pairs';
const QUESTION_BANKS_VIEW = 'core.v_ai_question_banks';
const ESSAY_ANSWERS_VIEW = 'core.v_ai_essay_answers';

/** PostgreSQL's insufficient_privilege, raised before the statement touches any row. */
async function expectDenied(promise: Promise<unknown>): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code: '42501' });
}

async function connect(url: string): Promise<Client> {
  const client = new Client({ connectionString: url });
  await client.connect();
  return client;
}

describe('AD-4: database roles of the AI Service and the API', () => {
  let owner: Client;
  let ai: Client;
  let coreTables: string[];
  /** A column of each core table to name in UPDATE: not every table has `id` (skill_implications). */
  let firstColumns: Map<string, string>;

  beforeAll(async () => {
    owner = await connect(ownerDatabaseUrl());
    ai = await connect(aiDatabaseUrl());
    const { rows } = await owner.query<{ table_name: string; column_name: string }>(
      `SELECT DISTINCT ON (c.table_name) c.table_name, c.column_name
       FROM information_schema.columns c
       JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
       WHERE c.table_schema = 'core' AND t.table_type = 'BASE TABLE'
       ORDER BY c.table_name, c.ordinal_position`,
    );
    coreTables = rows.map((r) => r.table_name);
    firstColumns = new Map(rows.map((r) => [r.table_name, r.column_name]));
  });

  afterAll(async () => {
    await ai?.end();
    await owner?.end();
  });

  it('AD-4 tài khoản ai_service không ghi được schema core', async () => {
    expect(coreTables).toContain('cvs');
    for (const table of coreTables) {
      await expectDenied(ai.query(`INSERT INTO core.${table} DEFAULT VALUES`));
      await expectDenied(ai.query(`UPDATE core.${table} SET ${firstColumns.get(table)} = DEFAULT WHERE false`));
      await expectDenied(ai.query(`DELETE FROM core.${table} WHERE false`));
      await expectDenied(ai.query(`TRUNCATE core.${table}`));
      await expectDenied(ai.query(`SELECT 1 FROM core.${table} LIMIT 1`));
    }
  });

  it('AD-4 ai_service cannot change the views or create objects', async () => {
    await expectDenied(ai.query(`UPDATE ${CV_VIEW} SET version = version WHERE false`));
    await expectDenied(ai.query(`DELETE FROM ${JD_VIEW} WHERE false`));
    await expectDenied(ai.query('CREATE TABLE ai.ai_service_probe (id int)'));
    await expectDenied(ai.query('CREATE TABLE core.ai_service_probe (id int)'));
    await expectDenied(ai.query('CREATE TABLE public.ai_service_probe (id int)'));
  });

  it('AD-4 ai_service reads the views and reads and writes ai.jobs', async () => {
    await ai.query(`SELECT * FROM ${CV_VIEW} LIMIT 1`);
    await ai.query(`SELECT * FROM ${JD_VIEW} LIMIT 1`);
    const jobId = randomUUID();
    await ai.query("INSERT INTO ai.jobs (job_id, type, status, attempts) VALUES ($1, 'CV_PARSE', 'PROCESSING', 1)", [
      jobId,
    ]);
    await ai.query("UPDATE ai.jobs SET status = 'SUCCEEDED', finished_at = now() WHERE job_id = $1", [jobId]);
    const { rows } = await ai.query<{ status: string }>('SELECT status FROM ai.jobs WHERE job_id = $1', [jobId]);
    expect(rows).toEqual([{ status: 'SUCCEEDED' }]);
    await ai.query('DELETE FROM ai.jobs WHERE job_id = $1', [jobId]);
  });

  it('NFR-11 ai_service logs an LLM call in ai.llm_calls with every column it writes', async () => {
    // Same columns, in the same order, as ai-service/app/llm/recorder.py LLM_CALL_COLUMNS.
    const jobId = randomUUID();
    const logKey = `cv_parser/2026/10/${randomUUID()}.json`;
    await ai.query("INSERT INTO ai.jobs (job_id, type, status, attempts) VALUES ($1, 'CV_PARSE', 'PROCESSING', 1)", [
      jobId,
    ]);
    await ai.query(
      `INSERT INTO ai.llm_calls (job_id, agent, prompt_version, provider, model, effort, attempt, outcome,
         stop_reason, raw_stop_reason, input_tokens, cache_read_tokens, cache_write_tokens, output_tokens,
         cost_usd, latency_ms, log_key)
       VALUES ($1, 'cv_parser', 'cv_parser/v1', 'GEMINI', 'gemini-3.8-flash', 'LOW', 1, 'SUCCEEDED',
         'END_TURN', 'STOP', 4000, 0, 0, 2000, 0.0105, 1830, $2)`,
      [jobId, logKey],
    );
    const { rows } = await ai.query<{ cost_usd: string }>('SELECT cost_usd FROM ai.llm_calls WHERE log_key = $1', [
      logKey,
    ]);
    expect(rows).toEqual([{ cost_usd: '0.010500' }]);
    // A provider failure has no reply, so no stop reason; any other outcome must have one.
    await expect(
      ai.query(
        `INSERT INTO ai.llm_calls (agent, prompt_version, provider, model, effort, attempt, outcome, latency_ms, log_key)
         VALUES ('cv_parser', 'cv_parser/v1', 'GEMINI', 'gemini-3.8-flash', 'LOW', 1, 'SUCCEEDED', 5, $1)`,
        [`cv_parser/2026/10/${randomUUID()}.json`],
      ),
    ).rejects.toMatchObject({ code: '23514', constraint: 'llm_calls_stop_reason_present_check' });
    // The audit trail is append-only for the service it audits (migration 0008).
    await expectDenied(ai.query('UPDATE ai.llm_calls SET cost_usd = 0 WHERE log_key = $1', [logKey]));
    await expectDenied(ai.query('DELETE FROM ai.llm_calls WHERE log_key = $1', [logKey]));
    await owner.query('DELETE FROM ai.llm_calls WHERE log_key = $1', [logKey]);
    await ai.query('DELETE FROM ai.jobs WHERE job_id = $1', [jobId]);
  });

  it('AD-4 ai_service holds exactly these table grants', async () => {
    const { rows } = await owner.query<{ grant: string }>(
      `SELECT table_schema || '.' || table_name || ' ' || privilege_type AS grant
       FROM information_schema.table_privileges WHERE grantee = 'ai_service' ORDER BY 1`,
    );
    expect(rows.map((r) => r.grant)).toEqual([
      'ai.embeddings DELETE',
      'ai.embeddings INSERT',
      'ai.embeddings SELECT',
      'ai.embeddings UPDATE',
      'ai.jobs DELETE',
      'ai.jobs INSERT',
      'ai.jobs SELECT',
      'ai.jobs UPDATE',
      'ai.llm_batches DELETE',
      'ai.llm_batches INSERT',
      'ai.llm_batches SELECT',
      'ai.llm_batches UPDATE',
      'ai.llm_calls INSERT',
      'ai.llm_calls SELECT',
      'ai.question_drafts DELETE',
      'ai.question_drafts INSERT',
      'ai.question_drafts SELECT',
      'ai.question_drafts UPDATE',
      // US-4.2: one verdict per draft, insert only (migration 0031).
      'ai.question_validations INSERT',
      'ai.question_validations SELECT',
      `${CV_VIEW} SELECT`,
      `${ESSAY_ANSWERS_VIEW} SELECT`,
      `${JD_VIEW} SELECT`,
      `${JD_SOURCE_VIEW} SELECT`,
      `${MATCH_PAIRS_VIEW} SELECT`,
      `${QUESTION_BANKS_VIEW} SELECT`,
      `${SKILL_CANDIDATES_VIEW} SELECT`,
      `${SKILLS_VIEW} SELECT`,
    ]);
  });

  it('AD-4 api_service writes core (audit_logs insert-only) and only reads ai', async () => {
    const can = async (table: string, privilege: string) =>
      (
        await owner.query<{ ok: boolean }>('SELECT has_table_privilege($1, $2, $3) AS ok', [
          'api_service',
          table,
          privilege,
        ])
      ).rows[0]!.ok;
    for (const table of coreTables) {
      const audit = table === 'audit_logs';
      expect([table, await can(`core.${table}`, 'SELECT,INSERT')]).toEqual([table, true]);
      expect([table, await can(`core.${table}`, 'UPDATE')]).toEqual([table, !audit]);
      expect([table, await can(`core.${table}`, 'DELETE')]).toEqual([table, !audit]);
      expect([table, await can(`core.${table}`, 'TRUNCATE')]).toEqual([table, false]);
    }
    for (const table of [
      'ai.jobs',
      'ai.llm_calls',
      'ai.llm_batches',
      'ai.embeddings',
      'ai.question_drafts',
      'ai.question_validations',
    ]) {
      expect([table, await can(table, 'SELECT')]).toEqual([table, true]);
      for (const privilege of ['INSERT', 'UPDATE', 'DELETE']) {
        expect([table, privilege, await can(table, privilege)]).toEqual([table, privilege, false]);
      }
    }
    const { rows } = await owner.query<{ core: boolean; ai: boolean }>(
      "SELECT has_schema_privilege('api_service', 'core', 'CREATE') AS core, has_schema_privilege('api_service', 'ai', 'CREATE') AS ai",
    );
    expect(rows).toEqual([{ core: false, ai: false }]);
  });
});

describe('AD-4: views the AI Service reads', () => {
  let owner: Client;
  let ai: Client;
  let seed: TestDb;

  beforeAll(async () => {
    owner = await connect(ownerDatabaseUrl());
    ai = await connect(aiDatabaseUrl());
    seed = createTestDb();
  });

  afterAll(async () => {
    await seed?.close();
    await ai?.end();
    await owner?.end();
  });

  const columnsOf = async (view: string) => {
    const [schema, name] = view.split('.');
    const { rows } = await owner.query<{ column_name: string }>(
      'SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position',
      [schema, name],
    );
    return rows.map((r) => r.column_name);
  };

  it('BR-03 view v_ai_* không có cột PII', async () => {
    // An exact allow-list: any new column, PII or not, has to be added here on purpose.
    // masked_text: the CV text with personal data replaced, for the evidence check (US-2.4, D37).
    expect(await columnsOf(CV_VIEW)).toEqual(['cv_id', 'version', 'campaign_id', 'profile_masked', 'masked_text']);
    expect(await columnsOf(JD_VIEW)).toEqual(['jd_id', 'version', 'campaign_id', 'position_group', 'requirements']);
    // The company's own text; no student data and nothing of the JD's workflow (US-2.3).
    expect(await columnsOf(JD_SOURCE_VIEW)).toEqual(['jd_id', 'version', 'title', 'raw_text', 'file_key']);
    // The catalogue, and the names awaiting ADMIN; no data of who wrote them (US-2.5).
    expect(await columnsOf(SKILLS_VIEW)).toEqual(['skill_id', 'canonical_name', 'aliases', 'group', 'version']);
    expect(await columnsOf(SKILL_CANDIDATES_VIEW)).toEqual(['skill_id', 'name']);
    // Code verdicts quoting the masked profile; no facts (GPA, major) and no score (US-3.2 AC-5).
    expect(await columnsOf(MATCH_PAIRS_VIEW)).toEqual([
      'campaign_id',
      'cv_id',
      'cv_version',
      'jd_id',
      'jd_version',
      'rules_version',
      'criteria',
    ]);
    // The blueprint and which JD version it was made for; no question, no answer (US-4.1).
    expect(await columnsOf(QUESTION_BANKS_VIEW)).toEqual(['bank_id', 'jd_id', 'jd_version', 'campaign_id', 'blueprint']);
    // The question and the answer by session only; nothing of the student (US-4.4 AC-3, BR-03).
    expect(await columnsOf(ESSAY_ANSWERS_VIEW)).toEqual([
      'session_id',
      'question_id',
      'stem',
      'rubric',
      'sample_answer',
      'answer_text',
    ]);
  });

  it('US-4.4 v_ai_essay_answers shows only essays of closed sessions without a final score', async () => {
    const jd = await createJobDescription(seed.db, { status: 'APPROVED' });
    const bank = await createBank(seed.db, jd);
    const paper = await seed.db
      .select({ id: questions.id, type: questions.type, content: questions.content, rubric: questions.rubric, answerKey: questions.answerKey })
      .from(questions)
      .where(eq(questions.bankId, bank!.id))
      .orderBy(questions.id);
    const mcq = paper.find((question) => question.type === 'MCQ')!;
    const [graded, toGrade] = paper.filter((question) => question.type === 'ESSAY');
    const sessionIds: number[] = [];
    for (const status of ['SUBMITTED', 'IN_PROGRESS'] as const) {
      const student = await createStudent(seed.db);
      const startedAt = new Date(Date.now() - 30 * 60_000);
      const [session] = await seed.db
        .insert(examSessions)
        .values({
          studentId: student.id,
          bankId: bank!.id,
          bankVersion: bank!.version,
          seed: 1,
          questionIds: paper.map((question) => question.id),
          optionLayout: {},
          startedAt,
          deadlineAt: new Date(startedAt.getTime() + 45 * 60_000),
          status,
          submittedAt: status === 'SUBMITTED' ? new Date(startedAt.getTime() + 20 * 60_000) : null,
        })
        .returning({ id: examSessions.id });
      sessionIds.push(session!.id);
      await seed.db.insert(examAnswers).values([
        { sessionId: session!.id, questionId: mcq.id, answer: { code: 'a1', option: 0 } },
        { sessionId: session!.id, questionId: graded!.id, answer: { text: 'Đã chấm' }, finalScore: 3 },
        { sessionId: session!.id, questionId: toGrade!.id, answer: { text: 'Chỉ mục giúp tìm nhanh hơn.' } },
      ]);
    }
    const { rows } = await ai.query(`SELECT * FROM ${ESSAY_ANSWERS_VIEW} WHERE session_id = ANY($1)`, [sessionIds]);
    expect(rows).toEqual([
      {
        session_id: String(sessionIds[0]),
        question_id: String(toGrade!.id),
        stem: toGrade!.content.stem,
        rubric: toGrade!.rubric,
        sample_answer: toGrade!.answerKey.sample_answer,
        answer_text: 'Chỉ mục giúp tìm nhanh hơn.',
      },
    ]);
  });

  it('US-4.1 v_ai_question_banks shows only banks not yet locked', async () => {
    const blueprint = {
      duration_minutes: 45,
      parts: {
        A: { weight_percent: 60, question_count: 1, cells: [{ skill: 'SQL', difficulty: 'EASY' as const, count: 1 }] },
        B: { weight_percent: 40, question_count: 2, cells: [{ skill: 'SQL', difficulty: 'MEDIUM' as const, count: 2 }] },
      },
    };
    const ids: number[] = [];
    for (const lockedAt of [null, new Date()]) {
      const jd = await createJobDescription(seed.db, { status: 'APPROVED' });
      const [bank] = await seed.db
        .insert(questionBanks)
        .values({
          campaignId: jd.campaignId,
          jdId: jd.id,
          jdVersion: jd.version,
          blueprint,
          status: lockedAt === null ? 'OPEN' : 'LOCKED',
          lockedAt,
        })
        .returning({ id: questionBanks.id });
      ids.push(bank!.id);
    }
    const { rows } = await ai.query<{ bank_id: string; blueprint: unknown }>(
      `SELECT bank_id, blueprint FROM ${QUESTION_BANKS_VIEW} WHERE bank_id = ANY($1)`,
      [ids],
    );
    expect(rows).toEqual([{ bank_id: String(ids[0]), blueprint }]);
  });

  it('US-3.2 v_ai_match_pairs shows only eligible top-M pairs awaiting the LLM', async () => {
    const cv = await createCv(seed.db);
    const criteria: MatchCodeCriteria = {
      must_have: [],
      nice_to_have: [],
      education: { major_match: 'EXACT', major_unrecognized: false },
      language: null,
      zones: [],
      gaps: [],
    };
    const facts = { major: 'CNTT', yearOfStudy: 3, gpa4: 3.2, languageCertificates: [] };
    const assessment = {
      project_relevance: { score_0_4: 2, reason: 'x', evidence: [] },
      strengths: [],
      suggestions: [],
      summary: 'x',
      evidence_check: [],
    };
    const cases = [
      { visible: true, row: {} },
      { visible: false, row: { skippedByPrefilter: true } },
      { visible: false, row: { needsReview: true } },
      {
        visible: false,
        row: { promptVersion: 'matching/v1', model: 'm', assessment, sCv: 50, scvBreakdown: [] },
      },
      {
        visible: false,
        row: {
          eligible: false,
          criteria: null,
          skillFit: null,
          ineligibleReasons: [{ code: 'GPA_MISSING' as const, required: 2.5, actual: null }],
        },
      },
    ];
    const ids: number[] = [];
    for (const c of cases) {
      const jd = await createJobDescription(seed.db, { campaignId: cv.campaignId, status: 'APPROVED' });
      const [row] = await seed.db
        .insert(matchResults)
        .values({
          campaignId: cv.campaignId,
          studentId: cv.studentId,
          cvId: cv.id,
          cvVersion: cv.version,
          jdId: jd.id,
          jdVersion: jd.version,
          rulesVersion: 'matching-rules/v1',
          eligible: true,
          facts,
          criteria,
          skillFit: 50,
          ...c.row,
        })
        .returning({ id: matchResults.id, jdId: matchResults.jdId });
      ids.push(row!.jdId);
    }
    const { rows } = await ai.query<{ jd_id: string }>(`SELECT jd_id FROM ${MATCH_PAIRS_VIEW} WHERE jd_id = ANY($1)`, [ids]);
    const visible = new Set(rows.map((r) => Number(r.jd_id)));
    expect(ids.map((jdId) => visible.has(jdId))).toEqual(cases.map((c) => c.visible));
  });

  it('FR-13 v_ai_skills shows only approved skills; v_ai_skill_candidates only those awaiting review', async () => {
    const catalogue = new Set<SkillStatus>(reachableFrom(skillMachine, 'APPROVED'));
    const insert = async (status: SkillStatus, mergedIntoId: number | null = null) => {
      const name = `Role test skill ${status} ${randomUUID()}`;
      const { rows } = await owner.query<{ id: string }>(
        `INSERT INTO core.skills (canonical_name, name_key, "group", status, merged_into_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [name, name.toLowerCase().replace(/[\s._/-]+/g, ''), status === 'APPROVED' ? 'TOOL' : null, status, mergedIntoId],
      );
      return Number(rows[0]!.id);
    };
    // One client runs one query at a time: no Promise.all here.
    const target = await insert('APPROVED');
    const skills: { status: SkillStatus; id: number }[] = [];
    for (const status of SKILL_STATES) {
      skills.push({ status, id: status === 'APPROVED' ? target : await insert(status, status === 'MERGED' ? target : null) });
    }
    const ids = skills.map((s) => s.id);
    const visible = async (view: string) =>
      new Set(
        (await ai.query<{ skill_id: string }>(`SELECT skill_id FROM ${view} WHERE skill_id = ANY($1)`, [ids])).rows.map(
          (r) => Number(r.skill_id),
        ),
      );
    const approved = await visible(SKILLS_VIEW);
    const pending = await visible(SKILL_CANDIDATES_VIEW);
    for (const skill of skills) {
      expect([skill.status, approved.has(skill.id), pending.has(skill.id)]).toEqual([
        skill.status,
        catalogue.has(skill.status),
        skill.status === 'PENDING',
      ]);
    }
  });

  it('AD-4 v_ai_jd_source shows only JDs awaiting analysis (US-2.3, CONTEXT D35)', async () => {
    const cases = [
      { status: 'PENDING_HR_CONFIRMATION', analysisStatus: 'PENDING', requirements: null, visible: true },
      { status: 'PENDING_HR_CONFIRMATION', analysisStatus: 'PENDING', requirements: SAMPLE_REQUIREMENTS, visible: false },
      { status: 'PENDING_HR_CONFIRMATION', analysisStatus: 'SUCCEEDED', requirements: SAMPLE_REQUIREMENTS, visible: false },
      { status: 'PENDING_HR_CONFIRMATION', analysisStatus: 'FAILED', requirements: null, visible: false },
      { status: 'PENDING_HR_CONFIRMATION', analysisStatus: null, requirements: null, visible: false },
      { status: 'DRAFT', analysisStatus: null, requirements: null, visible: false },
      { status: 'APPROVED', analysisStatus: 'PENDING', requirements: null, visible: false },
    ] as const;
    const jds = await Promise.all(
      cases.map(async (c) => ({
        ...c,
        id: (
          await createJobDescription(seed.db, {
            status: c.status,
            analysisStatus: c.analysisStatus,
            requirements: c.requirements,
            rawText: 'Mô tả',
          })
        ).id,
      })),
    );
    const { rows } = await ai.query<{ jd_id: string }>(`SELECT jd_id FROM ${JD_SOURCE_VIEW} WHERE jd_id = ANY($1)`, [
      jds.map((jd) => jd.id),
    ]);
    const visible = new Set(rows.map((r) => Number(r.jd_id)));
    for (const jd of jds) {
      expect([jd.status, jd.analysisStatus, jd.requirements !== null, visible.has(jd.id)]).toEqual([
        jd.status,
        jd.analysisStatus,
        jd.requirements !== null,
        jd.visible,
      ]);
    }
  });

  it('BR-01 BR-02 view chỉ trả dữ liệu đã xác nhận', async () => {
    const readable = new Set<CvStatus>(reachableFrom(cvMachine, 'CONFIRMED'));
    const cvs = await Promise.all(
      CV_STATES.flatMap((status) =>
        [true, false].map(async (active) => ({
          status,
          active,
          id: (await createCv(seed.db, { status, active, maskedText: '[NAME] SQL' })).id,
        })),
      ),
    );
    const { rows: cvRows } = await ai.query<{ cv_id: string; profile_masked: unknown; masked_text: string }>(
      `SELECT cv_id, profile_masked, masked_text FROM ${CV_VIEW} WHERE cv_id = ANY($1)`,
      [cvs.map((cv) => cv.id)],
    );
    const visibleCvs = new Set(cvRows.map((r) => Number(r.cv_id)));
    for (const cv of cvs) {
      expect([cv.status, cv.active, visibleCvs.has(cv.id)]).toEqual([cv.status, cv.active, cv.active && readable.has(cv.status)]);
    }
    for (const row of cvRows) expect([row.profile_masked, row.masked_text]).toEqual([SAMPLE_CV_PROFILE, '[NAME] SQL']);

    const approved = new Set<JobDescriptionStatus>(reachableFrom(jobDescriptionMachine, 'APPROVED'));
    const jds = await Promise.all(
      JOB_DESCRIPTION_STATES.map(async (status) => ({ status, id: (await createJobDescription(seed.db, { status })).id })),
    );
    const { rows: jdRows } = await ai.query<{ jd_id: string }>(`SELECT jd_id FROM ${JD_VIEW} WHERE jd_id = ANY($1)`, [
      jds.map((jd) => jd.id),
    ]);
    const visibleJds = new Set(jdRows.map((r) => Number(r.jd_id)));
    for (const jd of jds) expect([jd.status, visibleJds.has(jd.id)]).toEqual([jd.status, approved.has(jd.status)]);
  });
});
