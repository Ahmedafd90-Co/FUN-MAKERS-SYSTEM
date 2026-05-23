/**
 * Document upload submission — shared client-side helper.
 *
 * Single source of truth for the browser → /api/upload POST. Used by both
 * `UploadWidget` (Dialog) and `FileUploadField`-driven forms so there is
 * exactly ONE upload path through the application.
 *
 * Why a shared helper instead of letting each consumer build its own
 * `FormData` + `fetch`: (1) drift surface — if the API contract changes,
 * every caller would need updating; (2) testability — this is the seam
 * we mock in unit tests; (3) PIC-51 hard rule — no parallel upload paths.
 */

export type UploadCreateArgs = {
  mode: 'create';
  file: File;
  projectId: string;
  title: string;
  category: string;
  /** Polymorphic FK target (must be a value from RECORD_TYPES_FOR_DOCUMENTS). */
  recordType?: string;
  recordId?: string;
};

export type UploadSupersedeArgs = {
  mode: 'supersede';
  file: File;
  projectId: string;
  documentId: string;
  reason: string;
};

export type UploadArgs = UploadCreateArgs | UploadSupersedeArgs;

export type UploadResult = {
  message?: string;
  document?: { id: string };
  version?: { id: string };
};

/**
 * POST a multipart/form-data upload to `/api/upload`. Throws on non-2xx;
 * the message is the server-returned error text where available.
 *
 * Callers wrap this in their own UI (Dialog, FormField, etc.) and decide
 * what to do with the returned `document.id` — typically navigate to the
 * viewer (create mode) or refresh the current page (supersede mode).
 */
export async function submitDocumentUpload(args: UploadArgs): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('file', args.file);
  formData.append('projectId', args.projectId);
  formData.append('mode', args.mode);

  if (args.mode === 'create') {
    formData.append('title', args.title);
    formData.append('category', args.category);
    if (args.recordType) formData.append('recordType', args.recordType);
    if (args.recordId) formData.append('recordId', args.recordId);
  } else {
    formData.append('documentId', args.documentId);
    formData.append('reason', args.reason);
  }

  const response = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  });

  const result = (await response.json()) as UploadResult & { error?: string };

  if (!response.ok) {
    throw new Error(result.error ?? 'Upload failed.');
  }

  return result;
}

// ---------------------------------------------------------------------------
// Client-side validation (shared with FileUploadField)
// ---------------------------------------------------------------------------

/** Client-side hard limit. Matches the server-mediated path in /api/upload/route.ts.
 *  Note (PIC-57): files larger than this require presigned-PUT direct-to-S3,
 *  which is out of scope for PIC-51. Reads via env in production setups will
 *  honour deployment overrides — but the floor is also enforced server-side. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export type FileSizeCheckResult =
  | { ok: true }
  | { ok: false; reason: 'too_large'; limitBytes: number; actualBytes: number };

/** Pure size-validation helper. Extracted so it's unit-testable without rendering. */
export function checkFileSize(file: File, limitBytes = MAX_UPLOAD_BYTES): FileSizeCheckResult {
  if (file.size > limitBytes) {
    return { ok: false, reason: 'too_large', limitBytes, actualBytes: file.size };
  }
  return { ok: true };
}

/** Display helper. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
