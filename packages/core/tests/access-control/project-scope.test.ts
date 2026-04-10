import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@fmksa/db';
import {
  isAssignedToProject,
  getAssignedProjectIds,
} from '../../src/access-control/project-scope';

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

let user: { id: string };
let noAssignUser: { id: string };
let entity: { id: string };
let projectA: { id: string };
let projectB: { id: string };
let roleId: string;

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  user = await prisma.user.create({
    data: {
      email: `proj-scope-1-${Date.now()}@test.com`,
      name: 'Proj Scope User',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });

  noAssignUser = await prisma.user.create({
    data: {
      email: `proj-scope-none-${Date.now()}@test.com`,
      name: 'No Assignment User',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });

  entity = await prisma.entity.create({
    data: {
      code: `ENT-PS-${Date.now()}`,
      name: 'Project Scope Test Entity',
      type: 'parent',
      status: 'active',
    },
  });

  projectA = await prisma.project.create({
    data: {
      code: `PA-${Date.now()}`,
      name: 'Project A',
      entityId: entity.id,
      currencyCode: 'SAR',
      startDate: new Date(),
      createdBy: 'test',
      status: 'active',
    },
  });

  projectB = await prisma.project.create({
    data: {
      code: `PB-${Date.now()}`,
      name: 'Project B',
      entityId: entity.id,
      currencyCode: 'SAR',
      startDate: new Date(),
      createdBy: 'test',
      status: 'active',
    },
  });

  const pmRole = await prisma.role.findUniqueOrThrow({ where: { code: 'project_manager' } });
  roleId = pmRole.id;

  // Active assignment to Project A
  await prisma.projectAssignment.create({
    data: {
      projectId: projectA.id,
      userId: user.id,
      roleId,
      effectiveFrom: pastDate(10),
      assignedBy: 'test',
      assignedAt: new Date(),
    },
  });

  // Future assignment to Project B (starts in 30 days)
  await prisma.projectAssignment.create({
    data: {
      projectId: projectB.id,
      userId: user.id,
      roleId,
      effectiveFrom: futureDate(30),
      assignedBy: 'test',
      assignedAt: new Date(),
    },
  });

  // Expired assignment — create a separate project for this
  // We reuse projectB with a second, expired assignment
  await prisma.projectAssignment.create({
    data: {
      projectId: projectB.id,
      userId: user.id,
      roleId,
      effectiveFrom: pastDate(60),
      effectiveTo: pastDate(5),
      assignedBy: 'test',
      assignedAt: new Date(),
    },
  });

  // Revoked assignment (revokedAt set) — add another to projectA
  await prisma.projectAssignment.create({
    data: {
      projectId: projectA.id,
      userId: user.id,
      roleId,
      effectiveFrom: pastDate(10),
      assignedBy: 'test',
      assignedAt: new Date(),
      revokedAt: pastDate(2),
      revokedBy: 'test',
      reason: 'testing revocation',
    },
  });
});

afterAll(async () => {
  const userIds = [user.id, noAssignUser.id];
  await prisma.projectAssignment.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.project.deleteMany({
    where: { id: { in: [projectA.id, projectB.id] } },
  });
  await prisma.entity.deleteMany({ where: { id: entity.id } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('isAssignedToProject', () => {
  it('returns true for an active assignment', async () => {
    const result = await isAssignedToProject(user.id, projectA.id);
    expect(result).toBe(true);
  });

  it('returns false for a future assignment', async () => {
    // Only the future assignment is non-expired for projectB
    // The expired one is also there but doesn't count
    const result = await isAssignedToProject(user.id, projectB.id);
    expect(result).toBe(false);
  });

  it('returns false for a user with no assignments', async () => {
    const result = await isAssignedToProject(noAssignUser.id, projectA.id);
    expect(result).toBe(false);
  });
});

describe('getAssignedProjectIds', () => {
  it('returns only currently active project IDs', async () => {
    const ids = await getAssignedProjectIds(user.id);
    expect(ids).toContain(projectA.id);
    // projectB should NOT be included (future + expired only)
    expect(ids).not.toContain(projectB.id);
  });

  it('returns empty array for user with no assignments', async () => {
    const ids = await getAssignedProjectIds(noAssignUser.id);
    expect(ids).toHaveLength(0);
  });
});
