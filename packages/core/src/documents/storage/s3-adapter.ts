import { Readable } from 'node:stream';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageAdapter } from '../storage';

// ---------------------------------------------------------------------------
// S3 / MinIO Storage Adapter
// ---------------------------------------------------------------------------

export interface S3StorageConfig {
  endpoint: string | undefined;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

/** Default presigned URL expiry: 15 minutes. */
const DEFAULT_EXPIRY_SECONDS = 15 * 60;

/**
 * S3-compatible storage adapter.
 *
 * Works with both AWS S3 and MinIO (via `endpoint` + `forcePathStyle`).
 */
export class S3StorageAdapter implements StorageAdapter {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket;

    this.client = new S3Client({
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle,
    });
  }

  async upload(params: {
    key: string;
    body: Buffer | Readable;
    contentType: string;
    contentLength: number;
  }): Promise<{ fileKey: string; etag: string }> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      ContentLength: params.contentLength,
    });

    const response = await this.client.send(command);

    return {
      fileKey: params.key,
      etag: response.ETag?.replace(/"/g, '') ?? '',
    };
  }

  async download(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const response = await this.client.send(command);

    if (!response.Body) {
      throw new Error(`Empty body returned for key: ${key}`);
    }

    // response.Body is a Readable stream in Node.js
    return this.streamToBuffer(response.Body as Readable);
  }

  async getSignedUrl(
    key: string,
    expiresInSeconds: number = DEFAULT_EXPIRY_SECONDS,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds,
    });
  }

  async delete(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.client.send(command);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
  }
}
