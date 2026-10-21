import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  jobDescriptionMachine,
  type JdAnalysisEvent,
  type JdRequirements,
  JdRequirementsSchema,
  type PositionGroup,
  SERVER_EVENTS,
} from '@srm/shared';
import { errorMessage } from '../../../common/errors/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database } from '../../../db/types.js';
import { AI_RESULT_EVENTS, AiGatewayService, type AiResultEvent } from '../../aigateway/index.js';
import { AuditService, SYSTEM_ACTOR } from '../../audit/index.js';
import { UserDirectory } from '../../iam/index.js';
import { NotificationService, type PendingNotifications, RealtimePublisher } from '../../notification/index.js';
import { COMPANY_AUDIT_ACTIONS } from '../domain/audit-actions.js';
import { JD_SUBMITTED, type JdEvent } from '../domain/events.js';
import { decideAnalysisResult } from '../domain/jd-analysis.js';
import { JdRepository } from '../infrastructure/jd.repository.js';

const ENTITY = jobDescriptionMachine.name;

/** What a settled analysis brings: the proposal, or why there is none. */
type AnalysisOutcome =
  | {
      kind: 'SUCCEEDED';
      jobId: string;
      requirements: JdRequirements;
      positionGroup: PositionGroup;
      model: string;
      promptVersion: string;
      hiddenTextDetected: boolean;
    }
  | { kind: 'FAILED'; jobId: string | null; code: string; hiddenTextDetected: boolean };

/**
 * The AI analysis of a submitted JD (US-2.3 AC-1, AC-4 to AC-6, CONTEXT D28, D33, D35). The JD
 * Analyzer only proposes: a result stores the requirements, position group, hidden-text flag,
 * model and prompt, never the JD's state; HR reviews and confirms them (JdRequirementsService).
 * HR of the company is told either way, in the app, and the JD page refreshes over SSE.
 */
@Injectable()
export class JdAnalysisService {
  private readonly logger = new Logger(JdAnalysisService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly repository: JdRepository,
    private readonly audit: AuditService,
    private readonly aiGateway: AiGatewayService,
    private readonly users: UserDirectory,
    private readonly notifications: NotificationService,
    private readonly realtime: RealtimePublisher,
  ) {}

  /**
   * AC-1: the submission has committed with `analysis_status = PENDING`; send the job. A broker
   * that stays unreachable fails the analysis at once, so HR can enter the requirements by hand
   * instead of waiting for a job that was never sent (CONTEXT D35; no outbox, D33).
   */
  @OnEvent(JD_SUBMITTED, { async: true })
  async dispatch(event: JdEvent): Promise<void> {
    try {
      await this.aiGateway.dispatch('JD_ANALYZE', { jd_id: event.jdId, jd_version: event.version });
    } catch (error) {
      this.logger.error(`JD ${event.jdId} v${event.version}: analysis not dispatched: ${errorMessage(error)}`);
      try {
        await this.settle(event.jdId, event.version, {
          kind: 'FAILED',
          jobId: null,
          code: 'DISPATCH_FAILED',
          hiddenTextDetected: false,
        });
      } catch (settleError) {
        this.logger.error(`JD ${event.jdId}: could not record the failed dispatch: ${errorMessage(settleError)}`);
      }
    }
  }

  /**
   * AC-4 to AC-6, listener convention of aigateway/domain/events.ts: awaited by the consumer, so a
   * database failure is retried once and then dead-lettered. Duplicates, stale versions and late
   * results return quietly through `decideAnalysisResult`.
   */
  @OnEvent(AI_RESULT_EVENTS.JD_ANALYZE, { suppressErrors: false })
  async apply(result: AiResultEvent<'JD_ANALYZE'>): Promise<void> {
    await this.settle(result.job.jd_id, result.job.jd_version, outcomeOf(result));
  }

  private async settle(jdId: number, version: number, outcome: AnalysisOutcome): Promise<void> {
    // Recipients first, outside the transaction: the JD row stays locked only for the writes.
    const current = await this.repository.findById(jdId);
    if (!current) return;
    const recipients = await this.users.hrUserIdsOfCompany(current.companyId);

    const settled = await this.db.transaction(async (tx) => {
      const jd = await this.repository.findById(jdId, { tx, lock: 'update' });
      if (!jd) return null;
      const decision = decideAnalysisResult(jd, {
        status: outcome.kind === 'SUCCEEDED' ? 'SUCCEEDED' : 'FAILED',
        jdVersion: version,
      });
      if (decision === 'IGNORE') return null;

      if (outcome.kind === 'SUCCEEDED') {
        const proposal = {
          requirements: outcome.requirements,
          positionGroup: outcome.positionGroup,
          analysisModel: outcome.model,
          analysisPromptVersion: outcome.promptVersion,
          hiddenTextFlag: outcome.hiddenTextDetected,
        };
        await this.repository.updateVersioned(tx, jdId, jd.rowVersion, { ...proposal, analysisStatus: 'SUCCEEDED' });
        await this.audit.record(tx, {
          actor: SYSTEM_ACTOR,
          action: COMPANY_AUDIT_ACTIONS.JD_REQUIREMENTS_PROPOSED,
          entity: ENTITY,
          entityId: jdId,
          before: { analysisStatus: jd.analysisStatus, rowVersion: jd.rowVersion },
          after: { ...proposal, analysisStatus: 'SUCCEEDED', version, jobId: outcome.jobId, rowVersion: jd.rowVersion + 1 },
          reason: 'JD Analyzer result',
        });
      } else {
        // The file's hidden text stays flagged for the center even though nothing was proposed (AC-12).
        const failure = { analysisStatus: 'FAILED' as const, ...(outcome.hiddenTextDetected ? { hiddenTextFlag: true } : {}) };
        await this.repository.updateVersioned(tx, jdId, jd.rowVersion, failure);
        await this.audit.record(tx, {
          actor: SYSTEM_ACTOR,
          action: COMPANY_AUDIT_ACTIONS.JD_ANALYSIS_FAILED,
          entity: ENTITY,
          entityId: jdId,
          before: { analysisStatus: jd.analysisStatus, rowVersion: jd.rowVersion },
          after: { ...failure, version, jobId: outcome.jobId, rowVersion: jd.rowVersion + 1 },
          reason: `JD analysis failed: ${outcome.code}`,
        });
      }

      let pending: PendingNotifications | null = null;
      if (recipients.length > 0) {
        const ready = outcome.kind === 'SUCCEEDED';
        pending = await this.notifications.notify(
          {
            type: ready ? 'JD_REQUIREMENTS_READY' : 'JD_ANALYSIS_FAILED',
            payload: { jdId, jdTitle: jd.title },
            userIds: recipients,
            channels: ['IN_APP'],
            // One notice per outcome: a proposal after a failed dispatch is announced too.
            dedupeKey: `${ready ? 'jd_requirements_ready' : 'jd_analysis_failed'}:${jdId}:v${version}`,
          },
          { tx },
        );
      }
      return { pending, analysisStatus: outcome.kind };
    });
    if (!settled) return;

    if (settled.pending) await this.notifications.push(settled.pending);
    const data: JdAnalysisEvent = { jdId, analysisStatus: settled.analysisStatus };
    const pushed = await Promise.allSettled(
      recipients.map((userId) => this.realtime.publishToUser(userId, { event: SERVER_EVENTS.JD_ANALYSIS, data })),
    );
    // Stored already: a client that missed the event sees the new state when it reloads.
    if (pushed.some((push) => push.status === 'rejected')) this.logger.warn(`JD ${jdId}: analysis event not pushed to everyone`);
  }
}

/**
 * The outcome a result message stands for. A SUCCEEDED message whose requirements break the
 * cross-field rule of JdRequirementsSchema (the JSON Schema checked on the queue cannot carry it)
 * or that names another JD counts as a failure: HR then enters the requirements by hand.
 */
function outcomeOf(result: AiResultEvent<'JD_ANALYZE'>): AnalysisOutcome {
  if (result.status === 'FAILED' || result.result === null) {
    return {
      kind: 'FAILED',
      jobId: result.job_id,
      code: result.error?.code ?? 'FAILED',
      hiddenTextDetected: result.error?.hidden_text_detected === true,
    };
  }
  const output = result.result;
  const requirements = JdRequirementsSchema.safeParse(output.requirements);
  const sameJd = output.jd_id === result.job.jd_id && output.jd_version === result.job.jd_version;
  if (!requirements.success || !sameJd) {
    return {
      kind: 'FAILED',
      jobId: result.job_id,
      code: 'INVALID_REQUIREMENTS',
      hiddenTextDetected: output.hidden_text_detected,
    };
  }
  return {
    kind: 'SUCCEEDED',
    jobId: result.job_id,
    requirements: requirements.data,
    positionGroup: output.position_group,
    model: output.model,
    promptVersion: output.prompt_version,
    hiddenTextDetected: output.hidden_text_detected,
  };
}
