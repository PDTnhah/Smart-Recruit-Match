// Locked question bank seed (US-4.2 AC-9, EPIC-4 › Cross-story testing requirements): on top of the
// dev seed, one campaign, one approved JD of "Công ty Demo Alpha" and its question bank, LOCKED with
// VALIDATED questions 3× every cell of the default blueprint. The exam room (US-4.3) and the demo
// (US-6.6) get a bank to draw from without calling an LLM. Deterministic and idempotent: a second
// run finds the locked bank and changes nothing.
// Usage: DATABASE_URL=… [SEED_PASSWORD=…] pnpm --filter @srm/api db:seed:question-bank
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, count, eq } from 'drizzle-orm';
import { Pool } from 'pg';
import {
  CampaignConfigSchema,
  DEFAULT_CAMPAIGN_CONFIG,
  type ExamBlueprint,
  type GeneratedQuestion,
  type JdRequirements,
  MCQ_OPTION_COUNT,
  QUESTION_BANK_FACTORS,
  type QuestionBankStatus,
  type QuestionDifficulty,
  type QuestionValidation,
} from '@srm/shared';
import { ADVISORY_LOCK_KEYS, lockEntityInTx } from '../../common/scheduling/advisory-lock.js';
import { transitionTo } from '../../common/state/transition-to.js';
import { type BlueprintCellRef, buildDefaultBlueprint, cellsOf, toStoredQuestion } from '../../modules/assessment/index.js';
import { AuditService, SYSTEM_ACTOR } from '../../modules/audit/index.js';
import { questionBankLifecycle } from '../lifecycles.js';
import * as schema from '../schema/index.js';
import { campaigns, companies, jobDescriptions, questionBanks, questions } from '../schema/index.js';
import type { Database, DbTx } from '../types.js';
import { DEFAULT_SEED_PASSWORD, SEED_COMPANIES, seedDev } from './dev-seed.js';

/** A campaign of its own, so the JD and bank stay out of the dev campaign's screens (US-1.4). */
export const LOCKED_BANK_CAMPAIGN = {
  name: 'Đợt thực tập mẫu — ngân hàng câu hỏi đã khóa',
  target: { cohorts: ['K66'], majors: ['Công nghệ thông tin', 'Khoa học máy tính'] },
} as const;

/** Java 3, SQL 2, Spring Boot 1: the default blueprint has cells of all three difficulties. */
export const LOCKED_BANK_REQUIREMENTS: JdRequirements = {
  must_have: [
    { skill: 'Java', level: 'INTERMEDIATE', weight: 3 },
    { skill: 'SQL', level: 'BASIC', weight: 2 },
    { skill: 'Spring Boot', level: 'BASIC', weight: 1 },
  ],
  nice_to_have: [{ skill: 'Docker', level: 'BASIC', weight: 1 }],
  hard_conditions: { majors: ['Công nghệ thông tin'], min_study_year: 3, min_gpa: null, required_languages: [] },
  preferred_languages: [],
};

/**
 * Inserted directly as APPROVED, its questions directly as VALIDATED: dev and test data only, never
 * a path production code takes (AD-8), like the dev seed's JD. Only the lock goes through
 * `transitionTo`, so the bank's audit shows when it was locked.
 */
export const LOCKED_BANK_JD = {
  company: 'Công ty Demo Alpha' satisfies (typeof SEED_COMPANIES)[number],
  title: 'Thực tập sinh Backend Java (ngân hàng câu hỏi mẫu)',
  quota: 2,
  location: 'Cầu Giấy, Hà Nội',
  workMode: 'ONSITE',
  internshipPeriod: '01/2027 – 04/2027',
  allowance: '3 triệu đồng/tháng',
  rawText: 'Phát triển API bằng Java, Spring Boot và PostgreSQL.',
  positionGroup: 'BACKEND',
  requirements: LOCKED_BANK_REQUIREMENTS,
} as const;

/**
 * `model` and `prompt_version` of the seeded questions and their verdicts: no LLM wrote them
 * (AGENTS › Invariant 12). `prompt_version` keeps the `<agent>/v<N>` form the column checks.
 */
export const SEED_QUESTION_MODEL = 'seed';
export const SEED_QUESTION_PROMPT = 'seed/v1';

export interface LockedQuestionBankSeed {
  campaignId: number;
  jdId: number;
  bankId: number;
  /** The bank's version: 1 when locked by the seed. */
  version: number;
  /** VALIDATED questions of the bank. */
  questions: number;
}

const DIFFICULTY_NAMES: Record<QuestionDifficulty, string> = { EASY: 'dễ', MEDIUM: 'trung bình', HARD: 'khó' };
const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const;

function verdictOf(difficulty: QuestionDifficulty, correctOption: number | null): QuestionValidation {
  return {
    status: 'VALIDATED',
    reasons: [],
    correct_options: correctOption === null ? null : [correctOption],
    estimated_difficulty: difficulty,
    note: null,
    model: SEED_QUESTION_MODEL,
    prompt_version: SEED_QUESTION_PROMPT,
  };
}

/** Question `n` (from 1) of a cell; the correct option moves with `n`, so keys are not all A. */
function seedQuestion(cell: BlueprintCellRef, n: number, draftId: number): GeneratedQuestion {
  const base = {
    draft_id: draftId,
    skill: cell.skill,
    difficulty: cell.difficulty,
    model: SEED_QUESTION_MODEL,
    prompt_version: SEED_QUESTION_PROMPT,
  };
  const level = DIFFICULTY_NAMES[cell.difficulty];
  if (cell.type === 'ESSAY') {
    return {
      ...base,
      type: 'ESSAY',
      stem: `[Câu mẫu] ${cell.skill}, tự luận ${level} số ${n}: trình bày một tình huống dùng ${cell.skill} và cách bạn xử lý.`,
      explanation: 'Câu mẫu do seed tạo: đánh giá khả năng giải thích và áp dụng.',
      rubric: [
        { criterion: `Nêu đúng khái niệm chính của ${cell.skill}`, max_points: 4 },
        { criterion: 'Có ví dụ minh họa phù hợp với tình huống', max_points: 6 },
      ],
      sample_answer: `Đáp án mẫu do seed tạo cho câu tự luận số ${n} về ${cell.skill}.`,
      validation: verdictOf(cell.difficulty, null),
    };
  }
  const correct = (n - 1) % MCQ_OPTION_COUNT;
  return {
    ...base,
    type: 'MCQ',
    stem: `[Câu mẫu] ${cell.skill}, trắc nghiệm ${level} số ${n}: chọn phương án đúng.`,
    explanation: `Câu mẫu do seed tạo: phương án ${OPTION_LABELS[correct]} là đáp án.`,
    options: OPTION_LABELS.map((label, index) => ({
      text: `Phương án ${label} của câu mẫu số ${n}`,
      correct: index === correct,
    })),
    validation: verdictOf(cell.difficulty, correct),
  };
}

/**
 * 3× the questions every cell draws (BR-05). Draft ids are negative, -1 down in blueprint order:
 * no `ai.question_drafts` row has them, so they read as synthetic and meet no generated draft.
 */
export function seedQuestions(blueprint: ExamBlueprint): GeneratedQuestion[] {
  let draftId = 0;
  return cellsOf(blueprint).flatMap((cell) =>
    Array.from({ length: cell.count * QUESTION_BANK_FACTORS.min }, (_, i) => seedQuestion(cell, i + 1, --draftId)),
  );
}

async function campaignOf(tx: DbTx): Promise<{ id: number; testMinutes: number }> {
  // campaigns.name is not unique; look the campaign up by name, as the dev seed does.
  const [found] = await tx
    .select({ id: campaigns.id, config: campaigns.config })
    .from(campaigns)
    .where(eq(campaigns.name, LOCKED_BANK_CAMPAIGN.name));
  // The schema drops `target`, which the column keeps next to the parameters.
  if (found) return { id: found.id, testMinutes: CampaignConfigSchema.parse(found.config).t_test_minutes };
  const config = { ...DEFAULT_CAMPAIGN_CONFIG, target: LOCKED_BANK_CAMPAIGN.target };
  const [made] = await tx
    .insert(campaigns)
    .values({ name: LOCKED_BANK_CAMPAIGN.name, config })
    .returning({ id: campaigns.id });
  if (!made) throw new Error('seed: could not create the campaign of the locked bank');
  return { id: made.id, testMinutes: config.t_test_minutes };
}

async function jdOf(tx: DbTx, campaignId: number): Promise<{ id: number; version: number }> {
  const [company] = await tx.select({ id: companies.id }).from(companies).where(eq(companies.name, LOCKED_BANK_JD.company));
  if (!company) throw new Error(`seed: company ${LOCKED_BANK_JD.company} missing`);
  // job_descriptions.title is not unique; look the JD up by company and title.
  const [found] = await tx
    .select({ id: jobDescriptions.id, version: jobDescriptions.version })
    .from(jobDescriptions)
    .where(and(eq(jobDescriptions.companyId, company.id), eq(jobDescriptions.title, LOCKED_BANK_JD.title)));
  if (found) return found;
  const [made] = await tx
    .insert(jobDescriptions)
    .values({
      title: LOCKED_BANK_JD.title,
      quota: LOCKED_BANK_JD.quota,
      location: LOCKED_BANK_JD.location,
      workMode: LOCKED_BANK_JD.workMode,
      internshipPeriod: LOCKED_BANK_JD.internshipPeriod,
      allowance: LOCKED_BANK_JD.allowance,
      rawText: LOCKED_BANK_JD.rawText,
      positionGroup: LOCKED_BANK_JD.positionGroup,
      requirements: LOCKED_BANK_JD.requirements,
      campaignId,
      companyId: company.id,
      status: 'APPROVED',
    })
    .returning({ id: jobDescriptions.id, version: jobDescriptions.version });
  if (!made) throw new Error('seed: could not create the JD of the locked bank');
  return made;
}

/**
 * Runs the dev seed, then makes the locked bank in one transaction under the QUESTION_BANK lock of
 * the JD, as the API makes banks: the questions go in while the bank is OPEN, then the bank moves to
 * LOCKED (migration 0031 refuses questions in a locked bank). A bank the API made first keeps its
 * blueprint; the questions follow the blueprint the bank holds.
 */
export async function seedLockedQuestionBank(
  db: Database,
  password: string = DEFAULT_SEED_PASSWORD,
): Promise<LockedQuestionBankSeed> {
  await seedDev(db, password);
  return db.transaction(async (tx) => {
    const campaign = await campaignOf(tx);
    const jd = await jdOf(tx, campaign.id);
    await lockEntityInTx(tx, ADVISORY_LOCK_KEYS.QUESTION_BANK, jd.id);
    const [found] = await tx.select().from(questionBanks).where(eq(questionBanks.jdId, jd.id));
    const bank =
      found ??
      (
        await tx
          .insert(questionBanks)
          .values({
            campaignId: campaign.id,
            jdId: jd.id,
            jdVersion: jd.version,
            blueprint: buildDefaultBlueprint(LOCKED_BANK_JD.requirements, { durationMinutes: campaign.testMinutes }),
          })
          .returning()
      )[0];
    if (!bank) throw new Error('seed: could not create the question bank');

    if (bank.status !== 'LOCKED') {
      const rows = seedQuestions(bank.blueprint).map((question) => {
        const stored = toStoredQuestion(question);
        if (!stored) throw new Error(`seed: question ${question.draft_id} has no single answer`);
        return { ...stored, bankId: bank.id, status: 'VALIDATED' as const, validation: question.validation };
      });
      await tx.insert(questions).values(rows).onConflictDoNothing({ target: questions.draftId });
      await transitionTo<QuestionBankStatus>(db, new AuditService(), {
        lifecycle: questionBankLifecycle,
        id: bank.id,
        to: 'LOCKED',
        actor: SYSTEM_ACTOR,
        reason: 'seed: locked question bank for tests and the demo (US-4.2 AC-9)',
        set: { lockedAt: new Date() },
        tx,
      });
    }
    const [held] = await tx
      .select({ count: count() })
      .from(questions)
      .where(and(eq(questions.bankId, bank.id), eq(questions.status, 'VALIDATED')));
    // Locking keeps the version; only retiring a question raises it.
    return { campaignId: campaign.id, jdId: jd.id, bankId: bank.id, version: bank.version, questions: held?.count ?? 0 };
  });
}

if (require.main === module) {
  const url = process.env.DATABASE_URL;
  if (process.env.NODE_ENV === 'production') {
    console.error('seed: refusing to run with NODE_ENV=production (dev/test data only)');
    process.exit(1);
  }
  if (!url) {
    console.error('seed: DATABASE_URL is not set');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url, max: 1 });
  const password = process.env.SEED_PASSWORD || DEFAULT_SEED_PASSWORD;
  seedLockedQuestionBank(drizzle({ client: pool, schema }), password)
    .then((seed) => {
      console.log(
        `seed: question bank ${seed.bankId} of JD ${seed.jdId} (campaign ${seed.campaignId}) LOCKED, ` +
          `version ${seed.version}, ${seed.questions} VALIDATED questions`,
      );
    })
    .catch((error: unknown) => {
      console.error('seed: failed', error);
      process.exitCode = 1;
    })
    .finally(() => void pool.end());
}
