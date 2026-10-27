import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SKILL_NORMALIZE_BATCH, skillMachine, SkillSuggestionSchema } from '@srm/shared';
import { errorMessage } from '../../../common/errors/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database } from '../../../db/types.js';
import { AI_RESULT_EVENTS, AiGatewayService, type AiResultEvent } from '../../aigateway/index.js';
import { AuditService, SYSTEM_ACTOR } from '../../audit/index.js';
import { SKILLS_AUDIT_ACTIONS } from '../domain/audit-actions.js';
import { distinctNewSkills, keyOwner } from '../domain/catalogue-keys.js';
import { SkillRepository } from '../infrastructure/skill.repository.js';

const ENTITY = skillMachine.name;

/** Where a new skill name came from, in the audit entry of its PENDING row. */
type ProposalSource = 'CV_PARSE' | 'JD_ANALYZE' | 'CV_PROFILE';

/**
 * Skills found outside the catalogue (FR-13, US-2.5 AC-5, AC-6, CONTEXT D39): by the AI in a CV or
 * JD, or typed by a student into the profile they confirmed (US-2.6, CONTEXT D40). The skills
 * module listens to the CV and JD results itself, so a database failure is retried by the consumer
 * (listener convention of aigateway/domain/events.ts). Each new name becomes one PENDING row, and
 * after commit the skill normalizer is asked for suggestions; ADMIN decides (AD-2).
 */
@Injectable()
export class NewSkillsService {
  private readonly logger = new Logger(NewSkillsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly repository: SkillRepository,
    private readonly audit: AuditService,
    private readonly aiGateway: AiGatewayService,
  ) {}

  @OnEvent(AI_RESULT_EVENTS.CV_PARSE, { suppressErrors: false })
  async fromCv(result: AiResultEvent<'CV_PARSE'>): Promise<void> {
    if (result.status !== 'SUCCEEDED' || result.result === null) return;
    // From profile_masked, without names holding a mask token (BR-03).
    await this.queue(result.result.new_skills, result.type, result.job_id);
  }

  @OnEvent(AI_RESULT_EVENTS.JD_ANALYZE, { suppressErrors: false })
  async fromJd(result: AiResultEvent<'JD_ANALYZE'>): Promise<void> {
    if (result.status !== 'SUCCEEDED' || result.result === null) return;
    await this.queue(result.result.new_skills, result.type, result.job_id);
  }

  /**
   * Skills a student typed outside the catalogue into the profile they just confirmed (US-2.6,
   * CONTEXT D40). The caller passes the NEW names of profile_masked without a mask token (BR-03),
   * after its transaction commits.
   */
  async proposeFromStudentProfile(names: readonly string[]): Promise<void> {
    await this.queue(names, 'CV_PROFILE', null);
  }

  /**
   * AC-6: stores each suggestion on its skill while it awaits review. A failed job is left alone:
   * ADMIN reviews without a suggestion. Suggestions for a skill outside the job are dropped.
   */
  @OnEvent(AI_RESULT_EVENTS.SKILL_NORMALIZE, { suppressErrors: false })
  async applySuggestions(result: AiResultEvent<'SKILL_NORMALIZE'>): Promise<void> {
    if (result.status !== 'SUCCEEDED' || result.result === null) {
      this.logger.warn(`job ${result.job_id}: no skill suggestions (${result.error?.code ?? 'FAILED'})`);
      return;
    }
    const { model, prompt_version: promptVersion, suggestions } = result.result;
    const wanted = new Set(result.job.skill_ids);
    // The queue checks the JSON Schema; this also applies the contract's trimming.
    const checked = suggestions.flatMap((item) => {
      const parsed = SkillSuggestionSchema.safeParse(item);
      return parsed.success && wanted.has(parsed.data.skill_id) ? [parsed.data] : [];
    });
    if (checked.length < suggestions.length) {
      this.logger.warn(`job ${result.job_id}: ${suggestions.length - checked.length} skill suggestion(s) dropped`);
    }
    await this.db.transaction(async (tx) => {
      for (const suggestion of checked) {
        const stored = await this.repository.storeSuggestion(tx, suggestion.skill_id, suggestion, model, promptVersion);
        if (!stored) continue;
        await this.audit.record(tx, {
          actor: SYSTEM_ACTOR,
          action: SKILLS_AUDIT_ACTIONS.SKILL_SUGGESTED,
          entity: ENTITY,
          entityId: suggestion.skill_id,
          after: { suggestion, model, promptVersion, jobId: result.job_id },
          reason: 'Skill normalizer suggestion',
        });
      }
    });
  }

  private async queue(names: readonly string[], source: ProposalSource, jobId: string | null): Promise<void> {
    const distinct = distinctNewSkills(names);
    if (distinct.length === 0) return;
    const created = await this.db.transaction(async (tx) => {
      await this.repository.lockCatalogue(tx, 'shared');
      // The AI Service may have read the catalogue before ADMIN's latest decision: a name that an
      // approved skill now matches (say, by the alias a rename left) is not new (AC-10).
      const known = await this.repository.keyedSkills(
        tx,
        distinct.map(({ key }) => key),
      );
      const fresh = distinct.filter(({ key }) => !keyOwner(key, known, []));
      const rows = await this.repository.insertPending(tx, fresh);
      for (const row of rows) {
        await this.audit.record(tx, {
          actor: SYSTEM_ACTOR,
          action: SKILLS_AUDIT_ACTIONS.SKILL_PROPOSED,
          entity: ENTITY,
          entityId: row.id,
          after: { canonicalName: row.canonicalName, status: 'PENDING', source, jobId },
          reason: source === 'CV_PROFILE' ? 'New skill entered by a student in their profile' : `New skill found by ${source}`,
        });
      }
      return rows;
    });
    await this.requestSuggestions(created.map((row) => row.id));
  }

  /**
   * After commit, one SKILL_NORMALIZE job per SKILL_NORMALIZE_BATCH skills. A job the broker never
   * confirms is logged, not retried (no outbox, CONTEXT D33): its skills await review without a
   * suggestion.
   */
  private async requestSuggestions(skillIds: readonly number[]): Promise<void> {
    for (let start = 0; start < skillIds.length; start += SKILL_NORMALIZE_BATCH) {
      const batch = skillIds.slice(start, start + SKILL_NORMALIZE_BATCH);
      try {
        await this.aiGateway.dispatch('SKILL_NORMALIZE', { skill_ids: batch });
      } catch (error) {
        this.logger.error(`skills ${batch.join(', ')}: suggestion job not dispatched: ${errorMessage(error)}`);
      }
    }
  }
}
