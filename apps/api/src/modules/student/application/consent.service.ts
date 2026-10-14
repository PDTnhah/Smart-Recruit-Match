import { Inject, Injectable } from '@nestjs/common';
import {
  type AcceptConsentRequest,
  type CampaignStatus,
  type Consent,
  type ConsentList,
  CURRENT_TERMS,
} from '@srm/shared';
import type { AuthUser } from '../../../common/auth/index.js';
import { Clock } from '../../../common/clock/index.js';
import { TermsOutdatedError } from '../../../common/errors/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import { AuditService, userActor } from '../../audit/index.js';
import { CampaignService } from '../../campaign/index.js';
import { CONSENT_ENTITY, STUDENT_AUDIT_ACTIONS } from '../domain/audit-actions.js';
import { termsSha256 } from '../domain/terms.js';
import { type ConsentRecord, ConsentRepository } from '../infrastructure/consent.repository.js';
import { studentIdOf } from './current-student.js';

/** Students consent while the campaign takes CVs, its first phase they can see (CONTEXT D27, D30). */
const CONSENT_PHASES: readonly CampaignStatus[] = ['INTAKE'];

/**
 * Consent to the data-processing terms (NFR-2, US-1.6 AC-1, CONTEXT D30): per campaign and per
 * terms version, with the SHA-256 of the exact text. Nothing of a student is processed for a
 * campaign before `hasConsent` is true for it.
 */
@Injectable()
export class ConsentService {
  private readonly currentSha256 = termsSha256(CURRENT_TERMS);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly repository: ConsentRepository,
    private readonly campaigns: CampaignService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  async list(user: AuthUser): Promise<ConsentList> {
    const rows = await this.repository.listByStudent(studentIdOf(user));
    return { currentTermsVersion: CURRENT_TERMS.version, items: rows.map(toConsent) };
  }

  /**
   * AC-1: records the student, campaign, terms version and time, with an audit entry. A campaign
   * the student cannot see answers 404; accepting again returns the first record unchanged.
   */
  async accept(user: AuthUser, request: AcceptConsentRequest): Promise<Consent> {
    const studentId = studentIdOf(user);
    await this.campaigns.get(user, request.campaignId);
    // The page the student read was stale: they must see the current text before accepting it.
    if (request.termsVersion !== CURRENT_TERMS.version) {
      throw new TermsOutdatedError(request.termsVersion, CURRENT_TERMS.version);
    }
    const record = await this.db.transaction(async (tx) => {
      await this.campaigns.assertPhase(request.campaignId, CONSENT_PHASES, { tx });
      const existing = await this.repository.find(studentId, request.campaignId, CURRENT_TERMS.version, tx);
      if (existing) return existing;
      const created = await this.repository.insert(tx, {
        studentId,
        campaignId: request.campaignId,
        termsVersion: CURRENT_TERMS.version,
        termsSha256: this.currentSha256,
        acceptedAt: this.clock.now(),
      });
      // A concurrent accept committed the same consent first; the insert waited for it.
      if (!created) return this.requireConsent(tx, studentId, request.campaignId);
      await this.audit.record(tx, {
        actor: userActor(user),
        action: STUDENT_AUDIT_ACTIONS.CONSENT_ACCEPTED,
        entity: CONSENT_ENTITY,
        entityId: created.id,
        after: {
          campaignId: created.campaignId,
          termsVersion: created.termsVersion,
          termsSha256: created.termsSha256,
          acceptedAt: created.acceptedAt.toISOString(),
        },
      });
      return created;
    });
    return toConsent(record);
  }

  /** AC-2: the student accepted the current terms version for the campaign. */
  async hasConsent(studentId: number, campaignId: number): Promise<boolean> {
    return (await this.repository.find(studentId, campaignId, CURRENT_TERMS.version)) !== undefined;
  }

  private async requireConsent(tx: DbTx, studentId: number, campaignId: number): Promise<ConsentRecord> {
    const record = await this.repository.find(studentId, campaignId, CURRENT_TERMS.version, tx);
    if (!record) throw new Error(`consent of student ${studentId} for campaign ${campaignId} vanished`);
    return record;
  }
}

function toConsent(record: ConsentRecord): Consent {
  return {
    campaignId: record.campaignId,
    termsVersion: record.termsVersion,
    acceptedAt: record.acceptedAt.toISOString(),
  };
}
