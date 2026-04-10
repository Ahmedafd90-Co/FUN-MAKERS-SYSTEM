/**
 * Dashboard tRPC router E2E tests — Phase 1.10
 *
 * Tests:
 *   - Authenticated user gets summary with correct shape
 *   - Admin user gets recentActivity populated
 *   - Non-admin user gets empty recentActivity
 *   - Unauthenticated caller is rejected
 */
import { describe, it, expect } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  unauthenticatedCaller,
  masterAdminCaller,
  authenticatedCaller,
} from '../helpers/auth-test-callers';
import { prisma } from '@fmksa/db';

describe('dashboard.summary', () => {
  it('rejects unauthenticated caller', async () => {
    const caller = await unauthenticatedCaller();
    await expect(caller.dashboard.summary()).rejects.toThrow(TRPCError);

    try {
      await caller.dashboard.summary();
    } catch (e) {
      expect((e as TRPCError).code).toBe('UNAUTHORIZED');
    }
  });

  it('admin gets full summary with recentActivity', async () => {
    const caller = await masterAdminCaller();
    const result = await caller.dashboard.summary();

    expect(result).toHaveProperty('pendingApprovals');
    expect(result).toHaveProperty('assignedProjects');
    expect(result).toHaveProperty('unreadNotifications');
    expect(result).toHaveProperty('recentActivity');
    expect(result).toHaveProperty('isAdmin');

    expect(typeof result.pendingApprovals).toBe('number');
    expect(Array.isArray(result.assignedProjects)).toBe(true);
    expect(typeof result.unreadNotifications).toBe('number');
    expect(result.isAdmin).toBe(true);
    // Admin should get recentActivity as an array (possibly empty if no logs)
    expect(Array.isArray(result.recentActivity)).toBe(true);
  });

  it('non-admin gets empty recentActivity', async () => {
    // Create a regular user with no admin permissions
    const ts = Date.now();
    const user = await prisma.user.create({
      data: {
        email: `dash-nonadmin-${ts}@test.com`,
        name: 'Dashboard Non-Admin',
        passwordHash: 'test-hash',
        status: 'active',
      },
    });

    const role = await prisma.role.create({
      data: {
        code: `DASH-REG-${ts}`,
        name: 'Dashboard Regular Role',
        isSystem: false,
      },
    });

    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: role.id,
        effectiveFrom: new Date('2020-01-01'),
        assignedBy: user.id,
        assignedAt: new Date(),
      },
    });

    try {
      const caller = await authenticatedCaller(user.id);
      const result = await caller.dashboard.summary();

      expect(result.isAdmin).toBe(false);
      expect(result.recentActivity).toEqual([]);
      expect(typeof result.pendingApprovals).toBe('number');
      expect(typeof result.unreadNotifications).toBe('number');
    } finally {
      // Cleanup
      await prisma.userRole.deleteMany({ where: { roleId: role.id } });
      await prisma.role.deleteMany({ where: { code: `DASH-REG-${ts}` } });
      await prisma.user.deleteMany({ where: { email: `dash-nonadmin-${ts}@test.com` } });
    }
  });
});
