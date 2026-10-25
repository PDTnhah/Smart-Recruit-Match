// Sends a CV_PARSE job for every active CV still awaiting analysis (US-2.4 TASK-2.4.5.1, CONTEXT
// D37): CVs uploaded before 0.10.0 never had one, and a broker outage can leave others waiting.
//
//   pnpm --filter @srm/api cv:redispatch [--campaign <id>] [--retry-failed]
//
// --retry-failed also moves ANALYSIS_FAILED CVs back to PENDING_ANALYSIS (audited, actor SYSTEM)
// and sends them again, e.g. after LLM_PROVIDER was switched from fixture to gemini. Needs the
// API's environment (DATABASE_URL, RABBITMQ_URL, PII_ENCRYPTION_KEY, …); in compose:
//   docker compose -f deploy/docker-compose.yml exec api node dist/cli/cv-parse-redispatch.js
import 'reflect-metadata';
import { parseArgs } from 'node:util';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { CvAnalysisService } from '../modules/student/index.js';

const CONNECT_TIMEOUT_MS = 30_000;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { campaign: { type: 'string' }, 'retry-failed': { type: 'boolean', default: false } },
  });
  const campaignId = values.campaign === undefined ? undefined : Number(values.campaign);
  if (campaignId !== undefined && !(Number.isInteger(campaignId) && campaignId > 0)) {
    throw new Error(`--campaign must be a campaign id, got ${values.campaign}`);
  }
  // This process only sends jobs: the API instances run the scheduled jobs.
  process.env.SCHEDULER_ENABLED = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    await waitForBroker(app.get(AmqpConnection));
    const summary = await app.get(CvAnalysisService).redispatchPending({
      campaignId,
      retryFailed: values['retry-failed'] ?? false,
    });
    console.log(`cv:redispatch: ${summary.dispatched} job(s) sent, ${summary.failed} not sent (marked ANALYSIS_FAILED)`);
    if (summary.failed > 0) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

/** The connection is opened without waiting (amqp.ts); a job published before it is up would time out. */
async function waitForBroker(amqp: AmqpConnection): Promise<void> {
  const deadline = Date.now() + CONNECT_TIMEOUT_MS;
  while (!amqp.connected) {
    if (Date.now() > deadline) throw new Error(`RabbitMQ not reachable within ${CONNECT_TIMEOUT_MS / 1000} s`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

main().catch((error: unknown) => {
  console.error('cv:redispatch: failed', error);
  process.exitCode = 1;
});
