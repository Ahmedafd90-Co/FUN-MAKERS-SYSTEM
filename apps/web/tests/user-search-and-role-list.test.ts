/**
 * Tests for projects.userSearch and projects.roleList tRPC endpoints.
 *
 * Verifies:
 *   1. userSearch returns matching users by name
 *   2. userSearch returns matching users by email
 *   3. userSearch only returns active users (inactive users excluded)
 *   4. userSearch returns max 20 results
 *   5. roleList returns all roles ordered by name
 *
 * Requires DATABASE_URL to run.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@fmksa/db';
import {
  masterAdminCaller,
  unauthenticatedCaller,
} from './helpers/auth-test-callers';

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

const ts = Date.now();
const TEST_PREFIX = `usrtest-${ts}`;

let activeUserId: string;
let inactiveUserId: string;
const bulkUserIds: string[] = [];

beforeAll(async () => {
  // Create an active user with a unique, searchable name
  const activeUser = await prisma.user.create({
    data: {
      email: `${TEST_PREFIX}-active@test.com`,
      name: `${TEST_PREFIX} Active User`,
      passwordHash: 'test-hash',
      status: 'active',
    },
  });
  activeUserId = activeUser.id;

  // Create an inactive user — should be excluded from search results
  const inactiveUser = await prisma.user.create({
    data: {
      email: `${TEST_PREFIX}-inactive@test.com`,
      name: `${TEST_PREFIX} Inactive User`,
      passwordHash: 'test-hash',
      status: 'inactive',
    },
  });
  inactiveUserId = inactiveUser.id;

  // Create 22 active users to test the take:20 limit
  for (let i = 0; i < 22; i++) {
    const u = await prisma.user.create({
      data: {
        email: `${TEST_PREFIX}-bulk${String(i).padStart(2, '0')}@test.com`,
        name: `${TEST_PREFIX} Bulk User ${String(i).padStart(2, '0')}`,
        passwordHash: 'test-hash',
        status: 'active',
      },
    });
    bulkUserIds.push(u.id);
  }
});

afterAll(async () => {
  // Cleanup all test users
  await prisma.user.deleteMany({
    where: {
      id: { in: [activeUserId, inactiveUserId, ...bulkUserIds] },
    },
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('projects.userSearch', () => {
  it('returns matching users by name', async () => {
    const caller = await masterAdminCaller();
    const results = await caller.projects.userSearch({
      query: `${TEST_PREFIX} Active`,
    });

    expect(results.length).toBeGreaterThanOrEqual(1);
    const match = results.find((u) => u.id === activeUserId);
    expect(match).toBeDefined();
    expect(match!.name).toBe(`${TEST_PREFIX} Active User`);
    expect(match!.email).toBe(`${TEST_PREFIX}-active@test.com`);
  });

  it('returns matching users by email', async () => {
    const caller = await masterAdminCaller();
    const results = await caller.projects.userSearch({
      query: `${TEST_PREFIX}-active@test`,
    });

    expect(results.length).toBeGreaterThanOrEqual(1);
    const match = results.find((u) => u.id === activeUserId);
    expect(match).toBeDefined();
  });

  it('only returns active users (inactive excluded)', async () => {
    const caller = await masterAdminCaller();
    const results = await caller.projects.userSearch({
      query: `${TEST_PREFIX}`,
    });

    const inactiveMatch = results.find((u) => u.id === inactiveUserId);
    expect(inactiveMatch).toBeUndefined();

    // All returned users should be active
    for (const u of results) {
      expect(u.status).toBe('active');
    }
  });

  it('returns max 20 results', async () => {
    const caller = await masterAdminCaller();
    // We created 22 bulk users + 1 active user = 23 matching users with the prefix
    const results = await caller.projects.userSearch({
      query: `${TEST_PREFIX} Bulk`,
    });

    expect(results.length).toBeLessThanOrEqual(20);
  });

  it('rejects unauthenticated callers', async () => {
    const caller = await unauthenticatedCaller();
    try {
      await caller.projects.userSearch({ query: 'test' });
      expect.unreachable('Should have thrown');
    } catch (e: any) {
      expect(e.code).toBe('UNAUTHORIZED');
    }
  });
});

describe('projects.roleList', () => {
  it('returns all roles ordered by name', async () => {
    const caller = await masterAdminCaller();
    const roles = await caller.projects.roleList();

    expect(roles.length).toBeGreaterThanOrEqual(1);

    // Verify each role has the expected shape
    for (const role of roles) {
      expect(role.id).toBeDefined();
      expect(role.code).toBeDefined();
      expect(role.name).toBeDefined();
    }

    // Verify ordering by name (ascending)
    for (let i = 1; i < roles.length; i++) {
      expect(
        roles[i]!.name.localeCompare(roles[i - 1]!.name),
      ).toBeGreaterThanOrEqual(0);
    }
  });

  it('rejects unauthenticated callers', async () => {
    const caller = await unauthenticatedCaller();
    try {
      await caller.projects.roleList();
      expect.unreachable('Should have thrown');
    } catch (e: any) {
      expect(e.code).toBe('UNAUTHORIZED');
    }
  });
});
