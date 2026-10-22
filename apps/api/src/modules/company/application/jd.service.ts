import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  type CampaignStatus,
  type CreateJdRequest,
  type JdList,
  type JdListQuery,
  jobDescriptionMachine,
  type JobDescription,
  type JobDescriptionStatus,
  type UpdateJdRequest,
} from '@srm/shared';
import { and, eq } from 'drizzle-orm';
import { assertRecordAccess, type AuthUser, recordScopeWhere } from '../../../common/auth/index.js';
import {
  EntityNotFoundError,
  ForbiddenError,
  JdNotEditableError,
  RowVersionConflictError,
} from '../../../common/errors/index.js';
import { emitSafely } from '../../../common/events/index.js';
import { StateTransitionService, type TransitionResult } from '../../../common/state/index.js';
import {
  BUCKETS,
  detectDocument,
  displayFileName,
  FileAccessRegistry,
  type StoredFile,
  StorageService,
  type UploadedFileLike,
} from '../../../common/storage/index.js';
import { jobDescriptionLifecycle } from '../../../db/lifecycles.js';
import { jobDescriptions } from '../../../db/schema/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import { AuditService, userActor } from '../../audit/index.js';
import { CampaignService } from '../../campaign/index.js';
import { COMPANY_AUDIT_ACTIONS } from '../domain/audit-actions.js';
import { JD_APPROVED, JD_SUBMITTED, type JdEvent } from '../domain/events.js';
import { checkApprovable, checkSubmittable } from '../domain/jd-checks.js';
import { type JdChanges, type JdContent, type JdRecord, JdRepository } from '../infrastructure/jd.repository.js';

/** Audit and error entity, shared with transitionTo (the machine name). */
const ENTITY = jobDescriptionMachine.name;

/** HR posts, edits and submits JDs while the campaign takes them (PRD GĐ1, CONTEXT D28). */
const HR_PHASES: readonly CampaignStatus[] = ['INTAKE'];

/**
 * JDs: posting, editing, the original file and submission by HR; approval by the center (FR-4,
 * FR-5, US-1.5, CONTEXT D28). HR only ever reaches JDs of its own company: the company comes from
 * the token, and a JD of another company answers 404 (BR-11). Status changes go through
 * `transitionTo` (AD-8); events are published only after the transaction commits. No LLM here:
 * the analysis starts from `jd.submitted` (JdAnalysisService, US-2.3).
 */
@Injectable()
export class JdService implements OnModuleInit {
  private readonly logger = new Logger(JdService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly repository: JdRepository,
    private readonly transitions: StateTransitionService,
    private readonly audit: AuditService,
    private readonly campaigns: CampaignService,
    private readonly storage: StorageService,
    private readonly files: FileAccessRegistry,
    private readonly events: EventEmitter2,
  ) {}

  onModuleInit(): void {
    this.files.register('jd', (user, id) => this.fileOf(user, id));
  }

  /**
   * AC-4: a new JD of the caller's company, DRAFT, version 1, while the campaign is in INTAKE. A
   * campaign HR cannot see (still DRAFT) answers 404 like a missing one, not 409 with its status
   * (CONTEXT D27).
   */
  async create(user: AuthUser, input: CreateJdRequest): Promise<JobDescription> {
    const companyId = hrCompanyId(user);
    await this.campaigns.get(user, input.campaignId);
    const id = await this.db.transaction(async (tx) => {
      await this.campaigns.assertPhase(input.campaignId, HR_PHASES, { tx });
      const content = contentOf(input);
      const created = await this.repository.insert(tx, { ...content, campaignId: input.campaignId, companyId });
      await this.audit.record(tx, {
        actor: userActor(user),
        action: COMPANY_AUDIT_ACTIONS.JD_CREATED,
        entity: ENTITY,
        entityId: created,
        after: { ...content, campaignId: input.campaignId, companyId },
      });
      return created;
    });
    return this.get(user, id);
  }

  /** AC-8: HR sees its company's JDs only; the center sees all. Newest first. */
  async list(user: AuthUser, query: JdListQuery): Promise<JdList> {
    const where = and(
      recordScopeWhere(user, { companyId: jobDescriptions.companyId }),
      query.campaignId === undefined ? undefined : eq(jobDescriptions.campaignId, query.campaignId),
      query.status === undefined ? undefined : eq(jobDescriptions.status, query.status),
    );
    return { items: (await this.repository.list(where)).map(toJobDescription) };
  }

  async get(user: AuthUser, id: number): Promise<JobDescription> {
    return toJobDescription(assertRecordAccess(user, await this.repository.findById(id), ENTITY, id));
  }

  /** AC-6: edits a draft; fields left out keep their value. Stale row_version or not a draft: 409. */
  async update(user: AuthUser, id: number, patch: UpdateJdRequest): Promise<JobDescription> {
    await this.db.transaction(async (tx) => {
      const before = await this.lockEditable(tx, user, id, patch.rowVersion);
      const after: JdContent = { ...contentFromRecord(before), ...changedContent(patch) };
      if (isDeepStrictEqual(after, contentFromRecord(before))) return;
      await this.repository.updateVersioned(tx, id, before.rowVersion, after);
      await this.audit.record(tx, {
        actor: userActor(user),
        action: COMPANY_AUDIT_ACTIONS.JD_UPDATED,
        entity: ENTITY,
        entityId: id,
        before: { ...contentFromRecord(before), rowVersion: before.rowVersion },
        after: { ...after, rowVersion: before.rowVersion + 1 },
      });
    });
    return this.get(user, id);
  }

  /**
   * AC-5: stores the original PDF/DOCX in `jd-files` (SSE-S3) and records its key. The type comes
   * from the content (415 otherwise); multer has already refused anything over 5 MB (413). Access,
   * state and version are checked before the upload, so nothing is written for a request that
   * cannot succeed, and again in the transaction. A failed transaction deletes the new object; a
   * replaced file is deleted after commit.
   */
  async attachFile(user: AuthUser, id: number, rowVersion: number, file: UploadedFileLike): Promise<JobDescription> {
    const current = this.checkEditable(user, id, rowVersion, await this.repository.findById(id));
    await this.campaigns.assertPhase(current.campaignId, HR_PHASES);
    const document = await detectDocument(file.buffer);
    const fileName = displayFileName(file.originalname, document.ext);
    const key = `jd/${id}/${randomUUID()}.${document.ext}`;
    await this.storage.put(BUCKETS.JD_FILES, key, file.buffer, document.mime);

    let replacedKey: string | null;
    try {
      replacedKey = await this.db.transaction(async (tx) => {
        const before = await this.lockEditable(tx, user, id, rowVersion);
        const changes: JdChanges = { fileKey: key, fileName };
        await this.repository.updateVersioned(tx, id, before.rowVersion, changes);
        await this.audit.record(tx, {
          actor: userActor(user),
          action: COMPANY_AUDIT_ACTIONS.JD_FILE_ATTACHED,
          entity: ENTITY,
          entityId: id,
          before: { fileName: before.fileName, rowVersion: before.rowVersion },
          after: { fileName, size: file.size, type: document.ext, rowVersion: before.rowVersion + 1 },
        });
        return before.fileKey;
      });
    } catch (error) {
      await this.storage.deleteQuietly(BUCKETS.JD_FILES, key);
      throw error;
    }
    if (replacedKey) await this.storage.deleteQuietly(BUCKETS.JD_FILES, replacedKey);
    return this.get(user, id);
  }

  /**
   * AC-6: DRAFT → PENDING_HR_CONFIRMATION, and the analysis is awaited from the same transaction
   * (US-2.3 AC-1, CONTEXT D28, D35); the job is dispatched after commit, on `jd.submitted`.
   */
  async submit(user: AuthUser, id: number, rowVersion: number): Promise<JobDescription> {
    // Out-of-scope JDs answer 404 before transitionTo can reveal their state.
    assertRecordAccess(user, await this.repository.findById(id), ENTITY, id);
    const result = await this.db.transaction(async (tx) => {
      const moved = await this.transitions.transitionTo<JobDescriptionStatus>({
        lifecycle: jobDescriptionLifecycle,
        id,
        to: 'PENDING_HR_CONFIRMATION',
        actor: userActor(user),
        reason: 'JD submitted by HR',
        expectedRowVersion: rowVersion,
        guard: async (_row, guardTx) => {
          const record = await this.requireRecord(id, guardTx);
          await this.campaigns.assertPhase(record.campaignId, HR_PHASES, { tx: guardTx });
          return checkSubmittable(record);
        },
        tx,
      });
      await this.repository.updateVersioned(tx, id, moved.rowVersion, { analysisStatus: 'PENDING' });
      return { ...moved, rowVersion: moved.rowVersion + 1 };
    });
    return this.publishAndGet(user, JD_SUBMITTED, result);
  }

  /** AC-7: PENDING_APPROVAL → APPROVED by the center, once HR has confirmed requirements (BR-02). */
  async approve(user: AuthUser, id: number, rowVersion: number): Promise<JobDescription> {
    const result = await this.transitions.transitionTo<JobDescriptionStatus>({
      lifecycle: jobDescriptionLifecycle,
      id,
      to: 'APPROVED',
      actor: userActor(user),
      reason: 'JD approved by the center',
      expectedRowVersion: rowVersion,
      guard: async (_row, tx) => checkApprovable(await this.requireRecord(id, tx)),
    });
    return this.publishAndGet(user, JD_APPROVED, result);
  }

  /** The original file of a JD the caller may see, for `GET /api/files/jd:{id}/url` (AC-9). */
  private async fileOf(user: AuthUser, id: number): Promise<StoredFile> {
    const record = assertRecordAccess(user, await this.repository.findById(id), ENTITY, id);
    if (!record.fileKey || !record.fileName) throw new EntityNotFoundError('file', id);
    return { bucket: BUCKETS.JD_FILES, key: record.fileKey, fileName: record.fileName };
  }

  /** Locks the JD and checks scope, version, state and campaign phase, in that order. */
  private async lockEditable(tx: DbTx, user: AuthUser, id: number, rowVersion: number): Promise<JdRecord> {
    const record = this.checkEditable(user, id, rowVersion, await this.repository.findById(id, { tx, lock: 'update' }));
    await this.campaigns.assertPhase(record.campaignId, HR_PHASES, { tx });
    return record;
  }

  private checkEditable(user: AuthUser, id: number, rowVersion: number, found: JdRecord | undefined): JdRecord {
    const record = assertRecordAccess(user, found, ENTITY, id);
    if (record.rowVersion !== rowVersion) throw new RowVersionConflictError(ENTITY, id, rowVersion, record.rowVersion);
    if (record.status !== 'DRAFT') throw new JdNotEditableError(id, record.status);
    return record;
  }

  private async requireRecord(id: number, tx: DbTx): Promise<JdRecord> {
    const record = await this.repository.findById(id, { tx });
    if (!record) throw new EntityNotFoundError(ENTITY, id);
    return record;
  }

  private async publishAndGet(
    user: AuthUser,
    event: string,
    result: TransitionResult<JobDescriptionStatus>,
  ): Promise<JobDescription> {
    const jd = await this.get(user, result.id);
    emitSafely(this.events, this.logger, event, {
      jdId: jd.id,
      campaignId: jd.campaignId,
      companyId: jd.companyId,
      version: jd.version,
    } satisfies JdEvent);
    return jd;
  }
}

/** Write endpoints are HR-only (controller); the company always comes from the token (AC-4). */
function hrCompanyId(user: AuthUser): number {
  if (user.role !== 'HR') throw new ForbiddenError('Only HR accounts post JDs');
  return user.companyId;
}

type ContentInput = Pick<
  CreateJdRequest,
  'title' | 'quota' | 'location' | 'workMode' | 'internshipPeriod' | 'allowance' | 'description'
>;

/** Request fields to stored columns; empty optional texts become null. */
function contentOf(input: ContentInput): JdContent {
  return {
    title: input.title,
    quota: input.quota,
    location: input.location,
    workMode: input.workMode,
    internshipPeriod: input.internshipPeriod,
    allowance: input.allowance ? input.allowance : null,
    rawText: input.description ? input.description : null,
  };
}

function contentFromRecord(record: JdRecord): JdContent {
  return {
    title: record.title,
    quota: record.quota,
    location: record.location,
    workMode: record.workMode,
    internshipPeriod: record.internshipPeriod,
    allowance: record.allowance,
    rawText: record.rawText,
  };
}

/** Only the columns a patch sets; keys left out keep the stored value. */
function changedContent(patch: UpdateJdRequest): Partial<JdContent> {
  const changes: Partial<JdContent> = {};
  if (patch.title !== undefined) changes.title = patch.title;
  if (patch.quota !== undefined) changes.quota = patch.quota;
  if (patch.location !== undefined) changes.location = patch.location;
  if (patch.workMode !== undefined) changes.workMode = patch.workMode;
  if (patch.internshipPeriod !== undefined) changes.internshipPeriod = patch.internshipPeriod;
  if (patch.allowance !== undefined) changes.allowance = patch.allowance ? patch.allowance : null;
  if (patch.description !== undefined) changes.rawText = patch.description ? patch.description : null;
  return changes;
}

function toJobDescription(record: JdRecord): JobDescription {
  return {
    id: record.id,
    campaignId: record.campaignId,
    companyId: record.companyId,
    companyName: record.companyName,
    title: record.title,
    quota: record.quota,
    location: record.location,
    workMode: record.workMode,
    internshipPeriod: record.internshipPeriod,
    allowance: record.allowance,
    description: record.rawText,
    file: record.fileName ? { name: record.fileName } : null,
    status: record.status,
    version: record.version,
    rowVersion: record.rowVersion,
    requirementsReady: record.requirementsReady,
    positionGroup: record.positionGroup,
    analysisStatus: record.analysisStatus,
    hiddenTextDetected: record.hiddenTextFlag,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
