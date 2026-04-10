/**
 * Tests for the projectScope tRPC middleware — Task 1.3.12
 *
 * Uses a small inline tRPC router with `projectProcedure` and calls it
 * via `createCaller` with manually constructed contexts. Hits the real DB
 * for access-control checks and audit log verification.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { prisma } from '@fmksa/db';
import {
  router,
  createCallerFactory,
  projectProcedure,
} from '../trpc';
import type { Context } from '../context';
import type { AuthUser } from '@fmksa/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pastDate(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

/** Build a minimal tRPC context with the given user (or null). */
function makeCtx(user: AuthUser | null): Context {
  return { db: prisma, user, session: null };
}

// ---------------------------------------------------------------------------
// Test router — a single project-scoped query that echoes back ctx.projectId
// ---------------------------------------------------------------------------

const testRouter = router({
  getProjectData: projectProcedure
    .input(z.object({ projectId: z.string().uuid(), extra: z.string().optional() }))
    .query(({ ctx, input }) => {
      // ctx.projectId is injected by the middleware
      return {
        projectId: (ctx as Context & { projectId: string }).projectId,
        extra: input.extra ?? null,
      };
    }),
});

const createCaller = createCallerFactory(testRouter);

// ---------------------------------------------------------------------------
// Shared test state
// ---------------------------------------------------------------------------

let assignedUser: AuthUser;
let unassignedUser: AuthUser;
let masterAdmin: AuthUser;
let entity: { id: string };
let project: { id: string };
let roleId: string;

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Create entity + project
  entity = await prisma.entity.create({
    data: {
      code: `ENT-MW-${Date.now()}`,
      name: 'Middleware Test Entity',
      type: 'parent',
      status: 'active',
    },
  });

  project = await prisma.project.create({
    data: {
      code: `MW-${Date.now()}`,
      name: 'Middleware Test Project',
      entityId: entity.id,
      currencyCode: 'SAR',
      startDate: new Date(),
      createdBy: 'test',
      status: 'active',
    },
  });

  // Look up the project_manager role for the assignment
  const pmRole = await prisma.role.findUniqueOrThrow({
    where: { code: 'project_manager' },
  });
  roleId = pmRole.id;

  // --- Assigned user ---
  const assignedDbUser = await prisma.user.create({
    data: {
      email: `mw-assigned-${Date.now()}@test.com`,
      name: 'MW Assigned User',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });

  // Give this user a role so we can derive permissions
  await prisma.userRole.create({
    data: {
      userId: assignedDbUser.id,
      roleId,
      effectiveFrom: pastDate(10),
      assignedBy: 'test',
      assignedAt: new Date(),
    },
  });

  // Active project assignment
  await prisma.projectAssignment.create({
    data: {
      projectId: project.id,
      userId: assignedDbUser.id,
      roleId,
      effectiveFrom: pastDate(10),
      assignedBy: 'test',
      assignedAt: new Date(),
    },
  });

  // Load effective roles+permissions for the AuthUser shape
  const assignedRoles = await loadUserRolesAndPermissions(assignedDbUser.id);
  assignedUser = {
    id: assignedDbUser.id,
    email: assignedDbUser.email,
    name: assignedDbUser.name,
    status: assignedDbUser.status,
    ...assignedRoles,
  };

  // --- Unassigned user ---
  const unassignedDbUser = await prisma.user.create({
    data: {
      email: `mw-unassigned-${Date.now()}@test.com`,
      name: 'MW Unassigned User',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });

  // Give a role but NO project assignment
  await prisma.userRole.create({
    data: {
      userId: unassignedDbUser.id,
      roleId,
      effectiveFrom: pastDate(10),
      assignedBy: 'test',
      assignedAt: new Date(),
    },
  });

  const unassignedRoles = await loadUserRolesAndPermissions(unassignedDbUser.id);
  unassignedUser = {
    id: unassignedDbUser.id,
    email: unassignedDbUser.email,
    name: unassignedDbUser.name,
    status: unassignedDbUser.status,
    ...unassignedRoles,
  };

  // --- Master Admin (has cross_project.read) ---
  // Use the seeded master_admin role which includes cross_project.read
  const masterAdminRole = await prisma.role.findUniqueOrThrow({
    where: { code: 'master_admin' },
  });

  const masterAdminDbUser = await prisma.user.create({
    data: {
      email: `mw-admin-${Date.now()}@test.com`,
      name: 'MW Master Admin',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });

  await prisma.userRole.create({
    data: {
      userId: masterAdminDbUser.id,
      roleId: masterAdminRole.id,
      effectiveFrom: pastDate(10),
      assignedBy: 'test',
      assignedAt: new Date(),
    },
  });

  const adminRoles = await loadUserRolesAndPermissions(masterAdminDbUser.id);
  masterAdmin = {
    id: masterAdminDbUser.id,
    email: masterAdminDbUser.email,
    name: masterAdminDbUser.name,
    status: masterAdminDbUser.status,
    ...adminRoles,
  };
});

afterAll(async () => {
  const userIds = [assignedUser.id, unassignedUser.id, masterAdmin.id];
  await prisma.projectAssignment.deleteMany({
    where: { userId: { in: userIds } },
  });
  // Note: audit_logs is immutable (append-only), so we do NOT attempt
  // to delete those rows. Test audit entries are harmless in dev DB.
  await prisma.userRole.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.project.deleteMany({ where: { id: project.id } });
  await prisma.entity.deleteMany({ where: { id: entity.id } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

// ---------------------------------------------------------------------------
// Helper — load roles and permissions for a user (mirrors authService logic)
// ---------------------------------------------------------------------------

async function loadUserRolesAndPermissions(userId: string) {
  const now = new Date();
  const userRoles = await prisma.userRole.findMany({
    where: {
      userId,
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
    },
    include: {
      role: {
        include: {
          rolePermissions: { include: { permission: true } },
        },
      },
    },
  });

  const roles = userRoles.map((ur) => ({
    id: ur.role.id,
    code: ur.role.code,
    name: ur.role.name,
  }));

  const permissionSet = new Set<string>();
  for (const ur of userRoles) {
    for (const rp of ur.role.rolePermissions) {
      permissionSet.add(rp.permission.code);
    }
  }

  return { roles, permissions: Array.from(permissionSet) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('projectScope middleware', () => {
  it('allows access when user is assigned to the project', async () => {
    const caller = createCaller(makeCtx(assignedUser));
    const result = await caller.getProjectData({
      projectId: project.id,
      extra: 'hello',
    });
    expect(result.projectId).toBe(project.id);
    expect(result.extra).toBe('hello');
  });

  it('denies access when user is NOT assigned to the project', async () => {
    const caller = createCaller(makeCtx(unassignedUser));
    await expect(
      caller.getProjectData({ projectId: project.id }),
    ).rejects.toThrow(TRPCError);

    await expect(
      caller.getProjectData({ projectId: project.id }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: "You don't have access to this project.",
    });
  });

  it('denies access when user has no session (unauthenticated)', async () => {
    const caller = createCaller(makeCtx(null));
    await expect(
      caller.getProjectData({ projectId: project.id }),
    ).rejects.toThrow(TRPCError);

    await expect(
      caller.getProjectData({ projectId: project.id }),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('allows cross-project read for Master Admin', async () => {
    // Master Admin is NOT assigned to the project but has cross_project.read
    const caller = createCaller(makeCtx(masterAdmin));
    const result = await caller.getProjectData({ projectId: project.id });
    expect(result.projectId).toBe(project.id);
  });

  it('writes an audit log entry on denial', async () => {
    // Record timestamp before the call so we can query for entries created after
    const beforeCall = new Date();

    const caller = createCaller(makeCtx(unassignedUser));
    await expect(
      caller.getProjectData({ projectId: project.id }),
    ).rejects.toThrow(TRPCError);

    // Verify the audit log was written (query for entries after our timestamp)
    const logs = await prisma.auditLog.findMany({
      where: {
        actorUserId: unassignedUser.id,
        action: 'access_denied',
        resourceType: 'project',
        resourceId: project.id,
        createdAt: { gte: beforeCall },
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    expect(logs).toHaveLength(1);
    expect(logs[0]!.actorSource).toBe('user');
    expect(logs[0]!.projectId).toBe(project.id);

    const afterJson = logs[0]!.afterJson as { reason: string };
    expect(afterJson.reason).toBe('not_assigned');
  });

  it('provides projectId in context for downstream resolvers', async () => {
    // The resolver in the test router accesses ctx.projectId and returns it
    const caller = createCaller(makeCtx(assignedUser));
    const result = await caller.getProjectData({ projectId: project.id });
    expect(result.projectId).toBe(project.id);
  });
});
