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
 * Validate that production storage credentials are explicitly configured.
 *
 * The `minioadmin` / `minioadmin` defaults are local-development values for
 * Docker Compose (MinIO). They must NOT be used in production — they are
 * well-known public defaults that would allow anyone with storage-endpoint
 * access to authenticate. This check mirrors the AUTH_SECRET guard in
 * `apps/web/lib/auth.ts`.
 *
 * The guard is scoped to NODE_ENV=production so that local dev + CI
 * (NODE_ENV=test or unset) continue to work with the Docker Compose defaults.
 *
 * PIC-90 (2026-05-30).
 */
function validateStorageConfig(): void {
  if (process.env.NODE_ENV !== 'production') return;

  // Skip during Next.js build-time static analysis — `next build` runs with
  // NODE_ENV=production but module-level code executes at build time (not
  // request time). Storage credentials are only needed at runtime; throwing
  // here would fail CI builds even when the runtime environment is correctly
  // configured. NEXT_PHASE='phase-production-build' is set by Next.js during
  // the build step and unset at runtime — this is the same pattern used by
  // Auth.js and next-auth for deferred secret validation.
  if (process.env.NEXT_PHASE === 'phase-production-build') return;

  const accessKey = process.env.STORAGE_ACCESS_KEY;
  const secretKey = process.env.STORAGE_SECRET_KEY;

  if (!accessKey || accessKey === 'minioadmin') {
    throw new Error(
      'STORAGE_ACCESS_KEY must be set in production and must not be the ' +
        "default 'minioadmin' value (PIC-90). " +
        "Set it in your deployment platform's environment configuration. " +
        'See docs/storage-production.md for the required environment variables.',
    );
  }

  if (!secretKey || secretKey === 'minioadmin') {
    throw new Error(
      'STORAGE_SECRET_KEY must be set in production and must not be the ' +
        "default 'minioadmin' value (PIC-90). " +
        "Set it in your deployment platform's environment configuration. " +
        'See docs/storage-production.md for the required environment variables.',
    );
  }
}

/**
 * Create the platform storage adapter from environment variables.
 *
 * Currently only S3/MinIO is supported. The factory pattern allows future
 * cloud providers to be added without changing consuming code.
 *
 * Throws in production if STORAGE_ACCESS_KEY or STORAGE_SECRET_KEY are
 * unset or are the 'minioadmin' dev default (PIC-90). Local development
 * and CI (NODE_ENV≠production) continue to use the Docker Compose defaults.
 */
export function createStorageAdapter(): StorageAdapter {
  validateStorageConfig();

  return new S3StorageAdapter({
    endpoint: process.env.STORAGE_ENDPOINT,
    region: process.env.STORAGE_REGION || 'us-east-1',
    bucket: process.env.STORAGE_BUCKET || 'fmksa-dev-documents',
    accessKeyId: process.env.STORAGE_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.STORAGE_SECRET_KEY || 'minioadmin',
    forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === 'true',
  });
}
