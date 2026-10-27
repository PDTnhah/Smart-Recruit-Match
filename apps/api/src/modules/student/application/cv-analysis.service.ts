import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { cvMachine, CvParseOutputSchema, type CvStatus } from '@srm/shared';
import { loadEnv } from '../../../common/config/env.js';
import { errorMessage } from '../../../common/errors/index.js';
import { emitSafely } from '../../../common/events/index.js';
import { StateTransitionService } from '../../../common/state/index.js';
import { cvLifecycle } from '../../../db/lifecycles.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database } from '../../../db/types.js';
import { AI_RESULT_EVENTS, AiGatewayService, type AiResultEvent } from '../../aigateway/index.js';
import { AuditService, SYSTEM_ACTOR } from '../../audit/index.js';
import { STUDENT_AUDIT_ACTIONS } from '../domain/audit-actions.js';
import { decideCvParseResult } from '../domain/cv-analysis.js';
import { CV_ANALYSIS_SETTLED, CV_SUBMITTED, type CvAnalysisSettledEvent, type CvSubmittedEvent } from '../domain/events.js';
import { type CvAnalysisResult, CvRepository } from '../infrastructure/cv.repository.js';

const ENTITY = cvMachine.name;

/** What a settled analysis brings: the parsed CV, or why there is none. */
type AnalysisOutcome =
  | ({ kind: 'SUCCEEDED'; jobId: string } & CvAnalysisResult)
  | { kind: 'FAILED'; jobId: string | null; code: string; hiddenTextDetected: boolean };

export interface RedispatchSummary {
  dispatched: number;
  failed: number;
}

/**
 * The AI analysis of a submitted CV (US-2.4 AC-1, AC-9 to AC-11, CONTEXT D33, D37). The student
 * module owns the CV row, so it sends the job, stores the result and moves the state with
 * `transitionTo`; the AI Service never writes core (AD-4). Personal data is stored encrypted with
 * pgcrypto, and audit entries name the version, job, model and prompt but never the data (NFR-3).
 * After commit, `cv.analysis.settled` lets the notification module tell the student and the center.
 */
@Injectable()
export class CvAnalysisService {
  private readonly logger = new Logger(CvAnalysisService.name);
  private readonly piiKey = loadEnv().PII_ENCRYPTION_KEY;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly repository: CvRepository,
    private readonly audit: AuditService,
    private readonly transitions: StateTransitionService,
    private readonly aiGateway: AiGatewayService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * AC-1: the upload has committed in PENDING_ANALYSIS; send the job. A broker that stays
   * unreachable fails the analysis at once, so the student is asked to upload again instead of
   * waiting for a job that was never sent (no outbox, CONTEXT D33).
   */
  @OnEvent(CV_SUBMITTED, { async: true })
  async dispatch(event: CvSubmittedEvent): Promise<void> {
    const cv = await this.repository.findById(event.cvId);
    if (!cv) return;
    await this.send(cv.id, cv.version, cv.fileKey);
  }

  /**
   * AC-9 to AC-11, listener convention of aigateway/domain/events.ts: awaited by the consumer, so a
   * database failure is retried once and then dead-lettered. Duplicates, replaced versions and late
   * results return quietly through `decideCvParseResult` (AC-10).
   */
  @OnEvent(AI_RESULT_EVENTS.CV_PARSE, { suppressErrors: false })
  async apply(result: AiResultEvent<'CV_PARSE'>): Promise<void> {
    await this.settle(result.job.cv_id, result.job.cv_version, outcomeOf(result));
  }

  /**
   * The re-dispatch command (src/cli/cv-parse-redispatch.ts): sends a job for every active CV
   * still awaiting analysis, e.g. those uploaded before 0.10.0. With `retryFailed`, failed CVs go
   * back to PENDING_ANALYSIS first. A CV whose job is in flight may get a second one; the first
   * result applies and the other is ignored.
   */
  async redispatchPending(options: { campaignId?: number; retryFailed: boolean }): Promise<RedispatchSummary> {
    const statuses: CvStatus[] = options.retryFailed ? ['PENDING_ANALYSIS', 'ANALYSIS_FAILED'] : ['PENDING_ANALYSIS'];
    const rows = await this.repository.listActiveIn(statuses, options.campaignId);
    let dispatched = 0;
    for (const cv of rows) {
      if (cv.status === 'ANALYSIS_FAILED') {
        await this.transitions.transitionTo<CvStatus>({
          lifecycle: cvLifecycle,
          id: cv.id,
          to: 'PENDING_ANALYSIS',
          actor: SYSTEM_ACTOR,
          reason: 'Analysis re-dispatched by command',
        });
      }
      if (await this.send(cv.id, cv.version, cv.fileKey)) dispatched += 1;
    }
    return { dispatched, failed: rows.length - dispatched };
  }

  /** Sends one job; on failure records DISPATCH_FAILED. True when the broker took the job. */
  private async send(cvId: number, version: number, fileKey: string): Promise<boolean> {
    try {
      await this.aiGateway.dispatch('CV_PARSE', { cv_id: cvId, cv_version: version, file_key: fileKey });
      return true;
    } catch (error) {
      this.logger.error(`CV ${cvId} v${version}: analysis not dispatched: ${errorMessage(error)}`);
      try {
        await this.settle(cvId, version, { kind: 'FAILED', jobId: null, code: 'DISPATCH_FAILED', hiddenTextDetected: false });
      } catch (settleError) {
        this.logger.error(`CV ${cvId}: could not record the failed dispatch: ${errorMessage(settleError)}`);
      }
      return false;
    }
  }

  private async settle(cvId: number, version: number, outcome: AnalysisOutcome): Promise<void> {
    const settled = await this.db.transaction(async (tx): Promise<CvAnalysisSettledEvent | null> => {
      const cv = await this.repository.lockForAnalysis(tx, cvId);
      if (!cv) return null;
      const decision = decideCvParseResult(cv, { succeeded: outcome.kind === 'SUCCEEDED', cvVersion: version });
      if (decision === 'IGNORE') return null;

      // Metadata only: audit_logs is append-only and must never hold personal data (AC-9, NFR-2).
      const common = { version, jobId: outcome.jobId, rowVersion: cv.rowVersion + 1 };
      let to: CvAnalysisSettledEvent['status'];
      let hiddenTextDetected: boolean;
      if (outcome.kind === 'SUCCEEDED') {
        to = 'PENDING_CONFIRMATION';
        hiddenTextDetected = outcome.hiddenTextDetected;
        await this.repository.storeAnalysis(tx, cvId, cv.rowVersion, outcome, this.piiKey);
        await this.audit.record(tx, {
          actor: SYSTEM_ACTOR,
          action: STUDENT_AUDIT_ACTIONS.CV_ANALYSED,
          entity: ENTITY,
          entityId: cvId,
          before: { status: cv.status, rowVersion: cv.rowVersion },
          after: {
            ...common,
            source: outcome.source,
            model: outcome.model,
            promptVersion: outcome.promptVersion,
            hiddenTextDetected,
          },
          reason: 'CV Parser result',
        });
      } else {
        to = 'ANALYSIS_FAILED';
        hiddenTextDetected = outcome.hiddenTextDetected;
        await this.repository.storeFailure(tx, cvId, cv.rowVersion, { errorCode: outcome.code, hiddenTextDetected });
        await this.audit.record(tx, {
          actor: SYSTEM_ACTOR,
          action: STUDENT_AUDIT_ACTIONS.CV_ANALYSIS_FAILED,
          entity: ENTITY,
          entityId: cvId,
          before: { status: cv.status, rowVersion: cv.rowVersion },
          after: { ...common, errorCode: outcome.code, hiddenTextDetected },
          reason: `CV analysis failed: ${outcome.code}`,
        });
      }
      await this.transitions.transitionTo<CvStatus>({
        lifecycle: cvLifecycle,
        id: cvId,
        to,
        actor: SYSTEM_ACTOR,
        reason: outcome.jobId ? `AI job ${outcome.jobId}` : 'AI job not dispatched',
        expectedRowVersion: cv.rowVersion + 1,
        tx,
      });
      return {
        cvId,
        cvVersion: version,
        campaignId: cv.campaignId,
        studentId: cv.studentId,
        status: to,
        hiddenTextDetected,
        jobId: outcome.jobId,
        errorCode: outcome.kind === 'FAILED' ? outcome.code : null,
      };
    });
    if (settled) emitSafely(this.events, this.logger, CV_ANALYSIS_SETTLED, settled);
  }
}

/**
 * The outcome a result message stands for. Only SUCCEEDED carries a usable profile; PARTIAL is
 * never sent by the CV Parser and counts as a failure, as does an output that does not parse or
 * names another CV: the student then uploads again.
 */
function outcomeOf(result: AiResultEvent<'CV_PARSE'>): AnalysisOutcome {
  if (result.status !== 'SUCCEEDED' || result.result === null) {
    return {
      kind: 'FAILED',
      jobId: result.job_id,
      code: result.error?.code ?? `${result.status}_RESULT`,
      hiddenTextDetected: result.error?.hidden_text_detected === true || result.result?.hidden_text_detected === true,
    };
  }
  const parsed = CvParseOutputSchema.safeParse(result.result);
  const sameCv = result.result.cv_id === result.job.cv_id && result.result.cv_version === result.job.cv_version;
  if (!parsed.success || !sameCv) {
    return {
      kind: 'FAILED',
      jobId: result.job_id,
      code: 'INVALID_RESULT',
      hiddenTextDetected: result.result.hidden_text_detected === true,
    };
  }
  const output = parsed.data;
  return {
    kind: 'SUCCEEDED',
    jobId: result.job_id,
    profile: output.profile,
    profileMasked: output.profile_masked,
    pii: output.pii,
    maskedText: output.masked_text,
    source: output.source,
    model: output.model,
    promptVersion: output.prompt_version,
    hiddenTextDetected: output.hidden_text_detected,
  };
}
