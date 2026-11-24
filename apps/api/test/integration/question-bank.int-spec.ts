// US-4.1 AC-3, AC-4, AC-9 (FR-18, BR-02, BR-05, GĐ5, CONTEXT D49): the question bank of an approved
// JD, its exam blueprint as CENTER edits it, and the generation runs of the Test Generator. US-4.11
// (CONTEXT D60): CENTER reads every question of the bank and rejects wrong ones by hand. US-4.13
// (FR-42, CONTEXT D62): CENTER and HR add questions by hand or from a file. The AI Service is not
// running here: jobs stay in their queue and results are handed to the listener.
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ApiErrorSchema,
  BankQuestionListSchema,
  ManualQuestionListSchema,
  QUESTION_IMPORT_HEADERS,
  QuestionImportPreviewSchema,
  SaveManualQuestionsResultSchema,
  CV_VERIFICATION_DEFAULTS,
  type ExamBlueprint,
  ExamBlueprintViewSchema,
  type GeneratedQuestion,
  QuestionGenerationRunSchema,
  type QuestionsGenerateJob,
  RejectQuestionResultSchema,
} from '@srm/shared';
import { and, eq } from 'drizzle-orm';
import { Workbook } from 'exceljs';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { Response } from 'supertest';
import { auditLogs, jobDescriptions, questionBanks, questionGenerationRuns, questions } from '../../src/db/schema/index.js';
import { PG_POOL } from '../../src/db/tokens.js';
import { AI_JOB_DISPATCHED, type AiJobDispatchedEvent, type AiResultEvent } from '../../src/modules/aigateway/index.js';
import { QuestionBankService } from '../../src/modules/assessment/application/question-bank.service.js';
import { buildDefaultBlueprint } from '../../src/modules/assessment/domain/blueprint.js';
import type { JdEvent } from '../../src/modules/company/index.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn } from '../helpers/auth.js';
import { createCampaign, createCompany } from '../helpers/factories.js';
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
  // US-4.13 (FR-42, CONTEXT D62): CENTER and HR add questions by hand.

  const addQuestions = (jdId: number, questionsToAdd: object[], as: LoggedIn = center, extra: object = {}) =>
    as.agent.post(api(`jds/${jdId}/question-bank/questions`)).send({ origin: 'FORM', questions: questionsToAdd, ...extra });
  const manualMcq = (stem: string, skill = 'Java') => ({
    type: 'MCQ',
    skill,
    difficulty: 'EASY',
    stem,
    options: ['Phương án 1', 'Phương án 2', 'Phương án 3', 'Phương án 4'],
    correctOption: 2,
    explanation: 'Vì phương án 3.',
  });
  const manualEssay = (stem: string) => ({
    type: 'ESSAY',
    skill: 'sql',
    difficulty: 'MEDIUM',
    stem,
    rubric: [
      { criterion: 'Đúng cú pháp', maxPoints: 6 },
      { criterion: 'Giải thích', maxPoints: 4 },
    ],
    sampleAnswer: 'SELECT 1;',
    explanation: 'Kiểm tra truy vấn.',
  });
  const manualIssues = (body: unknown) =>
    (ApiErrorSchema.parse(body).details?.issues as { index: number; code: string; field: string | null }[]).map(
      (issue) => `${issue.index}:${issue.field}:${issue.code}`,
    );
  const preview = (jdId: number, file: Buffer, filename: string, as: LoggedIn = center) =>
    as.agent.post(api(`jds/${jdId}/question-bank/import/preview`)).attach('file', file, { filename });
  /** Reads a download whole, as a Buffer: supertest only buffers text and JSON. */
  const binary = (res: Response, done: (error: Error | null, body: Buffer) => void) => {
    const stream = res as unknown as NodeJS.ReadableStream;
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => done(null, Buffer.concat(chunks)));
  };
  /** A workbook of the template whose sheet "Câu hỏi" holds `rows` (values by header). */
  async function importFile(rows: Record<string, string | { formula: string }>[]): Promise<Buffer> {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('Câu hỏi');
    sheet.addRow([...QUESTION_IMPORT_HEADERS]);
    for (const row of rows) sheet.addRow(QUESTION_IMPORT_HEADERS.map((header) => row[header] ?? null));
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
  const MCQ_ROW: Record<string, string> = {
    Loại: 'Trắc nghiệm',
    'Kỹ năng': 'Java',
    'Độ khó': 'Dễ',
    'Phương án A': 'final',
    'Phương án B': 'const',
    'Phương án C': 'static',
    'Phương án D': 'var',
    'Đáp án đúng': 'A',
    'Giải thích': 'final khai báo hằng.',
  };

  it('FR-42 US-4.13 AC-1 AC-7 AC-8 CENTER and HR of the company add questions: DRAFT, MANUAL, audited, usable at once', async () => {
    const { jdId, bankId } = await filledBank();
    const hr = await t.loginAs('HR', { companyId });

    const fromCenter = SaveManualQuestionsResultSchema.parse(
      (await addQuestions(jdId, [manualMcq('Câu của Trung tâm')]).expect(201)).body,
    );
    const fromHr = SaveManualQuestionsResultSchema.parse((await addQuestions(jdId, [manualEssay('Câu của HR')], hr).expect(201)).body);
    expect(fromCenter.bankId).toBe(bankId);
    expect(await questionRow(fromHr.questionIds[0]!)).toMatchObject({
      source: 'MANUAL',
      status: 'DRAFT',
      createdBy: hr.user.id,
      draftId: null,
      model: null,
      promptVersion: null,
      validation: null,
      skill: 'SQL',
      content: { stem: 'Câu của HR', options: null },
      answerKey: { correct_option: null, explanation: 'Kiểm tra truy vấn.', sample_answer: 'SELECT 1;' },
      rubric: [
        { criterion: 'Đúng cú pháp', max_points: 6 },
        { criterion: 'Giải thích', max_points: 4 },
      ],
    });
    const [entry] = await t.db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, bankId), eq(auditLogs.action, 'QUESTIONS_ADDED_MANUALLY'), eq(auditLogs.actorId, hr.user.id)));
    expect(entry?.after).toEqual({ origin: 'FORM', fileName: null, count: 1, questionIds: fromHr.questionIds });

    // AC-7: CENTER sees the source and the author; HR only the questions HR of the company added.
    const list = BankQuestionListSchema.parse((await listQuestions(bankId).expect(200)).body);
    expect(list.questions.find((q) => q.id === fromCenter.questionIds[0])).toMatchObject({
      source: 'MANUAL',
      createdBy: { id: center.user.id, role: 'CENTER' },
      model: null,
    });
    expect(list.questions.find((q) => q.id === fromHr.questionIds[0])?.createdBy).toMatchObject({ id: hr.user.id, role: 'HR' });
    expect(list.questions.filter((q) => q.source === 'AI')).toHaveLength(9);
    const ofCompany = ManualQuestionListSchema.parse(
      (await hr.agent.get(api(`jds/${jdId}/question-bank/manual-questions`)).expect(200)).body,
    );
    // The form offers the blueprint's cells with the room each has left (5× less those not rejected).
    expect(ofCompany.cells).toEqual([
      { type: 'MCQ', skill: 'Java', difficulty: 'EASY', usable: 4, room: 1 },
      { type: 'ESSAY', skill: 'SQL', difficulty: 'MEDIUM', usable: 7, room: 3 },
    ]);
    expect(ofCompany.questions.map((q) => [q.id, q.createdBy.id, q.status, q.correctOption])).toEqual([
      [fromHr.questionIds[0], hr.user.id, 'DRAFT', null],
    ]);

    // Usable at once: in the coverage; never sent to "Kiểm câu bằng AI", which reads drafts only.
    const view = ExamBlueprintViewSchema.parse((await getBlueprint(jdId).expect(200)).body);
    expect(view.coverage.find((cell) => cell.skill === 'Java')).toMatchObject({ usable: 4, pending: 1 });
    expect(errorCode((await center.agent.post(api(`jds/${jdId}/question-bank/validate`)).send().expect(409)).body)).toBe(
      'NOTHING_TO_VALIDATE',
    );
    // … and drawn once the bank is locked.
    await center.agent.post(api(`question-banks/${bankId}/lock`)).send({ rowVersion: view.rowVersion }).expect(200);
    const drawable = await t.app.get(QuestionBankService).getDrawableQuestions(bankId);
    expect(drawable.questions.map((q) => q.id)).toEqual(expect.arrayContaining([...fromCenter.questionIds, ...fromHr.questionIds]));

    // BR-11: HR of another company 404 like a missing JD; STUDENT 403.
    const other = await t.loginAs('HR', { companyId: (await createCompany(t.db)).id });
    await addQuestions(jdId, [manualMcq('Câu lạ')], other).expect(404);
    await other.agent.get(api(`jds/${jdId}/question-bank/manual-questions`)).expect(404);
    await other.agent.get(api(`jds/${jdId}/question-bank/import-template`)).expect(404);
    const student = await t.loginAs('STUDENT');
    await addQuestions(jdId, [manualMcq('Câu lạ')], student).expect(403);
    await student.agent.get(api(`jds/${jdId}/question-bank/manual-questions`)).expect(403);
  });

  it('FR-42 US-4.13 AC-2 AC-5 one question breaking a rule and none is saved: 400 with every issue', async () => {
    const { jdId, bankId, rows } = await filledBank();
    const aiStem = rows.find((row) => row.type === 'MCQ')!.content.stem;
    const before = (await questionsOf(bankId)).length;

    // Java EASY draws 1, so it holds 5 at most: 3 AI questions, then 2 more.
    const res = await addQuestions(jdId, [
      manualMcq('Mới 1'),
      manualMcq('Mới 2'),
      manualMcq('Mới 3'),
      manualMcq('Không có ô', 'Docker'),
      manualMcq(`  ${aiStem.toUpperCase()} `),
      manualEssay('Mới 4'),
      manualEssay('mới   4'),
    ]).expect(400);
    expect(errorCode(res.body)).toBe('MANUAL_QUESTIONS_INVALID');
    expect(manualIssues(res.body)).toEqual(['2:skill:CELL_FULL', '3:skill:UNKNOWN_CELL', '4:skill:CELL_FULL', '6:stem:DUPLICATE']);
    expect(await questionsOf(bankId)).toHaveLength(before);

    // A stem of the bank in a cell with room: DUPLICATE. The schema's rules: 400 VALIDATION_FAILED.
    expect(manualIssues((await addQuestions(jdId, [manualEssay(aiStem)]).expect(400)).body)).toEqual(['0:stem:DUPLICATE']);
    const invalid = await addQuestions(jdId, [{ ...manualMcq('Hai đáp án'), options: ['a', 'b', 'a', 'c'] }]).expect(400);
    expect(errorCode(invalid.body)).toBe('VALIDATION_FAILED');
    expect(await questionsOf(bankId)).toHaveLength(before);
  });

  it('FR-42 US-4.13 AC-3 the template: .xlsx with the guide sheet listing the cells, .csv in UTF-8 with commas', async () => {
    const { jdId } = await filledBank();
    const hr = await t.loginAs('HR', { companyId });
    const xlsx = await hr.agent
      .get(api(`jds/${jdId}/question-bank/import-template?format=xlsx`))
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(xlsx.headers['content-type']).toContain('spreadsheetml');
    expect(xlsx.headers['content-disposition']).toContain(`attachment; filename="mau-cau-hoi-jd-${jdId}.xlsx"`);
    const workbook = new Workbook();
    await workbook.xlsx.load(xlsx.body as ArrayBuffer);
    expect((workbook.getWorksheet('Câu hỏi')!.getRow(1).values as unknown[]).slice(1)).toEqual([...QUESTION_IMPORT_HEADERS]);
    const guide: unknown[][] = [];
    workbook.getWorksheet('Hướng dẫn')!.eachRow((row) => guide.push((row.values as unknown[]).slice(1)));
    expect(guide).toEqual(
      expect.arrayContaining([
        ['Trắc nghiệm', 'Java', 'Dễ', 3, 3, 5],
        ['Tự luận', 'SQL', 'Trung bình', 6, 6, 10],
      ]),
    );

    const csv = await center.agent
      .get(api(`jds/${jdId}/question-bank/import-template?format=csv`))
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect((csv.body as Buffer).toString('utf8')).toBe(`\uFEFF${QUESTION_IMPORT_HEADERS.join(',')}\r\n`);
  });

  it('FR-42 US-4.13 AC-4 AC-5 a file is previewed row by row, nothing saved; its rows are then saved together', async () => {
    const { jdId, bankId } = await filledBank();
    const before = (await questionsOf(bankId)).length;
    const file = await importFile([
      { ...MCQ_ROW, Đề: 'Từ khóa nào khai báo hằng?' },
      { ...MCQ_ROW, Đề: { formula: '"Đề"&"x"' } },
      { ...MCQ_ROW, Đề: 'từ khóa nào   khai báo hằng?' },
      {
        Loại: 'Tự luận',
        'Kỹ năng': 'SQL',
        'Độ khó': 'Trung bình',
        Đề: 'Viết truy vấn đếm sinh viên.',
        'Đáp án mẫu': 'SELECT count(*) FROM students;',
        'Giải thích': 'COUNT.',
        'Tiêu chí 1': 'Đúng',
        'Điểm 1': '10',
      },
    ]);
    const result = QuestionImportPreviewSchema.parse((await preview(jdId, file, 'Câu hỏi công ty.xlsx').expect(200)).body);
    expect(result.fileName).toBe('Câu hỏi công ty.xlsx');
    expect(result.rows.map((row) => [row.row, row.issues.map((issue) => `${issue.column}:${issue.code}`)])).toEqual([
      [2, []],
      [3, ['Đề:FORMULA']],
      [4, ['Đề:DUPLICATE']],
      [5, []],
    ]);
    expect(result.rows[2]!.issues[0]!.message).toBe('Trùng đề với dòng 2');
    expect(await questionsOf(bankId)).toHaveLength(before);

    // CSV with or without BOM; a missing header or a file of another type is refused whole.
    const csvRow = QUESTION_IMPORT_HEADERS.map((header) => (header === 'Đề' ? '"Câu, có dấu phẩy"' : (MCQ_ROW[header] ?? '')));
    const csvText = `${QUESTION_IMPORT_HEADERS.join(',')}\r\n${csvRow.join(',')}\r\n`;
    for (const prefix of ['\uFEFF', '']) {
      const csv = QuestionImportPreviewSchema.parse(
        (await preview(jdId, Buffer.from(`${prefix}${csvText}`, 'utf8'), 'cau-hoi.csv').expect(200)).body,
      );
      expect(csv.rows).toMatchObject([{ row: 2, issues: [], question: { stem: 'Câu, có dấu phẩy', correctOption: 0 } }]);
    }
    const fileError = (res: { body: unknown }) => [errorCode(res.body), ApiErrorSchema.parse(res.body).details?.reason];
    expect(fileError(await preview(jdId, Buffer.from('Loại,Kỹ năng\r\n'), 'thieu.csv').expect(400))).toEqual([
      'QUESTION_IMPORT_FILE_INVALID',
      'MISSING_COLUMNS',
    ]);
    expect(fileError(await preview(jdId, Buffer.from('%PDF-1.7\n\u0000\u0001'), 'cau-hoi.xlsx').expect(400))).toEqual([
      'QUESTION_IMPORT_FILE_INVALID',
      'UNSUPPORTED_TYPE',
    ]);
    expect(fileError(await preview(jdId, await importFile([]), 'rong.xlsx').expect(400))).toEqual([
      'QUESTION_IMPORT_FILE_INVALID',
      'NO_ROWS',
    ]);

    // Saving the rows without errors: one audit entry with the file and the count.
    const valid = result.rows.filter((row) => row.issues.length === 0).map((row) => row.question!);
    const saved = SaveManualQuestionsResultSchema.parse(
      (await addQuestions(jdId, valid, center, { origin: 'IMPORT', fileName: 'Câu hỏi công ty.xlsx' }).expect(201)).body,
    );
    expect(saved.questionIds).toHaveLength(2);
    const [entry] = await t.db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, bankId), eq(auditLogs.action, 'QUESTIONS_ADDED_MANUALLY')));
    expect(entry?.after).toEqual({ origin: 'IMPORT', fileName: 'Câu hỏi công ty.xlsx', count: 2, questionIds: saved.questionIds });
  });

  it('FR-42 US-4.13 AC-6 409 while the blueprint predates the JD, while a run is RUNNING, once the bank is locked and for a closed campaign; the DB refuses too', async () => {
    const { jdId, bankId } = await filledBank();
    // As for a run (US-4.2 AC-11): newer requirements may drop a skill of the blueprint's cells.
    const hr = await t.loginAs('HR', { companyId });
    const [jd] = await t.db.select({ version: jobDescriptions.version }).from(jobDescriptions).where(eq(jobDescriptions.id, jdId));
    await t.db.update(jobDescriptions).set({ version: jd!.version + 1 }).where(eq(jobDescriptions.id, jdId));
    expect(errorCode((await addQuestions(jdId, [manualMcq('JD mới hơn')], hr).expect(409)).body)).toBe('QUESTION_BANK_JD_OUTDATED');
    const ofCompany = ManualQuestionListSchema.parse(
      (await hr.agent.get(api(`jds/${jdId}/question-bank/manual-questions`)).expect(200)).body,
    );
    expect(ofCompany.bank).toMatchObject({ jdOutdated: true });
    await t.db.update(jobDescriptions).set({ version: jd!.version }).where(eq(jobDescriptions.id, jdId));

    await generate(jdId).expect(202);
    expect(errorCode((await addQuestions(jdId, [manualMcq('Khi đang sinh')]).expect(409)).body)).toBe('QUESTION_GENERATION_RUNNING');
    await deliver(message(jobsOf(bankId).at(-1)!.job, { questions: [] }));

    const view = ExamBlueprintViewSchema.parse((await getBlueprint(jdId).expect(200)).body);
    await center.agent.post(api(`question-banks/${bankId}/lock`)).send({ rowVersion: view.rowVersion }).expect(200);
    expect(errorCode((await addQuestions(jdId, [manualMcq('Sau khi khóa')]).expect(409)).body)).toBe('QUESTION_BANK_LOCKED');
    const xlsx = await importFile([{ ...MCQ_ROW, Đề: 'Sau khi khóa' }]);
    expect(errorCode((await preview(jdId, xlsx, 'a.xlsx').expect(409)).body)).toBe('QUESTION_BANK_LOCKED');

    // Invariant 11: the trigger refuses a question added to a locked bank.
    const pool = t.app.get<Pool>(PG_POOL);
    await expect(
      pool.query(
        `INSERT INTO core.questions (bank_id, source, created_by, type, skill, difficulty, content, answer_key)
         VALUES ($1, 'MANUAL', $2, 'MCQ', 'Java', 'EASY', '{"stem": "x", "options": ["a", "b", "c", "d"]}',
                 '{"correct_option": 0, "explanation": "x", "sample_answer": null}')`,
        [bankId, center.user.id],
      ),
    ).rejects.toMatchObject({ code: '23000' });

    const closed = await createJdInState(t.db, {
      companyId,
      status: 'APPROVED',
      requirements: REQUIREMENTS,
      campaignId: (await createCampaign(t.db, { status: 'CLOSED' })).id,
    });
    expect(errorCode((await addQuestions(closed.id, [manualMcq('Đợt đã đóng')]).expect(409)).body)).toBe('CAMPAIGN_PHASE_MISMATCH');
  });

  it('FR-42 US-4.13 AC-8 the CHECK keeps both sources apart: a MANUAL question has an author and no model; an AI one the other way round', async () => {
    const { bankId, rows } = await filledBank();
    const pool = t.app.get<Pool>(PG_POOL);
    const insert = (columns: string, values: string) =>
      pool.query(
        `INSERT INTO core.questions (bank_id, type, skill, difficulty, content, answer_key, ${columns})
         VALUES ($1, 'MCQ', 'Java', 'EASY', '{"stem": "y", "options": ["a", "b", "c", "d"]}',
                 '{"correct_option": 0, "explanation": "x", "sample_answer": null}', ${values})`,
        [bankId],
      );
    const refused = { code: '23514', constraint: 'questions_author_check' };
    await expect(
      insert('source, created_by, model, prompt_version', `'MANUAL', ${center.user.id}, 'm', 'test_generator/v1'`),
    ).rejects.toMatchObject(refused);
    await expect(insert('source, created_by', `'MANUAL', NULL`)).rejects.toMatchObject(refused);
    await expect(insert('source, model, prompt_version', `'AI', 'm', 'test_generator/v1'`)).rejects.toMatchObject(refused);
    await expect(
      pool.query(`UPDATE core.questions SET created_by = $2 WHERE id = $1`, [rows[0]!.id, center.user.id]),
    ).rejects.toMatchObject(refused);
  });
});
