import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@fmksa/db';
import { documentService } from '../../src/documents/service';

// ---------------------------------------------------------------------------
// Document service integration tests
// Requires: Postgres + MinIO running
// ---------------------------------------------------------------------------

const MINIO_AVAILABLE =
  !!process.env.STORAGE_ENDPOINT && !!process.env.STORAGE_BUCKET;

describe.skipIf(!MINIO_AVAILABLE)('documentService', () => {
  let testUser: { id: string };
  let testUser2: { id: string };
  let testEntity: { id: string };
  let testProject: { id: string };
  const ts = Date.now();

  beforeAll(async () => {

    testUser = await prisma.user.create({
      data: {
        email: `doc-test-1-${ts}@test.com`,
        name: 'Doc Test User 1',
        passwordHash: 'test-hash',
        status: 'active',
      },
    });

    testUser2 = await prisma.user.create({
      data: {
        email: `doc-test-2-${ts}@test.com`,
        name: 'Doc Test User 2',
        passwordHash: 'test-hash',
        status: 'active',
      },
    });

    testEntity = await prisma.entity.create({
      data: {
        code: `ENT-DOC-${ts}`,
        name: 'Doc Test Entity',
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
        code: `PROJ-DOC-${ts}`,
        name: 'Doc Test Project',
        entityId: testEntity.id,
        status: 'active',
        currencyCode: 'SAR',
        startDate: new Date('2026-01-01'),
        createdBy: testUser.id,
      },
    });
  });

  afterAll(async () => {
    // Clean up in reverse dependency order — targeted to this test's data only
    // (no TRUNCATE to avoid interfering with parallel test suites)
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

      // Unlink currentVersionId before deleting versions
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
      where: { code: `PROJ-DOC-${ts}` },
    });
    await prisma.entity.deleteMany({ where: { code: `ENT-DOC-${ts}` } });
    await prisma.user.deleteMany({
      where: { email: { endsWith: `${ts}@test.com` } },
    });
  });

  // -------------------------------------------------------------------------
  // createDocument
  // -------------------------------------------------------------------------

  it('creates a document in draft status', async () => {
    const doc = await documentService.createDocument({
      projectId: testProject.id,
      title: 'Test Shop Drawing',
      category: 'shop_drawing',
      createdBy: testUser.id,
    });

    expect(doc.id).toBeDefined();
    expect(doc.title).toBe('Test Shop Drawing');
    expect(doc.category).toBe('shop_drawing');
    expect(doc.status).toBe('draft');
    expect(doc.currentVersionId).toBeNull();
    expect(doc.projectId).toBe(testProject.id);
  });

  it('rejects invalid category', async () => {
    await expect(
      documentService.createDocument({
        projectId: testProject.id,
        title: 'Bad Category',
        category: 'nonexistent_category',
        createdBy: testUser.id,
      }),
    ).rejects.toThrow(/Invalid document category/);
  });

  it('rejects invalid project reference', async () => {
    await expect(
      documentService.createDocument({
        projectId: '00000000-0000-0000-0000-000000000000',
        title: 'Orphan Doc',
        category: 'general',
        createdBy: testUser.id,
      }),
    ).rejects.toThrow(/not found/);
  });

  // Removed: 'creates document with optional recordType and recordId'.
  // The previous test asserted that recordType/recordId persist correctly
  // by passing a hardcoded fake UUID. Once verifyRecordInProject was added
  // to createDocument, the fake UUID failed FK validation. The assertion
  // it covered (column persistence) is implicitly proven by the
  // verify-record.test.ts cases, which create real records and exercise
  // the same persistence path through valid attachments. See PR #24.

  it('rejects when recordType is provided without recordId', async () => {
    await expect(
      documentService.createDocument({
        projectId: testProject.id,
        title: 'Half-attached doc 1',
        category: 'general',
        recordType: 'expense',
        // recordId intentionally omitted
        createdBy: testUser.id,
      }),
    ).rejects.toThrow(/must be provided together/);
  });

  it('rejects when recordId is provided without recordType', async () => {
    await expect(
      documentService.createDocument({
        projectId: testProject.id,
        title: 'Half-attached doc 2',
        category: 'general',
        recordId: '00000000-0000-0000-0000-000000000000',
        // recordType intentionally omitted
        createdBy: testUser.id,
      }),
    ).rejects.toThrow(/must be provided together/);
  });

  // -------------------------------------------------------------------------
  // uploadVersion
  // -------------------------------------------------------------------------

  it('uploads a version and updates document', async () => {
    const doc = await documentService.createDocument({
      projectId: testProject.id,
      title: 'Upload Test',
      category: 'general',
      createdBy: testUser.id,
    });

    const fileBuffer = Buffer.from('PDF content for version 1');
    const version = await documentService.uploadVersion({
      documentId: doc.id,
      fileBuffer,
      fileName: 'test.pdf',
      mimeType: 'application/pdf',
      uploadedBy: testUser.id,
    });

    expect(version.id).toBeDefined();
    expect(version.versionNo).toBe(1);
    expect(version.fileSize).toBe(fileBuffer.length);
    expect(version.mimeType).toBe('application/pdf');
    expect(version.fileHash).toBeTruthy();

    // Document should now have currentVersionId set and status = in_review
    const updated = await prisma.document.findUnique({
      where: { id: doc.id },
    });
    expect(updated!.currentVersionId).toBe(version.id);
    expect(updated!.status).toBe('in_review');
  });

  it('auto-increments version number', async () => {
    const doc = await documentService.createDocument({
      projectId: testProject.id,
      title: 'Multi Version Test',
      category: 'drawing',
      createdBy: testUser.id,
    });

    const v1 = await documentService.uploadVersion({
      documentId: doc.id,
      fileBuffer: Buffer.from('v1 content'),
      fileName: 'v1.pdf',
      mimeType: 'application/pdf',
      uploadedBy: testUser.id,
    });

    const v2 = await documentService.uploadVersion({
      documentId: doc.id,
      fileBuffer: Buffer.from('v2 content'),
      fileName: 'v2.pdf',
      mimeType: 'application/pdf',
      uploadedBy: testUser.id,
    });

    expect(v1.versionNo).toBe(1);
    expect(v2.versionNo).toBe(2);
  });

  // -------------------------------------------------------------------------
  // listDocuments
  // -------------------------------------------------------------------------

  it('lists documents for a project', async () => {
    const result = await documentService.listDocuments({
      projectId: testProject.id,
    });

    expect(result.items.length).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);
  });

  it('filters by category', async () => {
    const result = await documentService.listDocuments({
      projectId: testProject.id,
      category: 'shop_drawing',
    });

    for (const item of result.items) {
      expect(item.category).toBe('shop_drawing');
    }
  });

  it('filters by status', async () => {
    const result = await documentService.listDocuments({
      projectId: testProject.id,
      status: 'draft',
    });

    for (const item of result.items) {
      expect(item.status).toBe('draft');
    }
  });

  it('searches by title (case insensitive)', async () => {
    await documentService.createDocument({
      projectId: testProject.id,
      title: 'Unique Searchable Title XYZ',
      category: 'general',
      createdBy: testUser.id,
    });

    const result = await documentService.listDocuments({
      projectId: testProject.id,
      search: 'unique searchable',
    });

    expect(result.items.length).toBe(1);
    expect(result.items[0]!.title).toBe('Unique Searchable Title XYZ');
  });

  it('supports pagination', async () => {
    const page1 = await documentService.listDocuments({
      projectId: testProject.id,
      take: 2,
      skip: 0,
    });

    const page2 = await documentService.listDocuments({
      projectId: testProject.id,
      take: 2,
      skip: 2,
    });

    expect(page1.items.length).toBeLessThanOrEqual(2);
    // Pages should not overlap (if enough items exist)
    if (page1.items.length > 0 && page2.items.length > 0) {
      expect(page1.items[0]!.id).not.toBe(page2.items[0]!.id);
    }
  });

  // -------------------------------------------------------------------------
  // signVersion
  // -------------------------------------------------------------------------

  it('signs a version with integrity check', async () => {
    const doc = await documentService.createDocument({
      projectId: testProject.id,
      title: 'Sign Test',
      category: 'test_certificate',
      createdBy: testUser.id,
    });

    const fileBuffer = Buffer.from('Content to be signed');
    const version = await documentService.uploadVersion({
      documentId: doc.id,
      fileBuffer,
      fileName: 'sign-test.pdf',
      mimeType: 'application/pdf',
      uploadedBy: testUser.id,
    });

    const result = await documentService.signVersion({
      versionId: version.id,
      signerUserId: testUser.id,
      ip: '127.0.0.1',
      userAgent: 'test-agent',
    });

    expect(result.version.isSigned).toBe(true);
    expect(result.version.signedAt).toBeTruthy();
    expect(result.version.signedBy).toBe(testUser.id);
    expect(result.signature.signatureType).toBe('internal_hash');
    expect(result.signature.hashAtSign).toBe(version.fileHash);

    // Document status should be 'signed'
    const updated = await prisma.document.findUnique({
      where: { id: doc.id },
    });
    expect(updated!.status).toBe('signed');
  });

  it('rejects signing an already-signed version', async () => {
    const doc = await documentService.createDocument({
      projectId: testProject.id,
      title: 'Double Sign Test',
      category: 'general',
      createdBy: testUser.id,
    });

    const version = await documentService.uploadVersion({
      documentId: doc.id,
      fileBuffer: Buffer.from('Already signed content'),
      fileName: 'double.pdf',
      mimeType: 'application/pdf',
      uploadedBy: testUser.id,
    });

    await documentService.signVersion({
      versionId: version.id,
      signerUserId: testUser.id,
      ip: '127.0.0.1',
      userAgent: 'test-agent',
    });

    // Second sign attempt should fail
    await expect(
      documentService.signVersion({
        versionId: version.id,
        signerUserId: testUser2.id,
        ip: '127.0.0.1',
        userAgent: 'test-agent',
      }),
    ).rejects.toThrow(/already signed/);
  });

  // -------------------------------------------------------------------------
  // supersedeVersion
  // -------------------------------------------------------------------------

  it('supersedes a signed version with reason', async () => {
    const doc = await documentService.createDocument({
      projectId: testProject.id,
      title: 'Supersede Test',
      category: 'specification',
      createdBy: testUser.id,
    });

    await documentService.uploadVersion({
      documentId: doc.id,
      fileBuffer: Buffer.from('Original content'),
      fileName: 'original.pdf',
      mimeType: 'application/pdf',
      uploadedBy: testUser.id,
    });

    // Sign it first
    const docAfterUpload = await prisma.document.findUnique({
      where: { id: doc.id },
    });

    await documentService.signVersion({
      versionId: docAfterUpload!.currentVersionId!,
      signerUserId: testUser.id,
      ip: '127.0.0.1',
      userAgent: 'test-agent',
    });

    // Now supersede
    const result = await documentService.supersedeVersion({
      documentId: doc.id,
      fileBuffer: Buffer.from('Updated content'),
      fileName: 'updated.pdf',
      mimeType: 'application/pdf',
      uploadedBy: testUser.id,
      reason: 'Client requested revision to section 3',
    });

    expect(result.newVersion.versionNo).toBe(2);
    expect(result.oldVersion.id).toBe(docAfterUpload!.currentVersionId);

    // Document status should be back to in_review
    const updated = await prisma.document.findUnique({
      where: { id: doc.id },
    });
    expect(updated!.status).toBe('in_review');
    expect(updated!.currentVersionId).toBe(result.newVersion.id);

    // Old version should have supersededAt set
    const oldVer = await (prisma as any).documentVersion.findUnique({
      where: { id: result.oldVersion.id },
    });
    expect(oldVer.supersededAt).toBeTruthy();
    expect(oldVer.supersededByVersionId).toBe(result.newVersion.id);
  });

  it('rejects supersede without reason', async () => {
    const doc = await documentService.createDocument({
      projectId: testProject.id,
      title: 'No Reason Supersede',
      category: 'general',
      createdBy: testUser.id,
    });

    await documentService.uploadVersion({
      documentId: doc.id,
      fileBuffer: Buffer.from('Some content'),
      fileName: 'file.pdf',
      mimeType: 'application/pdf',
      uploadedBy: testUser.id,
    });

    await expect(
      documentService.supersedeVersion({
        documentId: doc.id,
        fileBuffer: Buffer.from('New content'),
        fileName: 'new.pdf',
        mimeType: 'application/pdf',
        uploadedBy: testUser.id,
        reason: '',
      }),
    ).rejects.toThrow(/Reason is required/);
  });

  // -------------------------------------------------------------------------
  // getDocument
  // -------------------------------------------------------------------------

  it('returns document with versions, signatures, and download URL', async () => {
    const doc = await documentService.createDocument({
      projectId: testProject.id,
      title: 'Get Test',
      category: 'letter',
      createdBy: testUser.id,
    });

    const version = await documentService.uploadVersion({
      documentId: doc.id,
      fileBuffer: Buffer.from('Get test content'),
      fileName: 'get-test.pdf',
      mimeType: 'application/pdf',
      uploadedBy: testUser.id,
    });

    const result = await documentService.getDocument(doc.id, testUser.id);

    expect(result.id).toBe(doc.id);
    expect(result.title).toBe('Get Test');
    expect(result.versions.length).toBe(1);
    expect(result.versions[0]!.id).toBe(version.id);
    expect(result.currentVersion).toBeTruthy();
    expect(result.currentVersion!.id).toBe(version.id);
    expect(result.downloadUrl).toBeTruthy();
    expect(result.downloadUrl).toMatch(/^https?:\/\//);
    expect(result.project).toBeTruthy();
    expect(result.project.id).toBe(testProject.id);
  });

  it('returns null downloadUrl when no current version', async () => {
    const doc = await documentService.createDocument({
      projectId: testProject.id,
      title: 'No Version Get Test',
      category: 'general',
      createdBy: testUser.id,
    });

    const result = await documentService.getDocument(doc.id, testUser.id);
    expect(result.downloadUrl).toBeNull();
  });

  it('throws for nonexistent document', async () => {
    await expect(
      documentService.getDocument(
        '00000000-0000-0000-0000-000000000000',
        testUser.id,
      ),
    ).rejects.toThrow(/not found/);
  });
});
