// US-4.2 AC-6, AC-7, AC-8, AC-11 (FR-18, GĐ5 bước 4, BR-18, AGENTS › Invariants 8, 10, 11, CONTEXT
// D50): CENTER locks a question bank once every cell holds 3× VALIDATED questions; after that the
// database keeps the bank and its questions as they are, a retired question raises the bank's
// version, and exams are drawn from the locked bank only.
import { ApiErrorSchema, type ExamBlueprint, ExamBlueprintViewSchema, type GeneratedQuestion, type JdRequirements } from '@srm/shared';
import { and, eq, sql } from 'drizzle-orm';
import { BankNotLockedError, InvalidTransitionError } from '../../src/common/errors/index.js';
import { auditLogs, jobDescriptions, questionBanks, questions } from '../../src/db/schema/index.js';
import { AI_JOB_DISPATCHED, type AiJobDispatchedEvent } from '../../src/modules/aigateway/index.js';
import { QuestionBankService } from '../../src/modules/assessment/index.js';
import type { Actor } from '../../src/modules/audit/index.js';
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
  SMALL_BLUEPRINT,
  smallBankDrafts,
  verdict,
} from '../helpers/question-bank.js';

/** What a hand-written statement on a locked bank meets: the trigger of migration 0031. */
const LOCKED_REFUSAL = { code: '23000', message: expect.stringMatching(/locked/) as unknown };

describe('GĐ5 question bank lock (US-4.2)', () => {
  let t: AuthTestApp;
  let center: LoggedIn;
  let centerActor: Actor;
  let companyId: number;
  let dispatched: AiJobDispatchedEvent<'QUESTIONS_GENERATE'>[];
  let testDb: TestDb;
  let service: QuestionBankService;

  beforeAll(async () => {
    t = await createAuthTestApp();
    center = await t.loginAs('CENTER');
    centerActor = { kind: 'USER', userId: center.user.id };
    companyId = (await createCompany(t.db)).id;
    dispatched = captureEvents(t.app, AI_JOB_DISPATCHED);
    testDb = createTestDb();
    service = t.app.get(QuestionBankService);
  });

  afterAll(async () => {
    await t.close();
    await testDb.close();
  });

  const viewOf = async (jdId: number, as: LoggedIn = center) =>
    ExamBlueprintViewSchema.parse((await as.agent.get(api(`jds/${jdId}/exam-blueprint`)).expect(200)).body);
  const putBlueprint = (jdId: number, rowVersion: number, blueprint: ExamBlueprint) =>
    center.agent.put(api(`jds/${jdId}/exam-blueprint`)).send({ rowVersion, blueprint });
  const generate = (jdId: number) => center.agent.post(api(`jds/${jdId}/question-bank/generate`)).send();
  const lock = (bankId: number, rowVersion: number, as: LoggedIn = center) =>
    as.agent.post(api(`question-banks/${bankId}/lock`)).send({ rowVersion });
  const jobsOf = (bankId: number) =>
    dispatched.filter((event) => event.type === 'QUESTIONS_GENERATE' && event.job.bank_id === bankId);
  const errorCode = (body: unknown) => ApiErrorSchema.parse(body).code;
  const questionByDraft = async (draftId: number) => {
    const [row] = await t.db.select().from(questions).where(eq(questions.draftId, draftId));
    return row!;
  };
  /** Until some statement waits for a row lock; the files share the database, so any will do. */
  const waitForALockWait = async () => {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const { rows } = await t.db.execute<{ waiting: number }>(sql`select count(*)::int as waiting from pg_locks where not granted`);
      if ((rows[0]?.waiting ?? 0) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('no statement waited for a lock');
  };
  const bankRow = async (bankId: number) => {
    const [row] = await t.db.select().from(questionBanks).where(eq(questionBanks.id, bankId));
    return row!;
  };

  /**
   * An approved JD whose bank holds SMALL_BLUEPRINT and the drafts of one finished job; with the
   * default drafts every cell holds 3× VALIDATED questions.
   */
  async function bankWith(drafts: GeneratedQuestion[] = smallBankDrafts(), requirements: JdRequirements = BANK_REQUIREMENTS) {
    const jd = await createJdInState(t.db, { companyId, status: 'APPROVED', requirements });
    const made = await viewOf(jd.id);
    await putBlueprint(jd.id, made.rowVersion, SMALL_BLUEPRINT).expect(200);
    await generate(jd.id).expect(202);
    await deliverResult(t.app, resultMessage(jobsOf(made.bankId).at(-1)!.job, { questions: drafts }));
    return { jdId: jd.id, jdVersion: jd.version, bankId: made.bankId, drafts, view: await viewOf(jd.id) };
  }

  it('GĐ5 AC-6 CENTER locks a complete bank: OPEN → LOCKED, locked_at in the same UPDATE, audited', async () => {
    const { jdId, bankId, view } = await bankWith();
    expect(view).toMatchObject({ status: 'OPEN', locked: false, lock: { allowed: true, blockers: [] }, lockedAt: null });

    const locked = ExamBlueprintViewSchema.parse((await lock(bankId, view.rowVersion).expect(200)).body);
    expect(locked).toMatchObject({
      jdId,
      bankId,
      status: 'LOCKED',
      locked: true,
      editable: false,
      version: 1,
      rowVersion: view.rowVersion + 1,
      lock: { allowed: false, blockers: ['LOCKED'] },
    });
    const row = await bankRow(bankId);
    expect(row.lockedAt?.toISOString()).toBe(locked.lockedAt);
    const [entry] = await t.db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entity, 'question_bank'), eq(auditLogs.entityId, bankId), eq(auditLogs.action, 'TRANSITION')));
    expect(entry).toMatchObject({
      actorId: center.user.id,
      before: { status: 'OPEN', rowVersion: view.rowVersion },
      after: { status: 'LOCKED', rowVersion: locked.rowVersion, lockedAt: locked.lockedAt },
    });

    // Locked once and for good; a stale row_version is a conflict first.
    expect(errorCode((await lock(bankId, locked.rowVersion).expect(409)).body)).toBe('QUESTION_BANK_LOCKED');
    expect(errorCode((await lock(bankId, view.rowVersion).expect(409)).body)).toBe('ROW_VERSION_CONFLICT');
  });

  it('GĐ5 AC-6 a cell short of VALIDATED questions: 409 QUESTION_BANK_INCOMPLETE with the cells', async () => {
    const drafts = [
      ...Array.from({ length: 3 }, () => mcq('Java', 'EASY', verdict())),
      ...Array.from({ length: 4 }, () => essay('SQL', verdict())),
      essay('SQL', verdict(['UNCLEAR'])),
      essay('SQL'),
    ];
    const { bankId, view } = await bankWith(drafts);
    expect(view.lock).toEqual({ allowed: false, blockers: ['INCOMPLETE'] });

    const res = await lock(bankId, view.rowVersion).expect(409);
    const body = ApiErrorSchema.parse(res.body);
    expect(body.code).toBe('QUESTION_BANK_INCOMPLETE');
    // Rejected and unchecked drafts count as drafted, not as validated.
    expect(body.details?.missingCells).toEqual([
      { type: 'ESSAY', skill: 'SQL', difficulty: 'MEDIUM', drafted: 6, validated: 4, required: 6 },
    ]);
    expect(await bankRow(bankId)).toMatchObject({ status: 'OPEN', lockedAt: null, rowVersion: view.rowVersion });
  });

  it('GĐ5 AC-6 a running generation: 409 QUESTION_GENERATION_RUNNING', async () => {
    const { jdId, bankId } = await bankWith();
    await generate(jdId).expect(202);
    const view = await viewOf(jdId);
    expect(view.lock.blockers).toEqual(['GENERATION_RUNNING']);
    expect(errorCode((await lock(bankId, view.rowVersion).expect(409)).body)).toBe('QUESTION_GENERATION_RUNNING');
  });

  it('GĐ5 AC-6 only CENTER locks; of two locks with the same row_version one wins, the other gets 409', async () => {
    const { bankId, view } = await bankWith();
    for (const role of ['HR', 'STUDENT'] as const) {
      const as = await t.loginAs(role, role === 'HR' ? { companyId } : {});
      await lock(bankId, view.rowVersion, as).expect(403);
    }
    await center.agent.post(api(`question-banks/${bankId}/lock`)).send({ rowVersion: 'x' }).expect(400);
    const results = await Promise.all([lock(bankId, view.rowVersion), lock(bankId, view.rowVersion)]);
    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    expect(errorCode(results.find((res) => res.status === 409)!.body)).toBe('ROW_VERSION_CONFLICT');
    await lock(9_999_999, 0).expect(404);
  });

  it('BR-18 AC-11 newer JD requirements block lock and generation until the blueprint is saved again', async () => {
    const { jdId, jdVersion, bankId, view } = await bankWith();
    // HR versioned the requirements: SQL is no longer one of them.
    const javaOnly: JdRequirements = { ...BANK_REQUIREMENTS, must_have: [BANK_REQUIREMENTS.must_have[0]!], nice_to_have: [] };
    await t.db
      .update(jobDescriptions)
      .set({ version: jdVersion + 1, requirements: javaOnly })
      .where(eq(jobDescriptions.id, jdId));
    const outdated = await viewOf(jdId);
    expect(outdated).toMatchObject({ jdOutdated: true, jdVersion, lock: { allowed: false, blockers: ['JD_OUTDATED'] } });
    expect(errorCode((await lock(bankId, outdated.rowVersion).expect(409)).body)).toBe('QUESTION_BANK_JD_OUTDATED');
    expect(errorCode((await generate(jdId).expect(409)).body)).toBe('QUESTION_BANK_JD_OUTDATED');
    expect(jobsOf(bankId)).toHaveLength(1);

    // Saved again against the new requirements: the SQL essays are not counted anywhere.
    const javaBlueprint: ExamBlueprint = {
      ...SMALL_BLUEPRINT,
      parts: { ...SMALL_BLUEPRINT.parts, B: { ...SMALL_BLUEPRINT.parts.B, cells: [{ skill: 'Java', difficulty: 'MEDIUM', count: 2 }] } },
    };
    const saved = ExamBlueprintViewSchema.parse((await putBlueprint(jdId, view.rowVersion, javaBlueprint).expect(200)).body);
    expect(saved).toMatchObject({ jdOutdated: false, jdVersion: jdVersion + 1, lock: { blockers: ['INCOMPLETE'] } });
    expect(saved.coverage.map((cell) => [cell.skill, cell.difficulty, cell.validated])).toEqual([
      ['Java', 'EASY', 3],
      ['Java', 'MEDIUM', 0],
    ]);
    await generate(jdId).expect(202);

    // Filled and locked: the SQL essays are still VALIDATED, yet no exam draws them (AC-8).
    const javaEssays = Array.from({ length: 6 }, () => essay('Java', verdict()));
    await deliverResult(t.app, resultMessage(jobsOf(bankId).at(-1)!.job, { questions: javaEssays }));
    await lock(bankId, (await viewOf(jdId)).rowVersion).expect(200);
    const sqlEssays = await t.db
      .select()
      .from(questions)
      .where(and(eq(questions.bankId, bankId), eq(questions.skill, 'SQL'), eq(questions.status, 'VALIDATED')));
    expect(sqlEssays).toHaveLength(6);
    const drawable = await service.getDrawableQuestions(bankId);
    expect(drawable.questions).toHaveLength(9);
    expect(new Set(drawable.questions.map((question) => question.skill))).toEqual(new Set(['Java']));
  });

  it('BR-18 AC-11 requirements saved while the bank locks are seen: the lock reads the JD in its transaction', async () => {
    const { jdId, jdVersion, bankId, view } = await bankWith();
    let locking: Promise<{ status: number; body: unknown }> | undefined;
    await testDb.db.transaction(async (tx) => {
      // A save of new requirements, not committed yet, holds the JD row: the lock waits for it.
      await tx.update(jobDescriptions).set({ version: jdVersion + 1 }).where(eq(jobDescriptions.id, jdId));
      locking = lock(bankId, view.rowVersion).then((res) => res);
      await waitForALockWait();
    });
    const res = await locking!;
    expect(res.status).toBe(409);
    expect(errorCode(res.body)).toBe('QUESTION_BANK_JD_OUTDATED');
    expect(await bankRow(bankId)).toMatchObject({ status: 'OPEN', lockedAt: null });
  });

  it('BR-18 AC-11 a locked bank keeps its requirements when the JD is versioned', async () => {
    const { jdId, jdVersion, bankId, view } = await bankWith();
    await lock(bankId, view.rowVersion).expect(200);
    await t.db.update(jobDescriptions).set({ version: jdVersion + 1 }).where(eq(jobDescriptions.id, jdId));
    expect(await viewOf(jdId)).toMatchObject({ status: 'LOCKED', jdOutdated: false, jdVersion, version: 1 });
    expect(jobsOf(bankId)).toHaveLength(1);
  });

  it('GĐ5 AC-7 the database keeps a locked bank and its questions as they are (Invariant 11)', async () => {
    const { bankId, drafts, view } = await bankWith();
    await lock(bankId, view.rowVersion).expect(200);
    const question = await questionByDraft(drafts[0]!.draft_id);
    const pool = testDb.pool;

    await expect(
      pool.query(
        `INSERT INTO core.questions (bank_id, draft_id, type, skill, difficulty, content, answer_key, model, prompt_version)
         VALUES ($1, $2, 'MCQ', 'Java', 'EASY', '{"stem": "x", "options": ["a", "b", "c", "d"]}',
                 '{"correct_option": 0, "explanation": "x", "sample_answer": null}', 'm', 'test_generator/v1')`,
        [bankId, -question.draftId],
      ),
    ).rejects.toMatchObject(LOCKED_REFUSAL);
    await expect(pool.query('DELETE FROM core.questions WHERE id = $1', [question.id])).rejects.toMatchObject(LOCKED_REFUSAL);
    await expect(
      pool.query(`UPDATE core.questions SET content = jsonb_set(content, '{stem}', '"đổi đề"') WHERE id = $1`, [question.id]),
    ).rejects.toMatchObject(LOCKED_REFUSAL);
    await expect(pool.query(`UPDATE core.questions SET status = 'REJECTED' WHERE id = $1`, [question.id])).rejects.toMatchObject(
      LOCKED_REFUSAL,
    );
    await expect(
      pool.query(`UPDATE core.question_banks SET blueprint = jsonb_set(blueprint, '{duration_minutes}', '90') WHERE id = $1`, [bankId]),
    ).rejects.toMatchObject(LOCKED_REFUSAL);
    await expect(
      pool.query(`UPDATE core.question_banks SET status = 'OPEN', locked_at = NULL WHERE id = $1`, [bankId]),
    ).rejects.toMatchObject(LOCKED_REFUSAL);
    await expect(pool.query('DELETE FROM core.question_banks WHERE id = $1', [bankId])).rejects.toMatchObject(LOCKED_REFUSAL);
    expect(await questionByDraft(drafts[0]!.draft_id)).toEqual(question);
  });

  it('GĐ5 AC-7 retiring a question of a locked bank raises its version by one, audited in the same transaction', async () => {
    const extraJava = mcq('Java', 'EASY', verdict());
    const rejected = mcq('Java', 'EASY', verdict(['ANSWER_LEAKED']));
    const { jdId, bankId, drafts } = await bankWith([...smallBankDrafts(), extraJava, rejected]);

    // Before locking a retired question leaves the version as it is.
    const early = await questionByDraft(extraJava.draft_id);
    const open = await service.retireQuestion({
      questionId: early.id,
      actor: centerActor,
      reason: 'Trùng ý với câu khác',
      expectedRowVersion: early.rowVersion,
    });
    expect(open).toMatchObject({ bankId, bankVersion: 1 });

    const ready = await viewOf(jdId);
    await lock(bankId, ready.rowVersion).expect(200);
    const target = await questionByDraft(drafts[0]!.draft_id);
    const lockedBank = await bankRow(bankId);
    const retired = await service.retireQuestion({
      questionId: target.id,
      actor: centerActor,
      reason: 'Phúc khảo: đáp án sai',
      expectedRowVersion: target.rowVersion,
    });
    expect(retired).toEqual({ questionId: target.id, rowVersion: target.rowVersion + 1, bankId, bankVersion: 2 });
    expect(await questionByDraft(drafts[0]!.draft_id)).toMatchObject({ status: 'RETIRED', content: target.content });
    expect(await bankRow(bankId)).toMatchObject({ status: 'LOCKED', version: 2, rowVersion: lockedBank.rowVersion + 1 });
    const [entry] = await t.db
      .select()
      .from(auditLogs)
      .where(
        and(eq(auditLogs.entity, 'question_bank'), eq(auditLogs.entityId, bankId), eq(auditLogs.action, 'QUESTION_BANK_VERSIONED')),
      );
    expect(entry).toMatchObject({
      actorId: center.user.id,
      before: { version: 1 },
      after: { version: 2, questionId: target.id },
      reason: 'Phúc khảo: đáp án sai',
    });
    const { rows } = await testDb.pool.query<{ bank: string; question: string; audit: string }>(
      `SELECT (SELECT xmin::text FROM core.question_banks WHERE id = $1) AS bank,
              (SELECT xmin::text FROM core.questions WHERE id = $2) AS question,
              (SELECT xmin::text FROM core.audit_logs WHERE id = $3) AS audit`,
      [bankId, target.id, entry!.id],
    );
    expect(new Set(Object.values(rows[0]!)).size).toBe(1);

    // A REJECTED question cannot be retired; the bank's version stays.
    const refused = await questionByDraft(rejected.draft_id);
    await expect(
      service.retireQuestion({ questionId: refused.id, actor: centerActor, reason: 'x', expectedRowVersion: refused.rowVersion }),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
    expect(await bankRow(bankId)).toMatchObject({ version: 2 });
    // The version only rises.
    await expect(testDb.pool.query('UPDATE core.question_banks SET version = 1 WHERE id = $1', [bankId])).rejects.toMatchObject(
      LOCKED_REFUSAL,
    );
  });

  it('GĐ5 AC-8 exams are drawn from the VALIDATED questions of a locked bank only; answer keys stay on the server', async () => {
    const rejected = mcq('Java', 'EASY', verdict(['MULTIPLE_CORRECT'], { correct_options: [0, 1] }));
    const waiting = essay('SQL');
    const drafts = smallBankDrafts();
    const { jdId, bankId, view } = await bankWith([...drafts, rejected, waiting]);
    await expect(service.getDrawableQuestions(bankId)).rejects.toBeInstanceOf(BankNotLockedError);
    await expect(service.getDrawableQuestions(bankId)).rejects.toMatchObject({ code: 'BANK_NOT_LOCKED', httpStatus: 409 });

    await lock(bankId, view.rowVersion).expect(200);
    const drawable = await service.getDrawableQuestions(bankId);
    expect(drawable).toMatchObject({ bankId, version: 1, blueprint: SMALL_BLUEPRINT });
    const validatedIds = await Promise.all(drafts.map(async (draft) => (await questionByDraft(draft.draft_id)).id));
    expect(drawable.questions.map((question) => question.id)).toEqual([...validatedIds].sort((a, b) => a - b));
    expect(drawable.questions[0]).toMatchObject({
      type: 'MCQ',
      skill: 'Java',
      difficulty: 'EASY',
      content: { stem: drafts[0]!.stem },
      answerKey: { correct_option: 1, explanation: 'Phương án B đúng vì …' },
      rubric: null,
    });

    // Invariant 8: CENTER's view of the bank carries no answer.
    const body = JSON.stringify((await center.agent.get(api(`jds/${jdId}/exam-blueprint`)).expect(200)).body);
    expect(body).not.toMatch(/answer_key|answerKey|Phương án B đúng vì|Đáp án mẫu/);
  });
});
