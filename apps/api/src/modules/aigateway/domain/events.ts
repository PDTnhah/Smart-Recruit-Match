// Events of the aigateway module (AD-5, CONTEXT D33). aigateway never writes another module's
// tables (Invariant 13): it validates each `ai.results` message and hands it to the module that
// owns the job type through `ai.result.<TYPE>`.
import type { AiJobError, AiJobPayload, AiJobType, AiResultOf, AiResultStatus } from '@srm/shared';

/** A job message was confirmed by the broker. Owners may show "Đang phân tích…" from here. */
export const AI_JOB_DISPATCHED = 'ai.job.dispatched';

export interface AiJobDispatchedEvent<T extends AiJobType = AiJobType> {
  jobId: string;
  type: T;
  job: AiJobPayload<T>;
}

/**
 * One event per job type, carrying the validated `ai.results` message (`AiResultOf<T>`). Its
 * `job` field echoes the job payload, so a FAILED result still names its CV or JD.
 *
 * Listener convention (CONTEXT D33), for the owning module (US-2.3, US-2.4, …):
 * - `@OnEvent(AI_RESULT_EVENTS.X, { suppressErrors: false })` without `async: true`. The consumer
 *   awaits listeners with `emitAsync`; with `async: true` it would not wait, and an error would
 *   never reach it.
 * - Delivery is at least once: the same result can arrive twice, or after a newer version. Return
 *   quietly when the result is already applied or belongs to an older version; write with an
 *   upsert on the natural key (e.g. cv_id + cv_version) and change states through `transitionTo`.
 * - Throw only for a failure worth retrying: the message is requeued once, then dead-lettered.
 */
export const AI_RESULT_EVENTS = {
  CV_PARSE: 'ai.result.CV_PARSE',
  JD_ANALYZE: 'ai.result.JD_ANALYZE',
  SKILL_NORMALIZE: 'ai.result.SKILL_NORMALIZE',
} as const satisfies { [T in AiJobType]: `ai.result.${T}` };

export type AiResultEvent<T extends AiJobType> = AiResultOf<T>;

/** A result was accepted and every listener of `ai.result.<TYPE>` returned. */
export const AI_JOB_SETTLED = 'ai.job.settled';

export interface AiJobSettledEvent {
  jobId: string;
  type: AiJobType;
  status: AiResultStatus;
  job: AiJobPayload<AiJobType>;
  error: AiJobError | null;
}
