// Setup for the part D tests (US-4.8): a part D row of a preference written directly, as the
// drafting result would leave it, and results of the two jobs as the consumer hands them over (the
// AI Service does not run in the API tests). Listeners are called directly (LESSONS §36).
import {
  type CvVerificationEvaluationItem,
  type CvVerificationQuestion,
  CvVerifyEvaluateResultSchema,
  CvVerifyGenerateResultSchema,
} from '@srm/shared';
import { and, asc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { cvs, cvVerificationQuestions, cvVerifications } from '../../src/db/schema/index.js';
import type { Database } from '../../src/db/types.js';
import type { AiResultEvent } from '../../src/modules/aigateway/index.js';
import type { ExamFixture } from './exam.js';
import { createConfirmedCv } from './shortlist.js';

export const CV_VERIFY_MODEL = 'gemini-3.8-flash';
export const DRAFT_PROMPT = 'cv_verification/v1';
export const CHECK_PROMPT = 'cv_verification_check/v1';

export type CvVerificationRow = typeof cvVerifications.$inferSelect;

export async function verificationOf(db: Database, preferenceId: number): Promise<CvVerificationRow | undefined> {
  const [row] = await db.select().from(cvVerifications).where(eq(cvVerifications.preferenceId, preferenceId));
  return row;
}

export function verificationQuestionsOf(db: Database, verificationId: number) {
  return db
    .select()
    .from(cvVerificationQuestions)
    .where(eq(cvVerificationQuestions.verificationId, verificationId))
    .orderBy(asc(cvVerificationQuestions.no));
}

/** A drafted question about project `index` of the CV. */
export function draftedQuestion(index: number, stem = `Bạn đã làm gì trong dự án ${index + 1}?`): CvVerificationQuestion {
  return { claim_ref: { section: 'PROJECT', index }, claim_label: `Dự án ${index + 1}`, stem };
}

/**
 * Part D of the exam's preference: READY with one question per stem by default, or RUNNING
 * without questions; its drafting job sent unless `dispatched` is false. Uses the student's CV in
 * the campaign, or makes a confirmed one.
 */
export async function createPartD(
  db: Database,
  exam: ExamFixture,
  options: { stems?: string[]; status?: 'READY' | 'RUNNING'; dispatched?: boolean } = {},
): Promise<{ id: number; questionIds: number[] }> {
  const stems = options.stems ?? ['Bạn đã làm gì trong dự án 1?', 'Bạn đã làm gì trong dự án 2?'];
  const [existing] = await db
    .select({ id: cvs.id, version: cvs.version })
    .from(cvs)
    .where(and(eq(cvs.studentId, exam.studentId), eq(cvs.campaignId, exam.campaignId)));
  const cv = existing ?? (await createConfirmedCv(db, exam.studentId, exam.campaignId));
  const ready = (options.status ?? 'READY') === 'READY';
  const [row] = await db
    .insert(cvVerifications)
    .values({
      preferenceId: exam.preferenceId,
      cvId: cv.id,
      cvVersion: cv.version,
      jdId: exam.jdId,
      questionCount: Math.max(2, stems.length),
      jobId: randomUUID(),
      dispatchedAt: options.dispatched === false ? null : new Date(),
      status: ready ? 'READY' : 'RUNNING',
      model: ready ? CV_VERIFY_MODEL : null,
      promptVersion: ready ? DRAFT_PROMPT : null,
    })
    .returning();
  if (!ready) return { id: row!.id, questionIds: [] };
  const questions = await db
    .insert(cvVerificationQuestions)
    .values(
      stems.map((stem, index) => ({
        verificationId: row!.id,
        no: index + 1,
        stem,
        claimRef: { section: 'PROJECT' as const, index },
        claimLabel: `Dự án ${index + 1}`,
      })),
    )
    .returning({ id: cvVerificationQuestions.id });
  return { id: row!.id, questionIds: questions.map((question) => question.id) };
}

/** A result of the row's drafting job, checked by the shared contract; null is a refusal. */
export function draftResult(
  row: CvVerificationRow,
  questions: CvVerificationQuestion[] | null,
): AiResultEvent<'CV_VERIFY_GENERATE'> {
  return CvVerifyGenerateResultSchema.parse({
    job_id: row.jobId,
    type: 'CV_VERIFY_GENERATE',
    status: questions === null ? 'FAILED' : 'SUCCEEDED',
    job: {
      job_id: row.jobId,
      preference_id: row.preferenceId,
      cv_id: row.cvId,
      cv_version: row.cvVersion,
      jd_id: row.jdId,
      question_count: row.questionCount,
    },
    result:
      questions === null
        ? null
        : { prompt_version: DRAFT_PROMPT, model: CV_VERIFY_MODEL, preference_id: row.preferenceId, questions },
    error: questions === null ? { code: 'LLM_REFUSAL', message: 'refused', needs_human: false } : null,
  });
}

/** A result of the row's checking job; null is a job that failed whole. */
export function checkResult(
  row: CvVerificationRow,
  items: CvVerificationEvaluationItem[] | null,
): AiResultEvent<'CV_VERIFY_EVALUATE'> {
  if (row.evaluationJobId === null) throw new Error(`part D ${row.id} has no checking job`);
  const jobId = row.evaluationJobId;
  return CvVerifyEvaluateResultSchema.parse({
    job_id: jobId,
    type: 'CV_VERIFY_EVALUATE',
    status: items === null ? 'FAILED' : 'SUCCEEDED',
    job: { job_id: jobId, preference_id: row.preferenceId, cv_id: row.cvId, cv_version: row.cvVersion },
    result:
      items === null
        ? null
        : { prompt_version: CHECK_PROMPT, model: CV_VERIFY_MODEL, preference_id: row.preferenceId, items },
    error: items === null ? { code: 'LLM_UNAVAILABLE', message: 'provider down', needs_human: false } : null,
  });
}
