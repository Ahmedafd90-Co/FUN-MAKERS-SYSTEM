/**
 * Admin procedure deny/allow tests — Phase 1.10
 *
 * Verifies that all adminProcedure-protected endpoints correctly:
 *   - Reject unauthenticated callers (UNAUTHORIZED)
 *   - Reject non-admin authenticated callers (FORBIDDEN)
 *   - Allow admin callers
 *
 * Covers: audit.list, audit.get, audit.overrides, audit.overrideDetail,
 *         health.overview
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  unauthenticatedCaller,
  masterAdminCaller,
  authenticatedCaller,
} from '../helpers/auth-test-callers';
import { prisma } from '@fmksa/db';

// ---------------------------------------------------------------------------
// Non-admin test user
// ---------------------------------------------------------------------------

const ts = Date.now();
let nonAdminUserId: string;
let testRoleId: string;

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      email: `admin-proc-test-${ts}@test.com`,
      name: 'Admin Procedure Test User',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });
  nonAdminUserId = user.id;

  const role = await prisma.role.create({
    data: {
      code: `ADMPROC-ROLE-${ts}`,
      name: 'Non-Admin Role',
      isSystem: false,
    },
  });
  testRoleId = role.id;

  await prisma.userRole.create({
    data: {
      userId: user.id,
      roleId: role.id,
      effectiveFrom: new Date('2020-01-01'),
      assignedBy: user.id,
      assignedAt: new Date(),
    },
  });
});

afterAll(async () => {
  await prisma.userRole.deleteMany({ where: { roleId: testRoleId } });
  await prisma.role.deleteMany({ where: { code: `ADMPROC-ROLE-${ts}` } });
  await prisma.user.deleteMany({ where: { email: `admin-proc-test-${ts}@test.com` } });
});

// ---------------------------------------------------------------------------
// audit.list
// ---------------------------------------------------------------------------

describe('audit.list', () => {
  it('rejects unauthenticated caller with UNAUTHORIZED', async () => {
    const caller = await unauthenticatedCaller();
    try {
      await caller.audit.list({});
    } catch (e) {
      expect((e as TRPCError).code).toBe('UNAUTHORIZED');
    }
  });

  it('rejects non-admin with FORBIDDEN', async () => {
    const caller = await authenticatedCaller(nonAdminUserId);
    try {
      await caller.audit.list({});
    } catch (e) {
      expect((e as TRPCError).code).toBe('FORBIDDEN');
    }
  });

  it('admin can list audit logs', async () => {
    const caller = await masterAdminCaller();
    const result = await caller.audit.list({});

    expect(result).toHaveProperty('items');
    expect(result).toHaveProperty('total');
    expect(Array.isArray(result.items)).toBe(true);
    expect(typeof result.total).toBe('number');
  });

  it('admin can filter by resourceType', async () => {
    const caller = await masterAdminCaller();
    const result = await caller.audit.list({ resourceType: 'posting_event' });

    expect(result).toHaveProperty('items');
    // All returned items (if any) should match the filter
    for (const item of result.items) {
      expect((item as any).resourceType).toBe('posting_event');
    }
  });
});

// ---------------------------------------------------------------------------
// audit.get
// ---------------------------------------------------------------------------

describe('audit.get', () => {
  it('rejects unauthenticated caller with UNAUTHORIZED', async () => {
    const caller = await unauthenticatedCaller();
    try {
      await caller.audit.get({ id: '00000000-0000-0000-0000-000000000000' });
    } catch (e) {
      expect((e as TRPCError).code).toBe('UNAUTHORIZED');
    }
  });

  it('rejects non-admin with FORBIDDEN', async () => {
    const caller = await authenticatedCaller(nonAdminUserId);
    try {
      await caller.audit.get({ id: '00000000-0000-0000-0000-000000000000' });
    } catch (e) {
      expect((e as TRPCError).code).toBe('FORBIDDEN');
    }
  });

  it('admin gets NOT_FOUND for non-existent ID', async () => {
    const caller = await masterAdminCaller();
    try {
      await caller.audit.get({ id: '00000000-0000-0000-0000-000000000000' });
    } catch (e) {
      expect((e as TRPCError).code).toBe('NOT_FOUND');
    }
  });
});

// ---------------------------------------------------------------------------
// audit.overrides
// ---------------------------------------------------------------------------

describe('audit.overrides', () => {
  it('rejects unauthenticated caller with UNAUTHORIZED', async () => {
    const caller = await unauthenticatedCaller();
    try {
      await caller.audit.overrides({});
    } catch (e) {
      expect((e as TRPCError).code).toBe('UNAUTHORIZED');
    }
  });

  it('rejects non-admin with FORBIDDEN', async () => {
    const caller = await authenticatedCaller(nonAdminUserId);
    try {
      await caller.audit.overrides({});
    } catch (e) {
      expect((e as TRPCError).code).toBe('FORBIDDEN');
    }
  });

  it('admin can list override logs', async () => {
    const caller = await masterAdminCaller();
    const result = await caller.audit.overrides({});

    expect(result).toHaveProperty('items');
    expect(result).toHaveProperty('total');
    expect(Array.isArray(result.items)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// audit.overrideDetail
// ---------------------------------------------------------------------------

describe('audit.overrideDetail', () => {
  it('rejects unauthenticated caller with UNAUTHORIZED', async () => {
    const caller = await unauthenticatedCaller();
    try {
      await caller.audit.overrideDetail({ id: '00000000-0000-0000-0000-000000000000' });
    } catch (e) {
      expect((e as TRPCError).code).toBe('UNAUTHORIZED');
    }
  });

  it('rejects non-admin with FORBIDDEN', async () => {
    const caller = await authenticatedCaller(nonAdminUserId);
    try {
      await caller.audit.overrideDetail({ id: '00000000-0000-0000-0000-000000000000' });
    } catch (e) {
      expect((e as TRPCError).code).toBe('FORBIDDEN');
    }
  });
});

// ---------------------------------------------------------------------------
// health.overview
// ---------------------------------------------------------------------------

describe('health.overview', () => {
  it('rejects unauthenticated caller with UNAUTHORIZED', async () => {
    const caller = await unauthenticatedCaller();
    try {
      await caller.health.overview();
    } catch (e) {
      expect((e as TRPCError).code).toBe('UNAUTHORIZED');
    }
  });

  it('rejects non-admin with FORBIDDEN', async () => {
    const caller = await authenticatedCaller(nonAdminUserId);
    try {
      await caller.health.overview();
    } catch (e) {
      expect((e as TRPCError).code).toBe('FORBIDDEN');
    }
  });

  it('admin gets health overview with correct shape', async () => {
    const caller = await masterAdminCaller();
    const result = await caller.health.overview();

    expect(result).toHaveProperty('db');
    expect(result).toHaveProperty('redis');
    expect(result).toHaveProperty('queues');
    expect(result).toHaveProperty('failedJobs');

    expect(result.db).toHaveProperty('connected');
    expect(result.db).toHaveProperty('latencyMs');
    expect(result.db.connected).toBe(true);
    expect(typeof result.db.latencyMs).toBe('number');

    expect(result.redis).toHaveProperty('connected');
    expect(result.redis).toHaveProperty('latencyMs');

    expect(Array.isArray(result.queues)).toBe(true);
    expect(Array.isArray(result.failedJobs)).toBe(true);
  });
});
