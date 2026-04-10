import { randomBytes, createHash } from 'node:crypto';
import { prisma } from '@fmksa/db';
import { verifyPassword } from './password';
import { auditService } from '../audit/service';

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class InvalidCredentialsError extends Error {
  readonly code = 'INVALID_CREDENTIALS' as const;
  constructor() {
    super('Invalid email or password.');
    this.name = 'InvalidCredentialsError';
  }
}

export class AccountLockedError extends Error {
  readonly code = 'ACCOUNT_LOCKED' as const;
  readonly lockedUntil: Date;
  constructor(lockedUntil: Date) {
    super('Account is temporarily locked due to too many failed login attempts.');
    this.name = 'AccountLockedError';
    this.lockedUntil = lockedUntil;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  status: string;
  roles: Array<{
    id: string;
    code: string;
    name: string;
  }>;
  permissions: string[];
};

export type SignInResult = {
  user: AuthUser;
  sessionToken: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const SESSION_EXPIRY_HOURS = 24;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Hash a session token with SHA-256 (fast hash for per-request lookup). */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Generate a cryptographically random session token. */
function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Load a user by ID with their currently-effective roles and permissions.
 */
async function loadUserWithRoles(userId: string): Promise<AuthUser | null> {
  const now = new Date();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userRoles: {
        where: {
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
        include: {
          role: {
            include: {
              rolePermissions: {
                include: { permission: true },
              },
            },
          },
        },
      },
    },
  });

  if (!user) return null;

  const roles = user.userRoles.map((ur) => ({
    id: ur.role.id,
    code: ur.role.code,
    name: ur.role.name,
  }));

  const permissionSet = new Set<string>();
  for (const ur of user.userRoles) {
    for (const rp of ur.role.rolePermissions) {
      permissionSet.add(rp.permission.code);
    }
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    status: user.status,
    roles,
    permissions: Array.from(permissionSet),
  };
}

// ---------------------------------------------------------------------------
// Session operations
// ---------------------------------------------------------------------------

/**
 * Authenticate a user by email + password.
 *
 * On success: resets failure count, records `lastLoginAt`, creates a
 * `UserSession` audit row, writes an audit log, and returns the user
 * with a raw session token.
 *
 * On failure: increments `failedLoginCount`; after 5 failures locks
 * the account for 15 minutes.
 */
async function signIn(
  email: string,
  password: string,
  ip: string,
  userAgent: string,
): Promise<SignInResult> {
  // 1. Look up the user — generic error to avoid email enumeration
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new InvalidCredentialsError();
  }

  // 2. Check lockout
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AccountLockedError(user.lockedUntil);
  }

  // 3. Verify password
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const newCount = user.failedLoginCount + 1;
    const updates: Record<string, unknown> = {
      failedLoginCount: newCount,
    };

    if (newCount >= MAX_FAILED_ATTEMPTS) {
      updates.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
      updates.status = 'locked';
    }

    await prisma.user.update({
      where: { id: user.id },
      data: updates as { failedLoginCount: number; lockedUntil?: Date; status?: 'locked' },
    });

    throw new InvalidCredentialsError();
  }

  // 4. Success — reset failure count, update lastLoginAt
  const now = new Date();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: now,
      status: 'active',
    },
  });

  // 5. Create audit-trail session row
  const rawToken = generateSessionToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(now.getTime() + SESSION_EXPIRY_HOURS * 60 * 60 * 1000);

  await prisma.userSession.create({
    data: {
      userId: user.id,
      tokenHash,
      ip,
      userAgent,
      expiresAt,
    },
  });

  // 6. Audit log
  await auditService.log({
    actorUserId: user.id,
    actorSource: 'user',
    action: 'auth.sign_in',
    resourceType: 'user',
    resourceId: user.id,
    beforeJson: {},
    afterJson: { ip, userAgent },
    ip,
    userAgent,
  });

  // 7. Return user with roles
  const authUser = await loadUserWithRoles(user.id);
  if (!authUser) {
    throw new Error('User unexpectedly missing after login.');
  }

  return { user: authUser, sessionToken: rawToken };
}

/**
 * Record a logout event for audit trail.
 */
async function recordLogout(
  userId: string,
  ip: string,
  userAgent: string,
): Promise<void> {
  await auditService.log({
    actorUserId: userId,
    actorSource: 'user',
    action: 'auth.sign_out',
    resourceType: 'user',
    resourceId: userId,
    beforeJson: {},
    afterJson: { ip, userAgent },
    ip,
    userAgent,
  });
}

/**
 * Get a user by ID with effective roles and permissions.
 */
async function getUser(userId: string): Promise<AuthUser | null> {
  return loadUserWithRoles(userId);
}

export const sessionService = {
  signIn,
  recordLogout,
  getUser,
};
