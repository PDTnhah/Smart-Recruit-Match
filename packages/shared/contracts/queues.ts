import type { AiJobType } from './jobs.js';

/** Queue per job type (ARCHITECTURE › Hàng đợi). Published through the default exchange. */
export const AI_JOB_QUEUES = {
  CV_PARSE: 'ai.cv.parse',
  JD_ANALYZE: 'ai.jd.analyze',
  SKILL_NORMALIZE: 'ai.skills.normalize',
} as const satisfies Record<AiJobType, string>;

export const AI_RESULTS_QUEUE = 'ai.results';

export const DLQ_SUFFIX = '.dlq';

export function dlqOf(queue: string): string {
  return `${queue}${DLQ_SUFFIX}`;
}

/** NFR-10: a job runs at most this many times before it goes to its dead-letter queue. */
export const AI_JOB_MAX_ATTEMPTS = 3;

/** Wait before attempt 2 and attempt 3. */
export const AI_JOB_RETRY_DELAYS_SECONDS = [2, 10] as const;

/**
 * Both sides declare every queue with exactly these options; RabbitMQ refuses a redeclaration with
 * different arguments. FastStream 0.7 always sends `x-queue-type`, so the API sends it too.
 * Dead-lettering is done by code, not by queue arguments (CONTEXT D33).
 */
export const AI_QUEUE_OPTIONS = {
  durable: true,
  arguments: { 'x-queue-type': 'classic' },
} as const;

/** Headers on a message published to a dead-letter queue. */
export const AI_DLQ_HEADERS = {
  reason: 'x-srm-dlq-reason',
  attempts: 'x-srm-attempts',
  sourceQueue: 'x-srm-source-queue',
} as const;

/** Every queue either side declares: job queues, the results queue and their DLQs. */
export function allAiQueues(): string[] {
  const queues = [...Object.values(AI_JOB_QUEUES), AI_RESULTS_QUEUE];
  return [...queues, ...queues.map(dlqOf)];
}

/** Written to `ai-service/app/contracts/queues.json` so Python reads the same constants. */
export function aiQueueManifest() {
  return {
    jobs: AI_JOB_QUEUES,
    results: AI_RESULTS_QUEUE,
    dlq_suffix: DLQ_SUFFIX,
    max_attempts: AI_JOB_MAX_ATTEMPTS,
    retry_delays_seconds: AI_JOB_RETRY_DELAYS_SECONDS,
    queue_arguments: AI_QUEUE_OPTIONS.arguments,
    dlq_headers: {
      reason: AI_DLQ_HEADERS.reason,
      attempts: AI_DLQ_HEADERS.attempts,
      source_queue: AI_DLQ_HEADERS.sourceQueue,
    },
  };
}
