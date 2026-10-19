import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { type CampaignStatus, CURRENT_TERMS, type Cv, type CvList, type CvListQuery, cvMachine } from '@srm/shared';
import { assertRecordAccess, type AuthUser } from '../../../common/auth/index.js';
import { ConsentRequiredError } from '../../../common/errors/index.js';
import { emitSafely } from '../../../common/events/index.js';
import {
  BUCKETS,
  detectDocument,
  displayFileName,
  FileAccessRegistry,
  type StoredFile,
  StorageService,
  type UploadedFileLike,
} from '../../../common/storage/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database } from '../../../db/types.js';
import { AuditService, userActor } from '../../audit/index.js';
import { CampaignService } from '../../campaign/index.js';
import { STUDENT_AUDIT_ACTIONS } from '../domain/audit-actions.js';
import { CV_SUBMITTED, type CvSubmittedEvent } from '../domain/events.js';
import { type CvRecord, CvRepository } from '../infrastructure/cv.repository.js';
import { ConsentService } from './consent.service.js';
import { studentIdOf } from './current-student.js';

/** Audit and error entity, shared with transitionTo (the machine name). */
const ENTITY = cvMachine.name;

/** Students submit and update CVs while the campaign takes them (PRD GĐ2, CONTEXT D27). */
const SUBMIT_PHASES: readonly CampaignStatus[] = ['INTAKE'];

/**
 * CV submission (FR-6, US-1.6, CONTEXT D30). Every upload is a new `cvs` row with the next version;
 * the previous one loses `active` in the same transaction, so one CV per student and campaign
 * counts (BR-01, backed by a partial unique index). The student always comes from the token. No
 * LLM here and no reading of the CV: analysis starts in US-2.4 from `cv.submitted`.
 */
@Injectable()
export class CvService implements OnModuleInit {
  private readonly logger = new Logger(CvService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly repository: CvRepository,
    private readonly consents: ConsentService,
    private readonly campaigns: CampaignService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly files: FileAccessRegistry,
    private readonly events: EventEmitter2,
  ) {}

  onModuleInit(): void {
    this.files.register('cv', (user, id) => this.fileOf(user, id));
  }

  /**
   * AC-3…AC-7. Checked before anything is stored, in this order: the campaign is visible to the
   * student (404, a DRAFT one too), in INTAKE before `intake_end` (409), consent to the current
   * terms (403), real PDF/DOCX content (415); multer has already refused anything over 5 MB (413).
   * The phase is checked again in the transaction. A failed transaction deletes the new object;
   * files of older versions stay (AC-5).
   */
  async submit(user: AuthUser, campaignId: number, file: UploadedFileLike): Promise<Cv> {
    const studentId = studentIdOf(user);
    await this.campaigns.get(user, campaignId);
    await this.campaigns.assertPhase(campaignId, SUBMIT_PHASES);
    if (!(await this.consents.hasConsent(studentId, campaignId))) {
      throw new ConsentRequiredError(campaignId, CURRENT_TERMS.version);
    }
    const document = await detectDocument(file.buffer);
    const fileName = displayFileName(file.originalname, document.ext);
    const key = `cv/${studentId}/${campaignId}/${randomUUID()}.${document.ext}`;
    await this.storage.put(BUCKETS.CV_FILES, key, file.buffer, document.mime);

    let created: CvRecord;
    try {
      created = await this.db.transaction(async (tx) => {
        await this.campaigns.assertPhase(campaignId, SUBMIT_PHASES, { tx });
        const previous = await this.repository.lockActive(tx, studentId, campaignId);
        const version = (await this.repository.latestVersion(tx, studentId, campaignId)) + 1;
        if (previous) {
          await this.repository.deactivate(tx, previous.id);
          await this.audit.record(tx, {
            actor: userActor(user),
            action: STUDENT_AUDIT_ACTIONS.CV_SUPERSEDED,
            entity: ENTITY,
            entityId: previous.id,
            before: { active: true, version: previous.version },
            after: { active: false, supersededByVersion: version },
          });
        }
        const row = await this.repository.insert(tx, { studentId, campaignId, fileKey: key, fileName, version });
        await this.audit.record(tx, {
          actor: userActor(user),
          action: STUDENT_AUDIT_ACTIONS.CV_SUBMITTED,
          entity: ENTITY,
          entityId: row.id,
          // No file name: students often put their full name in it, and audit_logs is append-only
          // while personal data must be deletable after the retention period (NFR-2, CONTEXT D30).
          after: { campaignId, version, size: file.size, type: document.ext, status: row.status, active: true },
        });
        return row;
      });
    } catch (error) {
      await this.storage.deleteQuietly(BUCKETS.CV_FILES, key);
      throw error;
    }

    emitSafely(this.events, this.logger, CV_SUBMITTED, {
      cvId: created.id,
      cvVersion: created.version,
      campaignId,
      studentId,
    } satisfies CvSubmittedEvent);
    return toCv(created);
  }

  /**
   * Students who have a CV that counts in the campaign, for other modules; the CV deadline
   * reminder skips them (US-1.7 AC-6).
   */
  async studentIdsWithActiveCv(campaignId: number): Promise<number[]> {
    return this.repository.studentIdsWithActive(campaignId);
  }

  /** AC-8: the caller's own versions, newest first. */
  async listMine(user: AuthUser, query: CvListQuery): Promise<CvList> {
    const rows = await this.repository.listByStudent(studentIdOf(user), query.campaignId);
    return { items: rows.map(toCv) };
  }

  /**
   * The file of a CV version the caller may see, for `GET /api/files/cv:{id}/url` (AC-8): its
   * student, CENTER and ADMIN. HR gets 404 (a CV has no company) until nominations, US-5.3.
   */
  private async fileOf(user: AuthUser, id: number): Promise<StoredFile> {
    const record = assertRecordAccess(user, await this.repository.findById(id), ENTITY, id);
    return { bucket: BUCKETS.CV_FILES, key: record.fileKey, fileName: record.fileName };
  }
}

function toCv(record: CvRecord): Cv {
  return {
    id: record.id,
    campaignId: record.campaignId,
    version: record.version,
    status: record.status,
    active: record.active,
    fileName: record.fileName,
    createdAt: record.createdAt.toISOString(),
  };
}
