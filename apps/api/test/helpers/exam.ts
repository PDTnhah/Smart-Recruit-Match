// Setup for the exam room tests (US-4.3): a campaign in TESTING, an approved JD whose question bank
// of SMALL_BLUEPRINT (1 MCQ in part A, 2 essays in part B) is locked, and a student with a
// PENDING_TEST preference for it. Rows are written directly; locking goes through transitionTo.
import type { ExamBlueprint, GeneratedQuestion, QuestionBankStatus } from '@srm/shared';
import { eq, sql } from 'drizzle-orm';
import { transitionTo } from '../../src/common/state/transition-to.js';
import { questionBankLifecycle } from '../../src/db/lifecycles.js';
import { examSessions, questionBanks, questions } from '../../src/db/schema/index.js';
import type { Database } from '../../src/db/types.js';
import { toStoredQuestion } from '../../src/modules/assessment/index.js';
import { AuditService, SYSTEM_ACTOR } from '../../src/modules/audit/index.js';
import type { AuthTestApp, LoggedIn } from './auth.js';
import { createCampaign, createCompany, createPreference, TEST_CAMPAIGN_TARGET } from './factories.js';
import { createJdInState } from './jd.js';
import { BANK_REQUIREMENTS, SMALL_BLUEPRINT, smallBankDrafts } from './question-bank.js';

const MINUTE = 60_000;

/** Minutes of SMALL_BLUEPRINT. */
export const EXAM_MINUTES = SMALL_BLUEPRINT.duration_minutes;

/** ISO instant `minutes` after `from`. */
export const minutesAfter = (from: Date, minutes: number) => new Date(from.getTime() + minutes * MINUTE).toISOString();

export interface BankOptions {
  /** LOCKED by default; OPEN leaves it as generation left it; NONE makes no bank. */
  bank?: 'LOCKED' | 'OPEN' | 'NONE';
  blueprint?: ExamBlueprint;
  drafts?: GeneratedQuestion[];
}

/** A bank of the JD holding `drafts` as VALIDATED questions, locked unless told otherwise. */
export async function createBank(
  db: Database,
  jd: { id: number; campaignId: number; version: number },
  options: BankOptions = {},
): Promise<typeof questionBanks.$inferSelect | null> {
  if (options.bank === 'NONE') return null;
  const [bank] = await db
    .insert(questionBanks)
    .values({ campaignId: jd.campaignId, jdId: jd.id, jdVersion: jd.version, blueprint: options.blueprint ?? SMALL_BLUEPRINT })
    .returning();
  if (!bank) throw new Error('no question bank inserted');
  const rows = (options.drafts ?? smallBankDrafts()).map((draft) => {
    const stored = toStoredQuestion(draft);
    if (!stored) throw new Error(`draft ${draft.draft_id} has no single answer`);
    return { ...stored, bankId: bank.id, status: 'VALIDATED' as const, validation: draft.validation };
  });
  await db.insert(questions).values(rows);
  if (options.bank === 'OPEN') return bank;
  await transitionTo<QuestionBankStatus>(db, new AuditService(), {
    lifecycle: questionBankLifecycle,
    id: bank.id,
    to: 'LOCKED',
    actor: SYSTEM_ACTOR,
    reason: 'test: locked question bank (US-4.3)',
    set: { lockedAt: new Date() },
  });
  const [locked] = await db.select().from(questionBanks).where(eq(questionBanks.id, bank.id));
  return locked!;
}

export interface ExamFixtureOptions extends BankOptions {
  /** `testing_end`; a week after `now` by default. */
  testingEnd?: string;
  /** The campaign's status; TESTING by default. */
  status?: 'TESTING' | 'PREFERENCE_SELECTION' | 'ALLOCATION_REVIEW';
  /** The time the deadlines count from, normally the FakeClock's now. */
  now: Date;
  /** Logs in a new student unless given. */
  student?: LoggedIn;
  campaignId?: number;
  rank?: number;
}

export interface ExamFixture {
  campaignId: number;
  jdId: number;
  bankId: number | null;
  preferenceId: number;
  student: LoggedIn;
  studentId: number;
}

/** A student with a PENDING_TEST preference for a JD whose bank is locked (by default). */
export async function createExamFixture(t: AuthTestApp, options: ExamFixtureOptions): Promise<ExamFixture> {
  const campaignId =
    options.campaignId ??
    (
      await createCampaign(t.db, {
        status: options.status ?? 'TESTING',
        phaseDeadlines: {
          intake_end: minutesAfter(options.now, -14 * 24 * 60),
          preference_end: minutesAfter(options.now, -7 * 24 * 60),
          testing_end: options.testingEnd ?? minutesAfter(options.now, 7 * 24 * 60),
        },
        config: { target: TEST_CAMPAIGN_TARGET },
      })
    ).id;
  const { id: companyId } = await createCompany(t.db);
  const jd = await createJdInState(t.db, { companyId, campaignId, status: 'APPROVED', requirements: BANK_REQUIREMENTS });
  const bank = await createBank(t.db, jd, options);
  const student = options.student ?? (await t.loginAs('STUDENT'));
  const studentId = student.user.studentId!;
  const preference = await createPreference(t.db, {
    campaignId,
    studentId,
    jdId: jd.id,
    rank: options.rank ?? 1,
    status: 'PENDING_TEST',
  });
  return { campaignId, jdId: jd.id, bankId: bank?.id ?? null, preferenceId: preference.id, student, studentId };
}

export async function sessionRow(db: Database, sessionId: number) {
  const [row] = await db.select().from(examSessions).where(eq(examSessions.id, sessionId));
  return row!;
}

/** Waits until some statement waits for a row lock, e.g. a request behind an open transaction. */
export async function waitForALockWait(db: Database): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const { rows } = await db.execute<{ waiting: number }>(sql`select count(*)::int as waiting from pg_locks where not granted`);
    if ((rows[0]?.waiting ?? 0) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('no statement waited for a lock');
}
