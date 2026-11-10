// Setup for the grading tests (US-4.4): an exam fixture whose student has a confirmed CV scored
// against the JD, so the preference has a current S_cv (CONTEXT D47); the test taken over HTTP; and
// results of the Grader as the consumer hands them over (the AI Service does not run in the API
// tests). Listeners are called directly (LESSONS §36).
import {
  type EssayGradeFailedItem,
  type EssayGradeItem,
  type EssayGradeOutput,
  EssayGradeResultSchema,
  ExamPaperSchema,
  type GradingResult,
} from '@srm/shared';
import { asc, eq } from 'drizzle-orm';
import { essayGradingRuns, examAnswers, examSessions } from '../../src/db/schema/index.js';
import type { AiResultEvent } from '../../src/modules/aigateway/index.js';
import { api, type AuthTestApp } from './auth.js';
import { createExamFixture, type ExamFixture, type ExamFixtureOptions, sessionRow } from './exam.js';
import { createConfirmedCv, scorePair } from './shortlist.js';

export const GRADER_MODEL = 'claude-opus-5-5';
export const GRADER_PROMPT = 'grader/v1';

export interface GradingFixtureOptions extends ExamFixtureOptions {
  /** S_cv of the pair; null leaves the pair without a result. 70 by default. */
  sCv?: number | null;
}

/** A student with a PENDING_TEST preference for a JD with a locked bank, and a scored CV. */
export async function createGradingFixture(t: AuthTestApp, options: GradingFixtureOptions): Promise<ExamFixture> {
  const exam = await createExamFixture(t, options);
  const cv = await createConfirmedCv(t.db, exam.studentId, exam.campaignId);
  if (options.sCv !== null) {
    await scorePair(
      t.db,
      { id: cv.id, version: cv.version, studentId: exam.studentId, campaignId: exam.campaignId },
      { id: exam.jdId, version: 1 },
      options.sCv ?? 70,
    );
  }
  return exam;
}

export interface TakenExam {
  sessionId: number;
  mcqId: number;
  /** The two essays of SMALL_BLUEPRINT, in paper order. */
  essayIds: [number, number];
}

/**
 * Starts the test, answers it and submits it over HTTP: the MCQ right (option B), wrong or blank,
 * each essay with its text or blank (null). `submit: false` leaves the session open.
 */
export async function takeExam(
  t: AuthTestApp,
  exam: ExamFixture,
  answers: { mcq: 'RIGHT' | 'WRONG' | null; essays: [string | null, string | null] },
  options: { submit?: boolean } = {},
): Promise<TakenExam> {
  const { agent } = exam.student;
  const paper = ExamPaperSchema.parse((await agent.post(api(`preferences/${exam.preferenceId}/exam/start`)).send().expect(200)).body);
  const mcq = paper.questions.find((question) => question.type === 'MCQ')!;
  const essays = paper.questions.filter((question) => question.type === 'ESSAY');
  const layout = (await sessionRow(t.db, paper.sessionId)).optionLayout[String(mcq.questionId)]!;
  const saved: unknown[] = [];
  if (answers.mcq !== null) {
    const index = answers.mcq === 'RIGHT' ? 1 : 0;
    saved.push({ questionId: mcq.questionId, answer: { optionCode: layout.find((slot) => slot.index === index)!.code } });
  }
  answers.essays.forEach((text, i) => {
    if (text !== null) saved.push({ questionId: essays[i]!.questionId, answer: { text } });
  });
  if (saved.length > 0) await agent.put(api(`exam-sessions/${paper.sessionId}/answers`)).send({ answers: saved }).expect(200);
  if (options.submit !== false) await agent.post(api(`exam-sessions/${paper.sessionId}/submit`)).send().expect(200);
  return { sessionId: paper.sessionId, mcqId: mcq.questionId, essayIds: [essays[0]!.questionId, essays[1]!.questionId] };
}

/** A grade of the two criteria of the test essays (4 and 6 points), with a reason each. */
export function grading(points: [number, number], extra: Partial<GradingResult> = {}): GradingResult {
  return {
    criteria: points.map((p, index) => ({ index, points: p, reason: `Tiêu chí ${index + 1}: ${p} điểm.` })),
    confidence: 'HIGH',
    flags: [],
    ...extra,
  };
}

export function gradeItem(
  sessionId: number,
  questionId: number,
  passNo: 1 | 2,
  points: [number, number],
  extra: Partial<GradingResult> = {},
): EssayGradeItem {
  return { session_id: sessionId, question_id: questionId, pass_no: passNo, model: GRADER_MODEL, grading: grading(points, extra) };
}

export function failedPass(sessionId: number, questionId: number, passNo: 1 | 2, code = 'LLM_REFUSAL'): EssayGradeFailedItem {
  return { session_id: sessionId, question_id: questionId, pass_no: passNo, code, needs_review: code === 'LLM_REFUSAL' };
}

export interface RunJob {
  runId: number;
  job_id: string;
  exam_session_ids: number[];
  prompt_version: string | null;
}

/** The run a session was sent with, and its job as `ai.essay.grade` carried it. */
export async function jobOfSession(t: AuthTestApp, sessionId: number): Promise<RunJob> {
  const session = await sessionRow(t.db, sessionId);
  if (session.essayRunId === null) throw new Error(`exam session ${sessionId} was not sent for grading`);
  const [run] = await t.db.select().from(essayGradingRuns).where(eq(essayGradingRuns.id, session.essayRunId));
  const sessions = await t.db
    .select({ id: examSessions.id })
    .from(examSessions)
    .where(eq(examSessions.essayRunId, session.essayRunId))
    .orderBy(asc(examSessions.id));
  return { runId: run!.id, job_id: run!.jobId, exam_session_ids: sessions.map((row) => row.id), prompt_version: null };
}

/** A result message of the job, checked by the shared contract. */
export function essayResult(
  job: RunJob,
  output: Partial<EssayGradeOutput> | null,
  status: 'SUCCEEDED' | 'PARTIAL' | 'FAILED' = 'SUCCEEDED',
): AiResultEvent<'ESSAY_GRADE'> {
  return EssayGradeResultSchema.parse({
    job_id: job.job_id,
    type: 'ESSAY_GRADE',
    status,
    job: { job_id: job.job_id, exam_session_ids: job.exam_session_ids, prompt_version: job.prompt_version },
    result: output === null ? null : { prompt_version: GRADER_PROMPT, final: true, items: [], failed: [], ...output },
    error: output === null ? { code: 'LLM_UNAVAILABLE', message: 'provider down', needs_human: false } : null,
  });
}

/** The answers of a session by question id. */
export async function answersOf(t: AuthTestApp, sessionId: number) {
  const rows = await t.db.select().from(examAnswers).where(eq(examAnswers.sessionId, sessionId));
  return new Map(rows.map((row) => [row.questionId, row]));
}
