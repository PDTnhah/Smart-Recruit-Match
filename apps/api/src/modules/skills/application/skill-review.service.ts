import { Inject, Injectable } from '@nestjs/common';
import {
  type AdminSkill,
  type AdminSkillList,
  type AdminSkillListQuery,
  type ApproveSkillRequest,
  familyGroupError,
  type MergeSkillRequest,
  type RejectSkillRequest,
  skillMachine,
  type SkillRef,
  type SkillStatus,
  type UpdateSkillTaxonomyRequest,
  zoneOf,
} from '@srm/shared';
import type { AuthUser } from '../../../common/auth/index.js';
import {
  EntityNotFoundError,
  InvalidTransitionError,
  RowVersionConflictError,
  SkillImplicationCycleError,
  SkillNameTakenError,
  SkillNotApprovedError,
  TransitionConditionFailedError,
  ValidationFailedError,
} from '../../../common/errors/index.js';
import { StateTransitionService } from '../../../common/state/index.js';
import { skillLifecycle } from '../../../db/lifecycles.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import { AuditService, userActor } from '../../audit/index.js';
import { MERGE_TARGET_NOT_APPROVED, SKILL_REVIEW_REASONS, SKILLS_AUDIT_ACTIONS } from '../domain/audit-actions.js';
import { approvalOf, type KeyedName, keyOwner, mergeOf } from '../domain/catalogue-keys.js';
import { findCycle, type Implication, withOutgoing } from '../domain/implications.js';
import { type LockedSkill, SkillRepository, type SkillRecord } from '../infrastructure/skill.repository.js';

const ENTITY = skillMachine.name;

const ascending = (ids: readonly number[]) => [...ids].sort((a, b) => a - b);

/**
 * ADMIN review of the skills the AI found outside the catalogue (FR-13, US-2.5 AC-7, CONTEXT D39):
 * approve (name and group may change), merge into an approved skill as an alias, or reject. Every
 * decision goes through `transitionTo` with its audit entries in one transaction (AD-8), and no two
 * skills ever match one spelling: a name or alias whose key another skill holds is a 409.
 * ADMIN also keeps the family and the implied skills of approved skills (FR-39, US-2.7, CONTEXT
 * D43); implications only join approved skills and never close a cycle.
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
    const records = await this.repository.list(query.status, query.zone);
    return { items: records.map(toAdminSkill) };
  }

  /**
   * The approved skill takes the new name, group, family and implied skills; a renamed spelling
   * stays as an alias (US-2.5 AC-10, US-2.7 AC-5). The schema has checked the family against the
   * group.
   */
  async approve(user: AuthUser, id: number, body: ApproveSkillRequest): Promise<AdminSkill> {
    await this.db.transaction(async (tx) => {
      await this.repository.lockCatalogue(tx, 'exclusive');
      const skill = await this.lockPending(tx, id, body.rowVersion, 'APPROVED');
      const approval = approvalOf(skill, body.canonicalName, body.group);
      await this.assertKeysFree(tx, approval.names, [id]);
      const { canonicalName, nameKey, aliases, group } = approval;
      const { family, impliesSkillIds } = body;
      // A pending skill is in no implication: only approved skills imply or are implied. Implying
      // itself is then the one cycle it can close, so the rest of the graph is not read.
      await this.assertImplications(tx, { id, canonicalName }, impliesSkillIds, []);
      await this.repository.updateVersioned(tx, id, skill.rowVersion, { canonicalName, nameKey, aliases, group, family });
      await this.repository.replaceImplications(tx, id, impliesSkillIds);
      await this.audit.record(tx, {
        actor: userActor(user),
        action: SKILLS_AUDIT_ACTIONS.SKILL_APPROVED,
        entity: ENTITY,
        entityId: id,
        before: { canonicalName: skill.canonicalName, aliases: skill.aliases, rowVersion: skill.rowVersion },
        after: {
          canonicalName,
          aliases,
          group,
          family,
          impliesSkillIds: ascending(impliesSkillIds),
          rowVersion: skill.rowVersion + 1,
        },
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

  /**
   * The family and the implied skills of an approved skill (US-2.7 AC-6). Checks run in the order
   * of transitionTo: 404, row_version (409), then the skill must be approved (422), the family must
   * fit its group (400), and the implied skills must be approved and close no cycle (422). Saving
   * what is stored writes nothing, so row_version stays and no other open form gets a 409.
   */
  async updateTaxonomy(user: AuthUser, id: number, body: UpdateSkillTaxonomyRequest): Promise<AdminSkill> {
    await this.db.transaction(async (tx) => {
      await this.repository.lockCatalogue(tx, 'exclusive');
      const [skill] = await this.repository.lock(tx, [id]);
      if (!skill) throw new EntityNotFoundError(ENTITY, id);
      if (skill.rowVersion !== body.rowVersion) {
        throw new RowVersionConflictError(ENTITY, id, body.rowVersion, skill.rowVersion);
      }
      if (skill.status !== 'APPROVED') throw new SkillNotApprovedError([id]);
      // CHECK skills_approved_group_check: an approved skill always has a group.
      const familyError = familyGroupError(skill.group!, body.family);
      if (familyError !== null) throw new ValidationFailedError([{ path: 'family', message: familyError }]);
      const implications = await this.repository.implications(tx);
      const implied = ascending(implications.filter((edge) => edge.skillId === id).map((edge) => edge.impliedSkillId));
      const impliesSkillIds = ascending(body.impliesSkillIds);
      if (skill.family === body.family && implied.join() === impliesSkillIds.join()) return;
      await this.assertImplications(tx, skill, body.impliesSkillIds, implications);
      await this.repository.updateVersioned(tx, id, skill.rowVersion, { family: body.family });
      await this.repository.replaceImplications(tx, id, body.impliesSkillIds);
      await this.audit.record(tx, {
        actor: userActor(user),
        action: SKILLS_AUDIT_ACTIONS.SKILL_TAXONOMY_UPDATED,
        entity: ENTITY,
        entityId: id,
        before: {
          family: skill.family,
          impliesSkillIds: implied,
          rowVersion: skill.rowVersion,
        },
        after: {
          family: body.family,
          impliesSkillIds,
          rowVersion: skill.rowVersion + 1,
        },
      });
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

  /**
   * 422 unless every skill of `impliedIds` is approved and `skill` implying exactly them, in place
   * of what it implies in `implications`, closes no cycle (AC-4, AC-6). Runs under the exclusive
   * catalogue lock, which every write of implications takes, so the graph checked is the one written.
   */
  private async assertImplications(
    tx: DbTx,
    skill: SkillRef,
    impliedIds: readonly number[],
    implications: readonly Implication[],
  ): Promise<void> {
    // Before the status check: on approval the skill itself is not approved yet.
    if (impliedIds.includes(skill.id)) throw new SkillImplicationCycleError([skill, skill]);
    const approved = new Set(
      (await this.repository.refs(tx, impliedIds)).filter((ref) => ref.status === 'APPROVED').map((ref) => ref.id),
    );
    const notApproved = impliedIds.filter((impliedId) => !approved.has(impliedId));
    if (notApproved.length > 0) throw new SkillNotApprovedError(notApproved);

    const cycle = findCycle(withOutgoing(implications, skill.id, impliedIds), skill.id);
    if (cycle === null) return;
    const names = new Map((await this.repository.refs(tx, cycle)).map((ref) => [ref.id, ref.canonicalName]));
    // On approval the new name, not yet written.
    names.set(skill.id, skill.canonicalName);
    throw new SkillImplicationCycleError(cycle.map((cycleId) => ({ id: cycleId, canonicalName: names.get(cycleId)! })));
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
    family: record.family,
    zone: zoneOf(record.family),
    implies: record.implies,
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
