// Shared setup for the JD and file tests of US-1.5: a campaign taking JDs, valid JD bodies, JDs in
// any state, fixture files and a direct S3 client to look into MinIO.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { HeadObjectCommand, ListObjectsV2Command, type S3Client } from '@aws-sdk/client-s3';
import type { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { JobDescriptionStatus } from '@srm/shared';
import { loadEnv } from '../../src/common/config/env.js';
import { BUCKETS, createS3Client, storageConfigFromEnv } from '../../src/common/storage/index.js';
import type { Database } from '../../src/db/types.js';
import { createCampaign, createJobDescription } from './factories.js';

const DAY = 86_400_000;

/** ISO instant `days` from the real now (no scheduler runs here, CONTEXT D27). */
export const inDays = (days: number) => new Date(Date.now() + days * DAY).toISOString();

/** A campaign in INTAKE with every deadline ahead, so HR may post JDs in it. */
export function createIntakeCampaign(db: Database) {
  return createCampaign(db, {
    status: 'INTAKE',
    phaseDeadlines: { intake_end: inDays(7), preference_end: inDays(14), testing_end: inDays(21) },
  });
}

/** A valid `POST /api/jds` body. */
export function jdBody(campaignId: number, overrides: Record<string, unknown> = {}) {
  return {
    campaignId,
    title: 'Thực tập sinh Backend',
    quota: 3,
    location: 'Hà Nội',
    workMode: 'HYBRID',
    internshipPeriod: '01/2027 – 04/2027',
    allowance: '3 triệu/tháng',
    description: 'Phát triển API bằng NestJS.',
    ...overrides,
  };
}

/** Sample requirements, as US-2.3 will store them once HR confirms. */
export const SAMPLE_REQUIREMENTS = { must_have: [{ skill: 'TypeScript' }], nice_to_have: [] };

/**
 * A JD inserted directly in `status` with the FR-4 fields (test setup only; production code moves
 * JDs with transitionTo). `requirements` defaults to set from PENDING_APPROVAL on.
 */
export function createJdInState(
  db: Database,
  values: { companyId: number; campaignId?: number; status: JobDescriptionStatus; requirements?: unknown },
) {
  const confirmed = !['DRAFT', 'PENDING_HR_CONFIRMATION'].includes(values.status);
  return createJobDescription(db, {
    companyId: values.companyId,
    ...(values.campaignId === undefined ? {} : { campaignId: values.campaignId }),
    status: values.status,
    location: 'Hà Nội',
    workMode: 'ONSITE',
    internshipPeriod: '3 tháng',
    rawText: 'Mô tả công việc',
    requirements: (values.requirements === undefined
      ? confirmed
        ? SAMPLE_REQUIREMENTS
        : null
      : values.requirements) as Record<string, unknown> | null,
  });
}

/** Bytes of a file in test/fixtures/files. */
export function fixtureFile(name: string): Buffer {
  return readFileSync(path.resolve(__dirname, '../fixtures/files', name));
}

/** An S3 client on the test MinIO, to check what the API stored. */
export function testS3(): S3Client {
  return createS3Client(storageConfigFromEnv(loadEnv()));
}

/** Object keys under `prefix` in `jd-files` (none when the bucket does not exist yet). */
export async function jdObjectKeys(s3: S3Client, prefix: string): Promise<string[]> {
  try {
    const listed = await s3.send(new ListObjectsV2Command({ Bucket: BUCKETS.JD_FILES, Prefix: prefix }));
    return (listed.Contents ?? []).flatMap((object) => (object.Key ? [object.Key] : []));
  } catch (error) {
    if (error instanceof Error && error.name === 'NoSuchBucket') return [];
    throw error;
  }
}

export function headJdObject(s3: S3Client, key: string) {
  return s3.send(new HeadObjectCommand({ Bucket: BUCKETS.JD_FILES, Key: key }));
}

/** Collects every payload of `event` published by the app under test. */
export function captureEvents<T>(app: INestApplication, event: string): T[] {
  const received: T[] = [];
  app.get(EventEmitter2).on(event, (payload: T) => received.push(payload));
  return received;
}
