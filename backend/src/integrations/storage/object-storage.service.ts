import { Injectable, OnModuleDestroy } from '@nestjs/common';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { AppConfigService } from '@config/app-config.service';
import {
  DependencyUnavailableException,
  ValidationDomainException,
} from '@common/errors/app.exception';
import { sha256Hex } from '@common/utils/crypto.util';

export const MAX_PRESIGNED_URL_TTL_SECONDS = 300;
const OPAQUE_REPORT_KEY_PATTERN =
  /^reports\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(json|html)$/i;

export interface PutPrivateObjectInput {
  key: string;
  body: Buffer | string;
  contentType: string;
  metadata?: Record<string, string>;
}

export interface PutPrivateObjectResult {
  key: string;
  contentSha256: string;
}

export interface CreateScopedDownloadUrlInput {
  key: string;
  expiresInSeconds?: number;
  responseContentDisposition?: string;
}

export interface ScopedDownloadUrlResult {
  downloadUrl: string;
  expiresInSeconds: number;
  expiresAt: string;
}

@Injectable()
export class ObjectStorageService implements OnModuleDestroy {
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private bucketEnsured = false;

  constructor(private readonly config: AppConfigService) {
    this.bucket = this.config.s3Bucket;
    const accessKeyId = this.config.s3AccessKey ?? 'minioadmin';
    const secretAccessKey = this.config.s3SecretKey ?? 'minioadmin'; // ggignore

    this.s3Client = new S3Client({
      endpoint: this.config.s3Endpoint,
      region: this.config.s3Region,
      forcePathStyle: true,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  /**
   * Generates an unpredictable, opaque private object key (`reports/<randomUUID>.json|html`)
   * with zero user IDs, names, or predictable sequences (T-019, INTEGRATIONS.md §14).
   */
  buildOpaqueReportKey(extension: 'json' | 'html' = 'json'): string {
    return `reports/${randomUUID()}.${extension}`;
  }

  assertOpaqueReportKey(key: string): void {
    if (!OPAQUE_REPORT_KEY_PATTERN.test(key)) {
      throw new ValidationDomainException(
        'Report object storage keys must use opaque unpredictable UUID paths.',
        [{ field: 'object_storage_key', reason: 'predictable_or_invalid_storage_key' }],
      );
    }
  }

  async ensureBucketExists(): Promise<void> {
    if (this.bucketEnsured) {
      return;
    }

    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.bucketEnsured = true;
      return;
    } catch (err) {
      if (this.config.isProduction) {
        throw new DependencyUnavailableException(
          'Private report object storage bucket is unavailable.',
        );
      }

      const statusCode = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata
        ?.httpStatusCode;
      const errName = (err as { name?: string })?.name ?? '';
      const isMissing =
        statusCode === 404 ||
        errName === 'NotFound' ||
        errName === 'NoSuchBucket' ||
        errName === 'UnknownError';

      if (!isMissing) {
        throw new DependencyUnavailableException(
          'Private report object storage service is temporarily unavailable.',
        );
      }
    }

    try {
      await this.s3Client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.bucketEnsured = true;
    } catch (createErr) {
      const createName = (createErr as { name?: string })?.name ?? '';
      const statusCode = (createErr as { $metadata?: { httpStatusCode?: number } })?.$metadata
        ?.httpStatusCode;
      if (
        createName === 'BucketAlreadyOwnedByYou' ||
        createName === 'BucketAlreadyExists' ||
        statusCode === 409
      ) {
        this.bucketEnsured = true;
        return;
      }
      throw new DependencyUnavailableException(
        'Failed to initialize private report object storage bucket.',
      );
    }
  }

  async putPrivateObject(input: PutPrivateObjectInput): Promise<PutPrivateObjectResult> {
    this.assertOpaqueReportKey(input.key);
    await this.ensureBucketExists();

    const bodyBuffer =
      typeof input.body === 'string' ? Buffer.from(input.body, 'utf8') : input.body;
    const contentSha256 = sha256Hex(bodyBuffer);

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: input.key,
          Body: bodyBuffer,
          ContentType: input.contentType,
          Metadata: {
            ...(input.metadata ?? {}),
            'content-sha256': contentSha256,
          },
        }),
      );
    } catch {
      throw new DependencyUnavailableException(
        'Failed to persist private report artifact to object storage.',
      );
    }

    return {
      key: input.key,
      contentSha256,
    };
  }

  /**
   * Issues a short-lived (`<= 300s`) scoped presigned GetObject URL.
   * Callers MUST verify report ownership or active `ReportAccess` grant BEFORE invoking (T-043).
   */
  async createScopedDownloadUrl(
    input: CreateScopedDownloadUrlInput,
  ): Promise<ScopedDownloadUrlResult> {
    this.assertOpaqueReportKey(input.key);
    await this.ensureBucketExists();

    const requestedTtl = input.expiresInSeconds ?? MAX_PRESIGNED_URL_TTL_SECONDS;
    const expiresInSeconds = Math.min(
      Math.max(1, Math.trunc(requestedTtl)),
      MAX_PRESIGNED_URL_TTL_SECONDS,
    );

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      ...(input.responseContentDisposition
        ? { ResponseContentDisposition: input.responseContentDisposition }
        : {}),
    });

    try {
      const downloadUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: expiresInSeconds,
      });
      const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
      return {
        downloadUrl,
        expiresInSeconds,
        expiresAt,
      };
    } catch {
      throw new DependencyUnavailableException(
        'Failed to generate scoped report download reference.',
      );
    }
  }

  async objectExists(key: string): Promise<boolean> {
    this.assertOpaqueReportKey(key);
    await this.ensureBucketExists();
    try {
      await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async deleteObject(key: string): Promise<void> {
    this.assertOpaqueReportKey(key);
    await this.ensureBucketExists();
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
    } catch {
      throw new DependencyUnavailableException(
        'Failed to delete private report artifact from object storage.',
      );
    }
  }

  onModuleDestroy(): void {
    this.s3Client.destroy();
  }
}
