import { S3Client } from '@aws-sdk/client-s3';
import type { Env } from '../config/env.js';

/** Buckets (ARCHITECTURE › Lưu trữ file, CONTEXT D28). Both use SSE-S3 by default. */
export const BUCKETS = {
  JD_FILES: 'jd-files',
  CV_FILES: 'cv-files',
} as const;

export type Bucket = (typeof BUCKETS)[keyof typeof BUCKETS];

export const STORAGE_CONFIG = Symbol('STORAGE_CONFIG');

export interface StorageConfig {
  /** Where the API reaches MinIO (e.g. http://minio:9000 inside compose). */
  endpoint: string;
  /** Where browsers reach MinIO; presigned URLs are signed for this host. */
  publicEndpoint: string;
  accessKey: string;
  secretKey: string;
}

export function storageConfigFromEnv(env: Env): StorageConfig {
  return {
    endpoint: env.MINIO_ENDPOINT,
    publicEndpoint: env.MINIO_PUBLIC_ENDPOINT ?? env.MINIO_ENDPOINT,
    accessKey: env.MINIO_ACCESS_KEY,
    secretKey: env.MINIO_SECRET_KEY,
  };
}

/**
 * An S3 client for MinIO: path-style URLs (no bucket subdomains) and checksums only where S3
 * requires them, which every MinIO release accepts. Building it opens no connection.
 */
export function createS3Client(config: StorageConfig, endpoint = config.endpoint): S3Client {
  return new S3Client({
    endpoint,
    // MinIO ignores the region, but SigV4 signatures need one.
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}
