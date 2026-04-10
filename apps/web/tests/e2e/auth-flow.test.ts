/**
 * E2E: Auth flow integration test — Task 1.3.18
 *
 * Exercises the full auth flow through the core authService (sign-in,
 * lockout, password change) and verifies tRPC procedures behave
 * correctly for authenticated callers.
 *
 * Note: `auth.signIn` tRPC procedure calls `nextAuthSignIn` (Auth.js)
 * which requires a Next.js runtime. We therefore test sign-in at the
 * core service layer (where the real logic lives) and test the tRPC
 * procedures that do not depend on Next.js (me, changePassword).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TRPCError } from '@trpc/server';
import { prisma } from '@fmksa/db';
import {
  authService,
  hashPassword,
  InvalidCredentialsError,
  AccountLockedError,
} from '@fmksa/core';
import { authenticatedCaller, masterAdminCaller } from '../helpers/auth-test-callers';

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

const TEST_PASSWORD = 'TestPassword2026!!';
const NEW_PASSWORD = 'NewPassword2026!!!';

let testUserId: string;
let lockoutUserId: string;
let passwordChangeUserId: string;
let roleId: string;

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

function pastDate(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

beforeAll(async () => {
  // Look up a role to assign (need at least one for the AuthUser shape)
  const role = await prisma.role.findUniqueOrThrow({
    where: { code: 'project_manager' },
  });
  roleId = role.id;

  const passwordHash = await hashPassword(TEST_PASSWORD);

  // --- Test user for profile flow ---
  const testUser = await prisma.user.create({
    data: {
      email: `e2e-auth-${Date.now()}-a@test.com`,
      name: 'E2E Auth User',
      passwordHash,
      status: 'active',
    },
  });
  testUserId = testUser.id;

  await prisma.userRole.create({
    data: {
      userId: testUserId,
      roleId,
      effectiveFrom: pastDate(10),
      assignedBy: 'test',
      assignedAt: new Date(),
    },
  });

  // --- User for lockout test ---
  const lockoutUser = await prisma.user.create({
    data: {
      email: `e2e-lockout-${Date.now()}@test.com`,
      name: 'E2E Lockout User',
      passwordHash,
      status: 'active',
    },
  });
  lockoutUserId = lockoutUser.id;

  await prisma.userRole.create({
    data: {
      userId: lockoutUserId,
      roleId,
      effectiveFrom: pastDate(10),
      assignedBy: 'test',
      assignedAt: new Date(),
    },
  });

  // --- User for password change test ---
  const pwUser = await prisma.user.create({
    data: {
      email: `e2e-pwchange-${Date.now()}@test.com`,
      name: 'E2E Password Change User',
      passwordHash,
      status: 'active',
    },
  });
  passwordChangeUserId = pwUser.id;

  await prisma.userRole.create({
    data: {
      userId: passwordChangeUserId,
      roleId,
      effectiveFrom: pastDate(10),
      assignedBy: 'test',
      assignedAt: new Date(),
    },
  });
});

afterAll(async () => {
  const userIds = [testUserId, lockoutUserId, passwordChangeUserId];
  // Delete user sessions created by authService.signIn
  await prisma.userSession.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.userRole.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: userIds } },
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('E2E: auth flow', () => {
  it('Master Admin can sign in (core service) and get their profile (tRPC)', async () => {
    // 1. Sign in via core authService
    const result = await authService.signIn(
      'ahmedafd90@gmail.com',
      'ChangeMe!Demo2026',
      '127.0.0.1',
      'vitest-e2e',
    );

    // 2. Verify sign-in returned user data
    expect(result.user.email).toBe('ahmedafd90@gmail.com');
    expect(result.user.name).toBeTruthy();
    expect(result.sessionToken).toBeTruthy();

    // 3. Create an authenticated tRPC caller
    const caller = await masterAdminCaller();

    // 4. Call auth.me
    const me = await caller.auth.me();

    // 5. Verify the response
    expect(me.email).toBe('ahmedafd90@gmail.com');
    expect(me.roles.some((r) => r.code === 'master_admin')).toBe(true);
    expect(me.permissions).toContain('system.admin');
  });

  it('wrong password returns InvalidCredentialsError (not a stack trace)', async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: testUserId },
    });

    await expect(
      authService.signIn(user.email, 'wrong-password', '127.0.0.1', 'vitest-e2e'),
    ).rejects.toThrow(InvalidCredentialsError);

    // Verify the error is user-friendly
    try {
      await authService.signIn(user.email, 'wrong-password', '127.0.0.1', 'vitest-e2e');
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidCredentialsError);
      expect((e as InvalidCredentialsError).code).toBe('INVALID_CREDENTIALS');
      expect((e as InvalidCredentialsError).message).toBe('Invalid email or password.');
    }
  });

  it('after 5 failed attempts, account is locked', async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: lockoutUserId },
    });

    // Reset any prior state
    await prisma.user.update({
      where: { id: lockoutUserId },
      data: { failedLoginCount: 0, lockedUntil: null, status: 'active' },
    });

    // Fail signIn 5 times
    for (let i = 0; i < 5; i++) {
      await expect(
        authService.signIn(user.email, 'wrong-password', '127.0.0.1', 'vitest-e2e'),
      ).rejects.toThrow(InvalidCredentialsError);
    }

    // 6th attempt should return AccountLockedError
    await expect(
      authService.signIn(user.email, 'wrong-password', '127.0.0.1', 'vitest-e2e'),
    ).rejects.toThrow(AccountLockedError);

    // Even correct password should be rejected while locked
    await expect(
      authService.signIn(user.email, TEST_PASSWORD, '127.0.0.1', 'vitest-e2e'),
    ).rejects.toThrow(AccountLockedError);

    // Verify DB state
    const lockedUser = await prisma.user.findUniqueOrThrow({
      where: { id: lockoutUserId },
    });
    expect(lockedUser.status).toBe('locked');
    expect(lockedUser.lockedUntil).toBeTruthy();
    expect(lockedUser.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it('password change works and old password is rejected', async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: passwordChangeUserId },
    });

    // 1. Sign in with original password (core service)
    const result = await authService.signIn(
      user.email,
      TEST_PASSWORD,
      '127.0.0.1',
      'vitest-e2e',
    );
    expect(result.user.id).toBe(passwordChangeUserId);

    // 2. Change password via tRPC
    const caller = await authenticatedCaller(passwordChangeUserId);
    const changeResult = await caller.auth.changePassword({
      currentPassword: TEST_PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    expect(changeResult.success).toBe(true);

    // 3. Old password should now fail
    await expect(
      authService.signIn(user.email, TEST_PASSWORD, '127.0.0.1', 'vitest-e2e'),
    ).rejects.toThrow(InvalidCredentialsError);

    // 4. New password should succeed
    const newResult = await authService.signIn(
      user.email,
      NEW_PASSWORD,
      '127.0.0.1',
      'vitest-e2e',
    );
    expect(newResult.user.id).toBe(passwordChangeUserId);
  });

  it('changePassword rejects incorrect current password', async () => {
    const caller = await authenticatedCaller(testUserId);
    await expect(
      caller.auth.changePassword({
        currentPassword: 'totally-wrong-password',
        newPassword: 'DoesNotMatter123!',
      }),
    ).rejects.toThrow(TRPCError);

    try {
      await caller.auth.changePassword({
        currentPassword: 'totally-wrong-password',
        newPassword: 'DoesNotMatter123!',
      });
    } catch (e) {
      expect((e as TRPCError).code).toBe('BAD_REQUEST');
      expect((e as TRPCError).message).toBe('Current password is incorrect.');
    }
  });
});
