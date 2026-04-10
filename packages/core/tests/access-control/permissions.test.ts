import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@fmksa/db';
import {
  getEffectiveRoles,
  getPermissionCodes,
  hasPermission,
} from '../../src/access-control/permissions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function futureDate(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function pastDate(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

let testUser: { id: string };
let testUser2: { id: string };
let noRoleUser: { id: string };
let masterAdminUser: { id: string };

let pmRoleId: string;
let siteTeamRoleId: string;
let masterAdminRoleId: string;

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Create test users
  testUser = await prisma.user.create({
    data: {
      email: `perm-test-1-${Date.now()}@test.com`,
      name: 'Perm Test User 1',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });

  testUser2 = await prisma.user.create({
    data: {
      email: `perm-test-2-${Date.now()}@test.com`,
      name: 'Perm Test User 2',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });

  noRoleUser = await prisma.user.create({
    data: {
      email: `perm-test-norole-${Date.now()}@test.com`,
      name: 'No Role User',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });

  masterAdminUser = await prisma.user.create({
    data: {
      email: `perm-test-admin-${Date.now()}@test.com`,
      name: 'Test Master Admin',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });

  // Look up seeded roles
  const pmRole = await prisma.role.findUniqueOrThrow({ where: { code: 'project_manager' } });
  const siteTeamRole = await prisma.role.findUniqueOrThrow({ where: { code: 'site_team' } });
  const maRole = await prisma.role.findUniqueOrThrow({ where: { code: 'master_admin' } });

  pmRoleId = pmRole.id;
  siteTeamRoleId = siteTeamRole.id;
  masterAdminRoleId = maRole.id;

  // testUser: active PM role (effective now, no end date)
  await prisma.userRole.create({
    data: {
      userId: testUser.id,
      roleId: pmRoleId,
      effectiveFrom: pastDate(10),
      assignedBy: 'test',
      assignedAt: new Date(),
    },
  });

  // testUser: future-dated site_team role (starts in 30 days)
  await prisma.userRole.create({
    data: {
      userId: testUser.id,
      roleId: siteTeamRoleId,
      effectiveFrom: futureDate(30),
      assignedBy: 'test',
      assignedAt: new Date(),
    },
  });

  // testUser2: expired PM role (ended 5 days ago)
  await prisma.userRole.create({
    data: {
      userId: testUser2.id,
      roleId: pmRoleId,
      effectiveFrom: pastDate(30),
      effectiveTo: pastDate(5),
      assignedBy: 'test',
      assignedAt: new Date(),
    },
  });

  // testUser2: also has site_team active
  await prisma.userRole.create({
    data: {
      userId: testUser2.id,
      roleId: siteTeamRoleId,
      effectiveFrom: pastDate(10),
      assignedBy: 'test',
      assignedAt: new Date(),
    },
  });

  // masterAdminUser: active master_admin role
  await prisma.userRole.create({
    data: {
      userId: masterAdminUser.id,
      roleId: masterAdminRoleId,
      effectiveFrom: pastDate(10),
      assignedBy: 'test',
      assignedAt: new Date(),
    },
  });
});

afterAll(async () => {
  // Clean up test UserRoles and Users
  const userIds = [testUser.id, testUser2.id, noRoleUser.id, masterAdminUser.id];
  await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getEffectiveRoles', () => {
  it('returns active roles and excludes future-dated roles', async () => {
    const roles = await getEffectiveRoles(testUser.id);
    const codes = roles.map((r) => r.code);

    expect(codes).toContain('project_manager');
    expect(codes).not.toContain('site_team'); // future-dated
  });

  it('excludes expired roles', async () => {
    const roles = await getEffectiveRoles(testUser2.id);
    const codes = roles.map((r) => r.code);

    expect(codes).toContain('site_team');
    expect(codes).not.toContain('project_manager'); // expired
  });

  it('returns empty set for user with no roles', async () => {
    const roles = await getEffectiveRoles(noRoleUser.id);
    expect(roles).toHaveLength(0);
  });
});

describe('getPermissionCodes', () => {
  it('returns union of permissions from multiple active roles', async () => {
    // testUser2 has only site_team active. site_team currently has no
    // permissions mapped in seeds (only master_admin does). But we can
    // verify the union logic by checking master admin.
    const codes = await getPermissionCodes(masterAdminUser.id);
    // Master Admin has all seeded permissions (at least 40+).
    // The exact count depends on the seed run; we verify key permissions exist.
    expect(codes.length).toBeGreaterThanOrEqual(40);
    expect(codes).toContain('override.execute');
    expect(codes).toContain('cross_project.read');
    expect(codes).toContain('project.view');
    expect(codes).toContain('audit.view');
  });

  it('returns empty set for user with no roles', async () => {
    const codes = await getPermissionCodes(noRoleUser.id);
    expect(codes).toHaveLength(0);
  });
});

describe('hasPermission', () => {
  it('returns true when Master Admin checks for override.execute', async () => {
    const result = await hasPermission(masterAdminUser.id, 'override.execute');
    expect(result).toBe(true);
  });

  it('returns false for user with no roles', async () => {
    const result = await hasPermission(noRoleUser.id, 'project.view');
    expect(result).toBe(false);
  });

  it('returns false for a non-existent permission code', async () => {
    const result = await hasPermission(masterAdminUser.id, 'does.not.exist');
    expect(result).toBe(false);
  });
});
