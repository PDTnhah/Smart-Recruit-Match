// US-4.2 AC-5 (FR-18, GĐ5, AD-8, CONTEXT D50): the Validator's verdicts that come with a Test
// Generator result move each draft DRAFT → VALIDATED | REJECTED through transitionTo, with the
// verdict in `questions.validation` and an audit entry, in the transaction of the result.
import { ExamBlueprintViewSchema, type QuestionsGenerateJob } from '@srm/shared';
import { and, eq } from 'drizzle-orm';
import { auditLogs, questionBanks, questions } from '../../src/db/schema/index.js';
import { AI_JOB_DISPATCHED, type AiJobDispatchedEvent } from '../../src/modules/aigateway/index.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn } from '../helpers/auth.js';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { createCompany } from '../helpers/factories.js';
import { captureEvents, createJdInState } from '../helpers/jd.js';
import {
  BANK_REQUIREMENTS,
  deliverResult,
  essay,
  mcq,
  resultMessage,
  verdict,
  withVerdict,
} from '../helpers/question-bank.js';

describe('GĐ5 Validator verdicts on the question bank (US-4.2 AC-5)', () => {
  let t: AuthTestApp;
  let center: LoggedIn;
  let companyId: number;
  let dispatched: AiJobDispatchedEvent<'QUESTIONS_GENERATE'>[];
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
    const jobs = dispatched.filter((event) => event.type === 'QUESTIONS_GENERATE' && event.job.bank_id === bank!.id);
    return { bankId: bank!.id, job: jobs.at(-1)!.job };
  }

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
});
