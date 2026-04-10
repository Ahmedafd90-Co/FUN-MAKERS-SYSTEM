import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@fmksa/db';
import { documentService } from '../../src/documents/service';

// ---------------------------------------------------------------------------
// Immutability integration test — signed version update protection
// Requires: Postgres + MinIO running
// ---------------------------------------------------------------------------

const MINIO_AVAILABLE =
  !!process.env.STORAGE_ENDPOINT && !!process.env.STORAGE_BUCKET;

describe.skipIf(!MINIO_AVAILABLE)('Signed version immutability', () => {
  let testUser: { id: string };
  let testEntity: { id: string };
  let testProject: { id: string };
  const ts = Date.now();

  beforeAll(async () => {

    testUser = await prisma.user.create({
      data: {
        email: `immut-test-${ts}@test.com`,
        name: 'Immutability Test User',
        passwordHash: 'test-hash',
        status: 'active',
      },
    });

    testEntity = await prisma.entity.create({
      data: {
        code: `ENT-IMMUT-${ts}`,
        name: 'Immutability Test Entity',
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
        code: `PROJ-IMMUT-${ts}`,
        name: 'Immutability Test Project',
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
      where: { code: `PROJ-IMMUT-${ts}` },
    });
    await prisma.entity.deleteMany({ where: { code: `ENT-IMMUT-${ts}` } });
    await prisma.user.deleteMany({
      where: { email: `immut-test-${ts}@test.com` },
    });
  });

  it('blocks updating fileKey on a signed version', async () => {
    const doc = await documentService.createDocument({
      projectId: testProject.id,
      title: 'Immutability Test Doc',
      category: 'test_certificate',
      createdBy: testUser.id,
    });

    const version = await documentService.uploadVersion({
      documentId: doc.id,
      fileBuffer: Buffer.from('Immutable content'),
      fileName: 'immutable.pdf',
      mimeType: 'application/pdf',
      uploadedBy: testUser.id,
    });

    // Sign the version
    await documentService.signVersion({
      versionId: version.id,
      signerUserId: testUser.id,
      ip: '127.0.0.1',
      userAgent: 'test-agent',
    });

    // Attempt to modify fileKey (should be blocked by Prisma middleware)
    await expect(
      (prisma as any).documentVersion.update({
        where: { id: version.id },
        data: { fileKey: 'tampered/path/evil.pdf' },
      }),
    ).rejects.toThrow(/Cannot modify signed document version/);
  });

  it('blocks updating fileHash on a signed version', async () => {
    const doc = await documentService.createDocument({
      projectId: testProject.id,
      title: 'Immutability Hash Test',
      category: 'general',
      createdBy: testUser.id,
    });

    const version = await documentService.uploadVersion({
      documentId: doc.id,
      fileBuffer: Buffer.from('Hash immutable content'),
      fileName: 'hash-immutable.pdf',
      mimeType: 'application/pdf',
      uploadedBy: testUser.id,
    });

    await documentService.signVersion({
      versionId: version.id,
      signerUserId: testUser.id,
      ip: '127.0.0.1',
      userAgent: 'test-agent',
    });

    await expect(
      (prisma as any).documentVersion.update({
        where: { id: version.id },
        data: { fileHash: 'deadbeefdeadbeefdeadbeef' },
      }),
    ).rejects.toThrow(/Cannot modify signed document version/);
  });

  it('allows supersession fields on a signed version', async () => {
    const doc = await documentService.createDocument({
      projectId: testProject.id,
      title: 'Supersession Allowed Test',
      category: 'drawing',
      createdBy: testUser.id,
    });

    const version = await documentService.uploadVersion({
      documentId: doc.id,
      fileBuffer: Buffer.from('Will be superseded'),
      fileName: 'will-supersede.pdf',
      mimeType: 'application/pdf',
      uploadedBy: testUser.id,
    });

    await documentService.signVersion({
      versionId: version.id,
      signerUserId: testUser.id,
      ip: '127.0.0.1',
      userAgent: 'test-agent',
    });

    // Supersede via the service (should succeed because only
    // supersededAt + supersededByVersionId are touched on the old version)
    const result = await documentService.supersedeVersion({
      documentId: doc.id,
      fileBuffer: Buffer.from('Superseding content'),
      fileName: 'superseding.pdf',
      mimeType: 'application/pdf',
      uploadedBy: testUser.id,
      reason: 'Design revision required',
    });

    expect(result.newVersion.versionNo).toBe(2);

    // Verify old version has supersession fields set
    const oldVer = await (prisma as any).documentVersion.findUnique({
      where: { id: version.id },
    });
    expect(oldVer.supersededAt).toBeTruthy();
    expect(oldVer.supersededByVersionId).toBe(result.newVersion.id);
  });

  it('blocks deleting a signed version', async () => {
    const doc = await documentService.createDocument({
      projectId: testProject.id,
      title: 'Delete Block Test',
      category: 'general',
      createdBy: testUser.id,
    });

    const version = await documentService.uploadVersion({
      documentId: doc.id,
      fileBuffer: Buffer.from('Cannot delete me'),
      fileName: 'nodelete.pdf',
      mimeType: 'application/pdf',
      uploadedBy: testUser.id,
    });

    await documentService.signVersion({
      versionId: version.id,
      signerUserId: testUser.id,
      ip: '127.0.0.1',
      userAgent: 'test-agent',
    });

    await expect(
      (prisma as any).documentVersion.delete({ where: { id: version.id } }),
    ).rejects.toThrow(/Cannot delete a signed document version/);
  });
});
