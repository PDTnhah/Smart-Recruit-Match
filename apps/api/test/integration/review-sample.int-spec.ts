// US-4.9 (FR-19, UC-22, GĐ5 › Quy trình sinh đề bước 3, BR-11, AGENTS › Invariants 7, 8, 10, 11):
// HR of the JD's company or CENTER review a random sample of the JD's question bank, stratified by
// blueprint cell, with answer keys and rubrics. An ERROR retires the question in the same
// transaction, raising a locked bank's version. Locking and drawing never wait for a review.
import {
  ApiErrorSchema,
  ExamBlueprintViewSchema,
  type QuestionReviewSample,
  QuestionReviewSampleSchema,
} from '@srm/shared';
import { and, eq, sql } from 'drizzle-orm';
import { auditLogs, questionReviews, questions } from '../../src/db/schema/index.js';
import { AI_JOB_DISPATCHED, type AiJobDispatchedEvent } from '../../src/modules/aigateway/index.js';
import { QuestionBankService } from '../../src/modules/assessment/index.js';
import { SYSTEM_ACTOR } from '../../src/modules/audit/index.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn } from '../helpers/auth.js';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { createCampaign, createCompany, TEST_CAMPAIGN_TARGET } from '../helpers/factories.js';
import { captureEvents, createJdInState } from '../helpers/jd.js';
import { BANK_REQUIREMENTS, deliverResult, resultMessage, SMALL_BLUEPRINT, smallBankDrafts } from '../helpers/question-bank.js';

/** Smaller than the 9 questions of SMALL_BLUEPRINT's bank, so some questions are outside the sample. */
const SAMPLE_SIZE = 4;

describe('GĐ5 sample review of a question bank (US-4.9)', () => {
  let t: AuthTestApp;
  let center: LoggedIn;
  let hr: LoggedIn;
  let companyId: number;
  let campaignId: number;
  let dispatched: AiJobDispatchedEvent<'QUESTIONS_GENERATE'>[];
  let testDb: TestDb;

  beforeAll(async () => {
    t = await createAuthTestApp();
    center = await t.loginAs('CENTER');
    companyId = (await createCompany(t.db)).id;
    hr = await t.loginAs('HR', { companyId });
    campaignId = (await createCampaign(t.db, { config: { target: TEST_CAMPAIGN_TARGET, bank_review_sample_size: SAMPLE_SIZE } })).id;
    dispatched = captureEvents(t.app, AI_JOB_DISPATCHED);
    testDb = createTestDb();
  });

  afterAll(async () => {
    await t.close();
    await testDb.close();
  });

  const sampleUrl = (jdId: number) => api(`jds/${jdId}/question-bank/sample`);
  const getSample = async (jdId: number, as: LoggedIn = hr): Promise<QuestionReviewSample> =>
    QuestionReviewSampleSchema.parse((await as.agent.get(sampleUrl(jdId)).expect(200)).body);
  const review = (jdId: number, body: object, as: LoggedIn = hr) => as.agent.post(`${sampleUrl(jdId)}/reviews`).send(body);
  const blueprintView = async (jdId: number) =>
    ExamBlueprintViewSchema.parse((await center.agent.get(api(`jds/${jdId}/exam-blueprint`)).expect(200)).body);
  const errorCode = (body: unknown) => ApiErrorSchema.parse(body).code;
  const questionRow = async (id: number) => (await t.db.select().from(questions).where(eq(questions.id, id)))[0]!;
  const reviewsOf = (questionId: number) => t.db.select().from(questionReviews).where(eq(questionReviews.questionId, questionId));

  /** An approved JD of the HR's company whose bank holds SMALL_BLUEPRINT filled to 3× VALIDATED. */
  async function bank() {
    const jd = await createJdInState(t.db, { companyId, campaignId, status: 'APPROVED', requirements: BANK_REQUIREMENTS });
    const made = await blueprintView(jd.id);
    await center.agent.put(api(`jds/${jd.id}/exam-blueprint`)).send({ rowVersion: made.rowVersion, blueprint: SMALL_BLUEPRINT }).expect(200);
    await center.agent.post(api(`jds/${jd.id}/question-bank/generate`)).send().expect(202);
    const job = dispatched.filter((event) => event.job.bank_id === made.bankId).at(-1)!.job;
    await deliverResult(t.app, resultMessage(job, { questions: smallBankDrafts() }));
    return { jdId: jd.id, bankId: made.bankId };
  }

  it('GĐ5 AC-1 HR of the JD company gets a stratified sample with answer keys; a reload gives the same sample', async () => {
    const { jdId, bankId } = await bank();

    const sample = await getSample(jdId);
    expect(sample).toMatchObject({ jdId, bank: { id: bankId, status: 'OPEN', version: 1 }, sampleSize: SAMPLE_SIZE });
    expect(sample.questions).toHaveLength(SAMPLE_SIZE);
    // Two cells, four questions: two of each, part A first.
    expect(sample.questions.map((q) => q.part)).toEqual(['A', 'A', 'B', 'B']);
    const [mcq, , essay] = sample.questions;
    expect(mcq).toMatchObject({ type: 'MCQ', skill: 'Java', correctOption: 1, rubric: null, sampleAnswer: null, review: null });
    expect(mcq!.options).toHaveLength(4);
    expect(mcq!.explanation).not.toBe('');
    expect(essay).toMatchObject({ type: 'ESSAY', options: null, correctOption: null, sampleAnswer: 'Đáp án mẫu …' });
    expect(essay!.rubric).toHaveLength(2);

    expect((await getSample(jdId)).questions.map((q) => q.id)).toEqual(sample.questions.map((q) => q.id));
    // CENTER reviews every JD and sees the same sample.
    expect((await getSample(jdId, center)).questions.map((q) => q.id)).toEqual(sample.questions.map((q) => q.id));
  });

  it('BR-11 AC-2 HR of another company gets 404, STUDENT 403; a JD without a bank gives an empty sample', async () => {
    const { jdId } = await bank();
    const otherHr = await t.loginAs('HR');
    const student = await t.loginAs('STUDENT');
    const questionId = (await getSample(jdId)).questions[0]!.id;

    expect(errorCode((await otherHr.agent.get(sampleUrl(jdId)).expect(404)).body)).toBe('ENTITY_NOT_FOUND');
    await review(jdId, { questionId, verdict: 'OK' }, otherHr).expect(404);
    await student.agent.get(sampleUrl(jdId)).expect(403);
    await review(jdId, { questionId, verdict: 'OK' }, student).expect(403);
    expect(await reviewsOf(questionId)).toEqual([]);

    const bare = await createJdInState(t.db, { companyId, campaignId, status: 'APPROVED', requirements: BANK_REQUIREMENTS });
    expect(await getSample(bare.id)).toEqual({ jdId: bare.id, bank: null, sampleSize: SAMPLE_SIZE, questions: [] });
  });

  it('FR-19 AC-3 a review is stored with its reviewer and audited; ERROR without reason or a question outside the sample: 400', async () => {
    const { jdId, bankId } = await bank();
    const sample = await getSample(jdId);
    const target = sample.questions[0]!;

    const after = QuestionReviewSampleSchema.parse((await review(jdId, { questionId: target.id, verdict: 'OK' }).expect(200)).body);
    expect(after.questions[0]).toMatchObject({ id: target.id, status: 'VALIDATED', review: { verdict: 'OK', reason: null, mine: true } });
    expect((await getSample(jdId, center)).questions[0]!.review).toMatchObject({ verdict: 'OK', mine: false });
    expect(await reviewsOf(target.id)).toEqual([
      expect.objectContaining({ reviewerId: hr.user.id, verdict: 'OK', reason: null, bankVersion: 1 }),
    ]);
    const [entry] = await t.db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entity, 'question'), eq(auditLogs.entityId, target.id), eq(auditLogs.action, 'QUESTION_REVIEWED')));
    expect(entry).toMatchObject({ actorId: hr.user.id, after: { bankId, bankVersion: 1, verdict: 'OK', reason: null } });

    const noReason = await review(jdId, { questionId: target.id, verdict: 'ERROR', rowVersion: target.rowVersion }).expect(400);
    expect(errorCode(noReason.body)).toBe('VALIDATION_FAILED');
    const sampled = new Set(sample.questions.map((q) => q.id));
    const [outside] = await t.db
      .select({ id: questions.id, rowVersion: questions.rowVersion })
      .from(questions)
      .where(and(eq(questions.bankId, bankId), sql`${questions.id} not in (${sql.join([...sampled], sql`, `)})`))
      .limit(1);
    const res = await review(jdId, { questionId: outside!.id, verdict: 'ERROR', reason: 'Sai đáp án', rowVersion: outside!.rowVersion }).expect(400);
    expect(errorCode(res.body)).toBe('VALIDATION_FAILED');
    expect((await questionRow(outside!.id)).status).toBe('VALIDATED');
    expect(await reviewsOf(outside!.id)).toEqual([]);
  });

  it('FR-19 AC-4 AC-5 an ERROR on a locked bank retires the question and raises the version; the cell turns short; nothing waited for a review', async () => {
    const { jdId, bankId } = await bank();
    // AC-5: the bank locks with no review at all.
    const view = await blueprintView(jdId);
    await center.agent.post(api(`question-banks/${bankId}/lock`)).send({ rowVersion: view.rowVersion }).expect(200);
    const target = (await getSample(jdId)).questions.find((q) => q.type === 'MCQ')!;

    const stale = await review(jdId, { questionId: target.id, verdict: 'ERROR', reason: 'x', rowVersion: target.rowVersion + 1 }).expect(409);
    expect(errorCode(stale.body)).toBe('ROW_VERSION_CONFLICT');
    expect(await reviewsOf(target.id)).toEqual([]);

    const res = await review(jdId, { questionId: target.id, verdict: 'ERROR', reason: ' Đáp án đúng là C ', rowVersion: target.rowVersion }).expect(200);
    const after = QuestionReviewSampleSchema.parse(res.body);
    expect(after.bank).toMatchObject({ status: 'LOCKED', version: 2 });
    // The question keeps its place, retired, with its review.
    expect(after.questions.find((q) => q.id === target.id)).toMatchObject({
      status: 'RETIRED',
      review: { verdict: 'ERROR', reason: 'Đáp án đúng là C', mine: true },
    });
    expect((await questionRow(target.id)).status).toBe('RETIRED');
    expect(await reviewsOf(target.id)).toEqual([expect.objectContaining({ verdict: 'ERROR', bankVersion: 1 })]);
    const drawable = await t.app.get(QuestionBankService).getDrawableQuestions(bankId);
    expect(drawable.version).toBe(2);
    expect(drawable.questions.map((q) => q.id)).not.toContain(target.id);
    // The bank screen's coverage shows the cell below its 3× floor: CENTER's warning (AC-4).
    const cell = (await blueprintView(jdId)).coverage.find((c) => c.type === 'MCQ')!;
    expect(cell.usable).toBeLessThan(cell.min);

    // A retired question takes no further verdict.
    const again = await review(jdId, { questionId: target.id, verdict: 'OK' }).expect(409);
    expect(errorCode(again.body)).toBe('QUESTION_NOT_REVIEWABLE');
    // One retired another way before anyone reviewed it leaves the sample: still 409, not 400.
    const shown = (await getSample(jdId)).questions.find((q) => q.status !== 'RETIRED')!;
    await t.app.get(QuestionBankService).retireQuestion({ questionId: shown.id, actor: SYSTEM_ACTOR, reason: 'test' });
    expect((await getSample(jdId)).questions.map((q) => q.id)).not.toContain(shown.id);
    const gone = await review(jdId, { questionId: shown.id, verdict: 'OK' }).expect(409);
    expect(errorCode(gone.body)).toBe('QUESTION_NOT_REVIEWABLE');
  });

  it('FR-19 Invariant 11 the database refuses an ERROR without a reason and a second ERROR of a question', async () => {
    const { jdId } = await bank();
    const target = (await getSample(jdId)).questions[0]!;
    const insert = (verdict: string, reason: string | null) =>
      testDb.pool.query(
        `INSERT INTO core.question_reviews (question_id, bank_version, reviewer_id, verdict, reason, reviewed_at)
         VALUES ($1, 1, $2, $3, $4, now())`,
        [target.id, hr.user.id, verdict, reason],
      );

    await expect(insert('ERROR', '  ')).rejects.toMatchObject({ code: '23514', constraint: 'question_reviews_reason_check' });
    await expect(insert('MAYBE', null)).rejects.toMatchObject({ code: '23514', constraint: 'question_reviews_verdict_check' });
    await insert('ERROR', 'Sai');
    await expect(insert('ERROR', 'Sai lần nữa')).rejects.toMatchObject({
      code: '23505',
      constraint: 'question_reviews_question_error_key',
    });
    await insert('OK', null);
  });
});
