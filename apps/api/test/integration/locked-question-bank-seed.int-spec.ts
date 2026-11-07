// US-4.2 AC-9 (GĐ5, EPIC-4 › Cross-story testing requirements): the locked question bank seed gives
// the exam room (US-4.3) and the demo (US-6.6) a bank to draw from, without an LLM. It is
// deterministic and a second run changes nothing.
import { ExamBlueprintViewSchema, QUESTION_BANK_FACTORS } from '@srm/shared';
import { and, eq } from 'drizzle-orm';
import { buildDefaultBlueprint, QuestionBankService } from '../../src/modules/assessment/index.js';
import {
  LOCKED_BANK_REQUIREMENTS,
  SEED_QUESTION_MODEL,
  SEED_QUESTION_PROMPT,
  seedLockedQuestionBank,
  seedQuestions,
} from '../../src/db/seed/locked-question-bank.js';
import { auditLogs, jobDescriptions, questionBanks, questions } from '../../src/db/schema/index.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn } from '../helpers/auth.js';

describe('GĐ5 locked question bank seed (US-4.2)', () => {
  let t: AuthTestApp;
  let center: LoggedIn;

  beforeAll(async () => {
    t = await createAuthTestApp();
    center = await t.loginAs('CENTER');
  });

  afterAll(async () => {
    await t.close();
  });

  it('GĐ5 AC-9 seeds an approved JD and a LOCKED bank, 3× VALIDATED questions per cell; a second run adds nothing', async () => {
    const first = await seedLockedQuestionBank(t.db);
    const second = await seedLockedQuestionBank(t.db);
    expect(second).toEqual(first);
    expect(first.version).toBe(1);

    const [jd] = await t.db.select().from(jobDescriptions).where(eq(jobDescriptions.id, first.jdId));
    expect(jd).toMatchObject({ status: 'APPROVED', campaignId: first.campaignId, requirements: LOCKED_BANK_REQUIREMENTS });

    // The screen CENTER opens: locked, every cell at 3× VALIDATED, nothing rejected or waiting.
    const view = ExamBlueprintViewSchema.parse(
      (await center.agent.get(api(`jds/${first.jdId}/exam-blueprint`)).expect(200)).body,
    );
    expect(view).toMatchObject({
      bankId: first.bankId,
      status: 'LOCKED',
      locked: true,
      version: 1,
      jdOutdated: false,
      run: null,
      lock: { allowed: false, blockers: ['LOCKED'] },
    });
    expect(view.lockedAt).not.toBeNull();
    expect(view.blueprint).toEqual(buildDefaultBlueprint(LOCKED_BANK_REQUIREMENTS, { durationMinutes: view.blueprint.duration_minutes }));
    expect(new Set(view.coverage.map((cell) => cell.difficulty))).toEqual(new Set(['EASY', 'MEDIUM', 'HARD']));
    for (const cell of view.coverage) {
      expect(cell).toMatchObject({ validated: cell.needed * QUESTION_BANK_FACTORS.min, rejected: 0, pending: 0 });
      expect(cell.drafted).toBe(cell.validated);
    }
    const total = view.coverage.reduce((sum, cell) => sum + cell.validated, 0);
    expect(first.questions).toBe(total);

    // Locked once, by the system, through transitionTo.
    const transitions = await t.db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entity, 'question_bank'), eq(auditLogs.entityId, first.bankId), eq(auditLogs.action, 'TRANSITION')));
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({ actorKind: 'SYSTEM', after: { status: 'LOCKED' } });
  });

  it('GĐ5 AC-9 the questions are synthetic and deterministic, with the seed as their model; the exam draws them', async () => {
    const seed = await seedLockedQuestionBank(t.db);
    const [bank] = await t.db.select().from(questionBanks).where(eq(questionBanks.id, seed.bankId));
    const rows = await t.db.select().from(questions).where(eq(questions.bankId, seed.bankId));
    const expected = seedQuestions(bank!.blueprint);
    expect(rows.map((row) => row.draftId).sort((a, b) => b - a)).toEqual(expected.map((draft) => draft.draft_id));
    expect(Math.max(...rows.map((row) => row.draftId))).toBe(-1);
    for (const row of rows) {
      expect(row).toMatchObject({ status: 'VALIDATED', model: SEED_QUESTION_MODEL, promptVersion: SEED_QUESTION_PROMPT });
      expect(row.validation).toMatchObject({ status: 'VALIDATED', reasons: [], model: SEED_QUESTION_MODEL, prompt_version: SEED_QUESTION_PROMPT });
      // The verdict's answer is the key's, as the Validator's would be (US-4.2 AC-3).
      expect(row.validation?.correct_options).toEqual(row.type === 'MCQ' ? [row.answerKey.correct_option] : null);
    }
    // Answer keys are spread over the options, not all A.
    const keys = new Set(rows.filter((row) => row.type === 'MCQ').map((row) => row.answerKey.correct_option));
    expect(keys.size).toBeGreaterThan(1);

    const drawable = await t.app.get(QuestionBankService).getDrawableQuestions(seed.bankId);
    expect(drawable).toMatchObject({ bankId: seed.bankId, version: 1, blueprint: bank!.blueprint });
    expect(drawable.questions).toHaveLength(seed.questions);
  });
});
