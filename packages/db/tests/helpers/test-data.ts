import { prisma } from '../../src/client';

export async function createTestUser(
  overrides?: Partial<{
    email: string;
    name: string;
    passwordHash: string;
    status: 'active' | 'inactive' | 'locked';
  }>,
) {
  return prisma.user.create({
    data: {
      email: `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`,
      name: 'Test User',
      passwordHash: 'test-hash',
      status: 'active',
      ...overrides,
    },
  });
}

export async function createTestEntity() {
  return prisma.entity.create({
    data: {
      code: `ENT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: 'Test Entity',
      type: 'parent',
      status: 'active',
    },
  });
}

export async function createTestProject(entityId: string) {
  return prisma.project.create({
    data: {
      code: `TEST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: 'Test Project',
      entityId,
      currencyCode: 'SAR',
      startDate: new Date(),
      createdBy: 'test',
      status: 'active',
    },
  });
}

export async function createTestDocumentWithVersion(
  projectId: string,
  uploadedBy: string,
  isSigned = false,
) {
  const doc = await prisma.document.create({
    data: {
      projectId,
      title: 'Test Doc',
      category: 'general',
      status: isSigned ? 'signed' : 'draft',
      createdBy: uploadedBy,
    },
  });

  const version = await prisma.documentVersion.create({
    data: {
      documentId: doc.id,
      versionNo: 1,
      fileKey: `files/test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`,
      fileHash: `sha256-test-${Math.random().toString(36).slice(2, 10)}`,
      fileSize: 1024,
      mimeType: 'application/pdf',
      uploadedBy,
      uploadedAt: new Date(),
      isSigned,
      ...(isSigned ? { signedAt: new Date(), signedBy: uploadedBy } : {}),
    },
  });

  return { doc, version };
}

/**
 * Clean all test data. Uses raw TRUNCATE to avoid both FK ordering headaches
 * and the no-delete-on-immutable middleware. TRUNCATE ... CASCADE handles
 * dependencies automatically.
 */
export async function cleanTestData() {
  // Use a single raw statement with TRUNCATE CASCADE for all test tables.
  // This is the most reliable approach for test cleanup.
  await (prisma as any).$executeRaw`
    TRUNCATE TABLE
      document_signatures,
      document_versions,
      documents,
      audit_logs,
      override_logs,
      workflow_actions,
      workflow_instances,
      workflow_steps,
      workflow_templates,
      posting_exceptions,
      posting_events,
      screen_permissions,
      project_assignments,
      project_settings,
      projects,
      entities
    CASCADE
  `;
  // Don't delete users/roles/permissions/currencies/countries — they're seeded
}
