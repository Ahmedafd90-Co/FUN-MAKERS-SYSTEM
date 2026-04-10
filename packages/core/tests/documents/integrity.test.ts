import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import { prisma } from '@fmksa/db';
import { documentService } from '../../src/documents/service';
import { IntegrityError } from '../../src/documents/signatures';

// ---------------------------------------------------------------------------
// Integrity check test — SHA-256 hash comparison at sign time
// Requires: Postgres + MinIO running
// ---------------------------------------------------------------------------

const MINIO_AVAILABLE =
  !!process.env.STORAGE_ENDPOINT && !!process.env.STORAGE_BUCKET;

describe.skipIf(!MINIO_AVAILABLE)('Document integrity check', () => {
  let testUser: { id: string };
  let testEntity: { id: string };
  let testProject: { id: string };
  const ts = Date.now();

  beforeAll(async () => {

    testUser = await prisma.user.create({
      data: {
        email: `integrity-test-${ts}@test.com`,
        name: 'Integrity Test User',
        passwordHash: 'test-hash',
        status: 'active',
      },
    });

    testEntity = await prisma.entity.create({
      data: {
        code: `ENT-INTEG-${ts}`,
        name: 'Integrity Test Entity',
        type: 'parent',
        status: 'active',
      },
    });

    await prisma.currency.upsert({
      where: { code: 'SAR' },
      create: {
        code: 'SAR',
        name: 'Saudi Riyal',
        symbol: '\uFDFC',
        decimalPlaces: 2,
      },
      update: {},
    });

    testProject = await prisma.project.create({
      data: {
        code: `PROJ-INTEG-${ts}`,
        name: 'Integrity Test Project',
        entityId: testEntity.id,
        status: 'active',
        currencyCode: 'SAR',
        startDate: new Date('2026-01-01'),
        createdBy: testUser.id,
      },
    });
  });

  afterAll(async () => {
    const docIds = (
      await prisma.document.findMany({
        where: { projectId: testProject.id },
        select: { id: true },
      })
    ).map((d) => d.id);

    if (docIds.length > 0) {
      const versionIds = (
        await (prisma as any).documentVersion.findMany({
          where: { documentId: { in: docIds } },
          select: { id: true },
        })
      ).map((v: any) => v.id);

      if (versionIds.length > 0) {
        // DocumentSignature is append-only — must use raw SQL for test cleanup
        await (prisma as any).$executeRaw`
          DELETE FROM document_signatures WHERE version_id = ANY(${versionIds})
        `;
      }

      await prisma.document.updateMany({
        where: { id: { in: docIds } },
        data: { currentVersionId: null },
      });

      // Use raw SQL to bypass signed-immutability middleware for test cleanup
      await (prisma as any).$executeRaw`
        DELETE FROM document_versions WHERE document_id = ANY(${docIds})
      `;

      await prisma.document.deleteMany({
        where: { projectId: testProject.id },
      });
    }

    await prisma.project.deleteMany({
      where: { code: `PROJ-INTEG-${ts}` },
    });
    await prisma.entity.deleteMany({ where: { code: `ENT-INTEG-${ts}` } });
    await prisma.user.deleteMany({
      where: { email: `integrity-test-${ts}@test.com` },
    });
  });

  it('succeeds when file hash matches at sign time', async () => {
    const content = Buffer.from('Trusted content with verifiable integrity');
    const expectedHash = createHash('sha256').update(content).digest('hex');

    const doc = await documentService.createDocument({
      projectId: testProject.id,
      title: 'Integrity Success Test',
      category: 'test_certificate',
      createdBy: testUser.id,
    });

    const version = await documentService.uploadVersion({
      documentId: doc.id,
      fileBuffer: content,
      fileName: 'integrity-pass.pdf',
      mimeType: 'application/pdf',
      uploadedBy: testUser.id,
    });

    // Verify stored hash matches our computed hash
    expect(version.fileHash).toBe(expectedHash);

    // Sign should succeed — hash matches
    const result = await documentService.signVersion({
      versionId: version.id,
      signerUserId: testUser.id,
      ip: '127.0.0.1',
      userAgent: 'integrity-test-agent',
    });

    expect(result.signature.hashAtSign).toBe(expectedHash);
    expect(result.version.isSigned).toBe(true);
  });

  it('fails with IntegrityError when stored hash is manually tampered', async () => {
    const content = Buffer.from('Content before tampering DB hash');

    const doc = await documentService.createDocument({
      projectId: testProject.id,
      title: 'Integrity Fail Test',
      category: 'general',
      createdBy: testUser.id,
    });

    const version = await documentService.uploadVersion({
      documentId: doc.id,
      fileBuffer: content,
      fileName: 'integrity-fail.pdf',
      mimeType: 'application/pdf',
      uploadedBy: testUser.id,
    });

    // Tamper: manually change the stored fileHash in the database
    // (simulating an attacker modifying the DB record)
    await (prisma as any).$executeRaw`
      UPDATE document_versions
      SET file_hash = 'tampered_hash_value_that_does_not_match_file'
      WHERE id = ${version.id}
    `;

    // Sign should fail — the file from storage will produce a different
    // hash than the tampered DB record
    await expect(
      documentService.signVersion({
        versionId: version.id,
        signerUserId: testUser.id,
        ip: '127.0.0.1',
        userAgent: 'integrity-test-agent',
      }),
    ).rejects.toThrow(IntegrityError);
  });

  it('IntegrityError contains expected and actual hashes', async () => {
    const content = Buffer.from('Content for hash mismatch details test');
    const actualHash = createHash('sha256').update(content).digest('hex');

    const doc = await documentService.createDocument({
      projectId: testProject.id,
      title: 'Integrity Detail Test',
      category: 'general',
      createdBy: testUser.id,
    });

    const version = await documentService.uploadVersion({
      documentId: doc.id,
      fileBuffer: content,
      fileName: 'integrity-detail.pdf',
      mimeType: 'application/pdf',
      uploadedBy: testUser.id,
    });

    const fakeHash = 'aaaa' + 'b'.repeat(60);
    await (prisma as any).$executeRaw`
      UPDATE document_versions
      SET file_hash = ${fakeHash}
      WHERE id = ${version.id}
    `;

    try {
      await documentService.signVersion({
        versionId: version.id,
        signerUserId: testUser.id,
        ip: '127.0.0.1',
        userAgent: 'test-agent',
      });
      // Should not reach here
      expect.unreachable('Should have thrown IntegrityError');
    } catch (err) {
      expect(err).toBeInstanceOf(IntegrityError);
      const ie = err as IntegrityError;
      expect(ie.expectedHash).toBe(fakeHash);
      expect(ie.actualHash).toBe(actualHash);
      expect(ie.message).toContain('tampered');
    }
  });
});
