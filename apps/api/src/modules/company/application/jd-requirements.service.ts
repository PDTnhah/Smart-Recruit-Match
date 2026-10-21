import { isDeepStrictEqual } from 'node:util';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  type CampaignStatus,
  type JdRequirements,
  JdRequirementsSchema,
  type JdRequirementsView,
  jobDescriptionMachine,
  type JobDescriptionStatus,
  type PositionGroup,
  type SaveJdRequirementsRequest,
} from '@srm/shared';
import { assertRecordAccess, type AuthUser } from '../../../common/auth/index.js';
import { errorMessage, JdRequirementsNotEditableError, RowVersionConflictError } from '../../../common/errors/index.js';
import { emitSafely } from '../../../common/events/index.js';
import { StateTransitionService } from '../../../common/state/index.js';
import { jobDescriptionLifecycle } from '../../../db/lifecycles.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import { AuditService, userActor } from '../../audit/index.js';
import { CampaignService } from '../../campaign/index.js';
import { UserDirectory } from '../../iam/index.js';
import { NotificationService } from '../../notification/index.js';
import { COMPANY_AUDIT_ACTIONS } from '../domain/audit-actions.js';
import { JD_REQUIREMENTS_VERSIONED, type JdRequirementsVersionedEvent } from '../domain/events.js';
import {
  canConfirm,
  decideRequirementsEdit,
  editModeOf,
  REQUIREMENTS_REASON_CODES,
  type RequirementsEdit,
  type RequirementsEditor,
} from '../domain/requirements-versioning.js';
import { type JdRecord, JdRepository } from '../infrastructure/jd.repository.js';

const ENTITY = jobDescriptionMachine.name;

/** HR edits and confirms while the campaign takes JDs (CONTEXT D28). */
const HR_PHASES: readonly CampaignStatus[] = ['INTAKE'];

interface Snapshot {
  requirements: JdRequirements | null;
  positionGroup: PositionGroup | null;
}

/**
 * Normalised requirements of a JD: read, edit and confirm (FR-10, US-2.3 AC-7 to AC-11, BR-02,
 * BR-11, BR-18, CONTEXT D35). HR reaches only its company's JDs (404 otherwise); the center reads
 * every JD and may version an approved one, but never confirms for HR. Who may do what is decided
 * by `decideRequirementsEdit`; every write is audited with the requirements before and after.
 */
@Injectable()
export class JdRequirementsService {
  private readonly logger = new Logger(JdRequirementsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly repository: JdRepository,
    private readonly transitions: StateTransitionService,
    private readonly audit: AuditService,
    private readonly campaigns: CampaignService,
    private readonly users: UserDirectory,
    private readonly notifications: NotificationService,
    private readonly events: EventEmitter2,
  ) {}

  /** AC-7, AC-9: the requirements next to what the caller may do with them. */
  async get(user: AuthUser, id: number): Promise<JdRequirementsView> {
    const record = assertRecordAccess(user, await this.repository.findById(id), ENTITY, id);
    const campaign = await this.campaigns.getSettings(record.campaignId);
    const edit = decideRequirementsEdit({ jdStatus: record.status, campaignStatus: campaign.status, editor: editorOf(user) });
    return this.view(record, await this.snapshot(record), edit);
  }

  /**
   * AC-11: before confirmation HR edits in place; on an approved JD every save is version + 1,
   * announced with `jd.requirements.versioned` after commit (BR-18). A save that changes nothing
   * writes nothing.
   */
  async save(user: AuthUser, id: number, body: SaveJdRequirementsRequest): Promise<JdRequirementsView> {
    const changed = await this.db.transaction(async (tx) => {
      const { record, edit } = await this.lockEditable(tx, user, id, body.rowVersion);
      const before = await this.snapshot(record, tx);
      const after = { requirements: body.requirements, positionGroup: body.positionGroup };
      if (isDeepStrictEqual(before, after)) return null;

      const versioned = edit.kind === 'NEW_VERSION';
      const version = versioned ? record.version + 1 : record.version;
      await this.repository.updateVersioned(tx, id, record.rowVersion, { ...after, version });
      await this.audit.record(tx, {
        actor: userActor(user),
        action: versioned ? COMPANY_AUDIT_ACTIONS.JD_REQUIREMENTS_VERSIONED : COMPANY_AUDIT_ACTIONS.JD_REQUIREMENTS_UPDATED,
        entity: ENTITY,
        entityId: id,
        before: { ...before, version: record.version, rowVersion: record.rowVersion },
        after: { ...after, version, rowVersion: record.rowVersion + 1 },
        ...(versioned ? { reason: 'Requirements of an approved JD changed (BR-18)' } : {}),
      });
      return versioned ? { record, toVersion: version } : null;
    });
    if (changed) await this.announceVersion(user, changed.record, changed.toVersion);
    return this.get(user, id);
  }

  /**
   * AC-8: stores the requirements HR confirms and moves the JD to PENDING_APPROVAL, in one
   * transaction with both audit entries. A stale row_version is a 409 and nothing is written.
   */
  async confirm(user: AuthUser, id: number, body: SaveJdRequirementsRequest): Promise<JdRequirementsView> {
    await this.db.transaction(async (tx) => {
      const { record, edit } = await this.lockEditable(tx, user, id, body.rowVersion);
      if (!canConfirm(edit, record.status)) {
        throw new JdRequirementsNotEditableError(id, record.status, REQUIREMENTS_REASON_CODES.NOT_AWAITING_CONFIRMATION);
      }
      const before = await this.snapshot(record, tx);
      const after = { requirements: body.requirements, positionGroup: body.positionGroup };
      await this.repository.updateVersioned(tx, id, record.rowVersion, after);
      await this.audit.record(tx, {
        actor: userActor(user),
        action: COMPANY_AUDIT_ACTIONS.JD_REQUIREMENTS_CONFIRMED,
        entity: ENTITY,
        entityId: id,
        before: { ...before, rowVersion: record.rowVersion },
        after: { ...after, rowVersion: record.rowVersion + 1 },
      });
      await this.transitions.transitionTo<JobDescriptionStatus>({
        lifecycle: jobDescriptionLifecycle,
        id,
        to: 'PENDING_APPROVAL',
        actor: userActor(user),
        reason: 'Requirements confirmed by HR',
        expectedRowVersion: record.rowVersion + 1,
        tx,
      });
    });
    return this.get(user, id);
  }

  /**
   * Locks the JD, then checks scope (404), row_version (409), what the caller may do (409 with a
   * reason code) and, for an in-place edit, the campaign phase and its deadline.
   */
  private async lockEditable(
    tx: DbTx,
    user: AuthUser,
    id: number,
    rowVersion: number,
  ): Promise<{ record: JdRecord; edit: RequirementsEdit }> {
    const record = assertRecordAccess(user, await this.repository.findById(id, { tx, lock: 'update' }), ENTITY, id);
    if (record.rowVersion !== rowVersion) throw new RowVersionConflictError(ENTITY, id, rowVersion, record.rowVersion);
    const campaign = await this.campaigns.getSettings(record.campaignId);
    const edit = decideRequirementsEdit({ jdStatus: record.status, campaignStatus: campaign.status, editor: editorOf(user) });
    if (edit.kind === 'FORBIDDEN') throw new JdRequirementsNotEditableError(id, record.status, edit.reasonCode);
    if (edit.kind === 'IN_PLACE') await this.campaigns.assertPhase(record.campaignId, HR_PHASES, { tx });
    return { record, edit };
  }

  /**
   * Stored requirements as the shared schema reads them. JDs written before 0.9.0 may hold an
   * older shape; they show as "no requirements" and HR enters them again (logged, not thrown).
   */
  private async snapshot(record: JdRecord, tx?: DbTx): Promise<Snapshot> {
    const { positionGroup } = record;
    const stored = await this.repository.findRequirements(record.id, tx ? { tx } : {});
    if (stored === null) return { requirements: null, positionGroup };
    const parsed = JdRequirementsSchema.safeParse(stored);
    if (!parsed.success) this.logger.warn(`JD ${record.id}: stored requirements do not match JdRequirements`);
    return { requirements: parsed.success ? parsed.data : null, positionGroup };
  }

  private view(record: JdRecord, snapshot: Snapshot, edit: RequirementsEdit): JdRequirementsView {
    return {
      jdId: record.id,
      status: record.status,
      version: record.version,
      rowVersion: record.rowVersion,
      analysisStatus: record.analysisStatus,
      hiddenTextDetected: record.hiddenTextFlag,
      requirements: snapshot.requirements,
      positionGroup: snapshot.positionGroup,
      editMode: editModeOf(edit),
      canConfirm: canConfirm(edit, record.status),
    };
  }

  /** After commit: EPIC-3 and EPIC-4 re-score and review (event); center staff are told (in app). */
  private async announceVersion(user: AuthUser, record: JdRecord, toVersion: number): Promise<void> {
    emitSafely(this.events, this.logger, JD_REQUIREMENTS_VERSIONED, {
      jdId: record.id,
      campaignId: record.campaignId,
      companyId: record.companyId,
      fromVersion: record.version,
      toVersion,
    } satisfies JdRequirementsVersionedEvent);
    try {
      const recipients = (await this.users.centerUserIds()).filter((userId) => userId !== user.userId);
      if (recipients.length === 0) return;
      await this.notifications.notify({
        type: 'JD_REQUIREMENTS_VERSIONED',
        payload: { jdId: record.id, jdTitle: record.title, companyName: record.companyName, version: toVersion },
        userIds: recipients,
        channels: ['IN_APP'],
        dedupeKey: `jd_requirements_version:${record.id}:v${toVersion}`,
      });
    } catch (error) {
      // The new version is committed; a lost notice must not turn the save into an error.
      this.logger.error(`JD ${record.id}: version ${toVersion} notice failed: ${errorMessage(error)}`);
    }
  }
}

function editorOf(user: AuthUser): RequirementsEditor {
  return user.role === 'HR' ? 'HR' : 'CENTER';
}
