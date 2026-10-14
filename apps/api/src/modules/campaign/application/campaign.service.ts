import { isDeepStrictEqual } from 'node:util';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CAMPAIGN_DEADLINE_KEYS,
  type Campaign,
  type CampaignConfig,
  CampaignConfigSchema,
  type CampaignDeadlines,
  type CampaignList,
  campaignMachine,
  type CampaignStatus,
  type CampaignTarget,
  type CreateCampaignRequest,
  DEADLINE_NOT_LATER,
  DEADLINE_REASON_REQUIRED,
  type PhaseDeadlinesInput,
  PhaseDeadlinesSchema,
  type UpdateCampaignRequest,
} from '@srm/shared';
import type { AuthUser } from '../../../common/auth/index.js';
import { Clock } from '../../../common/clock/index.js';
import { emitSafely } from '../../../common/events/index.js';
import {
  CampaignConfigLockedError,
  CampaignPhaseMismatchError,
  EntityNotFoundError,
  RowVersionConflictError,
  ValidationFailedError,
} from '../../../common/errors/index.js';
import { StateTransitionService, type TransitionResult } from '../../../common/state/index.js';
import { parseOrFail } from '../../../common/validation/validation-issues.js';
import { campaignLifecycle } from '../../../db/lifecycles.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import { type Actor, AuditService, SYSTEM_ACTOR, userActor } from '../../audit/index.js';
import { CAMPAIGN_AUDIT_ACTIONS } from '../domain/audit-actions.js';
import { checkDeadlineExtension } from '../domain/deadline-change.js';
import {
  CAMPAIGN_OPENED,
  CAMPAIGN_PHASE_CHANGED,
  type CampaignOpenedEvent,
  type CampaignPhaseChangedEvent,
} from '../domain/events.js';
import type { DueTransition } from '../domain/next-auto-transition.js';
import { checkOpenable, checkPhase } from '../domain/phase-check.js';
import { canSeeCampaign, type CampaignViewer } from '../domain/visibility.js';
import {
  type CampaignContent,
  type CampaignRecord,
  CampaignRepository,
} from '../infrastructure/campaign.repository.js';
import type { StudentAudienceLookup } from './student-audience.js';

/** Audit entity and error entity name, shared with transitionTo (the machine name). */
const ENTITY = campaignMachine.name;

/** What other modules read about a campaign (AGENTS › Invariant 13: never the table itself). */
export interface CampaignSettings {
  id: number;
  status: CampaignStatus;
  target: CampaignTarget;
  phaseDeadlines: CampaignDeadlines;
  config: CampaignConfig;
}

interface Change {
  content: CampaignContent;
  action: string;
  reason?: string;
}

/**
 * Campaigns: creation and edits by the center, opening, phase changes by deadline, and the phase
 * check other modules call before acting (FR-2, US-1.4, CONTEXT D27). Status changes go through
 * `transitionTo` (AD-8); events are published only after the transaction commits.
 */
@Injectable()
export class CampaignService {
  private readonly logger = new Logger(CampaignService.name);
  private studentAudience: StudentAudienceLookup | undefined;
  private warnedNoAudience = false;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly repository: CampaignRepository,
    private readonly transitions: StateTransitionService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
    private readonly events: EventEmitter2,
  ) {}

  /** Registered by StudentModule at startup; until then students see no campaign. */
  useStudentAudience(lookup: StudentAudienceLookup): void {
    this.studentAudience = lookup;
  }

  /** AC-1: a new campaign starts in DRAFT; parameters left out already hold the PRD defaults. */
  async create(user: AuthUser, input: CreateCampaignRequest): Promise<Campaign> {
    const content: CampaignContent = {
      name: input.name,
      target: input.target,
      phaseDeadlines: mergeDeadlines({}, input.phaseDeadlines),
      config: input.config,
    };
    const record = await this.db.transaction(async (tx) => {
      const created = await this.repository.insert(tx, content);
      await this.audit.record(tx, {
        actor: userActor(user),
        action: CAMPAIGN_AUDIT_ACTIONS.CREATED,
        entity: ENTITY,
        entityId: created.id,
        after: snapshot(created),
      });
      return created;
    });
    return toCampaign(record);
  }

  /** AC-3: only the campaigns the caller takes part in (CONTEXT D27), newest first. */
  async list(user: AuthUser): Promise<CampaignList> {
    const viewer = await this.viewerOf(user);
    const includeDrafts = viewer.role === 'CENTER' || viewer.role === 'ADMIN';
    const records = await this.repository.list({ includeDrafts });
    return { items: records.filter((record) => canSeeCampaign(viewer, record)).map(toCampaign) };
  }

  /** AC-3: a campaign outside the caller's scope answers 404, like a missing one. */
  async get(user: AuthUser, id: number): Promise<Campaign> {
    const [record, viewer] = await Promise.all([this.repository.findById(id), this.viewerOf(user)]);
    if (!record || !canSeeCampaign(viewer, record)) throw new EntityNotFoundError(ENTITY, id);
    return toCampaign(record);
  }

  /**
   * AC-4: a draft accepts any edit; once open, only deadlines still ahead may move later, with a
   * reason. The stale-version check comes first, so a lost race always answers 409.
   */
  async update(user: AuthUser, id: number, patch: UpdateCampaignRequest): Promise<Campaign> {
    const record = await this.db.transaction(async (tx) => {
      const before = await this.repository.findById(id, { tx, lock: 'update' });
      if (!before) throw new EntityNotFoundError(ENTITY, id);
      if (before.rowVersion !== patch.rowVersion) {
        throw new RowVersionConflictError(ENTITY, id, patch.rowVersion, before.rowVersion);
      }
      const change = before.status === 'DRAFT' ? draftChange(before, patch) : this.runningChange(before, patch);
      if (!change) return before;
      const after = await this.repository.updateVersioned(tx, id, before.rowVersion, change.content);
      await this.audit.record(tx, {
        actor: userActor(user),
        action: change.action,
        entity: ENTITY,
        entityId: id,
        before: snapshot(before),
        after: snapshot(after),
        reason: change.reason ?? null,
      });
      return after;
    });
    return toCampaign(record);
  }

  /** AC-5: DRAFT → INTAKE once every deadline is set and ahead; otherwise 422 and nothing changes. */
  async open(user: AuthUser, id: number, rowVersion: number): Promise<Campaign> {
    const result = await this.transitions.transitionTo<CampaignStatus>({
      lifecycle: campaignLifecycle,
      id,
      to: 'INTAKE',
      actor: userActor(user),
      reason: 'campaign opened by the center',
      expectedRowVersion: rowVersion,
      guard: async (_row, tx) => {
        // transitionTo has already locked the row in this transaction.
        const record = await this.repository.findById(id, { tx });
        const check = checkOpenable(record?.phaseDeadlines ?? {}, this.clock.now());
        if (check.ok) return { ok: true };
        return {
          ok: false,
          reasonCode: check.reasonCode,
          message: `campaign ${id}: ${check.reasonCode} (${check.keys.join(', ')})`,
        };
      },
    });
    this.publish(CAMPAIGN_OPENED, { campaignId: id } satisfies CampaignOpenedEvent);
    this.publishPhaseChanged(result, 'USER');
    return toCampaign(await this.requireRecord(id));
  }

  /**
   * AC-6: called by the scheduler when the deadline ending the current phase has passed. The
   * row_version read during the scan guards against a concurrent edit or another instance.
   */
  async advanceByDeadline(
    id: number,
    due: DueTransition,
    expectedRowVersion: number,
  ): Promise<TransitionResult<CampaignStatus>> {
    const result = await this.transitions.transitionTo<CampaignStatus>({
      lifecycle: campaignLifecycle,
      id,
      to: due.to,
      actor: SYSTEM_ACTOR,
      reason: `deadline ${due.deadlineKey} passed (${due.deadline})`,
      expectedRowVersion,
    });
    this.publishPhaseChanged(result, 'SYSTEM');
    return result;
  }

  /**
   * AC-8: throws 409 CAMPAIGN_PHASE_MISMATCH unless the campaign is in one of `allowed` and the
   * deadline ending that phase has not passed (CONTEXT D27). With `tx`, the campaign row is read
   * `FOR SHARE`, so it cannot change phase before the caller's transaction commits.
   */
  async assertPhase(
    campaignId: number,
    allowed: readonly CampaignStatus[],
    options: { tx?: DbTx } = {},
  ): Promise<CampaignSettings> {
    const record = await this.repository.findById(campaignId, options.tx ? { tx: options.tx, lock: 'share' } : {});
    if (!record) throw new EntityNotFoundError(ENTITY, campaignId);
    const check = checkPhase(record.status, record.phaseDeadlines, allowed, this.clock.now());
    if (!check.ok) throw new CampaignPhaseMismatchError(campaignId, record.status, allowed, check.phaseEndedAt);
    return settingsOf(record);
  }

  /** Parameters, target and deadlines of a campaign, for other modules. 404 when it does not exist. */
  async getSettings(campaignId: number): Promise<CampaignSettings> {
    return settingsOf(await this.requireRecord(campaignId));
  }

  private async requireRecord(id: number): Promise<CampaignRecord> {
    const record = await this.repository.findById(id);
    if (!record) throw new EntityNotFoundError(ENTITY, id);
    return record;
  }

  private async viewerOf(user: AuthUser): Promise<CampaignViewer> {
    if (user.role !== 'STUDENT') return { role: user.role };
    if (!this.studentAudience && !this.warnedNoAudience) {
      // Deny by default, but say so: StudentModule normally registers the lookup at startup.
      this.logger.warn('no student audience lookup registered; students see no campaign');
      this.warnedNoAudience = true;
    }
    const audience = this.studentAudience ? await this.studentAudience(user.studentId) : null;
    return { role: 'STUDENT', audience };
  }

  /** Edits of a campaign that has left DRAFT (CONTEXT D27). */
  private runningChange(before: CampaignRecord, patch: UpdateCampaignRequest): Change | null {
    const locked = lockedFieldChanges(before, patch);
    if (locked.length > 0) throw new CampaignConfigLockedError(before.id, before.status, locked);
    if (!patch.phaseDeadlines) return null;

    const extension = checkDeadlineExtension(before.phaseDeadlines, patch.phaseDeadlines, this.clock.now());
    if (!extension.ok) {
      const fields = extension.keys.map((key) => `phaseDeadlines.${key}`);
      if (extension.kind === 'LOCKED') throw new CampaignConfigLockedError(before.id, before.status, fields);
      throw new ValidationFailedError(fields.map((path) => ({ path, message: DEADLINE_NOT_LATER })));
    }
    if (extension.changed.length === 0) return null;
    if (!patch.reason) throw new ValidationFailedError([{ path: 'reason', message: DEADLINE_REASON_REQUIRED }]);

    const phaseDeadlines = parseOrFail(
      PhaseDeadlinesSchema,
      mergeDeadlines(before.phaseDeadlines, patch.phaseDeadlines),
      'phaseDeadlines',
    );
    return {
      content: { ...contentOf(before), phaseDeadlines },
      action: CAMPAIGN_AUDIT_ACTIONS.DEADLINES_EXTENDED,
      reason: patch.reason,
    };
  }

  private publishPhaseChanged(result: TransitionResult<CampaignStatus>, actorKind: Actor['kind']): void {
    this.publish(CAMPAIGN_PHASE_CHANGED, {
      campaignId: result.id,
      from: result.from,
      to: result.to,
      actorKind,
    } satisfies CampaignPhaseChangedEvent);
  }

  private publish(event: string, payload: object): void {
    emitSafely(this.events, this.logger, event, payload);
  }
}

/** Edits of a draft: sections and keys left out keep their stored value. */
function draftChange(before: CampaignRecord, patch: UpdateCampaignRequest): Change | null {
  const content: CampaignContent = {
    name: patch.name ?? before.name,
    target: patch.target ?? before.target,
    phaseDeadlines: parseOrFail(
      PhaseDeadlinesSchema,
      mergeDeadlines(before.phaseDeadlines, patch.phaseDeadlines),
      'phaseDeadlines',
    ),
    config: patch.config
      ? parseOrFail(CampaignConfigSchema, { ...before.config, ...patch.config }, 'config')
      : before.config,
  };
  if (isDeepStrictEqual(content, contentOf(before))) return null;
  return { content, action: CAMPAIGN_AUDIT_ACTIONS.UPDATED, reason: patch.reason };
}

/** Name, target and parameters the patch would change; all locked once the campaign is open. */
function lockedFieldChanges(before: CampaignRecord, patch: UpdateCampaignRequest): string[] {
  const fields: string[] = [];
  if (patch.name !== undefined && patch.name !== before.name) fields.push('name');
  if (patch.target !== undefined && !isDeepStrictEqual(patch.target, before.target)) fields.push('target');
  for (const [key, value] of Object.entries(patch.config ?? {})) {
    if (value !== undefined && value !== before.config[key as keyof CampaignConfig]) fields.push(`config.${key}`);
  }
  return fields;
}

/** Applies a deadline patch: `null` clears a key; values are stored as UTC ISO strings. */
function mergeDeadlines(before: CampaignDeadlines, patch: PhaseDeadlinesInput | undefined): CampaignDeadlines {
  const merged: CampaignDeadlines = { ...before };
  for (const key of CAMPAIGN_DEADLINE_KEYS) {
    const value = patch?.[key];
    if (value === undefined) continue;
    if (value === null) delete merged[key];
    else merged[key] = new Date(value).toISOString();
  }
  return merged;
}

function contentOf(record: CampaignRecord): CampaignContent {
  return {
    name: record.name,
    target: record.target,
    phaseDeadlines: record.phaseDeadlines,
    config: record.config,
  };
}

function settingsOf(record: CampaignRecord): CampaignSettings {
  return {
    id: record.id,
    status: record.status,
    target: record.target,
    phaseDeadlines: record.phaseDeadlines,
    config: record.config,
  };
}

function snapshot(record: CampaignRecord): Record<string, unknown> {
  return { ...contentOf(record), status: record.status, rowVersion: record.rowVersion };
}

function toCampaign(record: CampaignRecord): Campaign {
  return {
    ...settingsOf(record),
    name: record.name,
    rowVersion: record.rowVersion,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
