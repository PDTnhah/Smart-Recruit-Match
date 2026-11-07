// Drafts and Test Generator results for the question bank tests (US-4.1, US-4.2). The AI Service is
// not running in the API tests: results are handed to the listener as the consumer would.
import type { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  type ExamBlueprint,
  type GeneratedQuestion,
  type JdRequirements,
  type QuestionRejectReason,
  QuestionsGenerateResultSchema,
  type QuestionsGenerateJob,
  type QuestionsGenerateOutput,
  type QuestionValidation,
} from '@srm/shared';
import { AI_RESULT_EVENTS, type AiResultEvent } from '../../src/modules/aigateway/index.js';

export const BANK_REQUIREMENTS: JdRequirements = {
  must_have: [
    { skill: 'Java', level: 'INTERMEDIATE', weight: 6 },
    { skill: 'SQL', level: 'BASIC', weight: 4 },
  ],
  nice_to_have: [{ skill: 'Docker', level: 'BASIC', weight: 1 }],
  hard_conditions: { majors: [], min_study_year: null, min_gpa: null, required_languages: [] },
  preferred_languages: [],
};

/** A blueprint of BANK_REQUIREMENTS small enough to fill: 3 × 1 MCQ + 3 × 2 essays VALIDATED. */
export const SMALL_BLUEPRINT: ExamBlueprint = {
  duration_minutes: 45,
  parts: {
    A: { weight_percent: 60, question_count: 1, cells: [{ skill: 'Java', difficulty: 'EASY', count: 1 }] },
    B: { weight_percent: 40, question_count: 2, cells: [{ skill: 'SQL', difficulty: 'MEDIUM', count: 2 }] },
  },
};

export const GENERATOR_PROMPT = 'test_generator/v1';
export const VALIDATOR_PROMPT = 'validator/v1';
export const MODEL = 'gemini-3.8-flash';

// `core.questions.draft_id` is unique across banks and the integration files share one database:
// each file starts its drafts at its own random offset.
let nextDraftId = 1 + Math.floor(Math.random() * 2 ** 40);

/** A verdict as the AI Service sends it; REJECTED when `reasons` is not empty. */
export function verdict(
  reasons: readonly QuestionRejectReason[] = [],
  extra: Partial<QuestionValidation> = {},
): QuestionValidation {
  return {
    status: reasons.length === 0 ? 'VALIDATED' : 'REJECTED',
    reasons: [...reasons],
    correct_options: [1],
    estimated_difficulty: null,
    note: null,
    model: MODEL,
    prompt_version: VALIDATOR_PROMPT,
    ...extra,
  };
}

/** A multiple-choice draft whose answer is option B. */
export function mcq(
  skill: string,
  difficulty: GeneratedQuestion['difficulty'] = 'EASY',
  validation: QuestionValidation | null = null,
): GeneratedQuestion {
  const id = nextDraftId++;
  return {
    draft_id: id,
    type: 'MCQ',
    skill,
    difficulty,
    stem: `Câu hỏi trắc nghiệm ${id} về ${skill}?`,
    explanation: 'Phương án B đúng vì …',
    options: ['A', 'B', 'C', 'D'].map((text) => ({ text: `Phương án ${text}`, correct: text === 'B' })),
    model: MODEL,
    prompt_version: GENERATOR_PROMPT,
    validation,
  };
}

export function essay(skill: string, validation: QuestionValidation | null = null): GeneratedQuestion {
  const id = nextDraftId++;
  return {
    draft_id: id,
    type: 'ESSAY',
    skill,
    difficulty: 'MEDIUM',
    stem: `Câu hỏi tự luận ${id} về ${skill}.`,
    explanation: 'Đánh giá khả năng thiết kế.',
    rubric: [
      { criterion: 'Nêu đúng khái niệm', max_points: 4 },
      { criterion: 'Có ví dụ', max_points: 6 },
    ],
    sample_answer: 'Đáp án mẫu …',
    model: MODEL,
    prompt_version: GENERATOR_PROMPT,
    validation: validation && { ...validation, correct_options: null },
  };
}

/** The same draft with another verdict, as a later result of the job may carry it. */
export function withVerdict(draft: GeneratedQuestion, validation: QuestionValidation | null): GeneratedQuestion {
  return { ...draft, validation: validation && draft.type === 'ESSAY' ? { ...validation, correct_options: null } : validation };
}

/** VALIDATED drafts filling every cell of SMALL_BLUEPRINT to 3×. */
export function smallBankDrafts(): GeneratedQuestion[] {
  return [
    ...Array.from({ length: 3 }, () => mcq('Java', 'EASY', verdict())),
    ...Array.from({ length: 6 }, () => essay('SQL', verdict())),
  ];
}

/** A result message as the consumer hands it over, checked by the shared contract. */
export function resultMessage(
  job: QuestionsGenerateJob,
  output: Partial<QuestionsGenerateOutput> | null,
  status: 'SUCCEEDED' | 'PARTIAL' | 'FAILED' = 'SUCCEEDED',
): AiResultEvent<'QUESTIONS_GENERATE'> {
  return QuestionsGenerateResultSchema.parse({
    job_id: job.job_id,
    type: 'QUESTIONS_GENERATE',
    status,
    job,
    result: output === null ? null : { bank_id: job.bank_id, questions: [], missing_cells: [], rounds: 1, ...output },
    error: output === null ? { code: 'LLM_REFUSAL', message: 'refused', needs_human: true } : null,
  });
}

/** Hands a result to the listener and waits for it (the listener is not `async: true`). */
export async function deliverResult(app: INestApplication, result: AiResultEvent<'QUESTIONS_GENERATE'>): Promise<void> {
  await app.get(EventEmitter2).emitAsync(AI_RESULT_EVENTS.QUESTIONS_GENERATE, result);
}
