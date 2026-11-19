// US-4.1 AC-3, AC-4, AC-9 (FR-18, BR-02, BR-05, GĐ5, CONTEXT D49): the question bank of an approved
// JD, its exam blueprint as CENTER edits it, and the generation runs of the Test Generator. US-4.11
// (CONTEXT D60): CENTER reads every question of the bank and rejects wrong ones by hand. The AI
// Service is not running here: jobs stay in their queue and results are handed to the listener.
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ApiErrorSchema,
  BankQuestionListSchema,
  CV_VERIFICATION_DEFAULTS,
  type ExamBlueprint,
  ExamBlueprintViewSchema,
  type GeneratedQuestion,
  QuestionGenerationRunSchema,
  type QuestionsGenerateJob,
  RejectQuestionResultSchema,
} from '@srm/shared';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { auditLogs, jobDescriptions, questionBanks, questionGenerationRuns, questions } from '../../src/db/schema/index.js';
import { PG_POOL } from '../../src/db/tokens.js';
import { AI_JOB_DISPATCHED, type AiJobDispatchedEvent, type AiResultEvent } from '../../src/modules/aigateway/index.js';
import { QuestionBankService } from '../../src/modules/assessment/application/question-bank.service.js';
import { buildDefaultBlueprint } from '../../src/modules/assessment/domain/blueprint.js';
import type { JdEvent } from '../../src/modules/company/index.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn } from '../helpers/auth.js';
import { createCompany } from '../helpers/factories.js';
import { captureEvents, createJdInState } from '../helpers/jd.js';
import { waitFor } from '../helpers/notifications.js';
import {
  BANK_REQUIREMENTS as REQUIREMENTS,
  deliverResult,
  essay,
  GENERATOR_PROMPT as PROMPT,
  mcq,
  MODEL,
  resultMessage as message,
  SMALL_BLUEPRINT,
  smallBankDrafts,
  verdict,
} from '../helpers/question-bank.js';

/** The default blueprint of REQUIREMENTS with the campaign default T_test of 45 minutes. */
const DEFAULT_BLUEPRINT = buildDefaultBlueprint(REQUIREMENTS, { durationMinutes: 45 });

describe('GĐ5 question bank and exam blueprint (US-4.1)', () => {
  let t: AuthTestApp;
  let center: LoggedIn;
  let companyId: number;
  let dispatched: AiJobDispatchedEvent<'QUESTIONS_GENERATE'>[];

  beforeAll(async () => {
    t = await createAuthTestApp();
    center = await t.loginAs('CENTER');
    companyId = (await createCompany(t.db)).id;
    dispatched = captureEvents(t.app, AI_JOB_DISPATCHED);
  });

  afterAll(async () => {
    await t.close();
  });

  const approvedJd = () => createJdInState(t.db, { companyId, status: 'APPROVED', requirements: REQUIREMENTS });

  const getBlueprint = (jdId: number, as: LoggedIn = center) => as.agent.get(api(`jds/${jdId}/exam-blueprint`));
  const putBlueprint = (jdId: number, rowVersion: number, blueprint: unknown, as: LoggedIn = center) =>
    as.agent.put(api(`jds/${jdId}/exam-blueprint`)).send({ rowVersion, blueprint });
  const generate = (jdId: number, as: LoggedIn = center) => as.agent.post(api(`jds/${jdId}/question-bank/generate`)).send();

  const bankOf = async (jdId: number) => {
    const [bank] = await t.db.select().from(questionBanks).where(eq(questionBanks.jdId, jdId));
    return bank;
  };
  const runsOf = (bankId: number) =>
    t.db.select().from(questionGenerationRuns).where(eq(questionGenerationRuns.bankId, bankId)).orderBy(questionGenerationRuns.id);
  const questionsOf = (bankId: number) =>
    t.db.select().from(questions).where(eq(questions.bankId, bankId)).orderBy(questions.draftId);
  const jobsOf = (bankId: number) => dispatched.filter((event) => event.type === 'QUESTIONS_GENERATE' && event.job.bank_id === bankId);

  const deliver = (result: AiResultEvent<'QUESTIONS_GENERATE'>) => deliverResult(t.app, result);

  it('GĐ5 AC-4 approving a JD makes its bank with the default blueprint and sends one job', async () => {
    const jd = await createJdInState(t.db, { companyId, status: 'PENDING_APPROVAL', requirements: REQUIREMENTS });
    await center.agent.post(api(`jds/${jd.id}/approve`)).send({ rowVersion: jd.rowVersion }).expect(200);

    const bank = await waitFor(() => bankOf(jd.id));
    expect(bank).toMatchObject({
      jdVersion: jd.version,
      status: 'OPEN',
      version: 1,
      lockedAt: null,
      blueprint: DEFAULT_BLUEPRINT,
    });
    const [run] = await waitFor(async () => {
      const rows = await runsOf(bank.id);
      return rows[0]?.dispatchedAt ? rows : undefined;
    });
    expect(run).toMatchObject({ status: 'RUNNING', actorKind: 'SYSTEM', finishedAt: null });
    // One job, IDs only (AD-5), with the job id the run stored before it was sent (LESSONS §33).
    expect(jobsOf(bank.id).map((event) => event.job)).toEqual([{ job_id: run!.jobId, bank_id: bank.id }]);

    // A duplicate event finds the run: no second bank, run or job. The listener is called itself:
    // `emitAsync` does not wait for an `async: true` listener.
    const event: JdEvent = { jdId: jd.id, campaignId: jd.campaignId, companyId, version: jd.version };
    await t.app.get(QuestionBankService).onJdApproved(event);
    expect(await runsOf(bank.id)).toHaveLength(1);
    expect(jobsOf(bank.id)).toHaveLength(1);
  });

  it('GĐ5 AC-4 a bank the blueprint screen made before jd.approved was handled still gets one job', async () => {
    // The center opens the "Ngân hàng câu hỏi" tab as soon as the JD shows approved.
    const jd = await approvedJd();
    await getBlueprint(jd.id).expect(200);
    const bank = (await bankOf(jd.id))!;
    expect(await runsOf(bank.id)).toHaveLength(0);

    const event: JdEvent = { jdId: jd.id, campaignId: jd.campaignId, companyId, version: jd.version };
    await t.app.get(QuestionBankService).onJdApproved(event);
    await t.app.get(QuestionBankService).onJdApproved(event);
    const runs = await runsOf(bank.id);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ status: 'RUNNING', actorKind: 'SYSTEM' });
    expect(jobsOf(bank.id).map((sent) => sent.job)).toEqual([{ job_id: runs[0]!.jobId, bank_id: bank.id }]);
  });

  it('GĐ5 AC-4 POST generate while a run is RUNNING returns it and sends nothing', async () => {
    const jd = await approvedJd();
    const first = QuestionGenerationRunSchema.parse((await generate(jd.id).expect(202)).body);
    expect(first).toMatchObject({ status: 'RUNNING', missingCells: null, questionsReceived: 0 });
    const again = QuestionGenerationRunSchema.parse((await generate(jd.id).expect(202)).body);
    expect(again.runId).toBe(first.runId);
    const bank = (await bankOf(jd.id))!;
    expect(jobsOf(bank.id)).toHaveLength(1);
  });

  it('BR-02 AC-4 a JD not yet approved has no bank: 409 JD_NOT_APPROVED; an unknown JD 404', async () => {
    const jd = await createJdInState(t.db, { companyId, status: 'PENDING_APPROVAL', requirements: REQUIREMENTS });
    for (const res of [await getBlueprint(jd.id), await generate(jd.id), await putBlueprint(jd.id, 0, DEFAULT_BLUEPRINT)]) {
      expect(res.status).toBe(409);
      expect(ApiErrorSchema.parse(res.body).code).toBe('JD_NOT_APPROVED');
    }
    expect(await bankOf(jd.id)).toBeUndefined();
    await getBlueprint(9_999_999).expect(404);
  });

  it('BR-05 AC-3 only CENTER reaches the blueprint and the generation', async () => {
    const jd = await approvedJd();
    for (const role of ['HR', 'STUDENT'] as const) {
      const as = await t.loginAs(role, role === 'HR' ? { companyId } : {});
      await getBlueprint(jd.id, as).expect(403);
      await putBlueprint(jd.id, 0, DEFAULT_BLUEPRINT, as).expect(403);
      await generate(jd.id, as).expect(403);
    }
    expect(await bankOf(jd.id)).toBeUndefined();
  });

  it('BR-05 AC-3 CENTER reads the blueprint with its coverage and edits it with row_version and audit', async () => {
    const jd = await approvedJd();
    // A JD approved without its event gets the bank on first read, without a job.
    const view = ExamBlueprintViewSchema.parse((await getBlueprint(jd.id).expect(200)).body);
    expect(view).toMatchObject({ jdId: jd.id, rowVersion: 0, locked: false, editable: true, run: null });
    expect(view.blueprint).toEqual(DEFAULT_BLUEPRINT);
    expect(view.requirements).toEqual(REQUIREMENTS);
    expect(view.coverage[0]).toEqual({
      part: 'A',
      type: 'MCQ',
      skill: 'Java',
      difficulty: 'EASY',
      needed: DEFAULT_BLUEPRINT.parts.A.cells[0]!.count,
      drafted: 0,
      validated: 0,
      rejected: 0,
      pending: 0,
      usable: 0,
      rejectReasons: {},
      min: DEFAULT_BLUEPRINT.parts.A.cells[0]!.count * 3,
      max: DEFAULT_BLUEPRINT.parts.A.cells[0]!.count * 5,
    });
    expect(jobsOf(view.bankId)).toHaveLength(0);

    const edited: ExamBlueprint = {
      duration_minutes: 60,
      parts: {
        A: {
          weight_percent: 70,
          question_count: 10,
          cells: [
            { skill: 'Java', difficulty: 'MEDIUM', count: 6 },
            { skill: 'docker', difficulty: 'EASY', count: 4 },
          ],
        },
        B: { weight_percent: 30, question_count: 3, cells: [{ skill: 'SQL', difficulty: 'HARD', count: 3 }] },
      },
    };
    // HR versioned the requirements since the bank was made (BR-18): the blueprint is checked
    // against the current ones, so the bank records their version.
    await t.db.update(jobDescriptions).set({ version: jd.version + 1 }).where(eq(jobDescriptions.id, jd.id));
    const saved = ExamBlueprintViewSchema.parse((await putBlueprint(jd.id, 0, edited).expect(200)).body);
    expect(saved).toMatchObject({ rowVersion: 1, jdVersion: jd.version + 1, blueprint: edited });
    expect(saved.coverage.map((cell) => [cell.part, cell.skill, cell.difficulty, cell.min, cell.max])).toEqual([
      ['A', 'Java', 'MEDIUM', 18, 30],
      ['A', 'docker', 'EASY', 12, 20],
      ['B', 'SQL', 'HARD', 9, 15],
    ]);
    const [entry] = await t.db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entity, 'question_bank'), eq(auditLogs.entityId, view.bankId), eq(auditLogs.action, 'EXAM_BLUEPRINT_UPDATED')));
    expect(entry).toMatchObject({
      actorId: center.user.id,
      before: { blueprint: DEFAULT_BLUEPRINT, jdVersion: jd.version },
      after: { blueprint: edited, jdVersion: jd.version + 1 },
    });

    // The stored row_version moved on: the old one is a conflict.
    const stale = await putBlueprint(jd.id, 0, edited).expect(409);
    expect(ApiErrorSchema.parse(stale.body).code).toBe('ROW_VERSION_CONFLICT');
  });

  it('FR-25 part C is saved with the blueprint and kept when a request leaves it out; 2 or 3 questions (US-4.8 AC-1)', async () => {
    const jd = await approvedJd();
    const view = ExamBlueprintViewSchema.parse((await getBlueprint(jd.id).expect(200)).body);
    expect(view.cvVerification).toEqual(CV_VERIFICATION_DEFAULTS);
    const put = (rowVersion: number, cvVerification?: unknown) =>
      center.agent.put(api(`jds/${jd.id}/exam-blueprint`)).send({ rowVersion, blueprint: view.blueprint, cvVerification });
    const on = { enabled: true, questionCount: 3 };
    expect(ExamBlueprintViewSchema.parse((await put(0, on).expect(200)).body).cvVerification).toEqual(on);
    expect(ExamBlueprintViewSchema.parse((await put(1).expect(200)).body).cvVerification).toEqual(on);
    await put(2, { enabled: true, questionCount: 4 }).expect(400);
    // The database holds the same range (Invariant 11).
    await expect(
      t.app.get<Pool>(PG_POOL).query('UPDATE core.question_banks SET cv_verification_count = 4 WHERE jd_id = $1', [jd.id]),
    ).rejects.toMatchObject({ code: '23514', constraint: 'question_banks_cv_verification_count_check' });
  });

  it('BR-05 AC-2 a blueprint naming a skill outside the JD is a 400 on that field', async () => {
    const jd = await approvedJd();
    const bad = structuredClone(DEFAULT_BLUEPRINT);
    bad.parts.A.cells[0]!.skill = 'Kotlin';
    bad.parts.A.weight_percent = 50;
    const res = await putBlueprint(jd.id, 0, bad).expect(400);
    const body = ApiErrorSchema.parse(res.body);
    expect(body.code).toBe('VALIDATION_FAILED');
    const issues = (body.details?.issues ?? []) as { path: string }[];
    expect(issues.map((issue) => issue.path).sort()).toEqual(['blueprint.parts.A.cells.0.skill', 'blueprint.parts.B.weight_percent']);
    // A part C is refused by the request schema itself (Q7).
    const withC = { ...DEFAULT_BLUEPRINT, parts: { ...DEFAULT_BLUEPRINT.parts, C: DEFAULT_BLUEPRINT.parts.B } };
    await putBlueprint(jd.id, 0, withC).expect(400);
  });

  it('BR-05 AC-3 the blueprint is read only while a run is RUNNING and once the bank is locked', async () => {
    const jd = await approvedJd();
    await generate(jd.id).expect(202);
    const running = ExamBlueprintViewSchema.parse((await getBlueprint(jd.id).expect(200)).body);
    expect(running).toMatchObject({ editable: false, run: { status: 'RUNNING' } });
    const busy = await putBlueprint(jd.id, running.rowVersion, DEFAULT_BLUEPRINT).expect(409);
    expect(ApiErrorSchema.parse(busy.body).code).toBe('QUESTION_GENERATION_RUNNING');

    await t.db.update(questionBanks).set({ status: 'LOCKED', lockedAt: new Date() }).where(eq(questionBanks.id, running.bankId));
    for (const res of [await putBlueprint(jd.id, running.rowVersion, DEFAULT_BLUEPRINT), await generate(jd.id)]) {
      expect(res.status).toBe(409);
      expect(ApiErrorSchema.parse(res.body).code).toBe('QUESTION_BANK_LOCKED');
    }
    expect(ExamBlueprintViewSchema.parse((await getBlueprint(jd.id).expect(200)).body)).toMatchObject({
      locked: true,
      editable: false,
    });
  });

  it('AD-5 AC-9 drafts are stored once by draft_id, split from their answer key; a duplicate adds nothing', async () => {
    const jd = await approvedJd();
    const run = QuestionGenerationRunSchema.parse((await generate(jd.id).expect(202)).body);
    const bank = (await bankOf(jd.id))!;
    const [{ job }] = jobsOf(bank.id) as [AiJobDispatchedEvent<'QUESTIONS_GENERATE'>];
    const drafts = [mcq('Java'), mcq('java'), essay('Java')];
    const missing = [
      { type: 'MCQ' as const, skill: 'SQL', difficulty: 'HARD' as const, drafted: 0, validated: 0, usable: 0, required: 3 },
    ];
    const result = message(job, { questions: drafts, missing_cells: missing }, 'PARTIAL');
    await deliver(result);
    await deliver(result);

    const rows = await questionsOf(bank.id);
    expect(rows.map((row) => [row.draftId, row.type, row.status, row.model, row.promptVersion])).toEqual(
      drafts.map((draft) => [draft.draft_id, draft.type, 'DRAFT', MODEL, PROMPT]),
    );
    // Invariant 8: what a student may see carries no answer.
    expect(rows[0]).toMatchObject({
      content: { stem: drafts[0]!.stem, options: ['Phương án A', 'Phương án B', 'Phương án C', 'Phương án D'] },
      answerKey: { correct_option: 1, explanation: 'Phương án B đúng vì …', sample_answer: null },
      rubric: null,
    });
    expect(rows[2]).toMatchObject({
      content: { stem: drafts[2]!.stem, options: null },
      answerKey: { correct_option: null, sample_answer: 'Đáp án mẫu …' },
      rubric: [
        { criterion: 'Nêu đúng khái niệm', max_points: 4 },
        { criterion: 'Có ví dụ', max_points: 6 },
      ],
    });
    const [closed] = await runsOf(bank.id);
    expect(closed).toMatchObject({ id: run.runId, status: 'PARTIAL', missingCells: missing, questionsReceived: 3 });

    // The coverage counts the drafts by skillKey ("java" is Java).
    const view = ExamBlueprintViewSchema.parse((await getBlueprint(jd.id).expect(200)).body);
    expect(view.coverage.find((cell) => cell.type === 'MCQ' && cell.skill === 'Java' && cell.difficulty === 'EASY')?.drafted).toBe(2);
    expect(view.coverage.find((cell) => cell.type === 'ESSAY' && cell.skill === 'Java')?.drafted).toBe(1);
    expect(view).toMatchObject({ editable: true, run: { status: 'PARTIAL', missingCells: missing } });

    // The next job's result carries every draft of the bank again: only the new one is added.
    const next = QuestionGenerationRunSchema.parse((await generate(jd.id).expect(202)).body);
    expect(next.runId).not.toBe(run.runId);
    const nextJob = jobsOf(bank.id)[1]!.job;
    await deliver(message(nextJob, { questions: [...drafts, mcq('SQL', 'HARD')] }));
    expect(await questionsOf(bank.id)).toHaveLength(4);
    expect((await runsOf(bank.id))[1]).toMatchObject({ status: 'SUCCEEDED', missingCells: [], questionsReceived: 1 });
  });

  it('AD-5 AC-9 an answer that comes before the API has answered still closes its run', async () => {
    // A worker that answers at once: the result is handled as soon as the broker took the job.
    const events = t.app.get(EventEmitter2);
    const answers: Promise<unknown>[] = [];
    const answer = (event: AiJobDispatchedEvent) => {
      if (event.type !== 'QUESTIONS_GENERATE') return;
      const job = event.job as QuestionsGenerateJob;
      answers.push(deliver(message(job, { questions: [mcq('SQL')] })));
    };
    events.on(AI_JOB_DISPATCHED, answer);
    try {
      const jd = await approvedJd();
      const run = QuestionGenerationRunSchema.parse((await generate(jd.id).expect(202)).body);
      await Promise.all(answers);
      const bank = (await bankOf(jd.id))!;
      expect((await runsOf(bank.id))[0]).toMatchObject({ id: run.runId, status: 'SUCCEEDED', questionsReceived: 1 });
    } finally {
      events.off(AI_JOB_DISPATCHED, answer);
    }
  });

  it('AD-5 AC-9 a failed job closes its run FAILED; a result for a locked bank stores nothing', async () => {
    const jd = await approvedJd();
    await generate(jd.id).expect(202);
    const bank = (await bankOf(jd.id))!;
    await deliver(message(jobsOf(bank.id)[0]!.job, null, 'FAILED'));
    expect((await runsOf(bank.id))[0]).toMatchObject({ status: 'FAILED', errorCode: 'LLM_REFUSAL', missingCells: null });

    // The bank takes a new run, then is locked before its result comes.
    await generate(jd.id).expect(202);
    await t.db.update(questionBanks).set({ status: 'LOCKED', lockedAt: new Date() }).where(eq(questionBanks.id, bank.id));
    await deliver(message(jobsOf(bank.id)[1]!.job, { questions: [mcq('Java')] }));
    expect(await questionsOf(bank.id)).toHaveLength(0);
    expect((await runsOf(bank.id))[1]).toMatchObject({ status: 'SUCCEEDED', questionsReceived: 0 });
  });

  it('AD-5 AC-4 a run never handed to the broker is closed STALE by the next request', async () => {
    const jd = await approvedJd();
    const view = ExamBlueprintViewSchema.parse((await getBlueprint(jd.id).expect(200)).body);
    const [lost] = await t.db
      .insert(questionGenerationRuns)
      .values({
        bankId: view.bankId,
        jobId: randomUUID(),
        status: 'RUNNING',
        actorKind: 'SYSTEM',
        createdAt: new Date(Date.now() - 20 * 60_000),
      })
      .returning();
    const next = QuestionGenerationRunSchema.parse((await generate(jd.id).expect(202)).body);
    expect(next.runId).not.toBe(lost!.id);
    expect((await runsOf(view.bankId))[0]).toMatchObject({ status: 'FAILED', errorCode: 'STALE' });
  });

  it('AD-5 AC-3 reading the blueprint closes a run whose result can no longer come, so CENTER can edit again', async () => {
    const jd = await approvedJd();
    const view = ExamBlueprintViewSchema.parse((await getBlueprint(jd.id).expect(200)).body);
    const [lost] = await t.db
      .insert(questionGenerationRuns)
      .values({
        bankId: view.bankId,
        jobId: randomUUID(),
        status: 'RUNNING',
        actorKind: 'SYSTEM',
        dispatchedAt: new Date(Date.now() - 25 * 3_600_000),
        createdAt: new Date(Date.now() - 25 * 3_600_000),
      })
      .returning();
    const read = ExamBlueprintViewSchema.parse((await getBlueprint(jd.id).expect(200)).body);
    expect(read).toMatchObject({ editable: true, run: { runId: lost!.id, status: 'FAILED', errorCode: 'STALE' } });

    // A run within its time stays RUNNING.
    await generate(jd.id).expect(202);
    expect(ExamBlueprintViewSchema.parse((await getBlueprint(jd.id).expect(200)).body)).toMatchObject({
      editable: false,
      run: { status: 'RUNNING' },
    });
  });

  // --- US-4.11: every question of the bank, and CENTER rejecting one by hand ------------------------

  const listQuestions = (bankId: number, as: LoggedIn = center) => as.agent.get(api(`question-banks/${bankId}/questions`));
  const reject = (questionId: number, body: object, as: LoggedIn = center) =>
    as.agent.post(api(`questions/${questionId}/reject`)).send(body);
  const errorCode = (body: unknown) => ApiErrorSchema.parse(body).code;
  const questionRow = async (id: number) => (await t.db.select().from(questions).where(eq(questions.id, id)))[0]!;

  /** An approved JD whose bank holds SMALL_BLUEPRINT filled to 3× VALIDATED, and `extra` drafts. */
  async function filledBank(extra: GeneratedQuestion[] = []) {
    const jd = await approvedJd();
    const view = ExamBlueprintViewSchema.parse((await getBlueprint(jd.id).expect(200)).body);
    await putBlueprint(jd.id, view.rowVersion, SMALL_BLUEPRINT).expect(200);
    await generate(jd.id).expect(202);
    await deliver(message(jobsOf(view.bankId).at(-1)!.job, { questions: [...smallBankDrafts(), ...extra] }));
    return { jdId: jd.id, bankId: view.bankId, rows: await questionsOf(view.bankId) };
  }

  it('FR-18 US-4.11 AC-1 CENTER reads every question in every status with its answer key and AI check; HR and STUDENT 403', async () => {
    const rejected = mcq('Java', 'EASY', verdict(['UNCLEAR'], { note: 'Đề thiếu dữ kiện' }));
    const unchecked = mcq('Java', 'EASY');
    const offBlueprint = mcq('Docker', 'HARD');
    const { jdId, bankId } = await filledBank([rejected, unchecked, offBlueprint]);

    const list = BankQuestionListSchema.parse((await listQuestions(bankId).expect(200)).body);
    expect(list).toMatchObject({ bankId, jdId, status: 'OPEN', version: 1 });
    expect(list.questions).toHaveLength(12);
    // Part A by cell of the blueprint (a cell it no longer has last), then part B.
    expect(list.questions.map((q) => [q.part, q.skill, q.inBlueprint])).toEqual([
      ...Array.from({ length: 5 }, () => ['A', 'Java', true]),
      ['A', 'Docker', false],
      ...Array.from({ length: 6 }, () => ['B', 'SQL', true]),
    ]);
    const byStem = new Map(list.questions.map((q) => [q.stem, q]));
    expect(byStem.get(rejected.stem)).toMatchObject({
      status: 'REJECTED',
      correctOption: 1,
      explanation: 'Phương án B đúng vì …',
      aiCheck: { status: 'REJECTED', reasons: ['UNCLEAR'], note: 'Đề thiếu dữ kiện', promptVersion: 'validator/v1' },
      manualRejection: null,
      model: MODEL,
      promptVersion: PROMPT,
    });
    expect(byStem.get(rejected.stem)!.options).toHaveLength(4);
    expect(byStem.get(unchecked.stem)).toMatchObject({ status: 'DRAFT', aiCheck: null });
    const essayQuestion = list.questions.at(-1)!;
    expect(essayQuestion).toMatchObject({ type: 'ESSAY', status: 'VALIDATED', options: null, sampleAnswer: 'Đáp án mẫu …' });
    expect(essayQuestion.rubric).toHaveLength(2);
    // The tab's "Câu hỏi (N)" counts every question, the one outside the blueprint too.
    expect(ExamBlueprintViewSchema.parse((await getBlueprint(jdId).expect(200)).body).questionCount).toBe(12);

    const [first] = list.questions;
    for (const role of ['HR', 'STUDENT'] as const) {
      const as = await t.loginAs(role, role === 'HR' ? { companyId } : {});
      await listQuestions(bankId, as).expect(403);
      await reject(first!.id, { reason: 'UNCLEAR', rowVersion: first!.rowVersion }, as).expect(403);
    }
    expect((await questionRow(first!.id)).status).toBe('VALIDATED');
  });

  it('FR-18 US-4.11 AC-3 AC-4 before locking a rejected question is REJECTED with why, audited and out of its cell', async () => {
    const unchecked = mcq('Java', 'EASY');
    const { jdId, bankId, rows } = await filledBank([unchecked]);
    const validated = rows.find((row) => row.status === 'VALIDATED' && row.type === 'MCQ')!;

    const res = await reject(validated.id, { reason: 'ANSWER_MISMATCH', note: '  Đáp án đúng là C  ', rowVersion: validated.rowVersion });
    const result = RejectQuestionResultSchema.parse(res.body);
    expect(result).toMatchObject({ questionId: validated.id, status: 'REJECTED', bank: { id: bankId, status: 'OPEN', version: 1 } });
    // Three usable Java EASY questions are left of four: the cell still holds its 3×.
    expect(result.cell).toMatchObject({ skill: 'Java', difficulty: 'EASY', usable: 3, rejected: 1, rejectReasons: { ANSWER_MISMATCH: 1 } });
    const row = await questionRow(validated.id);
    expect(row).toMatchObject({
      status: 'REJECTED',
      rowVersion: validated.rowVersion + 1,
      manualRejection: { reason: 'ANSWER_MISMATCH', note: 'Đáp án đúng là C', rejected_by: center.user.id },
    });
    // The Validator's verdict stays as it was given.
    expect(row.validation).toMatchObject({ status: 'VALIDATED' });
    // The Validator's verdict was the first transition, by SYSTEM; CENTER's rejection is the last.
    const entry = (
      await t.db
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.entity, 'question'), eq(auditLogs.entityId, validated.id), eq(auditLogs.action, 'TRANSITION')))
        .orderBy(auditLogs.id)
    ).at(-1);
    expect(entry).toMatchObject({
      actorId: center.user.id,
      before: { status: 'VALIDATED' },
      after: { status: 'REJECTED', manualRejection: { reason: 'ANSWER_MISMATCH' } },
    });

    // A draft nobody checked may be rejected too; the list says who rejected each and why.
    const draft = rows.find((r) => r.draftId === unchecked.draft_id)!;
    await reject(draft.id, { reason: 'DUPLICATE', rowVersion: draft.rowVersion }).expect(200);
    const list = BankQuestionListSchema.parse((await listQuestions(bankId).expect(200)).body);
    expect(list.questions.find((q) => q.id === draft.id)).toMatchObject({
      status: 'REJECTED',
      aiCheck: null,
      manualRejection: { reason: 'DUPLICATE', note: null, rejectedBy: { id: center.user.id } },
    });
    const view = ExamBlueprintViewSchema.parse((await getBlueprint(jdId).expect(200)).body);
    expect(view.coverage[0]).toMatchObject({ usable: 2, rejected: 2, rejectReasons: { ANSWER_MISMATCH: 1, DUPLICATE: 1 } });

    // AC-4: the AI Service reads the reasons through its view while the bank is open.
    const { rows: seen } = await t.app
      .get<Pool>(PG_POOL)
      .query<{ draft_id: string; reasons: string[] }>(
        'SELECT draft_id, reasons FROM core.v_ai_question_rejections WHERE bank_id = $1 ORDER BY draft_id',
        [bankId],
      );
    expect(seen).toEqual(
      [
        { draft_id: String(validated.draftId), reasons: ['ANSWER_MISMATCH'] },
        { draft_id: String(draft.draftId), reasons: ['DUPLICATE'] },
      ].sort((a, b) => Number(a.draft_id) - Number(b.draft_id)),
    );

    // Already rejected: 409, whatever rowVersion is sent.
    const again = await reject(draft.id, { reason: 'UNCLEAR', rowVersion: draft.rowVersion + 1 }).expect(409);
    expect(errorCode(again.body)).toBe('QUESTION_NOT_REJECTABLE');
    // A Validator refusal is the model's own reason, not CENTER's; an MCQ reason would mislead the next run of an essay.
    const essayRow = rows.find((r) => r.type === 'ESSAY')!;
    for (const reason of ['VALIDATOR_REFUSAL', 'MULTIPLE_CORRECT'] as const) {
      const refused = await reject(essayRow.id, { reason, rowVersion: essayRow.rowVersion }).expect(400);
      expect(errorCode(refused.body)).toBe('VALIDATION_FAILED');
    }
  });

  it('FR-18 US-4.11 AC-3 409 on a stale rowVersion and while a run is RUNNING', async () => {
    const { jdId, rows } = await filledBank();
    const [first] = rows;
    const stale = await reject(first!.id, { reason: 'UNCLEAR', rowVersion: first!.rowVersion - 1 }).expect(409);
    expect(errorCode(stale.body)).toBe('ROW_VERSION_CONFLICT');

    await generate(jdId).expect(202);
    const busy = await reject(first!.id, { reason: 'UNCLEAR', rowVersion: first!.rowVersion }).expect(409);
    expect(errorCode(busy.body)).toBe('QUESTION_GENERATION_RUNNING');
    expect(await questionRow(first!.id)).toMatchObject({ status: 'VALIDATED', manualRejection: null });
  });

  it('FR-18 US-4.11 AC-3 after locking a rejected question is retired and the bank version rises; only then may the rejection be written', async () => {
    const { jdId, bankId, rows } = await filledBank();
    const view = ExamBlueprintViewSchema.parse((await getBlueprint(jdId).expect(200)).body);
    await center.agent.post(api(`question-banks/${bankId}/lock`)).send({ rowVersion: view.rowVersion }).expect(200);
    const target = rows.find((row) => row.type === 'MCQ')!;

    const result = RejectQuestionResultSchema.parse(
      (await reject(target.id, { reason: 'MULTIPLE_CORRECT', rowVersion: target.rowVersion }).expect(200)).body,
    );
    expect(result).toMatchObject({ status: 'RETIRED', bank: { id: bankId, status: 'LOCKED', version: 2 } });
    // One exam draws one Java EASY question: two are left, below the 3× floor but still drawable.
    expect(result.cell).toMatchObject({ usable: 2, needed: 1, min: 3 });
    expect(await questionRow(target.id)).toMatchObject({
      status: 'RETIRED',
      manualRejection: { reason: 'MULTIPLE_CORRECT', rejected_by: center.user.id },
    });
    expect((await bankOf(jdId))!.version).toBe(2);
    // A locked bank's questions are not for the Test Generator.
    const pool = t.app.get<Pool>(PG_POOL);
    expect((await pool.query('SELECT 1 FROM core.v_ai_question_rejections WHERE bank_id = $1', [bankId])).rows).toEqual([]);

    // Invariant 11: the trigger lets a rejection be written only with the retirement, and the CHECK
    // only with a status that removes the question.
    await expect(pool.query('UPDATE core.questions SET manual_rejection = NULL WHERE id = $1', [target.id])).rejects.toMatchObject({
      code: '23000',
    });
    const open = await filledBank();
    await expect(
      pool.query(`UPDATE core.questions SET manual_rejection = '{"reason":"UNCLEAR"}' WHERE id = $1`, [open.rows[0]!.id]),
    ).rejects.toMatchObject({ code: '23514', constraint: 'questions_manual_rejection_check' });
    // A REJECTED question has the Validator's REJECTED verdict or CENTER's rejection, nothing else.
    const passed = open.rows.find((row) => row.status === 'VALIDATED')!;
    await expect(
      pool.query(`UPDATE core.questions SET status = 'REJECTED' WHERE id = $1`, [passed.id]),
    ).rejects.toMatchObject({ code: '23514', constraint: 'questions_validation_check' });
  });
});
