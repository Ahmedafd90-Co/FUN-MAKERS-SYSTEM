/**
 * File hashing helper — sha256 hex of a byte buffer.
 *
 * Used in two places:
 *   - ImportBatch.sourceFileHash: set at upload time; together with
 *     (projectId, importType) it prevents silent duplicates.
 *   - ImportBatch.sourceFileHashAtValidation: set at validation time; the
 *     commit refuses if it no longer matches the stored sourceFileHash
 *     (the underlying bytes changed out from under validation).
 */

import { createHash } from 'crypto';

export function sha256Hex(bytes: Buffer | Uint8Array): string {
  const h = createHash('sha256');
  h.update(bytes);
  return h.digest('hex');
}
