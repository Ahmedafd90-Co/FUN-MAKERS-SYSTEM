import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createStorageAdapter, validateStorageConfig, type StorageAdapter } from '../../src/documents/storage';

// ---------------------------------------------------------------------------
// PIC-94 — validateStorageConfig guard-matrix (always-run, no MinIO needed)
//
// Pins four boundary rows across the build-vs-runtime axis so that
// regressions in either direction are caught at CI time:
//
//   R1: production + no NEXT_PHASE + bad creds  → THROWS
//       Catches: "someone deleted the credential-validation throw"
//   R2: production + NEXT_PHASE=phase-production-build + bad creds  → no throw
//       Catches: "someone deleted the NEXT_PHASE build-skip guard"
//   R3: production + no NEXT_PHASE + real creds  → no throw
//       Confirms: guard fires only on bad creds, not all production traffic
//   R4: development + no NEXT_PHASE + bad creds  → no throw
//       Catches: "NODE_ENV check moved after credential check"
//
// env is saved/restored in afterEach so rows are fully isolated.
// ---------------------------------------------------------------------------

describe('validateStorageConfig guard matrix (PIC-94)', () => {
  // Save every env key we might touch so afterEach can restore them.
  const envKeys = ['NODE_ENV', 'NEXT_PHASE', 'STORAGE_ACCESS_KEY', 'STORAGE_SECRET_KEY'] as const;
  type EnvKey = (typeof envKeys)[number];
  let saved: Partial<Record<EnvKey, string | undefined>>;

  beforeAll(() => {
    saved = {};
    for (const k of envKeys) saved[k] = process.env[k];
  });

  afterEach(() => {
    for (const k of envKeys) {
      if (saved[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = saved[k];
      }
    }
  });

  it('R1: throws in production with minioadmin credentials', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.NEXT_PHASE;
    process.env.STORAGE_ACCESS_KEY = 'minioadmin';
    process.env.STORAGE_SECRET_KEY = 'minioadmin';
    expect(() => validateStorageConfig()).toThrow(/STORAGE_ACCESS_KEY.*PIC-90/);
  });

  it('R2: does not throw in production during next build (NEXT_PHASE guard)', () => {
    process.env.NODE_ENV = 'production';
    process.env.NEXT_PHASE = 'phase-production-build';
    process.env.STORAGE_ACCESS_KEY = 'minioadmin';
    process.env.STORAGE_SECRET_KEY = 'minioadmin';
    expect(() => validateStorageConfig()).not.toThrow();
  });

  it('R3: does not throw in production with real credentials', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.NEXT_PHASE;
    process.env.STORAGE_ACCESS_KEY = 'real-access-key';
    process.env.STORAGE_SECRET_KEY = 'real-secret-key';
    expect(() => validateStorageConfig()).not.toThrow();
  });

  it('R4: does not throw in development even with minioadmin credentials', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.NEXT_PHASE;
    process.env.STORAGE_ACCESS_KEY = 'minioadmin';
    process.env.STORAGE_SECRET_KEY = 'minioadmin';
    expect(() => validateStorageConfig()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Storage adapter integration test — requires MinIO running on localhost:9000
// ---------------------------------------------------------------------------

const MINIO_AVAILABLE =
  !!process.env.STORAGE_ENDPOINT && !!process.env.STORAGE_BUCKET;

describe.skipIf(!MINIO_AVAILABLE)('S3StorageAdapter (MinIO)', () => {
  let storage: StorageAdapter;
  const testKey = `test/storage-test-${Date.now()}.txt`;
  const testContent = Buffer.from('Hello MinIO storage adapter test!');

  beforeAll(() => {
    storage = createStorageAdapter();
  });

  afterAll(async () => {
    // Clean up test object
    try {
      await storage.delete(testKey);
    } catch {
      // Ignore if already deleted
    }
  });

  it('uploads a file and returns fileKey + etag', async () => {
    const result = await storage.upload({
      key: testKey,
      body: testContent,
      contentType: 'text/plain',
      contentLength: testContent.length,
    });

    expect(result.fileKey).toBe(testKey);
    expect(result.etag).toBeTruthy();
  });

  it('downloads the uploaded file with matching content', async () => {
    const downloaded = await storage.download(testKey);
    expect(downloaded.toString()).toBe(testContent.toString());
  });

  it('generates a presigned URL', async () => {
    const url = await storage.getSignedUrl(testKey, 300);
    expect(url).toContain(testKey);
    // The URL should be a valid URL string
    expect(url).toMatch(/^https?:\/\//);
  });

  it('deletes the file', async () => {
    await storage.delete(testKey);

    // Attempting to download after deletion should throw
    await expect(storage.download(testKey)).rejects.toThrow();
  });

  it('upload/download roundtrip with binary content', async () => {
    const binaryKey = `test/binary-test-${Date.now()}.bin`;
    const binaryContent = Buffer.from([0x00, 0x01, 0xff, 0xfe, 0x42, 0x89]);

    await storage.upload({
      key: binaryKey,
      body: binaryContent,
      contentType: 'application/octet-stream',
      contentLength: binaryContent.length,
    });

    const downloaded = await storage.download(binaryKey);
    expect(Buffer.compare(downloaded, binaryContent)).toBe(0);

    await storage.delete(binaryKey);
  });
});
