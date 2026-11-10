// US-4.3 AC-1, AC-3–AC-8, AC-12, AC-14 (FR-20, BR-05, BR-06, NFR-9, NFR-10, AGENTS › Invariants 8,
// 10, 11, CONTEXT D51): the exam room over HTTP with PostgreSQL and Redis. The clock is a FakeClock
// near the real time (LESSONS §22): the sweep is exam-scheduler.int-spec.ts's.
import type { TestingModuleBuilder } from '@nestjs/testing';
import {
  ApiErrorSchema,
  type ExamPaper,
  ExamPaperSchema,
  type ExamSubmission,
  ExamSubmissionSchema,
  MyExamsResponseSchema,
} from '@srm/shared';
import { and, eq, inArray } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';
import type { Response } from 'supertest';
import { Clock } from '../../src/common/clock/index.js';
import { examAnswers, examSessions, preferences, questions } from '../../src/db/schema/index.js';
import { PG_POOL } from '../../src/db/tokens.js';
import { EXAM_SESSION_CLOSED, type ExamSessionClosedEvent, QuestionBankService } from '../../src/modules/assessment/index.js';
import { ExamAnswerStore } from '../../src/modules/assessment/infrastructure/exam-answer-store.js';
import { ExamSessionsRepository } from '../../src/modules/assessment/infrastructure/exam-sessions.repository.js';
import { SYSTEM_ACTOR } from '../../src/modules/audit/index.js';
import { REDIS } from '../../src/redis/redis.module.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn } from '../helpers/auth.js';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { createExamFixture, EXAM_MINUTES, type ExamFixture, minutesAfter, sessionRow, waitForALockWait } from '../helpers/exam.js';
import { FakeClock } from '../helpers/fake-clock.js';
import { captureEvents } from '../helpers/jd.js';
import { auditEntries, runConcurrently } from '../helpers/state.js';

/** Keys that would give away the answer or the original place of an option (AC-3). */
const FORBIDDEN_KEYS = [
  'answerKey',
  'answer_key',
  'correct_option',
  'correctOption',
  'correct',
  'explanation',
  'rubric',
  'sample_answer',
  'sampleAnswer',
  'validation',
  'index',
  'option',
  'optionLayout',
  'option_layout',
  'seed',
];

function keysOf(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const item of value) keysOf(item, into);
  else if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      into.add(key);
      keysOf(item, into);
    }
  }
  return into;
}

describe('GĐ5 exam room (US-4.3)', () => {
  const clock = new FakeClock();
  let t: AuthTestApp;
  let testDb: TestDb;
  let redis: Redis;
  let closedEvents: ExamSessionClosedEvent[];

  beforeAll(async () => {
    t = await createAuthTestApp({ configure: (b: TestingModuleBuilder) => b.overrideProvider(Clock).useValue(clock) });
    testDb = createTestDb();
    redis = t.app.get<Redis>(REDIS);
    closedEvents = captureEvents<ExamSessionClosedEvent>(t.app, EXAM_SESSION_CLOSED);
  });

  beforeEach(() => clock.set(new Date()));

  afterAll(async () => {
    await t.close();
    await testDb.close();
  });

  const start = (as: LoggedIn, preferenceId: number) => as.agent.post(api(`preferences/${preferenceId}/exam/start`)).send();
  const getPaper = (as: LoggedIn, sessionId: number) => as.agent.get(api(`exam-sessions/${sessionId}`));
  const save = (as: LoggedIn, sessionId: number, answers: unknown[]) =>
    as.agent.put(api(`exam-sessions/${sessionId}/answers`)).send({ answers });
  const submit = (as: LoggedIn, sessionId: number) => as.agent.post(api(`exam-sessions/${sessionId}/submit`)).send();
  const myExams = (as: LoggedIn) => as.agent.get(api('me/exams'));
  const errorOf = (res: Response) => ApiErrorSchema.parse(res.body);
  const fixture = (options: Partial<Parameters<typeof createExamFixture>[1]> = {}) =>
    createExamFixture(t, { now: clock.now(), ...options });

  async function started(options: Partial<Parameters<typeof createExamFixture>[1]> = {}) {
    const exam = await fixture(options);
    const paper = ExamPaperSchema.parse((await start(exam.student, exam.preferenceId).expect(200)).body);
    const [mcq, ...essays] = paper.questions;
    return { exam, paper, mcq: mcq!, essays };
  }

  /** The code the session shows for the option at `index` of the question's own list. */
  async function codeOf(sessionId: number, questionId: number, index: number): Promise<string> {
    const row = await sessionRow(t.db, sessionId);
    return row.optionLayout[String(questionId)]!.find((slot) => slot.index === index)!.code;
  }

  it('GĐ5 start draws per cell, shuffles, stores seed, caps deadline', async () => {
    const { exam, paper } = await started();
    const now = clock.now();
    expect(paper).toMatchObject({
      status: 'IN_PROGRESS',
      startedAt: now.toISOString(),
      deadlineAt: minutesAfter(now, EXAM_MINUTES),
      submittedAt: null,
      serverNow: now.toISOString(),
      answers: [],
    });
    // Part A (1 MCQ) before part B (2 essays), numbered across both.
    expect(paper.questions.map((question) => [question.no, question.part, question.type])).toEqual([
      [1, 'A', 'MCQ'],
      [2, 'B', 'ESSAY'],
      [3, 'B', 'ESSAY'],
    ]);
    const [mcq, ...essays] = paper.questions;
    expect(mcq!.options).toHaveLength(4);
    for (const option of mcq!.options!) expect(option.code).toMatch(/^[0-9a-z]{6}$/);
    for (const essay of essays) expect(essay.options).toBeNull();

    const row = await sessionRow(t.db, paper.sessionId);
    expect(row).toMatchObject({ studentId: exam.studentId, bankId: exam.bankId, bankVersion: 1, status: 'IN_PROGRESS' });
    expect(row.seed).toBeGreaterThanOrEqual(0);
    expect(row.seed).toBeLessThan(2 ** 31);
    expect(row.questionIds).toEqual(paper.questions.map((question) => question.questionId));
    expect(Object.keys(row.optionLayout)).toEqual([String(mcq!.questionId)]);
    expect(row.deadlineAt.getTime() - row.startedAt.getTime()).toBe(EXAM_MINUTES * 60_000);

    // Drawn per cell of SMALL_BLUEPRINT from the bank's VALIDATED questions, no repeat.
    const drawn = await t.db.select().from(questions).where(inArray(questions.id, row.questionIds));
    expect(drawn.map((question) => [question.bankId, question.status])).toEqual(drawn.map(() => [exam.bankId, 'VALIDATED']));
    const cells = drawn.map((question) => `${question.type}:${question.skill}:${question.difficulty}`).sort();
    expect(cells).toEqual(['ESSAY:SQL:MEDIUM', 'ESSAY:SQL:MEDIUM', 'MCQ:Java:EASY']);
    // The options are the question's own, in the session's order.
    const source = drawn.find((question) => question.type === 'MCQ')!;
    expect(mcq!.options!.map((option) => option.text).sort()).toEqual([...source.content.options!].sort());
    expect(mcq!.options!.map((option) => option.text)).toEqual(
      row.optionLayout[String(mcq!.questionId)]!.map((slot) => source.content.options![slot.index]),
    );

    // Redis holds what the autosave checks against, until a day after the deadline.
    const hash = await redis.hgetall(`exam:${paper.sessionId}:session`);
    expect(hash).toMatchObject({ student: String(exam.studentId), deadline: String(row.deadlineAt.getTime()), closed: '0' });
    expect(hash[`q:${mcq!.questionId}`]!.split(',').sort()).toEqual(mcq!.options!.map((option) => option.code).sort());
    for (const essay of essays) expect(hash[`q:${essay.questionId}`]).toBe('*');
    expect(await redis.pttl(`exam:${paper.sessionId}:session`)).toBeGreaterThan(EXAM_MINUTES * 60_000);

    const audit = await auditEntries(t.db, 'exam_session', paper.sessionId);
    expect(audit.map((entry) => entry.action)).toEqual(['EXAM_SESSION_STARTED']);
    expect(audit[0]!.after).toMatchObject({ preferenceId: exam.preferenceId, bankId: exam.bankId, bankVersion: 1, seed: row.seed });

    // CONTEXT D51: a late start is cut at testing_end.
    const testingEnd = minutesAfter(clock.now(), 20);
    const late = await started({ testingEnd });
    expect(late.paper.deadlineAt).toBe(testingEnd);
  });

  it('GĐ5 no exam response carries answer key fields', async () => {
    const { exam, paper, mcq, essays } = await started();
    const bodies: unknown[] = [paper];
    bodies.push((await myExams(exam.student).expect(200)).body);
    bodies.push((await getPaper(exam.student, paper.sessionId).expect(200)).body);
    bodies.push(
      (
        await save(exam.student, paper.sessionId, [
          { questionId: mcq.questionId, answer: { optionCode: mcq.options![0]!.code } },
          { questionId: essays[0]!.questionId, answer: { text: 'Bài làm' } },
        ]).expect(200)
      ).body,
    );
    bodies.push((await getPaper(exam.student, paper.sessionId).expect(200)).body);
    bodies.push((await submit(exam.student, paper.sessionId).expect(200)).body);
    bodies.push((await submit(exam.student, paper.sessionId).expect(200)).body);
    bodies.push((await getPaper(exam.student, paper.sessionId).expect(200)).body);
    bodies.push((await myExams(exam.student).expect(200)).body);

    for (const body of bodies) {
      const keys = keysOf(body);
      expect(FORBIDDEN_KEYS.filter((key) => keys.has(key))).toEqual([]);
      const text = JSON.stringify(body);
      // The explanation and the model answer of the drafts (test/helpers/question-bank.ts).
      expect(text).not.toContain('Phương án B đúng vì');
      expect(text).not.toContain('Đáp án mẫu');
      expect(text).not.toContain('Nêu đúng khái niệm');
    }
  });

  it('BR-06 restart resumes; 409 after submit; concurrent starts make one session', async () => {
    const exam = await fixture();
    const [first, second] = await runConcurrently(
      () => start(exam.student, exam.preferenceId).then((res) => res),
      () => start(exam.student, exam.preferenceId).then((res) => res),
    );
    const papers = [first!, second!].map((result) => {
      expect(result.status).toBe('fulfilled');
      const res = (result as PromiseFulfilledResult<Response>).value;
      expect(res.status).toBe(200);
      return ExamPaperSchema.parse(res.body);
    });
    expect(papers[1]!.sessionId).toBe(papers[0]!.sessionId);
    const rows = await t.db
      .select()
      .from(examSessions)
      .where(and(eq(examSessions.studentId, exam.studentId), eq(examSessions.bankId, exam.bankId!)));
    expect(rows).toHaveLength(1);

    // Starting again resumes the same paper, in the same order.
    const again = ExamPaperSchema.parse((await start(exam.student, exam.preferenceId).expect(200)).body);
    expect(again.sessionId).toBe(papers[0]!.sessionId);
    expect(again.questions).toEqual(papers[0]!.questions);

    await submit(exam.student, again.sessionId).expect(200);
    const taken = await start(exam.student, exam.preferenceId).expect(409);
    expect(errorOf(taken)).toMatchObject({ code: 'EXAM_ALREADY_TAKEN', details: { sessionId: again.sessionId, status: 'SUBMITTED' } });
  });

  it('BR-06 the database keeps one session per student and bank, and consistent deadlines (Invariant 11)', async () => {
    const { exam, paper } = await started();
    const row = await sessionRow(t.db, paper.sessionId);
    const insert = (values: Record<string, unknown>) =>
      testDb.pool.query(
        `INSERT INTO core.exam_sessions (student_id, bank_id, bank_version, seed, question_ids, option_layout, started_at, deadline_at, submitted_at, status)
         VALUES ($1, $2, $3, $4, $5, '{}', $6, $7, $8, $9)`,
        [
          values.studentId ?? exam.studentId,
          values.bankId ?? exam.bankId,
          values.bankVersion ?? 1,
          values.seed ?? 1,
          values.questionIds ?? row.questionIds,
          values.startedAt ?? row.startedAt,
          values.deadlineAt ?? row.deadlineAt,
          values.submittedAt ?? null,
          values.status ?? 'IN_PROGRESS',
        ],
      );
    await expect(insert({})).rejects.toMatchObject({ code: '23505', constraint: 'exam_sessions_student_bank_key' });

    const other = await fixture();
    const studentId = other.studentId;
    const bankId = other.bankId;
    await expect(insert({ studentId, bankId, deadlineAt: row.startedAt })).rejects.toMatchObject({
      constraint: 'exam_sessions_deadline_check',
    });
    await expect(insert({ studentId, bankId, status: 'SUBMITTED' })).rejects.toMatchObject({
      constraint: 'exam_sessions_submitted_check',
    });
    await expect(
      insert({ studentId, bankId, status: 'SUBMITTED', submittedAt: new Date(row.deadlineAt.getTime() + 1) }),
    ).rejects.toMatchObject({ constraint: 'exam_sessions_submitted_at_check' });
    await expect(insert({ studentId, bankId, questionIds: [] })).rejects.toMatchObject({ constraint: 'exam_sessions_draw_check' });
    await expect(insert({ studentId, bankId, seed: -1 })).rejects.toMatchObject({ constraint: 'exam_sessions_draw_check' });
  });

  it('GĐ5 IDOR 404; HR/CENTER 403; state, phase, bank 409', async () => {
    const { exam, paper, mcq } = await started();
    const intruder = await fixture();
    expect(errorOf(await start(intruder.student, exam.preferenceId).expect(404)).code).toBe('ENTITY_NOT_FOUND');
    await getPaper(intruder.student, paper.sessionId).expect(404);
    await save(intruder.student, paper.sessionId, [{ questionId: mcq.questionId, answer: { optionCode: mcq.options![0]!.code } }]).expect(
      404,
    );
    await submit(intruder.student, paper.sessionId).expect(404);
    expect((await sessionRow(t.db, paper.sessionId)).status).toBe('IN_PROGRESS');
    expect(await redis.hlen(`exam:${paper.sessionId}:answers`)).toBe(0);
    await start(exam.student, 999_999_999).expect(404);

    for (const role of ['HR', 'CENTER'] as const) {
      const staff = await t.loginAs(role);
      await myExams(staff).expect(403);
      await start(staff, exam.preferenceId).expect(403);
      await getPaper(staff, paper.sessionId).expect(403);
      await save(staff, paper.sessionId, [{ questionId: mcq.questionId, answer: null }]).expect(403);
      await submit(staff, paper.sessionId).expect(403);
    }

    const closed = await fixture();
    await t.db.update(preferences).set({ status: 'CLOSED' }).where(eq(preferences.id, closed.preferenceId));
    expect(errorOf(await start(closed.student, closed.preferenceId).expect(409))).toMatchObject({
      code: 'PREFERENCE_NOT_PENDING_TEST',
      details: { status: 'CLOSED' },
    });

    const early = await fixture({ status: 'PREFERENCE_SELECTION' });
    expect(errorOf(await start(early.student, early.preferenceId).expect(409)).code).toBe('CAMPAIGN_PHASE_MISMATCH');
    const ended = await fixture({ testingEnd: minutesAfter(clock.now(), -1) });
    expect(errorOf(await start(ended.student, ended.preferenceId).expect(409)).code).toBe('CAMPAIGN_PHASE_MISMATCH');

    const open = await fixture({ bank: 'OPEN' });
    expect(errorOf(await start(open.student, open.preferenceId).expect(409))).toMatchObject({
      code: 'BANK_NOT_LOCKED',
      details: { bankId: open.bankId },
    });
    const none = await fixture({ bank: 'NONE' });
    expect(errorOf(await start(none.student, none.preferenceId).expect(409))).toMatchObject({
      code: 'BANK_NOT_LOCKED',
      details: { bankId: null, jdId: none.jdId },
    });
    expect(await t.db.select().from(examSessions).where(eq(examSessions.studentId, closed.studentId))).toEqual([]);
  });

  it('GĐ5 LESSONS §38 a start waits for the preference lock and sees the change it waited for', async () => {
    const exam = await fixture();
    let starting: Promise<Response> | undefined;
    await testDb.db.transaction(async (tx) => {
      await tx.update(preferences).set({ status: 'CLOSED' }).where(eq(preferences.id, exam.preferenceId));
      starting = start(exam.student, exam.preferenceId).then((res) => res);
      await waitForALockWait(t.db);
    });
    const res = await starting!;
    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe('PREFERENCE_NOT_PENDING_TEST');
    expect(await t.db.select().from(examSessions).where(eq(examSessions.studentId, exam.studentId))).toEqual([]);
  });

  it('GĐ5 a retired question is not drawn; a cell left short is 409 EXAM_BANK_INCOMPLETE', async () => {
    const banks = t.app.get(QuestionBankService);
    const retire = (questionId: number) =>
      banks.retireQuestion({ questionId, actor: SYSTEM_ACTOR, reason: 'test: question retired after the lock' });
    const mcqsOf = async (bankId: number) =>
      t.db
        .select({ id: questions.id })
        .from(questions)
        .where(and(eq(questions.bankId, bankId), eq(questions.type, 'MCQ')));

    const exam = await fixture();
    const [gone, ...kept] = await mcqsOf(exam.bankId!);
    await retire(gone!.id);
    const paper = ExamPaperSchema.parse((await start(exam.student, exam.preferenceId).expect(200)).body);
    const row = await sessionRow(t.db, paper.sessionId);
    expect(row.bankVersion).toBe(2);
    expect(kept.map((question) => question.id)).toContain(row.questionIds[0]);

    const short = await fixture();
    for (const { id } of await mcqsOf(short.bankId!)) await retire(id);
    expect(errorOf(await start(short.student, short.preferenceId).expect(409))).toMatchObject({
      code: 'EXAM_BANK_INCOMPLETE',
      details: {
        bankId: short.bankId,
        shortCells: [{ part: 'A', type: 'MCQ', skill: 'Java', difficulty: 'EASY', needed: 1, available: 0 }],
      },
    });
  });

  it('NFR-10 autosave Redis only, idempotent; 422; 409 after grace', async () => {
    const { exam, paper, mcq, essays } = await started();
    const sessionId = paper.sessionId;
    const answers = [
      { questionId: mcq.questionId, answer: { optionCode: mcq.options![2]!.code } },
      { questionId: essays[0]!.questionId, answer: { text: 'Câu trả lời tự luận' } },
    ];
    const pool = t.app.get<Pool>(PG_POOL);
    const queries = jest.spyOn(pool, 'query');
    const connects = jest.spyOn(pool, 'connect');
    try {
      const saved = await save(exam.student, sessionId, answers).expect(200);
      expect(saved.body).toEqual({ deadlineAt: paper.deadlineAt, serverNow: clock.now().toISOString() });
      await save(exam.student, sessionId, answers).expect(200);
      expect(queries).not.toHaveBeenCalled();
      expect(connects).not.toHaveBeenCalled();
    } finally {
      queries.mockRestore();
      connects.mockRestore();
    }
    expect(await redis.hgetall(`exam:${sessionId}:answers`)).toEqual({
      [String(mcq.questionId)]: `C:${mcq.options![2]!.code}`,
      [String(essays[0]!.questionId)]: 'T:Câu trả lời tự luận',
    });
    expect(await t.db.select().from(examAnswers).where(eq(examAnswers.sessionId, sessionId))).toEqual([]);

    // One bad answer refuses the whole save (AC-6): nothing of it is written.
    const essay2 = essays[1]!.questionId;
    for (const bad of [
      { questionId: 999_999_999, answer: { text: 'x' } },
      { questionId: mcq.questionId, answer: { optionCode: 'zzzzzz' } },
      { questionId: mcq.questionId, answer: { text: 'B' } },
      { questionId: essays[0]!.questionId, answer: { optionCode: mcq.options![0]!.code } },
    ]) {
      const refused = await save(exam.student, sessionId, [{ questionId: essay2, answer: { text: 'không lưu' } }, bad]).expect(422);
      expect(errorOf(refused)).toMatchObject({ code: 'EXAM_ANSWER_INVALID', details: { questionIds: [bad.questionId] } });
    }
    expect(await redis.hexists(`exam:${sessionId}:answers`, String(essay2))).toBe(0);

    // `null` clears an answer; the body is checked before Redis (400).
    await save(exam.student, sessionId, [{ questionId: essays[0]!.questionId, answer: null }]).expect(200);
    expect(await redis.hkeys(`exam:${sessionId}:answers`)).toEqual([String(mcq.questionId)]);
    await save(exam.student, sessionId, []).expect(400);
    await save(exam.student, sessionId, [answers[0], answers[0]]).expect(400);
    await save(exam.student, sessionId, [{ questionId: essay2, answer: { text: 'x'.repeat(5001) } }]).expect(400);
    await save(exam.student, sessionId, [{ questionId: essay2, answer: { text: 'a', extra: 1 } }]).expect(400);

    // Ten seconds of grace by the server's clock, not one millisecond more.
    clock.set(new Date(Date.parse(paper.deadlineAt) + 10_000));
    await save(exam.student, sessionId, [{ questionId: essay2, answer: { text: 'kịp' } }]).expect(200);
    clock.set(new Date(Date.parse(paper.deadlineAt) + 10_001));
    const late = await save(exam.student, sessionId, [{ questionId: essay2, answer: { text: 'muộn' } }]).expect(409);
    expect(errorOf(late)).toMatchObject({ code: 'EXAM_CLOSED', details: { reason: 'DEADLINE_PASSED' } });
    expect(await redis.hget(`exam:${sessionId}:answers`, String(essay2))).toBe('T:kịp');
  });

  it('GĐ5 resume keeps paper, order, answers, deadline', async () => {
    const { exam, paper, mcq, essays } = await started();
    const sessionId = paper.sessionId;
    await save(exam.student, sessionId, [
      { questionId: mcq.questionId, answer: { optionCode: mcq.options![1]!.code } },
      { questionId: essays[1]!.questionId, answer: { text: 'Đang viết' } },
    ]).expect(200);

    // Ten minutes offline: the deadline does not move.
    clock.advance({ minutes: 10 });
    const resumed = ExamPaperSchema.parse((await getPaper(exam.student, sessionId).expect(200)).body);
    expect(resumed).toEqual<ExamPaper>({
      ...paper,
      serverNow: clock.now().toISOString(),
      answers: [
        { questionId: mcq.questionId, answer: { optionCode: mcq.options![1]!.code } },
        { questionId: essays[1]!.questionId, answer: { text: 'Đang viết' } },
      ],
    });

    // A question retired after the draw stays on the paper (CONTEXT D51).
    await t.app
      .get(QuestionBankService)
      .retireQuestion({ questionId: mcq.questionId, actor: SYSTEM_ACTOR, reason: 'test: retired during the exam' });
    const afterRetire = ExamPaperSchema.parse((await getPaper(exam.student, sessionId).expect(200)).body);
    expect(afterRetire.questions).toEqual(paper.questions);

    // Redis lost the session: it is rebuilt from PostgreSQL; the unsaved answers are gone, saves go on.
    await redis.del(`exam:${sessionId}:session`, `exam:${sessionId}:answers`);
    await save(exam.student, sessionId, [{ questionId: essays[0]!.questionId, answer: { text: 'Sau khi dựng lại' } }]).expect(200);
    const rebuilt = ExamPaperSchema.parse((await getPaper(exam.student, sessionId).expect(200)).body);
    expect(rebuilt.questions).toEqual(paper.questions);
    expect(rebuilt.answers).toEqual([{ questionId: essays[0]!.questionId, answer: { text: 'Sau khi dựng lại' } }]);
    expect(rebuilt.deadlineAt).toBe(paper.deadlineAt);
  });

  it('GĐ6 closing grades multiple choice', async () => {
    // US-4.4 AC-1 (CONTEXT D53): code grades the MCQ in the transaction that closes the session.
    const right = await started();
    const wrong = await started();
    await save(right.exam.student, right.paper.sessionId, [
      { questionId: right.mcq.questionId, answer: { optionCode: await codeOf(right.paper.sessionId, right.mcq.questionId, 1) } },
      { questionId: right.essays[0]!.questionId, answer: { text: 'Bài làm' } },
    ]).expect(200);
    await save(wrong.exam.student, wrong.paper.sessionId, [
      { questionId: wrong.mcq.questionId, answer: { optionCode: await codeOf(wrong.paper.sessionId, wrong.mcq.questionId, 2) } },
    ]).expect(200);
    await submit(right.exam.student, right.paper.sessionId).expect(200);
    await submit(wrong.exam.student, wrong.paper.sessionId).expect(200);
    const scores = async (sessionId: number) =>
      (
        await t.db
          .select({ questionId: examAnswers.questionId, autoScore: examAnswers.autoScore, finalScore: examAnswers.finalScore })
          .from(examAnswers)
          .where(eq(examAnswers.sessionId, sessionId))
      ).sort((a, b) => a.questionId - b.questionId);
    expect(await scores(right.paper.sessionId)).toEqual(
      [
        { questionId: right.mcq.questionId, autoScore: 1, finalScore: 1 },
        { questionId: right.essays[0]!.questionId, autoScore: null, finalScore: null },
      ].sort((a, b) => a.questionId - b.questionId),
    );
    expect(await scores(wrong.paper.sessionId)).toEqual([{ questionId: wrong.mcq.questionId, autoScore: 0, finalScore: 0 }]);
  });

  it('GĐ5 submit flushes in one transaction, emits event, idempotent', async () => {
    const { exam, paper, mcq, essays } = await started();
    const sessionId = paper.sessionId;
    const correct = await codeOf(sessionId, mcq.questionId, 1);
    await save(exam.student, sessionId, [
      { questionId: mcq.questionId, answer: { optionCode: correct } },
      { questionId: essays[0]!.questionId, answer: { text: 'Bài làm câu 2' } },
      { questionId: essays[1]!.questionId, answer: { text: '   ' } },
    ]).expect(200);
    clock.advance({ minutes: 30 });

    const submitted = ExamSubmissionSchema.parse((await submit(exam.student, sessionId).expect(200)).body);
    expect(submitted).toEqual({
      sessionId,
      status: 'SUBMITTED',
      submittedAt: clock.now().toISOString(),
      answeredCount: 2,
      questionCount: 3,
    });
    const rows = await t.db.select().from(examAnswers).where(eq(examAnswers.sessionId, sessionId));
    expect(rows.map((row) => [row.questionId, row.answer]).sort()).toEqual(
      [
        [mcq.questionId, { code: correct, option: 1 }],
        [essays[0]!.questionId, { text: 'Bài làm câu 2' }],
      ].sort(),
    );
    expect(await sessionRow(t.db, sessionId)).toMatchObject({ status: 'SUBMITTED', submittedAt: clock.now(), rowVersion: 1 });
    const audit = await auditEntries(t.db, 'exam_session', sessionId);
    expect(audit.map((entry) => entry.action)).toEqual(['TRANSITION', 'EXAM_SESSION_STARTED']);
    expect(closedEvents.filter((event) => event.sessionId === sessionId)).toEqual([
      { sessionId, studentId: exam.studentId, bankId: exam.bankId, status: 'SUBMITTED', submittedAt: clock.now().toISOString() },
    ]);

    // Redis closed first: no save lands afterwards. A second submit answers the same, writes nothing.
    expect(await redis.hget(`exam:${sessionId}:session`, 'closed')).toBe('1');
    expect(await redis.pttl(`exam:${sessionId}:session`)).toBeLessThanOrEqual(3_600_000);
    const closed = await save(exam.student, sessionId, [{ questionId: essays[1]!.questionId, answer: { text: 'muộn' } }]).expect(409);
    expect(errorOf(closed)).toMatchObject({ code: 'EXAM_CLOSED', details: { reason: 'CLOSED' } });
    clock.advance({ minutes: 1 });
    expect((await submit(exam.student, sessionId).expect(200)).body).toEqual(submitted);
    expect(await t.db.select().from(examAnswers).where(eq(examAnswers.sessionId, sessionId))).toHaveLength(2);
    expect(closedEvents.filter((event) => event.sessionId === sessionId)).toHaveLength(1);
    expect(ExamPaperSchema.parse((await getPaper(exam.student, sessionId).expect(200)).body)).toMatchObject({
      status: 'SUBMITTED',
      submittedAt: submitted.submittedAt,
      questions: [],
      answers: [],
    });
  });

  it('GĐ5 a close that fails lets saves in again; Redis rebuilt open meanwhile is closed by the submit', async () => {
    const { exam, paper, essays } = await started();
    const sessionId = paper.sessionId;
    const essay = essays[0]!.questionId;
    await save(exam.student, sessionId, [{ questionId: essay, answer: { text: 'Trước khi nộp' } }]).expect(200);

    // The close transaction fails: the session stays open, and so does Redis.
    const failing = jest
      .spyOn(t.app.get(ExamSessionsRepository), 'insertAnswers')
      .mockRejectedValueOnce(new Error('test: database down'));
    try {
      await submit(exam.student, sessionId).expect(500);
    } finally {
      failing.mockRestore();
    }
    expect((await sessionRow(t.db, sessionId)).status).toBe('IN_PROGRESS');
    expect(await redis.hget(`exam:${sessionId}:session`, 'closed')).toBe('0');
    await save(exam.student, sessionId, [{ questionId: essay, answer: { text: 'Sau lần nộp lỗi' } }]).expect(200);

    // Redis lost the session, and a GET rebuilt it open while the submit ran (CONTEXT D51).
    await redis.del(`exam:${sessionId}:session`, `exam:${sessionId}:answers`);
    const store = t.app.get(ExamAnswerStore);
    const closeAndRead = store.closeAndRead.bind(store);
    const racing = jest.spyOn(store, 'closeAndRead').mockImplementationOnce(async (id) => {
      const missing = await closeAndRead(id);
      await getPaper(exam.student, sessionId).expect(200);
      return missing;
    });
    let submitted: ExamSubmission;
    try {
      submitted = ExamSubmissionSchema.parse((await submit(exam.student, sessionId).expect(200)).body);
    } finally {
      racing.mockRestore();
    }
    expect(submitted).toMatchObject({ status: 'SUBMITTED', answeredCount: 0 });
    expect(await redis.hget(`exam:${sessionId}:session`, 'closed')).toBe('1');
    const refused = await save(exam.student, sessionId, [{ questionId: essay, answer: { text: 'muộn' } }]).expect(409);
    expect(errorOf(refused)).toMatchObject({ code: 'EXAM_CLOSED', details: { reason: 'CLOSED' } });
  });

  it('GĐ5 a submit within the grace is SUBMITTED at the deadline; after it, EXPIRED with the answers saved in time', async () => {
    const inGrace = await started();
    clock.set(new Date(Date.parse(inGrace.paper.deadlineAt) + 5_000));
    expect((await submit(inGrace.exam.student, inGrace.paper.sessionId).expect(200)).body).toMatchObject({
      status: 'SUBMITTED',
      submittedAt: inGrace.paper.deadlineAt,
    });

    clock.set(new Date());
    const late = await started();
    await save(late.exam.student, late.paper.sessionId, [
      { questionId: late.essays[0]!.questionId, answer: { text: 'Viết trước hạn' } },
    ]).expect(200);
    clock.set(new Date(Date.parse(late.paper.deadlineAt) + 11_000));
    expect((await submit(late.exam.student, late.paper.sessionId).expect(200)).body).toEqual({
      sessionId: late.paper.sessionId,
      status: 'EXPIRED',
      submittedAt: late.paper.deadlineAt,
      answeredCount: 1,
      questionCount: 3,
    });
    expect(closedEvents.find((event) => event.sessionId === late.paper.sessionId)).toMatchObject({ status: 'EXPIRED' });
  });

  it('GĐ5 rate limit 429; autosave cadence under limit', async () => {
    const exam = await fixture();
    for (let i = 0; i < 10; i += 1) await start(exam.student, exam.preferenceId).expect(200);
    const limited = await start(exam.student, exam.preferenceId).expect(429);
    expect(errorOf(limited)).toMatchObject({ code: 'RATE_LIMITED', details: { route: 'exam.start' } });
    const retryAfter = Number(limited.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);

    // A minute of the client's autosave at most: every 1.5 s of typing plus the 30-second cycle.
    const paper = ExamPaperSchema.parse((await getPaper(exam.student, (await sessionOf(exam)).id).expect(200)).body);
    const essay = paper.questions[1]!.questionId;
    for (let i = 0; i < 42; i += 1) {
      await save(exam.student, paper.sessionId, [{ questionId: essay, answer: { text: `bản ${i}` } }]).expect(200);
    }
  });

  async function sessionOf(exam: ExamFixture) {
    const [row] = await t.db
      .select()
      .from(examSessions)
      .where(and(eq(examSessions.studentId, exam.studentId), eq(examSessions.bankId, exam.bankId!)));
    return row!;
  }

  it('GĐ5 my exams lists status and remaining time', async () => {
    const nv1 = await fixture();
    const nv2 = await fixture({ campaignId: nv1.campaignId, student: nv1.student, rank: 2, bank: 'OPEN' });
    const nv3 = await fixture({ campaignId: nv1.campaignId, student: nv1.student, rank: 3 });
    await t.db.update(preferences).set({ status: 'CLOSED' }).where(eq(preferences.id, nv3.preferenceId));

    const before = MyExamsResponseSchema.parse((await myExams(nv1.student).expect(200)).body);
    expect(before.campaign).toMatchObject({ id: nv1.campaignId, testingOpen: true });
    expect(before.serverNow).toBe(clock.now().toISOString());
    expect(before.items).toMatchObject([
      {
        preferenceId: nv1.preferenceId,
        rank: 1,
        jdId: nv1.jdId,
        jdTitle: 'Backend Intern',
        examStatus: 'NOT_STARTED',
        sessionId: null,
        durationMinutes: EXAM_MINUTES,
        questionCount: 3,
        canStart: true,
        secondsIfStartedNow: EXAM_MINUTES * 60,
        resultState: null,
      },
      { preferenceId: nv2.preferenceId, rank: 2, examStatus: 'NOT_STARTED', durationMinutes: null, canStart: false, secondsIfStartedNow: null },
      { preferenceId: nv3.preferenceId, rank: 3, examStatus: 'CLOSED', canStart: false, secondsIfStartedNow: null },
    ]);

    const paper = ExamPaperSchema.parse((await start(nv1.student, nv1.preferenceId).expect(200)).body);
    const during = MyExamsResponseSchema.parse((await myExams(nv1.student).expect(200)).body);
    expect(during.items[0]).toMatchObject({
      examStatus: 'IN_PROGRESS',
      sessionId: paper.sessionId,
      deadlineAt: paper.deadlineAt,
      canStart: false,
      secondsIfStartedNow: null,
      resultState: null,
    });
    await submit(nv1.student, paper.sessionId).expect(200);
    const after = MyExamsResponseSchema.parse((await myExams(nv1.student).expect(200)).body);
    // US-4.4 AC-12: closed, its results not published yet.
    expect(after.items[0]).toMatchObject({ examStatus: 'SUBMITTED', submittedAt: clock.now().toISOString(), resultState: 'GRADING' });

    // CONTEXT D51: twenty minutes before testing_end, starting now gives twenty minutes.
    const late = await fixture({ testingEnd: minutesAfter(clock.now(), 20) });
    expect(MyExamsResponseSchema.parse((await myExams(late.student).expect(200)).body).items[0]).toMatchObject({
      canStart: true,
      secondsIfStartedNow: 20 * 60,
    });
    // Only the latest campaign of the student is listed.
    const next = await fixture({ student: late.student });
    const latest = MyExamsResponseSchema.parse((await myExams(late.student).expect(200)).body);
    expect(latest.campaign?.id).toBe(next.campaignId);
    expect(latest.items.map((item) => item.preferenceId)).toEqual([next.preferenceId]);

    const newcomer = await t.loginAs('STUDENT');
    expect((await myExams(newcomer).expect(200)).body).toEqual({ campaign: null, items: [], serverNow: clock.now().toISOString() });
  });
});
