/**
 * Layer 1 router-level permission deny tests — PR-A2 (PIC-13).
 *
 * Verifies that all Layer 1 router procedures enforce permissions:
 *   - Unauthenticated callers get UNAUTHORIZED (middleware)
 *   - Authenticated callers without resource permissions get FORBIDDEN
 *   - Transition actions enforce per-action permission granularity
 *     (e.g., user with prime_contract.sign cannot call action='activate')
 *   - myPermissions queries return correctly prefix-filtered sets
 *
 * Mirrors the procurement-permission-deny.test.ts pattern.
 * Requires DATABASE_URL to run (real-DB integration).
 *
 * First application of the ProjectLedger Testing Standard (deferred to PIC-15
 * for the full 13-section structured report process — this test file is the
 * deliverable for the report's "Test Coverage Summary" section).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  unauthenticatedCaller,
  authenticatedCaller,
} from './helpers/auth-test-callers';
import { prisma } from '@fmksa/db';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const ts = Date.now();
const FAKE_UUID = '00000000-0000-0000-0000-000000000000';

let testEntityId: string;
let testProjectId: string;

// User with zero Layer 1 perms — for FORBIDDEN tests on every endpoint.
let noPermUserId: string;
let noPermRoleId: string;

// User with the full Layer 1 .view/.create/.edit/.delete set across all 4
// resources — for happy-path smoke and myPermissions tests.
let viewUserId: string;
let viewRoleId: string;

// Per-transition-action single-permission users.
// Map keys are the full permission codes (e.g., 'prime_contract.sign').
const transitionUsers: Record<string, { userId: string; roleId: string }> = {};

const PRIME_CONTRACT_TRANSITION_ACTIONS = [
  'sign',
  'activate',
  'complete',
  'terminate',
  'cancel',
] as const;

const INTERCOMPANY_CONTRACT_TRANSITION_ACTIONS = [
  'sign',
  'activate',
  'close',
  'cancel',
] as const;

const VIEW_USER_PERM_CODES = [
  'project_participant.view',
  'project_participant.create',
  'project_participant.edit',
  'project_participant.delete',
  'prime_contract.view',
  'prime_contract.create',
  'prime_contract.edit',
  'prime_contract.delete',
  'intercompany_contract.view',
  'intercompany_contract.create',
  'intercompany_contract.edit',
  'intercompany_contract.delete',
  'entity_legal_details.view',
  'entity_legal_details.edit',
  'entity_legal_details.delete',
];

function pastDate(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

async function makeUserWithRole(opts: {
  email: string;
  name: string;
  roleCode: string;
  roleName: string;
  permCodes: string[];
}): Promise<{ userId: string; roleId: string }> {
  const role = await prisma.role.create({
    data: {
      code: opts.roleCode,
      name: opts.roleName,
      isSystem: false,
    },
  });

  for (const code of opts.permCodes) {
    const perm = await prisma.permission.findFirst({ where: { code } });
    if (perm) {
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: perm.id },
      });
    } else {
      throw new Error(
        `Permission code '${code}' not found in DB — seed it before running this test.`,
      );
    }
  }

  const user = await prisma.user.create({
    data: {
      email: opts.email,
      name: opts.name,
      passwordHash: 'test-hash',
      status: 'active',
    },
  });

  await prisma.userRole.create({
    data: {
      userId: user.id,
      roleId: role.id,
      effectiveFrom: pastDate(10),
      assignedBy: 'test',
      assignedAt: new Date(),
    },
  });

  await prisma.projectAssignment.create({
    data: {
      userId: user.id,
      projectId: testProjectId,
      roleId: role.id,
      effectiveFrom: pastDate(10),
      assignedBy: 'test',
      assignedAt: new Date(),
    },
  });

  return { userId: user.id, roleId: role.id };
}

beforeAll(async () => {
  // ── Shared entity + project ──
  const entity = await prisma.entity.findFirst({ where: { status: 'active' } });
  if (entity) {
    testEntityId = entity.id;
  } else {
    const e = await prisma.entity.create({
      data: {
        code: `L1TEST-${ts}`,
        name: 'Layer 1 Test Entity',
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
        code: `L1TEST-${ts}`,
        name: 'Layer 1 Test Project',
        status: 'active',
        entityId: testEntityId,
        currencyCode: 'SAR',
        startDate: new Date(),
        createdBy: 'test',
      },
    });
    testProjectId = p.id;
  }

  // ── No-permission user ──
  const noPerm = await makeUserWithRole({
    email: `l1-noperm-${ts}@test.com`,
    name: 'Layer 1 No Perm User',
    roleCode: `L1TEST-NOPERM-${ts}`,
    roleName: 'Layer 1 No Perm Role',
    permCodes: [],
  });
  noPermUserId = noPerm.userId;
  noPermRoleId = noPerm.roleId;

  // ── View / CRUD user (no transition perms) ──
  const viewUser = await makeUserWithRole({
    email: `l1-view-${ts}@test.com`,
    name: 'Layer 1 View User',
    roleCode: `L1TEST-VIEW-${ts}`,
    roleName: 'Layer 1 View Role',
    permCodes: VIEW_USER_PERM_CODES,
  });
  viewUserId = viewUser.userId;
  viewRoleId = viewUser.roleId;

  // ── Per-action transition users ──
  for (const action of PRIME_CONTRACT_TRANSITION_ACTIONS) {
    const code = `prime_contract.${action}`;
    const u = await makeUserWithRole({
      email: `l1-pc-${action}-${ts}@test.com`,
      name: `Layer 1 PC ${action} User`,
      roleCode: `L1TEST-PC-${action.toUpperCase()}-${ts}`,
      roleName: `Layer 1 PC ${action} Role`,
      permCodes: [code],
    });
    transitionUsers[code] = u;
  }
  for (const action of INTERCOMPANY_CONTRACT_TRANSITION_ACTIONS) {
    const code = `intercompany_contract.${action}`;
    const u = await makeUserWithRole({
      email: `l1-ic-${action}-${ts}@test.com`,
      name: `Layer 1 IC ${action} User`,
      roleCode: `L1TEST-IC-${action.toUpperCase()}-${ts}`,
      roleName: `Layer 1 IC ${action} Role`,
      permCodes: [code],
    });
    transitionUsers[code] = u;
  }
}, 60_000);

afterAll(async () => {
  const allUserIds = [noPermUserId, viewUserId, ...Object.values(transitionUsers).map((u) => u.userId)];
  const allRoleIds = [noPermRoleId, viewRoleId, ...Object.values(transitionUsers).map((u) => u.roleId)];

  await prisma.projectAssignment.deleteMany({ where: { userId: { in: allUserIds } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: allUserIds } } });
  await prisma.rolePermission.deleteMany({ where: { roleId: { in: allRoleIds } } });
  await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
  await prisma.role.deleteMany({ where: { id: { in: allRoleIds } } });
});

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

async function expectUnauthorized(fn: () => Promise<unknown>) {
  try {
    await fn();
    expect.unreachable('Should have thrown UNAUTHORIZED');
  } catch (e) {
    expect((e as TRPCError).code).toBe('UNAUTHORIZED');
  }
}

async function expectForbidden(fn: () => Promise<unknown>) {
  try {
    await fn();
    expect.unreachable('Should have thrown FORBIDDEN');
  } catch (e) {
    expect((e as TRPCError).code).toBe('FORBIDDEN');
  }
}

async function expectNotForbidden(fn: () => Promise<unknown>) {
  // For positive permission-gate tests: the call may still throw (NOT_FOUND
  // for fake IDs, BAD_REQUEST for other validation), but it MUST NOT be
  // FORBIDDEN — that would mean the permission gate rejected it.
  try {
    await fn();
  } catch (e) {
    expect((e as TRPCError).code).not.toBe('FORBIDDEN');
  }
}

// ---------------------------------------------------------------------------
// Section 1: Unauthenticated → UNAUTHORIZED
// (one representative call per router; middleware path is shared)
// ---------------------------------------------------------------------------

describe('Layer 1 routers — unauthenticated callers (middleware)', () => {
  it('entityLegalDetails.get rejects unauthenticated', async () => {
    const caller = await unauthenticatedCaller();
    await expectUnauthorized(() =>
      caller.layer1.entityLegalDetails.get({ entityId: testEntityId }),
    );
  });

  it('projectParticipants.list rejects unauthenticated', async () => {
    const caller = await unauthenticatedCaller();
    await expectUnauthorized(() =>
      caller.layer1.projectParticipants.list({ projectId: testProjectId }),
    );
  });

  it('primeContract.get rejects unauthenticated', async () => {
    const caller = await unauthenticatedCaller();
    await expectUnauthorized(() =>
      caller.layer1.primeContract.get({ projectId: testProjectId }),
    );
  });

  it('intercompanyContract.list rejects unauthenticated', async () => {
    const caller = await unauthenticatedCaller();
    await expectUnauthorized(() =>
      caller.layer1.intercompanyContract.list({ projectId: testProjectId }),
    );
  });

  it('layer1.myPermissions rejects unauthenticated', async () => {
    const caller = await unauthenticatedCaller();
    await expectUnauthorized(() => caller.layer1.myPermissions());
  });
});

// ---------------------------------------------------------------------------
// Section 2: Authenticated without permissions → FORBIDDEN
// (every endpoint gets a FORBIDDEN test with the no-perm user)
// ---------------------------------------------------------------------------

describe('entityLegalDetails router — FORBIDDEN without permission', () => {
  it('get rejects without entity_legal_details.view', async () => {
    const caller = await authenticatedCaller(noPermUserId);
    await expectForbidden(() =>
      caller.layer1.entityLegalDetails.get({ entityId: testEntityId }),
    );
  });

  it('upsert rejects without entity_legal_details.edit', async () => {
    const caller = await authenticatedCaller(noPermUserId);
    await expectForbidden(() =>
      caller.layer1.entityLegalDetails.upsert({
        entityId: testEntityId,
        updatedBy: noPermUserId,
      }),
    );
  });

  it('delete rejects without entity_legal_details.delete', async () => {
    const caller = await authenticatedCaller(noPermUserId);
    await expectForbidden(() =>
      caller.layer1.entityLegalDetails.delete({ entityId: testEntityId }),
    );
  });
});

describe('projectParticipants router — FORBIDDEN without permission', () => {
  it('list rejects without project_participant.view', async () => {
    const caller = await authenticatedCaller(noPermUserId);
    await expectForbidden(() =>
      caller.layer1.projectParticipants.list({ projectId: testProjectId }),
    );
  });

  it('get rejects without project_participant.view', async () => {
    const caller = await authenticatedCaller(noPermUserId);
    await expectForbidden(() =>
      caller.layer1.projectParticipants.get({ projectId: testProjectId, id: FAKE_UUID }),
    );
  });

  it('create rejects without project_participant.create', async () => {
    const caller = await authenticatedCaller(noPermUserId);
    await expectForbidden(() =>
      caller.layer1.projectParticipants.create({
        projectId: testProjectId,
        entityId: testEntityId,
        role: 'sub_contractor',
        isPrime: false,
        createdBy: noPermUserId,
      }),
    );
  });

  it('update rejects without project_participant.edit', async () => {
    const caller = await authenticatedCaller(noPermUserId);
    await expectForbidden(() =>
      caller.layer1.projectParticipants.update({
        id: FAKE_UUID,
        projectId: testProjectId,
        notes: 'whatever',
      }),
    );
  });

  it('delete rejects without project_participant.delete', async () => {
    const caller = await authenticatedCaller(noPermUserId);
    await expectForbidden(() =>
      caller.layer1.projectParticipants.delete({ projectId: testProjectId, id: FAKE_UUID }),
    );
  });
});

describe('primeContract router — FORBIDDEN without permission', () => {
  it('get rejects without prime_contract.view', async () => {
    const caller = await authenticatedCaller(noPermUserId);
    await expectForbidden(() =>
      caller.layer1.primeContract.get({ projectId: testProjectId }),
    );
  });

  it('create rejects without prime_contract.create', async () => {
    const caller = await authenticatedCaller(noPermUserId);
    await expectForbidden(() =>
      caller.layer1.primeContract.create({
        projectId: testProjectId,
        contractingEntityId: testEntityId,
        clientName: 'Test',
        contractValue: 1000,
        contractCurrency: 'SAR',
        createdBy: noPermUserId,
      }),
    );
  });

  it('update rejects without prime_contract.edit', async () => {
    const caller = await authenticatedCaller(noPermUserId);
    await expectForbidden(() =>
      caller.layer1.primeContract.update({
        projectId: testProjectId,
        notes: 'whatever',
      }),
    );
  });

  it('delete rejects without prime_contract.delete', async () => {
    const caller = await authenticatedCaller(noPermUserId);
    await expectForbidden(() =>
      caller.layer1.primeContract.delete({ projectId: testProjectId }),
    );
  });

  it('transition rejects without prime_contract.{action} permission', async () => {
    const caller = await authenticatedCaller(noPermUserId);
    await expectForbidden(() =>
      caller.layer1.primeContract.transition({
        projectId: testProjectId,
        action: 'sign',
      }),
    );
  });
});

describe('intercompanyContract router — FORBIDDEN without permission', () => {
  it('list rejects without intercompany_contract.view', async () => {
    const caller = await authenticatedCaller(noPermUserId);
    await expectForbidden(() =>
      caller.layer1.intercompanyContract.list({ projectId: testProjectId }),
    );
  });

  it('get rejects without intercompany_contract.view', async () => {
    const caller = await authenticatedCaller(noPermUserId);
    await expectForbidden(() =>
      caller.layer1.intercompanyContract.get({ projectId: testProjectId, id: FAKE_UUID }),
    );
  });

  it('create rejects without intercompany_contract.create', async () => {
    const caller = await authenticatedCaller(noPermUserId);
    await expectForbidden(() =>
      caller.layer1.intercompanyContract.create({
        projectId: testProjectId,
        fromEntityId: testEntityId,
        toEntityId: FAKE_UUID,
        scope: 'Test',
        pricingType: 'cost_plus_markup',
        markupPercent: 0.15,
        contractCurrency: 'SAR',
        managingDepartment: 'me_contract',
        createdBy: noPermUserId,
      }),
    );
  });

  it('update rejects without intercompany_contract.edit', async () => {
    const caller = await authenticatedCaller(noPermUserId);
    await expectForbidden(() =>
      caller.layer1.intercompanyContract.update({
        id: FAKE_UUID,
        projectId: testProjectId,
        notes: 'whatever',
      }),
    );
  });

  it('delete rejects without intercompany_contract.delete', async () => {
    const caller = await authenticatedCaller(noPermUserId);
    await expectForbidden(() =>
      caller.layer1.intercompanyContract.delete({ projectId: testProjectId, id: FAKE_UUID }),
    );
  });

  it('transition rejects without intercompany_contract.{action} permission', async () => {
    const caller = await authenticatedCaller(noPermUserId);
    await expectForbidden(() =>
      caller.layer1.intercompanyContract.transition({
        projectId: testProjectId,
        id: FAKE_UUID,
        action: 'sign',
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Section 3: Per-action transition permission granularity
// (User with ONLY action X passes for X, fails for all other actions)
// ---------------------------------------------------------------------------

describe('primeContract.transition — per-action permission granularity', () => {
  for (const action of PRIME_CONTRACT_TRANSITION_ACTIONS) {
    const otherActions = PRIME_CONTRACT_TRANSITION_ACTIONS.filter((a) => a !== action);
    const code = `prime_contract.${action}`;

    it(`user with ONLY '${code}' passes the gate for '${action}'`, async () => {
      const { userId } = transitionUsers[code]!;
      const caller = await authenticatedCaller(userId);
      // Use fake projectId so the user fails at scope check OR succeeds past
      // the perm gate and fails at NOT_FOUND. Either way, NOT FORBIDDEN.
      await expectNotForbidden(() =>
        caller.layer1.primeContract.transition({
          projectId: testProjectId,
          action,
        }),
      );
    });

    for (const other of otherActions) {
      it(`user with ONLY '${code}' is FORBIDDEN for '${other}'`, async () => {
        const { userId } = transitionUsers[code]!;
        const caller = await authenticatedCaller(userId);
        await expectForbidden(() =>
          caller.layer1.primeContract.transition({
            projectId: testProjectId,
            action: other,
          }),
        );
      });
    }
  }
});

describe('intercompanyContract.transition — per-action permission granularity', () => {
  for (const action of INTERCOMPANY_CONTRACT_TRANSITION_ACTIONS) {
    const otherActions = INTERCOMPANY_CONTRACT_TRANSITION_ACTIONS.filter((a) => a !== action);
    const code = `intercompany_contract.${action}`;

    it(`user with ONLY '${code}' passes the gate for '${action}'`, async () => {
      const { userId } = transitionUsers[code]!;
      const caller = await authenticatedCaller(userId);
      await expectNotForbidden(() =>
        caller.layer1.intercompanyContract.transition({
          projectId: testProjectId,
          id: FAKE_UUID,
          action,
        }),
      );
    });

    for (const other of otherActions) {
      it(`user with ONLY '${code}' is FORBIDDEN for '${other}'`, async () => {
        const { userId } = transitionUsers[code]!;
        const caller = await authenticatedCaller(userId);
        await expectForbidden(() =>
          caller.layer1.intercompanyContract.transition({
            projectId: testProjectId,
            id: FAKE_UUID,
            action: other,
          }),
        );
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Section 4: myPermissions queries
// (per-router prefix-filtered + cross-resource at barrel)
// ---------------------------------------------------------------------------

describe('Layer 1 myPermissions queries', () => {
  it('entityLegalDetails.myPermissions returns the entity_legal_details prefix set for view-user', async () => {
    const caller = await authenticatedCaller(viewUserId);
    const perms = await caller.layer1.entityLegalDetails.myPermissions();
    expect(perms).toContain('entity_legal_details.view');
    expect(perms).toContain('entity_legal_details.edit');
    expect(perms).toContain('entity_legal_details.delete');
    // Must not include codes from other resources
    expect(perms.every((p: string) => p.startsWith('entity_legal_details.'))).toBe(true);
  });

  it('projectParticipants.myPermissions returns project_participant prefix set', async () => {
    const caller = await authenticatedCaller(viewUserId);
    const perms = await caller.layer1.projectParticipants.myPermissions();
    expect(perms).toContain('project_participant.view');
    expect(perms.every((p: string) => p.startsWith('project_participant.'))).toBe(true);
  });

  it('primeContract.myPermissions returns prime_contract prefix set', async () => {
    const caller = await authenticatedCaller(viewUserId);
    const perms = await caller.layer1.primeContract.myPermissions();
    expect(perms).toContain('prime_contract.view');
    expect(perms.every((p: string) => p.startsWith('prime_contract.'))).toBe(true);
  });

  it('intercompanyContract.myPermissions returns intercompany_contract prefix set', async () => {
    const caller = await authenticatedCaller(viewUserId);
    const perms = await caller.layer1.intercompanyContract.myPermissions();
    expect(perms).toContain('intercompany_contract.view');
    expect(perms.every((p: string) => p.startsWith('intercompany_contract.'))).toBe(true);
  });

  it('layer1.myPermissions returns union across all 4 resources', async () => {
    const caller = await authenticatedCaller(viewUserId);
    const perms = await caller.layer1.myPermissions();
    expect(perms.length).toBe(VIEW_USER_PERM_CODES.length);
    for (const code of VIEW_USER_PERM_CODES) {
      expect(perms).toContain(code);
    }
  });

  it('layer1.myPermissions returns empty for noPermUser', async () => {
    const caller = await authenticatedCaller(noPermUserId);
    const perms = await caller.layer1.myPermissions();
    expect(perms).toHaveLength(0);
  });

  it('layer1.myPermissions returns single code for transition-only user', async () => {
    const { userId } = transitionUsers['prime_contract.sign']!;
    const caller = await authenticatedCaller(userId);
    const perms = await caller.layer1.myPermissions();
    expect(perms).toEqual(['prime_contract.sign']);
  });
});

// ---------------------------------------------------------------------------
// Section 5: Happy-path smoke tests (1 per router)
// (Confirms the router actually works when permissions are granted; service
//  may still throw NOT_FOUND for fake IDs — we just verify NOT FORBIDDEN.)
// ---------------------------------------------------------------------------

describe('Layer 1 routers — happy-path smoke tests (view-user passes the gate)', () => {
  it('entityLegalDetails.get passes the gate for view-user', async () => {
    const caller = await authenticatedCaller(viewUserId);
    // Returns null when no row exists — NOT FORBIDDEN.
    await expectNotForbidden(() =>
      caller.layer1.entityLegalDetails.get({ entityId: testEntityId }),
    );
  });

  it('projectParticipants.list passes the gate for view-user', async () => {
    const caller = await authenticatedCaller(viewUserId);
    await expectNotForbidden(() =>
      caller.layer1.projectParticipants.list({ projectId: testProjectId }),
    );
  });

  it('primeContract.get passes the gate for view-user', async () => {
    const caller = await authenticatedCaller(viewUserId);
    await expectNotForbidden(() =>
      caller.layer1.primeContract.get({ projectId: testProjectId }),
    );
  });

  it('intercompanyContract.list passes the gate for view-user', async () => {
    const caller = await authenticatedCaller(viewUserId);
    await expectNotForbidden(() =>
      caller.layer1.intercompanyContract.list({ projectId: testProjectId }),
    );
  });
});
