/**
 * Permission deny test suite — Task 1.3.17
 *
 * Verifies that protected tRPC procedures correctly deny unauthenticated
 * callers and succeed for authenticated ones.
 */

import { describe, it, expect } from 'vitest';
import { TRPCError } from '@trpc/server';
import { unauthenticatedCaller, masterAdminCaller } from './helpers/auth-test-callers';

// ---------------------------------------------------------------------------
// Auth procedure deny tests
// ---------------------------------------------------------------------------

describe('permission deny — auth procedures', () => {
  it('auth.me requires authentication', async () => {
    const caller = await unauthenticatedCaller();
    await expect(caller.auth.me()).rejects.toThrow(TRPCError);

    // Verify it is UNAUTHORIZED, not FORBIDDEN
    try {
      await caller.auth.me();
    } catch (e) {
      expect((e as TRPCError).code).toBe('UNAUTHORIZED');
    }
  });

  it('auth.signOut requires authentication', async () => {
    const caller = await unauthenticatedCaller();
    await expect(caller.auth.signOut()).rejects.toThrow(TRPCError);

    try {
      await caller.auth.signOut();
    } catch (e) {
      expect((e as TRPCError).code).toBe('UNAUTHORIZED');
    }
  });

  it('auth.changePassword requires authentication', async () => {
    const caller = await unauthenticatedCaller();
    await expect(
      caller.auth.changePassword({
        currentPassword: 'anything',
        newPassword: 'SomePassword12345!',
      }),
    ).rejects.toThrow(TRPCError);

    try {
      await caller.auth.changePassword({
        currentPassword: 'anything',
        newPassword: 'SomePassword12345!',
      });
    } catch (e) {
      expect((e as TRPCError).code).toBe('UNAUTHORIZED');
    }
  });

  it('auth.me succeeds for authenticated user', async () => {
    const caller = await masterAdminCaller();
    const result = await caller.auth.me();
    expect(result.email).toBe('ahmedafd90@gmail.com');
    expect(result.name).toBeTruthy();
    expect(result.roles).toBeDefined();
    expect(result.permissions).toBeDefined();
    expect(Array.isArray(result.roles)).toBe(true);
    expect(Array.isArray(result.permissions)).toBe(true);
  });

  it('auth.me returns correct role structure', async () => {
    const caller = await masterAdminCaller();
    const result = await caller.auth.me();

    // Master admin should have the master_admin role
    const masterRole = result.roles.find((r) => r.code === 'master_admin');
    expect(masterRole).toBeDefined();
    expect(masterRole!.id).toBeTruthy();
    expect(masterRole!.name).toBeTruthy();

    // Master admin should have system.admin permission
    expect(result.permissions).toContain('system.admin');
  });

  // TODO(phase 1.4+): Add deny tests for project-scoped procedures as they are created:
  // - projects.get requires assignment
  // - documents.list requires project assignment
  // - PMO user denied operational edit
});
