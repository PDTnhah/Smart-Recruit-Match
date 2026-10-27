import { isDeepStrictEqual } from 'node:util';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type CampaignStatus,
  CURRENT_TERMS,
  cvMachine,
  type CvProfile,
  type CvProfileView,
  type CvStatus,
  type ReopenCvProfileRequest,
  type SaveCvProfileRequest,
} from '@srm/shared';
import { ZodError } from 'zod';
import type { AuthUser } from '../../../common/auth/index.js';
import { loadEnv } from '../../../common/config/env.js';
import {
  CampaignPhaseMismatchError,
  ConsentRequiredError,
  CvProfileNotEditableError,
  EntityNotFoundError,
  errorMessage,
  RowVersionConflictError,
  ValidationFailedError,
} from '../../../common/errors/index.js';
import { StateTransitionService } from '../../../common/state/index.js';
import { validationIssues } from '../../../common/validation/validation-issues.js';
import { cvLifecycle } from '../../../db/lifecycles.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import { AuditService, userActor } from '../../audit/index.js';
import { CampaignService } from '../../campaign/index.js';
import { NewSkillsService, SkillCatalogService } from '../../skills/index.js';
import { STUDENT_AUDIT_ACTIONS } from '../domain/audit-actions.js';
import { findPii, maskProfile, stringsOf } from '../domain/mask-profile.js';
import { newSkillNames, normalizeProfileSkills, profileActions } from '../domain/profile-editing.js';
import { type CvProfileRecord, CvRepository } from '../infrastructure/cv.repository.js';
import { ConsentService } from './consent.service.js';
import { studentIdOf } from './current-student.js';

const ENTITY = cvMachine.name;

/** The student reviews the profile while the campaign takes CVs, as for uploads (CONTEXT D27). */
const PROFILE_PHASES: readonly CampaignStatus[] = ['INTAKE'];

const TOO_LONG_ONCE_MASKED =
  'Ô này vượt giới hạn độ dài khi thông tin cá nhân được thay bằng nhãn như [NAME]. Rút ngắn một chút.';

/**
 * The student's review of the profile the CV Parser read (FR-11, US-2.6, BR-01, BR-03, CONTEXT
 * D40): read, save as a draft, confirm, and "Sửa lại" after confirming. Only the student's own
 * active version, before `intake_end`. Every save maps the skills to the catalogue again and
 * rebuilds `profile_masked` from the personal data, decrypted in the transaction; confirming
 * moves the CV to CONFIRMED with `transitionTo`, which puts it in core.v_ai_cv_profile_masked.
 * Audit entries hold section sizes, never profile text (NFR-2).
 */
@Injectable()
export class CvProfileService {
  private readonly logger = new Logger(CvProfileService.name);
  private readonly piiKey = loadEnv().PII_ENCRYPTION_KEY;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly repository: CvRepository,
    private readonly campaigns: CampaignService,
    private readonly audit: AuditService,
    private readonly transitions: StateTransitionService,
    private readonly catalogue: SkillCatalogService,
    private readonly newSkills: NewSkillsService,
    private readonly consents: ConsentService,
  ) {}

  /** AC-1, AC-10: the active version in the campaign, with what the student may do with it. */
  async get(user: AuthUser, campaignId: number): Promise<CvProfileView> {
    const cv = await this.repository.findActiveProfile(studentIdOf(user), campaignId);
    if (!cv) throw new EntityNotFoundError(`${ENTITY} of campaign`, campaignId);
    return toView(cv, profileActions(cv, await this.intakeOpen(campaignId)));
  }

  /** AC-4: stores the edited profile; the CV keeps awaiting confirmation. No change, no write. */
  async save(user: AuthUser, body: SaveCvProfileRequest): Promise<CvProfileView> {
    const campaignId = await this.store(user, body, false);
    return this.get(user, campaignId);
  }

  /**
   * AC-5: stores the profile and moves the CV to CONFIRMED in one transaction, with both audit
   * entries. After commit, skills typed outside the catalogue go to ADMIN's review queue.
   */
  async confirm(user: AuthUser, body: SaveCvProfileRequest): Promise<CvProfileView> {
    const campaignId = await this.store(user, body, true);
    return this.get(user, campaignId);
  }

  /**
   * AC-12: a new version copying the confirmed one (file, profile, personal data), awaiting
   * confirmation again; the confirmed version loses `active`, as with an upload (BR-01). No AI
   * job: the profile is already read. Until the student confirms again, matching skips the CV.
   * Like an upload, the new version needs consent to the current terms (403 otherwise).
   */
  async reopen(user: AuthUser, body: ReopenCvProfileRequest): Promise<CvProfileView> {
    const studentId = studentIdOf(user);
    const campaignId = await this.db.transaction(async (tx) => {
      const cv = await this.lockOwn(tx, studentId, body.cvId, body.rowVersion);
      if (!profileActions(cv, true).canReopen) throw new CvProfileNotEditableError(cv.id, cv.status, cv.active);
      if (!(await this.consents.hasConsent(studentId, cv.campaignId))) {
        throw new ConsentRequiredError(cv.campaignId, CURRENT_TERMS.version);
      }

      const version = (await this.repository.latestVersion(tx, studentId, cv.campaignId)) + 1;
      await this.repository.deactivate(tx, cv.id);
      await this.audit.record(tx, {
        actor: userActor(user),
        action: STUDENT_AUDIT_ACTIONS.CV_SUPERSEDED,
        entity: ENTITY,
        entityId: cv.id,
        before: { active: true, version: cv.version },
        after: { active: false, supersededByVersion: version },
      });
      const row = await this.repository.insertReopened(tx, cv.id, version);
      await this.transitions.transitionTo<CvStatus>({
        lifecycle: cvLifecycle,
        id: row.id,
        to: 'PENDING_CONFIRMATION',
        actor: userActor(user),
        reason: `Reopened from confirmed version ${cv.version}`,
        expectedRowVersion: row.rowVersion,
        tx,
      });
      await this.audit.record(tx, {
        actor: userActor(user),
        action: STUDENT_AUDIT_ACTIONS.CV_PROFILE_REOPENED,
        entity: ENTITY,
        entityId: row.id,
        after: { campaignId: cv.campaignId, version, fromVersion: cv.version, status: 'PENDING_CONFIRMATION', active: true },
      });
      return cv.campaignId;
    });
    return this.get(user, campaignId);
  }

  /** Draft or confirmation; returns the campaign of the CV. */
  private async store(user: AuthUser, body: SaveCvProfileRequest, confirm: boolean): Promise<number> {
    const studentId = studentIdOf(user);
    // Read before the transaction: the catalogue belongs to the skills module.
    const catalogue = await this.catalogue.matchKeys(body.profile.skills.map((skill) => skill.name));
    const stored = await this.db.transaction(async (tx) => {
      const cv = await this.lockOwn(tx, studentId, body.cvId, body.rowVersion);
      if (!profileActions(cv, true).editable) throw new CvProfileNotEditableError(cv.id, cv.status, cv.active);

      const profile: CvProfile = {
        ...body.profile,
        skills: normalizeProfileSkills(body.profile.skills, cv.profile?.skills ?? [], catalogue),
      };
      if (!confirm && isDeepStrictEqual(profile, cv.profile)) return { campaignId: cv.campaignId, newSkills: [] };

      const profileMasked = await this.masked(tx, cv.id, profile);
      await this.repository.storeProfile(tx, cv.id, cv.rowVersion, profile, profileMasked);
      const newSkills = newSkillNames(profileMasked);
      await this.audit.record(tx, {
        actor: userActor(user),
        action: STUDENT_AUDIT_ACTIONS.CV_PROFILE_SAVED,
        entity: ENTITY,
        entityId: cv.id,
        before: { status: cv.status, rowVersion: cv.rowVersion },
        after: { version: cv.version, rowVersion: cv.rowVersion + 1, confirm, sections: sizesOf(profile), newSkills: newSkills.length },
      });
      if (confirm) {
        await this.transitions.transitionTo<CvStatus>({
          lifecycle: cvLifecycle,
          id: cv.id,
          to: 'CONFIRMED',
          actor: userActor(user),
          reason: 'Profile confirmed by the student',
          expectedRowVersion: cv.rowVersion + 1,
          tx,
        });
      }
      return { campaignId: cv.campaignId, newSkills: confirm ? newSkills : [] };
    });
    if (stored.newSkills.length > 0) await this.proposeSkills(stored.newSkills);
    return stored.campaignId;
  }

  /**
   * Locks the student's CV version and checks, in this order: it is theirs (404 otherwise, AC-9),
   * the campaign still takes CVs (409 CAMPAIGN_PHASE_MISMATCH, AC-8; the campaign row is read FOR
   * SHARE until commit), and `rowVersion` is current (409, AC-6). A version replaced by an upload
   * has a newer row_version (`deactivate` bumps it), so the screen reloads.
   */
  private async lockOwn(tx: DbTx, studentId: number, cvId: number, rowVersion: number): Promise<CvProfileRecord> {
    const cv = await this.repository.lockForProfile(tx, cvId);
    if (!cv || cv.studentId !== studentId) throw new EntityNotFoundError(ENTITY, cvId);
    await this.campaigns.assertPhase(cv.campaignId, PROFILE_PHASES, { tx });
    if (cv.rowVersion !== rowVersion) throw new RowVersionConflictError(ENTITY, cvId, rowVersion, cv.rowVersion);
    return cv;
  }

  /**
   * `profile_masked` of the edited profile (BR-03). A token can be longer than the value it
   * replaces ("Huế" → [HOMETOWN]), so a text near its limit can go over it once masked: 400 on
   * that field, for the student to shorten. Anything the final check still finds fails the save:
   * the message names the kinds only, never the values.
   */
  private async masked(tx: DbTx, cvId: number, profile: CvProfile): Promise<CvProfile> {
    const pii = await this.repository.readPii(tx, cvId, this.piiKey);
    // CHECK cvs_analysed_check: a CV awaiting confirmation always has its personal data.
    if (!pii) throw new Error(`CV ${cvId}: no personal data stored`);
    let masked: CvProfile;
    try {
      masked = maskProfile(profile, pii);
    } catch (error) {
      if (!(error instanceof ZodError)) throw error;
      const issues = validationIssues(error, 'profile').map(({ path }) => ({ path, message: TOO_LONG_ONCE_MASKED }));
      throw new ValidationFailedError(issues);
    }
    const left = [...new Set(stringsOf(masked).flatMap((text) => findPii(text, pii)))].sort();
    if (left.length > 0) throw new Error(`CV ${cvId}: personal data left after masking: ${left.join(', ')}`);
    return masked;
  }

  /** After commit; a failure leaves the skills NEW in the profile and is only logged. */
  private async proposeSkills(names: string[]): Promise<void> {
    try {
      await this.newSkills.proposeFromStudentProfile(names);
    } catch (error) {
      this.logger.error(`${names.length} new skill(s) not queued for review: ${errorMessage(error)}`);
    }
  }

  private async intakeOpen(campaignId: number): Promise<boolean> {
    try {
      await this.campaigns.assertPhase(campaignId, PROFILE_PHASES);
      return true;
    } catch (error) {
      if (error instanceof CampaignPhaseMismatchError) return false;
      throw error;
    }
  }
}

/** How many entries each section has: what the audit entry may say about the profile. */
function sizesOf(profile: CvProfile): Record<string, number> {
  return {
    summary: profile.summary === null ? 0 : 1,
    education: profile.education.length,
    skills: profile.skills.length,
    projects: profile.projects.length,
    experience: profile.experience.length,
    languages: profile.languages.length,
    certificates: profile.certificates.length,
  };
}

function toView(cv: CvProfileRecord, actions: { editable: boolean; canReopen: boolean }): CvProfileView {
  return {
    cvId: cv.id,
    campaignId: cv.campaignId,
    version: cv.version,
    status: cv.status,
    rowVersion: cv.rowVersion,
    fileName: cv.fileName,
    profile: cv.profile,
    ...actions,
  };
}
