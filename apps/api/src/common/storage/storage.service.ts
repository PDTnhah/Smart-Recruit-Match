import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutBucketEncryptionCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { FILE_URL_TTL_SECONDS } from '@srm/shared';
import { Clock } from '../clock/index.js';
import { contentDisposition } from './content-disposition.js';
import { type Bucket, BUCKETS, createS3Client, STORAGE_CONFIG, type StorageConfig } from './storage.config.js';

export interface PresignedUrl {
  url: string;
  expiresAt: Date;
}

/**
 * Original CV and JD files on MinIO (ARCHITECTURE › Lưu trữ file, CONTEXT D28). Files never go
 * into the database. Every object is encrypted server-side (SSE-S3); downloads go through
 * presigned URLs valid for 5 minutes. Buckets are set up when the app starts, without blocking
 * it: a MinIO that is down or lacks a KMS key is logged at startup, and the setup is retried on
 * the next write. Building the app without starting it (OpenAPI export) needs no MinIO.
 */
@Injectable()
export class StorageService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly signer: S3Client;
  private bucketsReady: Promise<void> | undefined;

  constructor(
    @Inject(STORAGE_CONFIG) config: StorageConfig,
    private readonly clock: Clock,
  ) {
    this.client = createS3Client(config);
    // Signing makes no request; the URL must carry the host the browser will call.
    this.signer = createS3Client(config, config.publicEndpoint);
  }

  async put(bucket: Bucket, key: string, body: Buffer, contentType: string): Promise<void> {
    await this.ensureBuckets();
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ServerSideEncryption: 'AES256',
      }),
    );
  }

  /** Removes an object that is no longer referenced; a failure is logged, never thrown. */
  async deleteQuietly(bucket: Bucket, key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    } catch (error) {
      this.logger.warn(`could not delete ${bucket}/${key}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * A GET URL valid for FILE_URL_TTL_SECONDS from the Clock's now (AC-9). `fileName` becomes the
   * download name; PDFs still open inline in the browser.
   */
  async presignGet(bucket: Bucket, key: string, options: { fileName?: string } = {}): Promise<PresignedUrl> {
    const signedAt = this.clock.now();
    const url = await getSignedUrl(
      this.signer,
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ...(options.fileName ? { ResponseContentDisposition: contentDisposition(options.fileName) } : {}),
      }),
      { expiresIn: FILE_URL_TTL_SECONDS, signingDate: signedAt },
    );
    return { url, expiresAt: new Date(signedAt.getTime() + FILE_URL_TTL_SECONDS * 1000) };
  }

  onApplicationBootstrap(): void {
    this.ensureBuckets().catch((error: unknown) => {
      this.logger.error(
        `object storage not ready (buckets ${Object.values(BUCKETS).join(', ')}): ${error instanceof Error ? error.message : String(error)}; uploads will retry`,
      );
    });
  }

  onApplicationShutdown(): void {
    this.client.destroy();
    this.signer.destroy();
  }

  /** Creates the buckets once per process; a failure is retried on the next write. */
  private ensureBuckets(): Promise<void> {
    this.bucketsReady ??= this.createBuckets().catch((error: unknown) => {
      this.bucketsReady = undefined;
      throw error;
    });
    return this.bucketsReady;
  }

  private async createBuckets(): Promise<void> {
    for (const bucket of Object.values(BUCKETS)) {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: bucket }));
      } catch (error) {
        if (!isBucketTaken(error)) throw error;
      }
      // Default encryption also covers objects written by other tools (MinIO needs a KMS key).
      await this.client.send(
        new PutBucketEncryptionCommand({
          Bucket: bucket,
          ServerSideEncryptionConfiguration: {
            Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }],
          },
        }),
      );
    }
  }
}

function isBucketTaken(error: unknown): boolean {
  const name = error instanceof Error ? error.name : undefined;
  return name === 'BucketAlreadyOwnedByYou' || name === 'BucketAlreadyExists';
}
