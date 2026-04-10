import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createStorageAdapter, type StorageAdapter } from '../../src/documents/storage';

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
