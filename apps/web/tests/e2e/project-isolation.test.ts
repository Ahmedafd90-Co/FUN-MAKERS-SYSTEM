/**
 * E2E: Project isolation integration test — Task 1.3.19
 *
 * Tests project-scope isolation end-to-end: user setup, project assignment,
 * access check, and audit log verification.
 *
 * Uses a small test router with `projectProcedure` (same pattern as
 * server/middleware/project-scope.test.ts) but focuses on the full
 * user-lifecycle flow rather than middleware internals.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { prisma } from '@fmksa/db';
import {
  router,
  createCallerFactory,
  projectProcedure,
} from '../../server/trpc';
import { makeCtx, loadAuthUser } from '../helpers/auth-test-callers';
import type { AuthUser } from '@fmksa/core';
import type { Context } from '../../server/context';

// ---------------------------------------------------------------------------
// Test router — echoes back ctx.projectId to prove access was granted
// ---------------------------------------------------------------------------

const isolationRouter = router({
  getProjectData: projectProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(({ ctx }) => {
      return {
        projectId: (ctx as Context & { projectId: string }).projectId,
        granted: true,
      };
    }),
});

const createCaller = createCallerFactory(isolationRouter);

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

let userA: AuthUser;
let userB: AuthUser;
let masterAdmin: AuthUser;

let entityId: string;
let projectA: { id: string };
let projectB: { id: string };
let roleId: string;

function pastDate(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

// ---------------------------------------------------------------------------
// Setup — two projects, two users, each assigned to one project
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Entity
  const entity = await prisma.entity.create({
    data: {
      code: `ENT-ISO-${Date.now()}`,
      name: 'Isolation Test Entity',
      type: 'parent',
      status: 'active',
    },
  });
  entityId = entity.id;

  // Two projects
  projectA = await prisma.project.create({
    data: {
      code: `ISO-A-${Date.now()}`,
      name: 'Isolation Project A',
      entityId: entity.id,
      currencyCode: 'SAR',
      startDate: new Date(),
      createdBy: 'test',
      status: 'active',
    },
  });

  projectB = await prisma.project.create({
    data: {
      code: `ISO-B-${Date.now()}`,
      name: 'Isolation Project B',
      entityId: entity.id,
      currencyCode: 'SAR',
      startDate: new Date(),
      createdBy: 'test',
      status: 'active',
    },
  });

  // Role for assignments
  const pmRole = await prisma.role.findUniqueOrThrow({
    where: { code: 'project_manager' },
  });
  roleId = pmRole.id;

  // --- User A — assigned to Project A only ---
  const userADb = await prisma.user.create({
    data: {
      email: `iso-user-a-${Date.now()}@test.com`,
      name: 'Isolation User A',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });

  await prisma.userRole.create({
    data: {
      userId: userADb.id,
      roleId,
      effectiveFrom: pastDate(10),
      assignedBy: 'test',
      assignedAt: new Date(),
    },
  });

  await prisma.projectAssignment.create({
    data: {
      projectId: projectA.id,
      userId: userADb.id,
      roleId,
      effectiveFrom: pastDate(10),
      assignedBy: 'test',
      assignedAt: new Date(),
    },
  });

  userA = await loadAuthUser(userADb.id);

  // --- User B — assigned to Project B only ---
  const userBDb = await prisma.user.create({
    data: {
      email: `iso-user-b-${Date.now()}@test.com`,
      name: 'Isolation User B',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });

  await prisma.userRole.create({
    data: {
      userId: userBDb.id,
      roleId,
      effectiveFrom: pastDate(10),
      assignedBy: 'test',
      assignedAt: new Date(),
    },
  });

  await prisma.projectAssignment.create({
    data: {
      projectId: projectB.id,
      userId: userBDb.id,
      roleId,
      effectiveFrom: pastDate(10),
      assignedBy: 'test',
      assignedAt: new Date(),
    },
  });

  userB = await loadAuthUser(userBDb.id);

  // --- Master Admin (has cross_project.read) ---
  const masterAdminRole = await prisma.role.findUniqueOrThrow({
    where: { code: 'master_admin' },
  });

  const masterAdminDb = await prisma.user.create({
    data: {
      email: `iso-admin-${Date.now()}@test.com`,
      name: 'Isolation Master Admin',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });

  await prisma.userRole.create({
    data: {
      userId: masterAdminDb.id,
      roleId: masterAdminRole.id,
      effectiveFrom: pastDate(10),
      assignedBy: 'test',
      assignedAt: new Date(),
    },
  });

  masterAdmin = await loadAuthUser(masterAdminDb.id);
});

afterAll(async () => {
  const userIds = [userA.id, userB.id, masterAdmin.id];
  await prisma.projectAssignment.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.userRole.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.project.deleteMany({
    where: { id: { in: [projectA.id, projectB.id] } },
  });
  await prisma.entity.deleteMany({ where: { id: entityId } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('E2E: project isolation', () => {
  it('user assigned to project A can access project A', async () => {
    const caller = createCaller(makeCtx(userA));
    const result = await caller.getProjectData({ projectId: projectA.id });
    expect(result.projectId).toBe(projectA.id);
    expect(result.granted).toBe(true);
  });

  it('user assigned to project A cannot access project B', async () => {
    const caller = createCaller(makeCtx(userA));
    await expect(
      caller.getProjectData({ projectId: projectB.id }),
    ).rejects.toThrow(TRPCError);

    await expect(
      caller.getProjectData({ projectId: projectB.id }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: "You don't have access to this project.",
    });
  });

  it('user assigned to project B cannot access project A', async () => {
    const caller = createCaller(makeCtx(userB));
    await expect(
      caller.getProjectData({ projectId: projectA.id }),
    ).rejects.toThrow(TRPCError);

    await expect(
      caller.getProjectData({ projectId: projectA.id }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('user assigned to project B can access project B', async () => {
    const caller = createCaller(makeCtx(userB));
    const result = await caller.getProjectData({ projectId: projectB.id });
    expect(result.projectId).toBe(projectB.id);
    expect(result.granted).toBe(true);
  });

  it('Master Admin can access project A (cross_project.read)', async () => {
    const caller = createCaller(makeCtx(masterAdmin));
    const result = await caller.getProjectData({ projectId: projectA.id });
    expect(result.projectId).toBe(projectA.id);
    expect(result.granted).toBe(true);
  });

  it('Master Admin can access project B (cross_project.read)', async () => {
    const caller = createCaller(makeCtx(masterAdmin));
    const result = await caller.getProjectData({ projectId: projectB.id });
    expect(result.projectId).toBe(projectB.id);
    expect(result.granted).toBe(true);
  });

  it('access denial writes audit log', async () => {
    const beforeCall = new Date();

    const caller = createCaller(makeCtx(userA));
    await expect(
      caller.getProjectData({ projectId: projectB.id }),
    ).rejects.toThrow(TRPCError);

    // Verify the audit log was written
    const logs = await prisma.auditLog.findMany({
      where: {
        actorUserId: userA.id,
        action: 'access_denied',
        resourceType: 'project',
        resourceId: projectB.id,
        createdAt: { gte: beforeCall },
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    expect(logs).toHaveLength(1);
    expect(logs[0]!.actorSource).toBe('user');
    expect(logs[0]!.projectId).toBe(projectB.id);

    const afterJson = logs[0]!.afterJson as { reason: string };
    expect(afterJson.reason).toBe('not_assigned');
  });

  it('unauthenticated caller cannot access any project', async () => {
    const caller = createCaller(makeCtx(null));
    await expect(
      caller.getProjectData({ projectId: projectA.id }),
    ).rejects.toThrow(TRPCError);

    await expect(
      caller.getProjectData({ projectId: projectA.id }),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});
