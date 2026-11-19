import { z } from 'zod';
import type { EvidenceSection } from './matching.js';

// CV verification questions, part C of the test (US-4.8, FR-25, AD-2, CONTEXT D57). One job drafts
// 2–3 questions about entries the student's CV claims; once the session closes, a second job
// checks each answer against the entry it asks about. The LLM gives a verdict per question with a
// quote from the answer; code computes the trust index. Part C never counts towards S_test.
// Shape and limits only (LESSONS §32): the AI Service checks a draft against the CV, and the
// backend checks the questions and verdicts again.

/** Part C holds 2–3 questions (PRD GĐ5). */
export const CV_VERIFICATION_QUESTIONS = { min: 2, max: 3 } as const;

/** CV lists a question may ask about, with the codes of the Matching Agent's evidence sections. */
export const CV_CLAIM_SECTIONS = ['PROJECT', 'EXPERIENCE', 'SKILLS_LIST'] as const satisfies readonly EvidenceSection[];

export type CvClaimSection = (typeof CV_CLAIM_SECTIONS)[number];

/** What the LLM may conclude of an answer against the CV entry its question asks about. */
export const CV_LLM_VERDICTS = ['CONSISTENT', 'PARTIAL', 'INCONSISTENT'] as const;

export type CvLlmVerdict = (typeof CV_LLM_VERDICTS)[number];

/**
 * The verdict that counts: the LLM's, INCONSISTENT when its quote is not in the answer, or
 * NO_ANSWER for a blank answer, which code sets without the LLM.
 */
export const CV_VERDICTS = [...CV_LLM_VERDICTS, 'NO_ANSWER'] as const;

export type CvVerdict = (typeof CV_VERDICTS)[number];

const jobId = () => z.uuid().describe('Unique id of this job; the AI Service processes each job_id once (AD-5)');

const rowId = () => z.int().positive();

const stem = () => z.string().trim().min(1).max(1_000).describe('The question, in Vietnamese');

export const CvClaimSectionSchema = z
  .enum(CV_CLAIM_SECTIONS)
  .meta({ title: 'CvClaimSection', description: 'CV list of the entry a question asks about: projects, experience or skills' });

export const CvLlmVerdictSchema = z.enum(CV_LLM_VERDICTS).meta({
  title: 'CvLlmVerdict',
  description:
    'CONSISTENT = the answer shows the student did what the entry claims; PARTIAL = it shows part of it, or stays vague; INCONSISTENT = it contradicts the entry or shows no first-hand knowledge of it',
});

export const CvVerdictSchema = z.enum(CV_VERDICTS).meta({
  title: 'CvVerdict',
  description: 'The verdict that counts: the LLM verdict after the quote check, or NO_ANSWER for a blank answer',
});

export const CvClaimRefSchema = z
  .strictObject({
    section: CvClaimSectionSchema,
    // A CV list holds at most 100 entries (skills).
    index: z.int().min(0).max(99).describe('Position of the entry in its list of profile_masked, from 0'),
  })
  .meta({ title: 'CvClaimRef', description: 'The CV entry a question asks about' });

export type CvClaimRef = z.output<typeof CvClaimRefSchema>;

/** Payload on `ai.cv_verification.generate` (US-4.8 AC-2): IDs only (AD-5). */
export const CvVerifyGenerateJobSchema = z
  .strictObject({
    job_id: jobId(),
    preference_id: rowId().describe('core.preferences.id the questions are for'),
    cv_id: rowId().describe('core.cvs.id of the CV version the questions ask about'),
    cv_version: rowId().describe('core.cvs.version of that row'),
    jd_id: rowId().describe('core.job_descriptions.id; its requirements say which entries matter most'),
    question_count: z
      .int()
      .min(CV_VERIFICATION_QUESTIONS.min)
      .max(CV_VERIFICATION_QUESTIONS.max)
      .describe('Questions to draft; fewer when the CV has fewer entries to ask about'),
  })
  .meta({ title: 'CvVerifyGenerateJob', description: 'Job on ai.cv_verification.generate: draft part C for one preference' });

export type CvVerifyGenerateJob = z.infer<typeof CvVerifyGenerateJobSchema>;

/** One question as the LLM drafts it: the entry it asks about and the question. */
export const CvVerificationDraftQuestionSchema = z
  .strictObject({
    claim_ref: CvClaimRefSchema,
    stem: stem(),
  })
  .meta({ title: 'CvVerificationDraftQuestion', description: 'One drafted question about a CV entry' });

/** What the LLM returns when drafting (US-4.8 AC-2): no answer key, no expected points. */
export const CvVerificationDraftSchema = z
  .strictObject({
    questions: z
      .array(CvVerificationDraftQuestionSchema)
      .min(1)
      .max(CV_VERIFICATION_QUESTIONS.max)
      .describe('One question per entry, each about a different entry'),
  })
  .meta({ title: 'CvVerificationDraft', description: 'Structured output of the CV verification drafting step' });

export const CvVerificationQuestionSchema = z
  .strictObject({
    claim_ref: CvClaimRefSchema,
    claim_label: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .describe('Name of the entry as profile_masked writes it (project, position and organisation, or skill), set by code'),
    stem: stem(),
  })
  .meta({ title: 'CvVerificationQuestion', description: 'One question of part C, checked against the CV' });

export type CvVerificationQuestion = z.output<typeof CvVerificationQuestionSchema>;

/** Output of CV_VERIFY_GENERATE (US-4.8 AC-2): the questions in display order. */
export const CvVerifyGenerateOutputSchema = z
  .strictObject({
    prompt_version: z.string().min(1).describe('Versioned prompt file, e.g. cv_verification/v1'),
    model: z.string().min(1).describe('Model id that produced the questions'),
    preference_id: rowId().describe('core.preferences.id of the job'),
    questions: z.array(CvVerificationQuestionSchema).min(1).max(CV_VERIFICATION_QUESTIONS.max),
  })
  .meta({ title: 'CvVerifyGenerateOutput', description: 'Result of CV_VERIFY_GENERATE' });

export type CvVerifyGenerateOutput = z.output<typeof CvVerifyGenerateOutputSchema>;

/**
 * Payload on `ai.cv_verification.evaluate` (US-4.8 AC-5): the closed session's questions and answers
 * are read through `core.v_ai_cv_verification_answers`, the CV through `core.v_ai_cv_profile_masked`.
 */
export const CvVerifyEvaluateJobSchema = z
  .strictObject({
    job_id: jobId(),
    preference_id: rowId().describe('core.preferences.id whose part C to check'),
    cv_id: rowId().describe('core.cvs.id of the CV version the questions were drafted from'),
    cv_version: rowId().describe('core.cvs.version of that row'),
  })
  .meta({ title: 'CvVerifyEvaluateJob', description: 'Job on ai.cv_verification.evaluate: check the answers of part C' });

export type CvVerifyEvaluateJob = z.infer<typeof CvVerifyEvaluateJobSchema>;

const quote = () => z.string().trim().min(1).max(1_000);

const reason = () => z.string().trim().min(1).max(1_000).describe('Why this verdict, in Vietnamese');

/**
 * The LLM's verdict on one answer. The description still says "part D": the LLM reads it in the
 * output schema next to `cv_verification_check/v1`, which says part D too, and a released prompt
 * never changes (US-4.12). Rename both in the next prompt version.
 */
export const CvVerificationCheckItemSchema = z
  .strictObject({
    question_id: rowId().describe('Id of the question, as the prompt gives it'),
    verdict: CvLlmVerdictSchema,
    quote: quote()
      .nullable()
      .describe('Words copied from the answer that support the verdict; required for CONSISTENT and PARTIAL'),
    reason: reason(),
  })
  .meta({ title: 'CvVerificationCheckItem', description: 'The verdict on one answer of part D' });

/** What the LLM returns when checking (US-4.8 AC-5): one verdict per answer sent, no score (AD-2). */
export const CvVerificationCheckSchema = z
  .strictObject({
    items: z.array(CvVerificationCheckItemSchema).min(1).max(CV_VERIFICATION_QUESTIONS.max),
  })
  .meta({ title: 'CvVerificationCheck', description: 'Structured output of the CV verification checking step' });

export const CvVerificationEvaluationItemSchema = z
  .strictObject({
    question_id: rowId().describe('core.cv_verification_questions.id'),
    llm_verdict: CvLlmVerdictSchema.nullable().describe("The LLM's verdict; null for a blank answer"),
    verdict: CvVerdictSchema,
    quote: quote().nullable().describe('The quote as the LLM wrote it; null when it gave none'),
    quote_score: z
      .number()
      .min(0)
      .max(100)
      .nullable()
      .describe('rapidfuzz score of the quote against the answer, both normalised: partial_ratio, or ratio for a quote longer than the answer; null without a quote'),
    reason: reason(),
  })
  .meta({ title: 'CvVerificationEvaluationItem', description: 'The checked verdict on one answer of part C' });

export type CvVerificationEvaluationItem = z.output<typeof CvVerificationEvaluationItemSchema>;

/**
 * Output of CV_VERIFY_EVALUATE (US-4.8 AC-5): one item per question. `prompt_version` and `model`
 * are null when every answer was blank, so no LLM was called.
 */
export const CvVerifyEvaluateOutputSchema = z
  .strictObject({
    prompt_version: z.string().min(1).nullable().describe('Versioned prompt file, e.g. cv_verification_check/v1'),
    model: z.string().min(1).nullable().describe('Model id that produced the verdicts'),
    preference_id: rowId().describe('core.preferences.id of the job'),
    items: z.array(CvVerificationEvaluationItemSchema).min(1).max(CV_VERIFICATION_QUESTIONS.max),
  })
  .meta({ title: 'CvVerifyEvaluateOutput', description: 'Result of CV_VERIFY_EVALUATE' });

export type CvVerifyEvaluateOutput = z.output<typeof CvVerifyEvaluateOutputSchema>;
