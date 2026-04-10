import { Readable } from 'node:stream';
import { S3StorageAdapter } from './storage/s3-adapter';

// ---------------------------------------------------------------------------
// Storage Adapter — Abstract interface
// ---------------------------------------------------------------------------

/**
 * Platform-agnostic file storage interface.
 *
 * Implementations: S3StorageAdapter (AWS S3 / MinIO).
 * Future: Azure Blob, GCS, local filesystem, etc.
 *
 * IMPORTANT: No cloud-provider SDK types leak out of storage/.
 * The rest of documents/ only depends on this interface.
 */
export interface StorageAdapter {
  upload(params: {
    key: string;
    body: Buffer | Readable;
    contentType: string;
    contentLength: number;
  }): Promise<{ fileKey: string; etag: string }>;

  download(key: string): Promise<Buffer>;

  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;

  delete(key: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create the platform storage adapter from environment variables.
 *
 * Currently only S3/MinIO is supported. The factory pattern allows future
 * cloud providers to be added without changing consuming code.
 */
export function createStorageAdapter(): StorageAdapter {
  return new S3StorageAdapter({
    endpoint: process.env.STORAGE_ENDPOINT,
    region: process.env.STORAGE_REGION || 'us-east-1',
    bucket: process.env.STORAGE_BUCKET || 'fmksa-dev-documents',
    accessKeyId: process.env.STORAGE_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.STORAGE_SECRET_KEY || 'minioadmin',
    forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === 'true',
  });
}
