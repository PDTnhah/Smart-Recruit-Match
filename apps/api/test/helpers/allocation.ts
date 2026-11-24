// A campaign ready for an allocation round (US-5.2): JDs with a bank, students with a confirmed CV,
// a scored match result, graded preferences and published tests, written straight to the tables so
// the 500 × 50 seed of NFR-8 stays quick. Times are real (the service reads `Clock`).
import type { ApplicationStatus } from '@srm/shared';
import { eq } from 'drizzle-orm';
import { examAnswers, examSessions, questionBanks, questions } from '../../src/db/schema/index.js';
import type { Database } from '../../src/db/types.js';
import { createBank } from './exam.js';
import { GRADER_MODEL, GRADER_PROMPT } from './grading.js';
import {
  createCampaign,
  createCompany,
  createCv,
  createJobDescription,
  createMatchResult,
  createPreference,
  createStudent,
  TEST_CAMPAIGN_TARGET,
} from './factories.js';
import { SMALL_BLUEPRINT } from './question-bank.js';

const HOUR = 60 * 60_000;

export interface SeedPreference {
  /** Index of the JD in `quotas`. */
  jd: number;
  sFinal: number;
  /** Null: the test was never taken and the preference is CLOSED. */
  sTest: number | null;
  sCv?: number;
  /** False: the pair failed the hard filter (GPA_BELOW_MIN). */
  eligible?: boolean;
  /** TEST_GRADED by default, CLOSED without a test. */
  status?: ApplicationStatus;
  /** When its results were published; 49 hours ago by default (past the 48-hour appeal window). */
  publishedAt?: Date;
}

export interface SeedStudent {
  prefs: SeedPreference[];
  gpa?: number | null;
}

export interface AllocationSeed {
  campaignId: number;
  companyId: number;
  jdIds: number[];
  studentIds: number[];
  studentCodes: string[];
  /** `[student][preference]`. */
  preferenceIds: number[][];
  sessionIds: (number | null)[][];
}

export interface SeedOptions {
  quotas: number[];
  students: SeedStudent[];
  k?: number;
  status?: 'ALLOCATION_REVIEW' | 'TESTING';
  /** Gives the first session of JD 0 an essay graded by `GRADER_MODEL` / `GRADER_PROMPT` (BR-17). */
  graderRun?: boolean;
}

export async function seedAllocationCampaign(db: Database, options: SeedOptions): Promise<AllocationSeed> {
  const now = Date.now();
  const campaign = await createCampaign(db, {
    status: options.status ?? 'ALLOCATION_REVIEW',
    config: { target: TEST_CAMPAIGN_TARGET, k: options.k ?? 1 },
  });
  const company = await createCompany(db);
  const jds = [];
  for (const quota of options.quotas) {
    jds.push(await createJobDescription(db, { campaignId: campaign.id, companyId: company.id, quota, status: 'APPROVED' }));
  }
  // JD 0 gets a real bank (its questions are what an essay answer refers to); the others a bare one.
  const bankIds: number[] = [];
  for (const [index, jd] of jds.entries()) {
    if (index === 0) {
      bankIds.push((await createBank(db, jd, { bank: 'OPEN' }))!.id);
      continue;
    }
    const [bank] = await db
      .insert(questionBanks)
      .values({ campaignId: campaign.id, jdId: jd.id, jdVersion: jd.version, blueprint: SMALL_BLUEPRINT })
      .returning({ id: questionBanks.id });
    bankIds.push(bank!.id);
  }

  const seed: AllocationSeed = {
    campaignId: campaign.id,
    companyId: company.id,
    jdIds: jds.map((jd) => jd.id),
    studentIds: [],
    studentCodes: [],
    preferenceIds: [],
    sessionIds: [],
  };
  const sessions: (typeof examSessions.$inferInsert)[] = [];
  const sessionSlots: [number, number][] = [];
  for (const [s, student] of options.students.entries()) {
    const row = await createStudent(db, { gpa: student.gpa === undefined ? 3.2 : student.gpa });
    const cv = await createCv(db, { studentId: row.id, campaignId: campaign.id, status: 'CONFIRMED' });
    seed.studentIds.push(row.id);
    seed.studentCodes.push(row.studentCode);
    seed.preferenceIds.push([]);
    seed.sessionIds.push([]);
    for (const [p, pref] of student.prefs.entries()) {
      const jdId = jds[pref.jd]!.id;
      const eligible = pref.eligible ?? true;
      const sCv = pref.sCv ?? 70;
      await createMatchResult(db, {
        campaignId: campaign.id,
        studentId: row.id,
        cvId: cv.id,
        jdId,
        eligible,
        sCv: eligible ? sCv : null,
        ...(eligible ? {} : { ineligibleReasons: [{ code: 'GPA_BELOW_MIN', required: 3, actual: 2 }] }),
      });
      const taken = pref.sTest !== null;
      const preference = await createPreference(db, {
        campaignId: campaign.id,
        studentId: row.id,
        jdId,
        rank: p + 1,
        status: pref.status ?? (taken ? 'TEST_GRADED' : 'CLOSED'),
        sFinal: taken ? pref.sFinal : null,
        sCv: taken ? sCv : null,
      });
      seed.preferenceIds[s]!.push(preference.id);
      seed.sessionIds[s]!.push(null);
      if (!taken) continue;
      const startedAt = new Date(now - 72 * HOUR - (s * 10 + p) * 60_000);
      sessions.push({
        studentId: row.id,
        bankId: bankIds[pref.jd]!,
        bankVersion: 1,
        seed: 1,
        questionIds: [1],
        optionLayout: {},
        startedAt,
        deadlineAt: new Date(startedAt.getTime() + HOUR),
        submittedAt: new Date(startedAt.getTime() + 30 * 60_000),
        status: 'SUBMITTED',
        scoreA: pref.sTest,
        scoreB: pref.sTest,
        sTest: pref.sTest,
        skillScores: [],
        resultsPublishedAt: pref.publishedAt ?? new Date(now - 49 * HOUR),
      });
      sessionSlots.push([s, p]);
    }
  }
  for (let start = 0; start < sessions.length; start += 500) {
    const rows = await db
      .insert(examSessions)
      .values(sessions.slice(start, start + 500))
      .returning({ id: examSessions.id });
    rows.forEach((row, i) => {
      const [s, p] = sessionSlots[start + i]!;
      seed.sessionIds[s]![p] = row.id;
    });
  }

  if (options.graderRun) {
    const slot = sessionSlots.findIndex(([s, p]) => options.students[s]!.prefs[p]!.jd === 0);
    const [s, p] = sessionSlots[slot]!;
    const [question] = await db.select({ id: questions.id }).from(questions).where(eq(questions.bankId, bankIds[0]!));
    await db.insert(examAnswers).values({
      sessionId: seed.sessionIds[s]![p]!,
      questionId: question!.id,
      answer: { text: 'Bài làm.' },
      aiGrading: {
        runs: { '1': { model: GRADER_MODEL, prompt_version: GRADER_PROMPT, grading: { criteria: [] }, points: 1 } },
        failures: {},
      } as never,
      finalScore: 1,
    });
  }
  return seed;
}

/** The PRD example (PRD › Thuật toán phân bổ › Ví dụ minh họa): An, Bình, Chi, Dũng; A = 1, B = 2, C = 1; k = 1. */
export const PRD_QUOTAS = [1, 2, 1];

export const PRD_STUDENTS: SeedStudent[] = [
  { prefs: [{ jd: 0, sFinal: 88, sTest: 85 }, { jd: 1, sFinal: 80, sTest: 75 }] },
  { prefs: [{ jd: 0, sFinal: 92, sTest: 90 }, { jd: 2, sFinal: 75, sTest: 70 }] },
  { prefs: [{ jd: 0, sFinal: 70, sTest: 65 }, { jd: 1, sFinal: 85, sTest: 80 }, { jd: 2, sFinal: 78, sTest: 72 }] },
  { prefs: [{ jd: 1, sFinal: 65, sTest: 60 }, { jd: 2, sFinal: 82, sTest: 80 }] },
];

/** Indexes of PRD_STUDENTS. */
export const AN = 0;
export const BINH = 1;
export const CHI = 2;
export const DUNG = 3;
