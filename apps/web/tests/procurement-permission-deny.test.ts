/**
 * Procurement permission deny tests — Module 3, Slices 1 + B.
 *
 * Verifies that procurement router procedures enforce permissions:
 *   - Unauthenticated callers get UNAUTHORIZED
 *   - Authenticated callers without procurement permissions get FORBIDDEN
 *   - Terminate-class actions (cancel, close, expire) require .terminate perm
 *   - myPermissions query returns correct procurement permission set
 *
 * Follows the same pattern as permission-deny.test.ts.
 * Requires DATABASE_URL to run.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  unauthenticatedCaller,
  authenticatedCaller,
} from './helpers/auth-test-callers';
import { prisma } from '@fmksa/db';

// ---------------------------------------------------------------------------
// Test setup: two users — one with no perms, one with terminate perms
// ---------------------------------------------------------------------------

const ts = Date.now();
let noPermUserId: string;
let testRoleId: string;
let terminateUserId: string;
let terminateRoleId: string;
let testProjectId: string;
let testEntityId: string;

function pastDate(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

beforeAll(async () => {
  // ── Role A: zero procurement permissions ──
  const role = await prisma.role.create({
    data: {
      code: `PROCTEST-${ts}`,
      name: 'Procurement No Perm Role',
      isSystem: false,
    },
  });
  testRoleId = role.id;

  const user = await prisma.user.create({
    data: {
      email: `proc-noperm-${ts}@test.com`,
      name: 'Procurement No Perm User',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });
  noPermUserId = user.id;

  await prisma.userRole.create({
    data: {
      userId: noPermUserId,
      roleId: testRoleId,
      effectiveFrom: pastDate(10),
      assignedBy: 'test',
      assignedAt: new Date(),
    },
  });

  // ── Role B: rfq.view + rfq.terminate + quotation.view + quotation.terminate ──
  const termRole = await prisma.role.create({
    data: {
      code: `PROCTERMINATE-${ts}`,
      name: 'Procurement Terminate Role',
      isSystem: false,
    },
  });
  terminateRoleId = termRole.id;

  // Seed the terminate-specific permissions
  const permCodes = ['rfq.view', 'rfq.terminate', 'quotation.view', 'quotation.terminate'];
  for (const code of permCodes) {
    const perm = await prisma.permission.findFirst({ where: { code } });
    if (perm) {
      await prisma.rolePermission.create({
        data: { roleId: terminateRoleId, permissionId: perm.id },
      });
    }
  }

  const termUser = await prisma.user.create({
    data: {
      email: `proc-terminate-${ts}@test.com`,
      name: 'Procurement Terminate User',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });
  terminateUserId = termUser.id;

  await prisma.userRole.create({
    data: {
      userId: terminateUserId,
      roleId: terminateRoleId,
      effectiveFrom: pastDate(10),
      assignedBy: 'test',
      assignedAt: new Date(),
    },
  });

  // ── Shared project + entity ──
  const entity = await prisma.entity.findFirst();
  if (entity) {
    testEntityId = entity.id;
  } else {
    const e = await prisma.entity.create({
      data: {
        code: `PROCTEST-${ts}`,
        name: 'Procurement Test Entity',
        type: 'branch',
        status: 'active',
      },
    });
    testEntityId = e.id;
  }

  const project = await prisma.project.findFirst();
  if (project) {
    testProjectId = project.id;
  } else {
    const p = await prisma.project.create({
      data: {
        code: `PROCTEST-${ts}`,
        name: 'Procurement Test Project',
        status: 'active',
        entityId: testEntityId,
        currencyCode: 'SAR',
        startDate: new Date(),
        createdBy: 'test',
      },
    });
    testProjectId = p.id;
  }

  // Assign both users to the project
  await prisma.projectAssignment.createMany({
    data: [
      {
        userId: noPermUserId,
        projectId: testProjectId,
        roleId: testRoleId,
        effectiveFrom: pastDate(10),
        assignedBy: 'test',
        assignedAt: new Date(),
      },
      {
        userId: terminateUserId,
        projectId: testProjectId,
        roleId: terminateRoleId,
        effectiveFrom: pastDate(10),
        assignedBy: 'test',
        assignedAt: new Date(),
      },
    ],
  });
});

afterAll(async () => {
  // Cleanup in dependency order
  await prisma.projectAssignment.deleteMany({
    where: { userId: { in: [noPermUserId, terminateUserId] } },
  });
  await prisma.userRole.deleteMany({
    where: { userId: { in: [noPermUserId, terminateUserId] } },
  });
  await prisma.rolePermission.deleteMany({ where: { roleId: terminateRoleId } });
  await prisma.user.deleteMany({
    where: { id: { in: [noPermUserId, terminateUserId] } },
  });
  await prisma.role.deleteMany({
    where: { id: { in: [testRoleId, terminateRoleId] } },
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function expectUnauthorized(fn: () => Promise<unknown>) {
  try {
    await fn();
    expect.unreachable('Should have thrown');
  } catch (e) {
    expect((e as TRPCError).code).toBe('UNAUTHORIZED');
  }
}

async function expectForbidden(fn: () => Promise<unknown>) {
  try {
    await fn();
    expect.unreachable('Should have thrown');
  } catch (e) {
    expect((e as TRPCError).code).toBe('FORBIDDEN');
  }
}

// ---------------------------------------------------------------------------
// Unauthenticated → UNAUTHORIZED
// ---------------------------------------------------------------------------

describe('Procurement routers — unauthenticated callers', () => {
  it('rfq.list rejects unauthenticated', async () => {
    const caller = await unauthenticatedCaller();
    await expectUnauthorized(() =>
      caller.procurement.rfq.list({
        projectId: testProjectId,
        skip: 0,
        take: 10,
      }),
    );
  });

  it('rfq.get rejects unauthenticated', async () => {
    const caller = await unauthenticatedCaller();
    await expectUnauthorized(() =>
      caller.procurement.rfq.get({
        projectId: testProjectId,
        id: '00000000-0000-0000-0000-000000000000',
      }),
    );
  });

  it('quotation.list rejects unauthenticated', async () => {
    const caller = await unauthenticatedCaller();
    await expectUnauthorized(() =>
      caller.procurement.quotation.list({
        projectId: testProjectId,
        skip: 0,
        take: 10,
      }),
    );
  });

  it('quotation.compare rejects unauthenticated', async () => {
    const caller = await unauthenticatedCaller();
    await expectUnauthorized(() =>
      caller.procurement.quotation.compare({
        projectId: testProjectId,
        rfqId: '00000000-0000-0000-0000-000000000000',
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Authenticated without permissions → FORBIDDEN
// ---------------------------------------------------------------------------

describe('Procurement routers — no permission callers', () => {
  it('rfq.list rejects caller without rfq.view', async () => {
    const caller = await authenticatedCaller(noPermUserId);
    await expectForbidden(() =>
      caller.procurement.rfq.list({
        projectId: testProjectId,
        skip: 0,
        take: 10,
      }),
    );
  });

  it('rfq.transition rejects caller without rfq transition permission', async () => {
    const caller = await authenticatedCaller(noPermUserId);
    await expectForbidden(() =>
      caller.procurement.rfq.transition({
        projectId: testProjectId,
        id: '00000000-0000-0000-0000-000000000000',
        action: 'submit',
      }),
    );
  });

  it('quotation.list rejects caller without quotation.view', async () => {
    const caller = await authenticatedCaller(noPermUserId);
    await expectForbidden(() =>
      caller.procurement.quotation.list({
        projectId: testProjectId,
        skip: 0,
        take: 10,
      }),
    );
  });

  it('quotation.transition rejects caller without quotation transition permission', async () => {
    const caller = await authenticatedCaller(noPermUserId);
    await expectForbidden(() =>
      caller.procurement.quotation.transition({
        projectId: testProjectId,
        id: '00000000-0000-0000-0000-000000000000',
        action: 'review',
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Terminate permission enforcement (Stabilization Slice B)
// ---------------------------------------------------------------------------

describe('Procurement routers — terminate permission enforcement', () => {
  // ── Deny: no-perm user cannot cancel/close/expire ──

  it('rfq cancel rejects caller without rfq.terminate', async () => {
    const caller = await authenticatedCaller(noPermUserId);
    await expectForbidden(() =>
      caller.procurement.rfq.transition({
        projectId: testProjectId,
        id: '00000000-0000-0000-0000-000000000000',
        action: 'cancel',
      }),
    );
  });

  it('rfq close rejects caller without rfq.terminate', async () => {
    const caller = await authenticatedCaller(noPermUserId);
    await expectForbidden(() =>
      caller.procurement.rfq.transition({
        projectId: testProjectId,
        id: '00000000-0000-0000-0000-000000000000',
        action: 'close',
      }),
    );
  });

  it('quotation expire rejects caller without quotation.terminate', async () => {
    const caller = await authenticatedCaller(noPermUserId);
    await expectForbidden(() =>
      caller.procurement.quotation.transition({
        projectId: testProjectId,
        id: '00000000-0000-0000-0000-000000000000',
        action: 'expire',
      }),
    );
  });

  // ── Grant: terminate-user passes the permission gate ──
  // (Service may throw NOT_FOUND for the fake ID — that's expected;
  //  the key assertion is that it does NOT throw FORBIDDEN.)

  it('rfq cancel passes permission gate for user with rfq.terminate', async () => {
    const caller = await authenticatedCaller(terminateUserId);
    try {
      await caller.procurement.rfq.transition({
        projectId: testProjectId,
        id: '00000000-0000-0000-0000-000000000000',
        action: 'cancel',
      });
      // Should not reach here — the fake ID will cause a NOT_FOUND
      expect.unreachable('Should have thrown');
    } catch (e) {
      // Must NOT be FORBIDDEN — any other error (NOT_FOUND, BAD_REQUEST) is fine
      expect((e as TRPCError).code).not.toBe('FORBIDDEN');
    }
  });

  it('quotation expire passes permission gate for user with quotation.terminate', async () => {
    const caller = await authenticatedCaller(terminateUserId);
    try {
      await caller.procurement.quotation.transition({
        projectId: testProjectId,
        id: '00000000-0000-0000-0000-000000000000',
        action: 'expire',
      });
      expect.unreachable('Should have thrown');
    } catch (e) {
      expect((e as TRPCError).code).not.toBe('FORBIDDEN');
    }
  });
});

// ---------------------------------------------------------------------------
// myPermissions query (Stabilization Slice B)
// ---------------------------------------------------------------------------

describe('Procurement myPermissions query', () => {
  it('returns procurement permissions for terminate-user', async () => {
    const caller = await authenticatedCaller(terminateUserId);
    const perms = await caller.procurement.myPermissions();
    expect(perms).toContain('rfq.terminate');
    expect(perms).toContain('quotation.terminate');
    expect(perms).toContain('rfq.view');
    expect(perms).toContain('quotation.view');
  });

  it('returns empty array for user with no procurement permissions', async () => {
    const caller = await authenticatedCaller(noPermUserId);
    const perms = await caller.procurement.myPermissions();
    expect(perms).toHaveLength(0);
  });

  it('rejects unauthenticated caller', async () => {
    const caller = await unauthenticatedCaller();
    await expectUnauthorized(() => caller.procurement.myPermissions());
  });
});
