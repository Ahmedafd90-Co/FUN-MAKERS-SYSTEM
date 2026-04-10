import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@fmksa/db';
import { canReadAcrossProjects } from '../../src/access-control/cross-project';
import { requirePermission } from '../../src/access-control/service';
import { PermissionDeniedError } from '../../src/access-control/errors';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pastDate(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

let masterAdminUser: { id: string };
let regularUser: { id: string };

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  masterAdminUser = await prisma.user.create({
    data: {
      email: `cross-proj-admin-${Date.now()}@test.com`,
      name: 'Cross-Project Admin',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });

  regularUser = await prisma.user.create({
    data: {
      email: `cross-proj-regular-${Date.now()}@test.com`,
      name: 'Cross-Project Regular',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });

  const maRole = await prisma.role.findUniqueOrThrow({ where: { code: 'master_admin' } });
  const pmRole = await prisma.role.findUniqueOrThrow({ where: { code: 'project_manager' } });

  // Master Admin gets all permissions via role-permissions seed
  await prisma.userRole.create({
    data: {
      userId: masterAdminUser.id,
      roleId: maRole.id,
      effectiveFrom: pastDate(10),
      assignedBy: 'test',
      assignedAt: new Date(),
    },
  });

  // Regular PM — currently only master_admin has permissions mapped in seeds
  await prisma.userRole.create({
    data: {
      userId: regularUser.id,
      roleId: pmRole.id,
      effectiveFrom: pastDate(10),
      assignedBy: 'test',
      assignedAt: new Date(),
    },
  });
});

afterAll(async () => {
  const userIds = [masterAdminUser.id, regularUser.id];
  await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

// ---------------------------------------------------------------------------
// Task 1.3.9 — canReadAcrossProjects
// ---------------------------------------------------------------------------

describe('canReadAcrossProjects', () => {
  it('returns true for Master Admin (has cross_project.read)', async () => {
    const result = await canReadAcrossProjects(masterAdminUser.id);
    expect(result).toBe(true);
  });

  it('returns false for regular PM (no cross_project.read mapped)', async () => {
    const result = await canReadAcrossProjects(regularUser.id);
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Task 1.3.10 — requirePermission
// ---------------------------------------------------------------------------

describe('requirePermission', () => {
  it('does not throw when user has the required permission', async () => {
    await expect(
      requirePermission(masterAdminUser.id, 'project.view'),
    ).resolves.toBeUndefined();
  });

  it('throws PermissionDeniedError when user lacks the permission', async () => {
    try {
      await requirePermission(regularUser.id, 'override.execute', 'some-project-id');
      // Should not reach here
      expect.fail('Expected PermissionDeniedError to be thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PermissionDeniedError);
      const pde = err as PermissionDeniedError;
      expect(pde.code).toBe('PERMISSION_DENIED');
      expect(pde.permissionCode).toBe('override.execute');
      expect(pde.projectId).toBe('some-project-id');
    }
  });

  it('throws PermissionDeniedError without projectId when not provided', async () => {
    try {
      await requirePermission(regularUser.id, 'system.admin');
      expect.fail('Expected PermissionDeniedError to be thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PermissionDeniedError);
      const pde = err as PermissionDeniedError;
      expect(pde.code).toBe('PERMISSION_DENIED');
      expect(pde.permissionCode).toBe('system.admin');
      expect(pde.projectId).toBeUndefined();
    }
  });
});
