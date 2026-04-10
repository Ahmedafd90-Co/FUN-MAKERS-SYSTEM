import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { prisma } from '@fmksa/db';
import { hashPassword } from '../../src/auth/password';
import { sessionService } from '../../src/auth/session';
import {
  InvalidCredentialsError,
  AccountLockedError,
} from '../../src/auth/session';

const TEST_EMAIL = 'session-test@fmksa.test';
const TEST_PASSWORD = 'TestPassword123!';
const TEST_IP = '127.0.0.1';
const TEST_UA = 'vitest/1.0';

let testUserId: string;

beforeAll(async () => {
  // Clean up any previous test user and related data
  const existingUser = await prisma.user.findUnique({
    where: { email: TEST_EMAIL },
  });
  if (existingUser) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).$executeRaw`DELETE FROM user_sessions WHERE user_id = ${existingUser.id}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).$executeRaw`TRUNCATE TABLE audit_logs CASCADE`;
    await prisma.userRole.deleteMany({ where: { userId: existingUser.id } });
    await prisma.user.delete({ where: { id: existingUser.id } });
  }

  // Create a fresh test user
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const user = await prisma.user.create({
    data: {
      email: TEST_EMAIL,
      name: 'Session Test User',
      passwordHash,
      status: 'active',
    },
  });
  testUserId = user.id;

  // Assign a role so getUser returns roles
  const role = await prisma.role.findFirst({ where: { code: 'master_admin' } });
  if (role) {
    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: role.id,
        effectiveFrom: new Date(),
        assignedBy: user.id,
        assignedAt: new Date(),
      },
    });
  }
});

beforeEach(async () => {
  // Reset user state before each test
  await prisma.user.update({
    where: { id: testUserId },
    data: {
      failedLoginCount: 0,
      lockedUntil: null,
      status: 'active',
    },
  });
  // Clear audit logs and sessions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma as any).$executeRaw`TRUNCATE TABLE audit_logs CASCADE`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma as any).$executeRaw`DELETE FROM user_sessions WHERE user_id = ${testUserId}`;
});

describe('sessionService.signIn', () => {
  it('succeeds with correct credentials and returns user + token', async () => {
    const result = await sessionService.signIn(
      TEST_EMAIL,
      TEST_PASSWORD,
      TEST_IP,
      TEST_UA,
    );

    expect(result.user.id).toBe(testUserId);
    expect(result.user.email).toBe(TEST_EMAIL);
    expect(result.user.name).toBe('Session Test User');
    expect(result.sessionToken).toBeDefined();
    expect(result.sessionToken.length).toBe(64); // 32 bytes hex
  });

  it('resets failedLoginCount on successful login', async () => {
    // Set failure count to 3
    await prisma.user.update({
      where: { id: testUserId },
      data: { failedLoginCount: 3 },
    });

    await sessionService.signIn(TEST_EMAIL, TEST_PASSWORD, TEST_IP, TEST_UA);

    const user = await prisma.user.findUnique({ where: { id: testUserId } });
    expect(user!.failedLoginCount).toBe(0);
  });

  it('creates a UserSession audit row', async () => {
    await sessionService.signIn(TEST_EMAIL, TEST_PASSWORD, TEST_IP, TEST_UA);

    const sessions = await prisma.userSession.findMany({
      where: { userId: testUserId },
    });
    expect(sessions.length).toBe(1);
    expect(sessions[0].ip).toBe(TEST_IP);
    expect(sessions[0].userAgent).toBe(TEST_UA);
    expect(sessions[0].tokenHash).toBeDefined();
    expect(sessions[0].tokenHash.length).toBe(64); // SHA-256 hex
  });

  it('writes an audit log entry on successful login', async () => {
    await sessionService.signIn(TEST_EMAIL, TEST_PASSWORD, TEST_IP, TEST_UA);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logs = await (prisma as any).auditLog.findMany({
      where: { action: 'auth.sign_in', resourceId: testUserId },
    });
    expect(logs.length).toBe(1);
    expect(logs[0].actorUserId).toBe(testUserId);
  });

  it('throws InvalidCredentialsError for non-existent email', async () => {
    await expect(
      sessionService.signIn('nobody@fmksa.test', TEST_PASSWORD, TEST_IP, TEST_UA),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it('throws InvalidCredentialsError for wrong password', async () => {
    await expect(
      sessionService.signIn(TEST_EMAIL, 'WrongPassword!', TEST_IP, TEST_UA),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it('increments failedLoginCount on wrong password', async () => {
    try {
      await sessionService.signIn(TEST_EMAIL, 'WrongPassword!', TEST_IP, TEST_UA);
    } catch {
      // expected
    }

    const user = await prisma.user.findUnique({ where: { id: testUserId } });
    expect(user!.failedLoginCount).toBe(1);
  });

  it('locks account after 5 failed attempts', async () => {
    // Pre-set to 4 failures
    await prisma.user.update({
      where: { id: testUserId },
      data: { failedLoginCount: 4 },
    });

    // 5th failure should trigger lockout
    await expect(
      sessionService.signIn(TEST_EMAIL, 'WrongPassword!', TEST_IP, TEST_UA),
    ).rejects.toThrow(InvalidCredentialsError);

    const user = await prisma.user.findUnique({ where: { id: testUserId } });
    expect(user!.failedLoginCount).toBe(5);
    expect(user!.lockedUntil).not.toBeNull();
    expect(user!.status).toBe('locked');

    // Subsequent attempt should throw AccountLockedError
    await expect(
      sessionService.signIn(TEST_EMAIL, TEST_PASSWORD, TEST_IP, TEST_UA),
    ).rejects.toThrow(AccountLockedError);
  });

  it('allows login after lockout expires', async () => {
    // Set lockout to past
    await prisma.user.update({
      where: { id: testUserId },
      data: {
        failedLoginCount: 5,
        lockedUntil: new Date(Date.now() - 1000), // 1 second ago
        status: 'locked',
      },
    });

    const result = await sessionService.signIn(
      TEST_EMAIL,
      TEST_PASSWORD,
      TEST_IP,
      TEST_UA,
    );
    expect(result.user.id).toBe(testUserId);
  });
});

describe('sessionService.recordLogout', () => {
  it('writes an audit log entry for logout', async () => {
    await sessionService.recordLogout(testUserId, TEST_IP, TEST_UA);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logs = await (prisma as any).auditLog.findMany({
      where: { action: 'auth.sign_out', resourceId: testUserId },
    });
    expect(logs.length).toBe(1);
    expect(logs[0].actorUserId).toBe(testUserId);
  });
});

describe('sessionService.getUser', () => {
  it('returns user with roles and permissions', async () => {
    const user = await sessionService.getUser(testUserId);

    expect(user).not.toBeNull();
    expect(user!.id).toBe(testUserId);
    expect(user!.email).toBe(TEST_EMAIL);
    expect(user!.roles.length).toBeGreaterThan(0);
    // master_admin role should have permissions
    expect(user!.permissions.length).toBeGreaterThan(0);
  });

  it('returns null for non-existent user', async () => {
    const user = await sessionService.getUser('00000000-0000-0000-0000-000000000000');
    expect(user).toBeNull();
  });
});
