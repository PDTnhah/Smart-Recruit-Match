import { Inject, Injectable } from '@nestjs/common';
import {
  type AdminSkill,
  type AdminSkillList,
  type AdminSkillListQuery,
  type ApproveSkillRequest,
  type MergeSkillRequest,
  type RejectSkillRequest,
  skillMachine,
  type SkillStatus,
} from '@srm/shared';
import type { AuthUser } from '../../../common/auth/index.js';
import {
  EntityNotFoundError,
  InvalidTransitionError,
  RowVersionConflictError,
  SkillNameTakenError,
  TransitionConditionFailedError,
} from '../../../common/errors/index.js';
import { StateTransitionService } from '../../../common/state/index.js';
import { skillLifecycle } from '../../../db/lifecycles.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import { AuditService, userActor } from '../../audit/index.js';
import { MERGE_TARGET_NOT_APPROVED, SKILL_REVIEW_REASONS, SKILLS_AUDIT_ACTIONS } from '../domain/audit-actions.js';
import { approvalOf, type KeyedName, keyOwner, mergeOf } from '../domain/catalogue-keys.js';
import { type LockedSkill, SkillRepository, type SkillRecord } from '../infrastructure/skill.repository.js';

const ENTITY = skillMachine.name;

/**
 * ADMIN review of the skills the AI found outside the catalogue (FR-13, US-2.5 AC-7, CONTEXT D39):
 * approve (name and group may change), merge into an approved skill as an alias, or reject. Every
 * decision goes through `transitionTo` with its audit entries in one transaction (AD-8), and no two
 * skills ever match one spelling: a name or alias whose key another skill holds is a 409.
 */
@Injectable()
export class SkillReviewService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly repository: SkillRepository,
    private readonly transitions: StateTransitionService,
    private readonly audit: AuditService,
  ) {}

  async list(query: AdminSkillListQuery): Promise<AdminSkillList> {
    const records = await this.repository.list(query.status);
    return { items: records.map(toAdminSkill) };
  }

  /** The approved skill takes the new name and group; a renamed spelling stays as an alias (AC-10). */
  async approve(user: AuthUser, id: number, body: ApproveSkillRequest): Promise<AdminSkill> {
    await this.db.transaction(async (tx) => {
      await this.repository.lockCatalogue(tx, 'exclusive');
      const skill = await this.lockPending(tx, id, body.rowVersion, 'APPROVED');
      const approval = approvalOf(skill, body.canonicalName, body.group);
      await this.assertKeysFree(tx, approval.names, [id]);
      const { canonicalName, nameKey, aliases, group } = approval;
      await this.repository.updateVersioned(tx, id, skill.rowVersion, { canonicalName, nameKey, aliases, group });
      await this.audit.record(tx, {
        actor: userActor(user),
        action: SKILLS_AUDIT_ACTIONS.SKILL_APPROVED,
        entity: ENTITY,
        entityId: id,
        before: { canonicalName: skill.canonicalName, aliases: skill.aliases, rowVersion: skill.rowVersion },
        after: { canonicalName, aliases, group, rowVersion: skill.rowVersion + 1 },
      });
      await this.transitions.transitionTo<SkillStatus>({
        lifecycle: skillLifecycle,
        id,
        to: 'APPROVED',
        actor: userActor(user),
        reason: SKILL_REVIEW_REASONS.APPROVED,
        expectedRowVersion: skill.rowVersion + 1,
        tx,
      });
    });
    return this.get(id);
  }

  /**
   * The name becomes an alias of an approved skill, so the next CV or JD that writes it maps to
   * that skill (AC-10). The target is locked too, and its row_version moves on with its aliases.
   */
  async merge(user: AuthUser, id: number, body: MergeSkillRequest): Promise<AdminSkill> {
    await this.db.transaction(async (tx) => {
      await this.repository.lockCatalogue(tx, 'exclusive');
      const locked = await this.repository.lock(tx, [id, body.targetId]);
      const source = checkedPending(
        locked.find((skill) => skill.id === id),
        id,
        body.rowVersion,
        'MERGED',
      );
      const target = locked.find((skill) => skill.id === body.targetId && skill.id !== id);
      if (!target || target.status !== 'APPROVED') {
        throw new TransitionConditionFailedError(
          ENTITY,
          source.status,
          'MERGED',
          MERGE_TARGET_NOT_APPROVED,
          `skill ${body.targetId} is not an approved skill to merge into`,
        );
      }
      const merge = mergeOf(source, target);
      await this.assertKeysFree(tx, merge.added, [id, target.id]);
      if (merge.added.length > 0) {
        await this.repository.updateVersioned(tx, target.id, target.rowVersion, { aliases: merge.aliases });
        await this.audit.record(tx, {
          actor: userActor(user),
          action: SKILLS_AUDIT_ACTIONS.SKILL_ALIASES_ADDED,
          entity: ENTITY,
          entityId: target.id,
          before: { aliases: target.aliases, rowVersion: target.rowVersion },
          after: { aliases: merge.aliases, rowVersion: target.rowVersion + 1 },
          reason: `Skill ${id} merged into it`,
        });
      }
      // The target first: CHECK skills_merged_check wants it before the status is MERGED.
      await this.repository.updateVersioned(tx, id, source.rowVersion, { mergedIntoId: target.id });
      await this.audit.record(tx, {
        actor: userActor(user),
        action: SKILLS_AUDIT_ACTIONS.SKILL_MERGED,
        entity: ENTITY,
        entityId: id,
        before: { mergedIntoId: null, rowVersion: source.rowVersion },
        after: { mergedIntoId: target.id, targetName: target.canonicalName, rowVersion: source.rowVersion + 1 },
      });
      await this.transitions.transitionTo<SkillStatus>({
        lifecycle: skillLifecycle,
        id,
        to: 'MERGED',
        actor: userActor(user),
        reason: SKILL_REVIEW_REASONS.MERGED,
        expectedRowVersion: source.rowVersion + 1,
        tx,
      });
    });
    return this.get(id);
  }

  /** The row stays REJECTED, so the same name is not queued again. */
  async reject(user: AuthUser, id: number, body: RejectSkillRequest): Promise<AdminSkill> {
    await this.transitions.transitionTo<SkillStatus>({
      lifecycle: skillLifecycle,
      id,
      to: 'REJECTED',
      actor: userActor(user),
      reason: SKILL_REVIEW_REASONS.REJECTED,
      expectedRowVersion: body.rowVersion,
    });
    return this.get(id);
  }

  private async get(id: number): Promise<AdminSkill> {
    const record = await this.repository.findById(id);
    if (!record) throw new EntityNotFoundError(ENTITY, id);
    return toAdminSkill(record);
  }

  private async lockPending(tx: DbTx, id: number, rowVersion: number, to: SkillStatus): Promise<LockedSkill> {
    const [skill] = await this.repository.lock(tx, [id]);
    return checkedPending(skill, id, rowVersion, to);
  }

  /** 409 when another skill already matches one of `names` (CONTEXT D39). */
  private async assertKeysFree(tx: DbTx, names: readonly KeyedName[], selfIds: readonly number[]): Promise<void> {
    if (names.length === 0) return;
    const skills = await this.repository.keyedSkills(
      tx,
      names.map(({ key }) => key),
    );
    for (const { name, key } of names) {
      const owner = keyOwner(key, skills, selfIds);
      if (owner) throw new SkillNameTakenError(name, owner);
    }
  }
}

/** Same order of checks as transitionTo: 404, then row_version (409), then the state (422). */
function checkedPending(
  skill: LockedSkill | undefined,
  id: number,
  rowVersion: number,
  to: SkillStatus,
): LockedSkill {
  if (!skill) throw new EntityNotFoundError(ENTITY, id);
  if (skill.rowVersion !== rowVersion) throw new RowVersionConflictError(ENTITY, id, rowVersion, skill.rowVersion);
  if (skill.status !== 'PENDING') throw new InvalidTransitionError(ENTITY, skill.status, to);
  return skill;
}

function toAdminSkill(record: SkillRecord): AdminSkill {
  const { suggestion, suggestionModel, suggestionPromptVersion } = record;
  return {
    id: record.id,
    canonicalName: record.canonicalName,
    aliases: [...record.aliases],
    group: record.group,
    status: record.status,
    mergedInto: record.mergedInto,
    suggestion:
      suggestion && suggestionModel && suggestionPromptVersion
        ? {
            canonicalName: suggestion.canonical_name,
            group: suggestion.group,
            similarSkills: suggestion.similar_skills,
            model: suggestionModel,
            promptVersion: suggestionPromptVersion,
          }
        : null,
    rowVersion: record.rowVersion,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
