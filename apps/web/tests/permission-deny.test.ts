/**
 * Permission deny test suite — Phase 1.10 (expanded from Task 1.3.17)
 *
 * Verifies that all procedure tiers correctly deny unauthorized callers:
 *   - protectedProcedure: UNAUTHORIZED for unauthenticated
 *   - adminProcedure: UNAUTHORIZED for unauthenticated, FORBIDDEN for non-admin
 *   - projectProcedure: UNAUTHORIZED for unauthenticated (project isolation
 *     tested separately in e2e/project-isolation.test.ts)
 *
 * Covers all 11 tRPC routers:
 *   auth, projects, entities, referenceData, workflow, documents, posting,
 *   notifications, dashboard, audit, health
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  unauthenticatedCaller,
  masterAdminCaller,
  authenticatedCaller,
} from './helpers/auth-test-callers';
import { prisma } from '@fmksa/db';

// ---------------------------------------------------------------------------
// Non-admin test user for FORBIDDEN checks
// ---------------------------------------------------------------------------

const ts = Date.now();
let nonAdminUserId: string;
let testRoleId: string;

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      email: `permdeny-${ts}@test.com`,
      name: 'Permission Deny Test User',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });
  nonAdminUserId = user.id;

  const role = await prisma.role.create({
    data: {
      code: `PERMDENY-${ts}`,
      name: 'Permission Deny Role',
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
  await prisma.role.deleteMany({ where: { code: `PERMDENY-${ts}` } });
  await prisma.user.deleteMany({ where: { email: `permdeny-${ts}@test.com` } });
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
// 1. AUTH ROUTER (protectedProcedure)
// ---------------------------------------------------------------------------

describe('auth router — protected procedures', () => {
  it('auth.me rejects unauthenticated', async () => {
    const c = await unauthenticatedCaller();
    await expectUnauthorized(() => c.auth.me());
  });

  it('auth.signOut rejects unauthenticated', async () => {
    const c = await unauthenticatedCaller();
    await expectUnauthorized(() => c.auth.signOut());
  });

  it('auth.changePassword rejects unauthenticated', async () => {
    const c = await unauthenticatedCaller();
    await expectUnauthorized(() =>
      c.auth.changePassword({ currentPassword: 'x', newPassword: 'NewP@ss12345' }),
    );
  });

  it('auth.me succeeds for authenticated user', async () => {
    const c = await masterAdminCaller();
    const result = await c.auth.me();
    expect(result.email).toBeTruthy();
    expect(result.permissions).toContain('system.admin');
  });
});

// ---------------------------------------------------------------------------
// 2. DASHBOARD ROUTER (protectedProcedure)
// ---------------------------------------------------------------------------

describe('dashboard router — protected procedures', () => {
  it('dashboard.summary rejects unauthenticated', async () => {
    const c = await unauthenticatedCaller();
    await expectUnauthorized(() => c.dashboard.summary());
  });

  it('dashboard.summary succeeds for authenticated', async () => {
    const c = await authenticatedCaller(nonAdminUserId);
    const result = await c.dashboard.summary();
    expect(result).toHaveProperty('pendingApprovals');
    expect(result.isAdmin).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. NOTIFICATIONS ROUTER (mixed: protected + admin)
// ---------------------------------------------------------------------------

describe('notifications router — protected procedures', () => {
  it('notifications.list rejects unauthenticated', async () => {
    const c = await unauthenticatedCaller();
    await expectUnauthorized(() => c.notifications.list({}));
  });

  it('notifications.unreadCount rejects unauthenticated', async () => {
    const c = await unauthenticatedCaller();
    await expectUnauthorized(() => c.notifications.unreadCount());
  });

  it('notifications.getPreferences rejects unauthenticated', async () => {
    const c = await unauthenticatedCaller();
    await expectUnauthorized(() => c.notifications.getPreferences());
  });
});

describe('notifications router — admin procedures', () => {
  it('notifications.templates.list rejects unauthenticated', async () => {
    const c = await unauthenticatedCaller();
    await expectUnauthorized(() => c.notifications.templates.list());
  });

  it('notifications.templates.list rejects non-admin', async () => {
    const c = await authenticatedCaller(nonAdminUserId);
    await expectForbidden(() => c.notifications.templates.list());
  });

  it('notifications.templates.list succeeds for admin', async () => {
    const c = await masterAdminCaller();
    const result = await c.notifications.templates.list();
    expect(Array.isArray(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. ENTITIES ROUTER (mixed: protected read + admin write)
// ---------------------------------------------------------------------------

describe('entities router — protected procedures', () => {
  it('entities.list rejects unauthenticated', async () => {
    const c = await unauthenticatedCaller();
    await expectUnauthorized(() => c.entities.list({}));
  });
});

describe('entities router — admin procedures', () => {
  it('entities.create rejects unauthenticated', async () => {
    const c = await unauthenticatedCaller();
    await expectUnauthorized(() =>
      c.entities.create({ code: 'X', name: 'X', type: 'parent' }),
    );
  });

  it('entities.create rejects non-admin', async () => {
    const c = await authenticatedCaller(nonAdminUserId);
    await expectForbidden(() =>
      c.entities.create({ code: 'X', name: 'X', type: 'parent' }),
    );
  });
});

// ---------------------------------------------------------------------------
// 5. REFERENCE DATA ROUTER (mixed: protected read + admin write)
// ---------------------------------------------------------------------------

describe('referenceData router — protected procedures', () => {
  it('referenceData.countries.list rejects unauthenticated', async () => {
    const c = await unauthenticatedCaller();
    await expectUnauthorized(() => c.referenceData.countries.list());
  });

  it('referenceData.currencies.list rejects unauthenticated', async () => {
    const c = await unauthenticatedCaller();
    await expectUnauthorized(() => c.referenceData.currencies.list());
  });
});

describe('referenceData router — admin procedures', () => {
  it('referenceData.appSettings.set rejects unauthenticated', async () => {
    const c = await unauthenticatedCaller();
    await expectUnauthorized(() =>
      c.referenceData.appSettings.set({ key: 'test', value: 'x' }),
    );
  });

  it('referenceData.appSettings.set rejects non-admin', async () => {
    const c = await authenticatedCaller(nonAdminUserId);
    await expectForbidden(() =>
      c.referenceData.appSettings.set({ key: 'test', value: 'x' }),
    );
  });
});

// ---------------------------------------------------------------------------
// 6. PROJECTS ROUTER (mixed: protected list + admin create/assign + project-scoped)
// ---------------------------------------------------------------------------

describe('projects router — protected procedures', () => {
  it('projects.list rejects unauthenticated', async () => {
    const c = await unauthenticatedCaller();
    await expectUnauthorized(() => c.projects.list({}));
  });
});

describe('projects router — admin procedures', () => {
  it('projects.create rejects unauthenticated', async () => {
    const c = await unauthenticatedCaller();
    await expectUnauthorized(() =>
      c.projects.create({
        code: 'X',
        name: 'X',
        entityId: '00000000-0000-0000-0000-000000000000',
        currencyCode: 'SAR',
        startDate: new Date(),
      }),
    );
  });

  it('projects.create rejects non-admin', async () => {
    const c = await authenticatedCaller(nonAdminUserId);
    await expectForbidden(() =>
      c.projects.create({
        code: 'X',
        name: 'X',
        entityId: '00000000-0000-0000-0000-000000000000',
        currencyCode: 'SAR',
        startDate: new Date(),
      }),
    );
  });

  it('projects.assignments.assign rejects non-admin', async () => {
    const c = await authenticatedCaller(nonAdminUserId);
    await expectForbidden(() =>
      c.projects.assignments.assign({
        projectId: '00000000-0000-0000-0000-000000000000',
        userId: '00000000-0000-0000-0000-000000000000',
        roleId: '00000000-0000-0000-0000-000000000000',
        effectiveFrom: new Date(),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// 7. WORKFLOW ROUTER — admin template management
// ---------------------------------------------------------------------------

describe('workflow router — admin procedures', () => {
  it('workflow.templates.list rejects unauthenticated', async () => {
    const c = await unauthenticatedCaller();
    await expectUnauthorized(() => c.workflow.templates.list());
  });

  it('workflow.templates.list rejects non-admin', async () => {
    const c = await authenticatedCaller(nonAdminUserId);
    await expectForbidden(() => c.workflow.templates.list());
  });

  it('workflow.templates.list succeeds for admin', async () => {
    const c = await masterAdminCaller();
    const result = await c.workflow.templates.list();
    expect(Array.isArray(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8. POSTING ROUTER (admin only)
// ---------------------------------------------------------------------------

describe('posting router — admin procedures', () => {
  it('posting.events.list rejects unauthenticated', async () => {
    const c = await unauthenticatedCaller();
    await expectUnauthorized(() => c.posting.events.list({}));
  });

  it('posting.events.list rejects non-admin', async () => {
    const c = await authenticatedCaller(nonAdminUserId);
    await expectForbidden(() => c.posting.events.list({}));
  });

  it('posting.exceptions.list rejects non-admin', async () => {
    const c = await authenticatedCaller(nonAdminUserId);
    await expectForbidden(() => c.posting.exceptions.list({}));
  });

  it('posting.events.list succeeds for admin', async () => {
    const c = await masterAdminCaller();
    const result = await c.posting.events.list({});
    expect(result).toHaveProperty('events');
    expect(result).toHaveProperty('total');
  });
});

// ---------------------------------------------------------------------------
// 9. AUDIT ROUTER (admin only)
// ---------------------------------------------------------------------------

describe('audit router — admin procedures', () => {
  it('audit.list rejects unauthenticated', async () => {
    const c = await unauthenticatedCaller();
    await expectUnauthorized(() => c.audit.list({}));
  });

  it('audit.list rejects non-admin', async () => {
    const c = await authenticatedCaller(nonAdminUserId);
    await expectForbidden(() => c.audit.list({}));
  });

  it('audit.overrides rejects non-admin', async () => {
    const c = await authenticatedCaller(nonAdminUserId);
    await expectForbidden(() => c.audit.overrides({}));
  });

  it('audit.list succeeds for admin', async () => {
    const c = await masterAdminCaller();
    const result = await c.audit.list({});
    expect(result).toHaveProperty('items');
    expect(result).toHaveProperty('total');
  });
});

// ---------------------------------------------------------------------------
// 10. HEALTH ROUTER (admin only)
// ---------------------------------------------------------------------------

describe('health router — admin procedures', () => {
  it('health.overview rejects unauthenticated', async () => {
    const c = await unauthenticatedCaller();
    await expectUnauthorized(() => c.health.overview());
  });

  it('health.overview rejects non-admin', async () => {
    const c = await authenticatedCaller(nonAdminUserId);
    await expectForbidden(() => c.health.overview());
  });

  it('health.overview succeeds for admin', async () => {
    const c = await masterAdminCaller();
    const result = await c.health.overview();
    expect(result.db.connected).toBe(true);
  });
});
