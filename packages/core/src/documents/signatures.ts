import { createHash } from 'node:crypto';
import { prisma } from '@fmksa/db';
import { auditService } from '../audit/service';
import { createStorageAdapter } from './storage';

// ---------------------------------------------------------------------------
// Task 1.6.5 — signVersion
// ---------------------------------------------------------------------------

const storage = createStorageAdapter();

/**
 * Custom error for file integrity failures (hash mismatch at sign time).
 */
export class IntegrityError extends Error {
  constructor(
    public readonly expectedHash: string,
    public readonly actualHash: string,
  ) {
    super(
      `File integrity check failed. Expected hash: ${expectedHash}, actual hash: ${actualHash}. ` +
        `The file may have been tampered with after upload.`,
    );
    this.name = 'IntegrityError';
  }
}

export interface SignVersionInput {
  versionId: string;
  signerUserId: string;
  ip: string;
  userAgent: string;
}

/**
 * Sign a document version with internal hash-based signing.
 *
 * CRITICAL integrity check:
 * 1. Downloads file from storage.
 * 2. Recomputes SHA-256 hash.
 * 3. Compares with stored fileHash from upload time.
 * 4. If mismatch: throws IntegrityError (file was tampered).
 * 5. If match: marks version as signed, creates DocumentSignature row,
 *    updates document status to 'signed'.
 */
export async function signVersion(input: SignVersionInput) {
  const { versionId, signerUserId, ip, userAgent } = input;

  // Load version with its document
  const version = await (prisma as any).documentVersion.findUnique({
    where: { id: versionId },
    include: { document: true },
  });

  if (!version) {
    throw new Error(`Document version not found: ${versionId}`);
  }

  if (version.isSigned) {
    throw new Error(
      `Document version ${versionId} is already signed (signed at ${version.signedAt}).`,
    );
  }

  // Download file from storage and recompute hash
  const fileBuffer = await storage.download(version.fileKey);
  const actualHash = createHash('sha256').update(fileBuffer).digest('hex');

  // CRITICAL: integrity check
  if (actualHash !== version.fileHash) {
    throw new IntegrityError(version.fileHash, actualHash);
  }

  // Sign in a transaction
  const now = new Date();

  const result = await (prisma as any).$transaction(async (tx: any) => {
    // Mark version as signed
    const signedVersion = await tx.documentVersion.update({
      where: { id: versionId },
      data: {
        isSigned: true,
        signedAt: now,
        signedBy: signerUserId,
      },
    });

    // Create DocumentSignature row
    const signature = await tx.documentSignature.create({
      data: {
        versionId,
        signerUserId,
        signatureType: 'internal_hash',
        signedAt: now,
        ip,
        userAgent,
        hashAtSign: actualHash,
      },
    });

    // Update document status to 'signed'
    await tx.document.update({
      where: { id: version.documentId },
      data: { status: 'signed' },
    });

    await auditService.log(
      {
        actorUserId: signerUserId,
        actorSource: 'user',
        action: 'document.sign_version',
        resourceType: 'document_version',
        resourceId: versionId,
        projectId: version.document.projectId,
        beforeJson: {
          isSigned: false,
          status: version.document.status,
        },
        afterJson: {
          isSigned: true,
          signedAt: now.toISOString(),
          signedBy: signerUserId,
          hashAtSign: actualHash,
          signatureType: 'internal_hash',
          status: 'signed',
        },
      },
      tx,
    );

    return { version: signedVersion, signature };
  });

  return result;
}
