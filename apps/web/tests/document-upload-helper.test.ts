/**
 * PIC-51 — document-upload shared helper (FileUploadField round-trip proof).
 *
 * The point of pulling `submitDocumentUpload` into a shared helper is that
 * UploadWidget (Dialog) and FileUploadField-driven forms (PR-3 Drawing Register,
 * PR-5 DCM, etc.) all flow through the SAME upload path. This test mocks
 * `global.fetch` and proves the helper builds the correct multipart body and
 * handles the response — the contract Layer 2.5 entity forms will rely on.
 *
 * Also covers the size-check helper (PIC-49 lesson — the failure case
 * MUST have a proof, not just the happy path).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  submitDocumentUpload,
  checkFileSize,
  MAX_UPLOAD_BYTES,
  formatFileSize,
} from '../lib/document-upload';

describe('PIC-51 — document-upload shared helper', () => {
  // -------------------------------------------------------------------------
  // checkFileSize (pure logic)
  // -------------------------------------------------------------------------

  describe('checkFileSize', () => {
    const tinyFile = new File(['hi'], 'tiny.txt', { type: 'text/plain' });

    it('accepts a file under the limit', () => {
      expect(checkFileSize(tinyFile, 1024)).toEqual({ ok: true });
    });

    it('accepts a file at exactly the limit (boundary)', () => {
      expect(checkFileSize(tinyFile, tinyFile.size)).toEqual({ ok: true });
    });

    it('rejects a file 1 byte over the limit (PIC-49 failure-case proof)', () => {
      const result = checkFileSize(tinyFile, tinyFile.size - 1);
      expect(result).toEqual({
        ok: false,
        reason: 'too_large',
        limitBytes: tinyFile.size - 1,
        actualBytes: tinyFile.size,
      });
    });

    it('uses MAX_UPLOAD_BYTES default when no limit is passed', () => {
      const bigFakeFile = { size: MAX_UPLOAD_BYTES + 1, name: 'big', type: 'x' } as File;
      const result = checkFileSize(bigFakeFile);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.limitBytes).toBe(MAX_UPLOAD_BYTES);
      }
    });
  });

  describe('formatFileSize', () => {
    it('renders bytes', () => expect(formatFileSize(500)).toBe('500 B'));
    it('renders KB', () => expect(formatFileSize(1500)).toBe('1.5 KB'));
    it('renders MB', () => expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB'));
  });

  // -------------------------------------------------------------------------
  // submitDocumentUpload — round-trip through mocked /api/upload
  // -------------------------------------------------------------------------

  describe('submitDocumentUpload (round-trip)', () => {
    let fetchMock: ReturnType<typeof vi.fn>;
    let capturedRequest: { url: string; init: RequestInit } | undefined;

    beforeEach(() => {
      capturedRequest = undefined;
      fetchMock = vi.fn(async (url: string, init: RequestInit) => {
        capturedRequest = { url, init };
        return new Response(
          JSON.stringify({ message: 'ok', document: { id: 'new-doc-id' }, version: { id: 'v1' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });
      vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    const file = new File(['content'], 'drawing.pdf', { type: 'application/pdf' });

    it('create mode: builds correct multipart body and returns document id', async () => {
      const result = await submitDocumentUpload({
        mode: 'create',
        file,
        projectId: 'proj-1',
        title: 'A drawing',
        category: 'drawing',
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(capturedRequest?.url).toBe('/api/upload');
      expect(capturedRequest?.init.method).toBe('POST');
      const body = capturedRequest?.init.body as FormData;
      expect(body.get('mode')).toBe('create');
      expect(body.get('projectId')).toBe('proj-1');
      expect(body.get('title')).toBe('A drawing');
      expect(body.get('category')).toBe('drawing');
      expect(body.get('file')).toBeInstanceOf(File);
      expect((body.get('file') as File).name).toBe('drawing.pdf');
      // No recordType/recordId set when not provided
      expect(body.get('recordType')).toBeNull();
      expect(body.get('recordId')).toBeNull();

      expect(result.document?.id).toBe('new-doc-id');
    });

    it('create mode with polymorphic FK: forwards recordType + recordId', async () => {
      await submitDocumentUpload({
        mode: 'create',
        file,
        projectId: 'proj-1',
        title: 'PO attachment',
        category: 'contract_attachment',
        recordType: 'purchase_order',
        recordId: 'po-uuid',
      });

      const body = capturedRequest?.init.body as FormData;
      expect(body.get('recordType')).toBe('purchase_order');
      expect(body.get('recordId')).toBe('po-uuid');
    });

    it('supersede mode: builds correct body', async () => {
      await submitDocumentUpload({
        mode: 'supersede',
        file,
        projectId: 'proj-1',
        documentId: 'doc-existing',
        reason: 'Revised per RFI #14',
      });

      const body = capturedRequest?.init.body as FormData;
      expect(body.get('mode')).toBe('supersede');
      expect(body.get('documentId')).toBe('doc-existing');
      expect(body.get('reason')).toBe('Revised per RFI #14');
      // create-only fields absent
      expect(body.get('title')).toBeNull();
      expect(body.get('category')).toBeNull();
    });

    it('non-2xx response: throws with server-returned error message (PIC-49 failure-case proof)', async () => {
      fetchMock.mockImplementationOnce(async () => {
        return new Response(JSON.stringify({ error: 'recordType invalid' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      await expect(
        submitDocumentUpload({
          mode: 'create',
          file,
          projectId: 'proj-1',
          title: 'x',
          category: 'drawing',
        }),
      ).rejects.toThrow('recordType invalid');
    });

    it('non-2xx response with no error body: throws generic message', async () => {
      fetchMock.mockImplementationOnce(async () => {
        return new Response(JSON.stringify({}), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      await expect(
        submitDocumentUpload({
          mode: 'create',
          file,
          projectId: 'proj-1',
          title: 'x',
          category: 'drawing',
        }),
      ).rejects.toThrow('Upload failed.');
    });
  });
});
