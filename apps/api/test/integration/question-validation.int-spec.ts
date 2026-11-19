// US-4.2 AC-5, US-4.10 AC-2, AC-3 (FR-18, GĐ5, AD-5, AD-8, CONTEXT D50, D60): the Validator's
// verdicts move each draft DRAFT → VALIDATED | REJECTED through transitionTo, with the verdict in
// `questions.validation` and an audit entry, in the transaction of the result. CENTER starts the
// Validator as a job of its own ("Kiểm câu bằng AI"), on the DRAFT questions of the blueprint.
import {
  ApiErrorSchema,
  ExamBlueprintViewSchema,
  QuestionGenerationRunSchema,
  type QuestionsGenerateJob,
  type QuestionsValidateJob,
} from '@srm/shared';
import { and, eq } from 'drizzle-orm';
import { auditLogs, questionBanks, questionGenerationRuns, questions } from '../../src/db/schema/index.js';
import { AI_JOB_DISPATCHED, type AiJobDispatchedEvent } from '../../src/modules/aigateway/index.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn } from '../helpers/auth.js';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { createCompany } from '../helpers/factories.js';
import { captureEvents, createJdInState } from '../helpers/jd.js';
import {
  BANK_REQUIREMENTS,
  deliverResult,
  deliverValidation,
  essay,
  mcq,
  resultMessage,
  validationMessage,
  verdict,
  withVerdict,
} from '../helpers/question-bank.js';

describe('GĐ5 Validator verdicts on the question bank (US-4.2 AC-5)', () => {
  let t: AuthTestApp;
  let center: LoggedIn;
  let companyId: number;
  let dispatched: AiJobDispatchedEvent[];
  /** Raw SQL, as a hand-written statement would run it. */
  let testDb: TestDb;

  beforeAll(async () => {
    t = await createAuthTestApp();
    testDb = createTestDb();
    center = await t.loginAs('CENTER');
    companyId = (await createCompany(t.db)).id;
    dispatched = captureEvents(t.app, AI_JOB_DISPATCHED);
  });

  afterAll(async () => {
    await t.close();
    await testDb.close();
  });

  /** An approved JD with its bank and one generation job sent. */
  async function bankWithJob(): Promise<{ jdId: number; bankId: number; job: QuestionsGenerateJob }> {
    const jd = await createJdInState(t.db, { companyId, status: 'APPROVED', requirements: BANK_REQUIREMENTS });
    return { jdId: jd.id, ...(await nextJob(jd.id)) };
  }

  async function nextJob(jdId: number): Promise<{ bankId: number; job: QuestionsGenerateJob }> {
    await center.agent.post(api(`jds/${jdId}/question-bank/generate`)).send().expect(202);
    const [bank] = await t.db.select().from(questionBanks).where(eq(questionBanks.jdId, jdId));
    const jobs = dispatched.filter(
      (event): event is AiJobDispatchedEvent<'QUESTIONS_GENERATE'> =>
        event.type === 'QUESTIONS_GENERATE' && 'bank_id' in event.job && event.job.bank_id === bank!.id,
    );
    return { bankId: bank!.id, job: jobs.at(-1)!.job };
  }

  const validate = (jdId: number, as: LoggedIn = center) => as.agent.post(api(`jds/${jdId}/question-bank/validate`)).send();
  const checksOf = (bankId: number) =>
    dispatched.filter(
      (event): event is AiJobDispatchedEvent<'QUESTIONS_VALIDATE'> =>
        event.type === 'QUESTIONS_VALIDATE' && 'bank_id' in event.job && event.job.bank_id === bankId,
    );
  const runOfJob = async (jobId: string) => {
    const [row] = await t.db.select().from(questionGenerationRuns).where(eq(questionGenerationRuns.jobId, jobId));
    return row!;
  };
  const viewOf = async (jdId: number) =>
    ExamBlueprintViewSchema.parse((await center.agent.get(api(`jds/${jdId}/exam-blueprint`)).expect(200)).body);

  const questionByDraft = async (draftId: number) => {
    const [row] = await t.db.select().from(questions).where(eq(questions.draftId, draftId));
    return row!;
  };

  const transitionsOf = (questionId: number) =>
    t.db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entity, 'question'), eq(auditLogs.entityId, questionId), eq(auditLogs.action, 'TRANSITION')));

  it('GĐ5 AC-5 each checked draft takes its verdict through transitionTo, audited by SYSTEM in the same transaction', async () => {
    const { jdId, job } = await bankWithJob();
    const passed = mcq('Java', 'EASY', verdict([], { estimated_difficulty: 'MEDIUM', note: 'Lệch một bậc: vẫn nhận' }));
    const wrong = mcq('Java', 'EASY', verdict(['ANSWER_MISMATCH', 'DIFFICULTY_MISMATCH'], { correct_options: [2], estimated_difficulty: 'HARD' }));
    const vague = essay('Java', verdict(['RUBRIC_MISMATCH']));
    const waiting = mcq('SQL', 'EASY');
    await deliverResult(t.app, resultMessage(job, { questions: [passed, wrong, vague, waiting] }, 'PARTIAL'));

    const rows = await Promise.all([passed, wrong, vague, waiting].map((draft) => questionByDraft(draft.draft_id)));
    expect(rows.map((row) => [row.status, row.rowVersion])).toEqual([
      ['VALIDATED', 1],
      ['REJECTED', 1],
      ['REJECTED', 1],
      ['DRAFT', 0],
    ]);
    // Invariant 12: the verdict is stored with the model and prompt that checked the question.
    expect(rows[0]!.validation).toEqual(passed.validation);
    expect(rows[1]!.validation).toEqual(wrong.validation);
    expect(rows[2]!.validation).toMatchObject({ status: 'REJECTED', reasons: ['RUBRIC_MISMATCH'], correct_options: null });
    expect(rows[3]!.validation).toBeNull();

    const [entry] = await transitionsOf(rows[1]!.id);
    expect(entry).toMatchObject({
      actorKind: 'SYSTEM',
      actorId: null,
      before: { status: 'DRAFT', rowVersion: 0 },
      after: { status: 'REJECTED', rowVersion: 1, validation: wrong.validation },
      reason: 'validator/v1: ANSWER_MISMATCH, DIFFICULTY_MISMATCH',
    });
    expect((await transitionsOf(rows[0]!.id))[0]?.reason).toBe('validator/v1: passed');
    expect(await transitionsOf(rows[3]!.id)).toEqual([]);
    // The question, its audit entry and the closed run were written by one transaction.
    const { rows: xmins } = await testDb.pool.query<{ question: string; audit: string }>(
      `SELECT (SELECT xmin::text FROM core.questions WHERE id = $1) AS question,
              (SELECT xmin::text FROM core.audit_logs WHERE id = $2) AS audit`,
      [rows[1]!.id, entry!.id],
    );
    expect(xmins[0]!.question).toBe(xmins[0]!.audit);

    // AC-10: the cell shows its questions by status and the rejected ones by reason.
    const view = ExamBlueprintViewSchema.parse((await center.agent.get(api(`jds/${jdId}/exam-blueprint`)).expect(200)).body);
    expect(view.coverage.find((cell) => cell.type === 'MCQ' && cell.skill === 'Java' && cell.difficulty === 'EASY')).toMatchObject({
      drafted: 2,
      validated: 1,
      rejected: 1,
      pending: 0,
      rejectReasons: { ANSWER_MISMATCH: 1, DIFFICULTY_MISMATCH: 1 },
    });
    expect(view.coverage.find((cell) => cell.type === 'MCQ' && cell.skill === 'SQL' && cell.difficulty === 'EASY')).toMatchObject({
      drafted: 1,
      validated: 0,
      pending: 1,
    });
  });

  it('GĐ5 AC-5 a duplicate result moves nothing again; a verdict of a later round moves its draft once', async () => {
    const { jdId, job } = await bankWithJob();
    const passed = mcq('Java', 'EASY', verdict());
    const waiting = mcq('SQL', 'EASY');
    const first = resultMessage(job, { questions: [passed, waiting] }, 'PARTIAL');
    await deliverResult(t.app, first);
    await deliverResult(t.app, first);
    const passedRow = await questionByDraft(passed.draft_id);
    expect(await transitionsOf(passedRow.id)).toHaveLength(1);

    // The next job checks the draft left waiting; the bank's drafts come back with their verdicts.
    const { job: second } = await nextJob(jdId);
    await deliverResult(
      t.app,
      resultMessage(second, { questions: [withVerdict(passed, verdict(['UNCLEAR'])), withVerdict(waiting, verdict())] }),
    );
    expect(await questionByDraft(passed.draft_id)).toMatchObject({ status: 'VALIDATED', rowVersion: 1, validation: passed.validation });
    expect(await transitionsOf(passedRow.id)).toHaveLength(1);
    const waitingRow = await questionByDraft(waiting.draft_id);
    expect(waitingRow).toMatchObject({ status: 'VALIDATED', rowVersion: 1 });
    expect(await transitionsOf(waitingRow.id)).toHaveLength(1);
  });

  it('GĐ5 AC-5 the database refuses a checked status without its verdict (Invariant 11)', async () => {
    const { job } = await bankWithJob();
    const waiting = mcq('Java', 'EASY');
    await deliverResult(t.app, resultMessage(job, { questions: [waiting] }, 'PARTIAL'));
    const row = await questionByDraft(waiting.draft_id);
    await expect(testDb.pool.query("UPDATE core.questions SET status = 'VALIDATED' WHERE id = $1", [row.id])).rejects.toMatchObject({
      code: '23514',
      constraint: 'questions_validation_check',
    });
  });

  it('GĐ5 US-4.10 AC-2 "Kiểm câu bằng AI" sends the DRAFT questions of the blueprint as a VALIDATE run, job id first', async () => {
    const { jdId, bankId, job } = await bankWithJob();
    const unchecked = [mcq('Java', 'EASY'), essay('Java')];
    const checked = mcq('Java', 'EASY', verdict());
    // Kotlin is no skill of the JD: its cell is not in the blueprint, and an exam never draws it.
    const outside = mcq('Kotlin', 'EASY');
    await deliverResult(t.app, resultMessage(job, { questions: [...unchecked, checked, outside] }));

    const run = QuestionGenerationRunSchema.parse((await validate(jdId).expect(202)).body);
    expect(run).toMatchObject({ kind: 'VALIDATE', status: 'RUNNING', missingCells: null });
    const [sent] = checksOf(bankId);
    expect(sent!.job.draft_ids).toEqual(unchecked.map((draft) => draft.draft_id));
    // LESSONS §33: the run held the job id before the job went out.
    expect(await runOfJob(sent!.jobId)).toMatchObject({ id: run.runId, kind: 'VALIDATE', status: 'RUNNING' });
    const view = await viewOf(jdId);
    expect(view.validationRun).toMatchObject({ runId: run.runId, status: 'RUNNING' });
    expect(view.run).toMatchObject({ kind: 'GENERATE', status: 'SUCCEEDED' });
    expect(view).toMatchObject({ editable: false, lock: { blockers: expect.arrayContaining(['GENERATION_RUNNING']) as unknown } });

    // 409 while it runs, for an AI check as for a generation.
    expect(ApiErrorSchema.parse((await validate(jdId).expect(409)).body).code).toBe('QUESTION_GENERATION_RUNNING');
    const generating = await center.agent.post(api(`jds/${jdId}/question-bank/generate`)).send().expect(409);
    expect(ApiErrorSchema.parse(generating.body).code).toBe('QUESTION_GENERATION_RUNNING');
    for (const role of ['HR', 'STUDENT'] as const) {
      await validate(jdId, await t.loginAs(role, role === 'HR' ? { companyId } : {})).expect(403);
    }
  });

  it('GĐ5 US-4.10 AC-3 the verdicts of an AI check move the DRAFT questions once; the run closes with how many moved', async () => {
    const { jdId, bankId, job } = await bankWithJob();
    const [good, bad, left] = [mcq('Java', 'EASY'), essay('Java'), mcq('SQL', 'EASY')];
    await deliverResult(t.app, resultMessage(job, { questions: [good, bad, left] }));
    await validate(jdId).expect(202);
    const check: QuestionsValidateJob = checksOf(bankId).at(-1)!.job;

    const result = validationMessage(
      check,
      [
        { draft: good, validation: verdict() },
        { draft: bad, validation: verdict(['RUBRIC_MISMATCH']) },
      ],
      [left.draft_id],
    );
    await deliverValidation(t.app, result);
    await deliverValidation(t.app, result);

    const rows = await Promise.all([good, bad, left].map((draft) => questionByDraft(draft.draft_id)));
    expect(rows.map((row) => [row.status, row.rowVersion])).toEqual([
      ['VALIDATED', 1],
      ['REJECTED', 1],
      ['DRAFT', 0],
    ]);
    const [entry] = await transitionsOf(rows[1]!.id);
    expect(entry).toMatchObject({ actorKind: 'SYSTEM', after: { status: 'REJECTED' }, reason: 'validator/v1: RUBRIC_MISMATCH' });
    expect(await transitionsOf(rows[1]!.id)).toHaveLength(1);
    expect(await runOfJob(check.job_id)).toMatchObject({ status: 'PARTIAL', questionsReceived: 2, missingCells: null });
    const view = await viewOf(jdId);
    expect(view.validationRun).toMatchObject({ kind: 'VALIDATE', status: 'PARTIAL', questionsReceived: 2 });
    expect(view.editable).toBe(true);

    // Only the question left unchecked goes to the next AI check; with none left, 409.
    await validate(jdId).expect(202);
    const next = checksOf(bankId).at(-1)!.job;
    expect(next.draft_ids).toEqual([left.draft_id]);
    await deliverValidation(t.app, validationMessage(next, [{ draft: left, validation: verdict() }]));
    expect(ApiErrorSchema.parse((await validate(jdId).expect(409)).body).code).toBe('NOTHING_TO_VALIDATE');
  });
});
