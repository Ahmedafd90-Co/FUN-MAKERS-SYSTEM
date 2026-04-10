import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@fmksa/db';
import {
  resolveApprovers,
  isValidApprover,
  NoApproversFoundError,
} from '../../src/workflow/approver-resolution';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

let testUser1: { id: string };
let testUser2: { id: string };
let testUser3: { id: string };
let testRole: { id: string; code: string };
let testRole2: { id: string; code: string };
let testEntity: { id: string };
let testProject: { id: string };
const ts = `apr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

beforeAll(async () => {

  testUser1 = await prisma.user.create({
    data: {
      email: `wf-apr-1-${ts}@test.com`,
      name: 'Approver Test User 1',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });

  testUser2 = await prisma.user.create({
    data: {
      email: `wf-apr-2-${ts}@test.com`,
      name: 'Approver Test User 2',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });

  testUser3 = await prisma.user.create({
    data: {
      email: `wf-apr-3-${ts}@test.com`,
      name: 'Approver Test User 3',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });

  testRole = await prisma.role.create({
    data: {
      code: `APPROVER-ROLE-${ts}`,
      name: 'Approver Test Role',
      isSystem: false,
    },
  });

  testRole2 = await prisma.role.create({
    data: {
      code: `PROJ-ROLE-${ts}`,
      name: 'Project Role Test',
      isSystem: false,
    },
  });

  // Assign testUser1 and testUser2 to the role
  await prisma.userRole.create({
    data: {
      userId: testUser1.id,
      roleId: testRole.id,
      effectiveFrom: new Date('2020-01-01'),
      assignedBy: testUser1.id,
      assignedAt: new Date(),
    },
  });

  await prisma.userRole.create({
    data: {
      userId: testUser2.id,
      roleId: testRole.id,
      effectiveFrom: new Date('2020-01-01'),
      assignedBy: testUser1.id,
      assignedAt: new Date(),
    },
  });

  // Assign testUser3 to testRole2
  await prisma.userRole.create({
    data: {
      userId: testUser3.id,
      roleId: testRole2.id,
      effectiveFrom: new Date('2020-01-01'),
      assignedBy: testUser1.id,
      assignedAt: new Date(),
    },
  });

  testEntity = await prisma.entity.create({
    data: {
      code: `ENT-APR-${ts}`,
      name: 'Approver Test Entity',
      type: 'parent',
      status: 'active',
    },
  });

  await prisma.currency.upsert({
    where: { code: 'SAR' },
    create: { code: 'SAR', name: 'Saudi Riyal', symbol: '\uFDFC', decimalPlaces: 2 },
    update: {},
  });

  testProject = await prisma.project.create({
    data: {
      code: `PROJ-APR-${ts}`,
      name: 'Approver Test Project',
      entityId: testEntity.id,
      currencyCode: 'SAR',
      startDate: new Date(),
      createdBy: testUser1.id,
      status: 'active',
    },
  });

  // Assign testUser1 to the project (for user-type rule)
  await prisma.projectAssignment.create({
    data: {
      projectId: testProject.id,
      userId: testUser1.id,
      roleId: testRole.id,
      effectiveFrom: new Date('2020-01-01'),
      assignedBy: testUser1.id,
      assignedAt: new Date(),
    },
  });

  // Assign testUser2 to the project with testRole2 (for project_role rule)
  await prisma.projectAssignment.create({
    data: {
      projectId: testProject.id,
      userId: testUser2.id,
      roleId: testRole2.id,
      effectiveFrom: new Date('2020-01-01'),
      assignedBy: testUser1.id,
      assignedAt: new Date(),
    },
  });
});

afterAll(async () => {
  await prisma.projectAssignment.deleteMany({
    where: { projectId: testProject.id },
  });
  await prisma.project.deleteMany({
    where: { code: `PROJ-APR-${ts}` },
  });
  await prisma.entity.deleteMany({ where: { code: `ENT-APR-${ts}` } });
  await prisma.userRole.deleteMany({
    where: { roleId: { in: [testRole.id, testRole2.id] } },
  });
  await prisma.role.deleteMany({
    where: { code: { in: [`APPROVER-ROLE-${ts}`, `PROJ-ROLE-${ts}`] } },
  });
  await prisma.user.deleteMany({
    where: { email: { startsWith: `wf-apr-` } },
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveApprovers', () => {
  describe('role type', () => {
    it('resolves users with the specified role', async () => {
      const approvers = await resolveApprovers(
        { type: 'role', roleCode: testRole.code },
        testProject.id,
      );

      expect(approvers).toContain(testUser1.id);
      expect(approvers).toContain(testUser2.id);
      expect(approvers).not.toContain(testUser3.id);
    });

    it('throws NoApproversFoundError for non-existent role', async () => {
      await expect(
        resolveApprovers(
          { type: 'role', roleCode: 'NONEXISTENT_ROLE' },
          testProject.id,
        ),
      ).rejects.toThrow(NoApproversFoundError);
    });
  });

  describe('user type', () => {
    it('resolves a specific user assigned to the project', async () => {
      const approvers = await resolveApprovers(
        { type: 'user', userId: testUser1.id },
        testProject.id,
      );

      expect(approvers).toEqual([testUser1.id]);
    });

    it('throws NoApproversFoundError if user is not assigned to the project', async () => {
      await expect(
        resolveApprovers(
          { type: 'user', userId: testUser3.id },
          testProject.id,
        ),
      ).rejects.toThrow(NoApproversFoundError);
    });

    it('throws NoApproversFoundError for non-existent user', async () => {
      await expect(
        resolveApprovers(
          { type: 'user', userId: '00000000-0000-0000-0000-000000000000' },
          testProject.id,
        ),
      ).rejects.toThrow(NoApproversFoundError);
    });
  });

  describe('project_role type', () => {
    it('resolves users with the role AND assigned to the project', async () => {
      const approvers = await resolveApprovers(
        { type: 'project_role', roleCode: testRole2.code, projectScoped: true },
        testProject.id,
      );

      // testUser2 has testRole2 assignment to the project
      expect(approvers).toContain(testUser2.id);
      // testUser3 has the role but no project assignment with testRole2 to testProject
      // (testUser3 has a global UserRole for testRole2, not a ProjectAssignment)
      expect(approvers).not.toContain(testUser1.id);
    });

    it('throws NoApproversFoundError for non-existent project role', async () => {
      await expect(
        resolveApprovers(
          { type: 'project_role', roleCode: 'NONEXISTENT_ROLE', projectScoped: true },
          testProject.id,
        ),
      ).rejects.toThrow(NoApproversFoundError);
    });
  });

  describe('any_of type', () => {
    it('resolves the union of multiple sub-rules (deduplicated)', async () => {
      const approvers = await resolveApprovers(
        {
          type: 'any_of',
          rules: [
            { type: 'role', roleCode: testRole.code },
            { type: 'user', userId: testUser1.id },
          ],
        },
        testProject.id,
      );

      // testUser1 appears in both rules but should be deduplicated
      expect(approvers).toContain(testUser1.id);
      expect(approvers).toContain(testUser2.id);
      const uniqueApprovers = new Set(approvers);
      expect(uniqueApprovers.size).toBe(approvers.length);
    });
  });
});

describe('isValidApprover', () => {
  it('returns true when user is a valid approver', async () => {
    const result = await isValidApprover(
      testUser1.id,
      { type: 'role', roleCode: testRole.code },
      testProject.id,
    );

    expect(result).toBe(true);
  });

  it('returns false when user is not a valid approver', async () => {
    const result = await isValidApprover(
      testUser3.id,
      { type: 'role', roleCode: testRole.code },
      testProject.id,
    );

    expect(result).toBe(false);
  });

  it('returns false when no approvers are found (empty set)', async () => {
    const result = await isValidApprover(
      testUser1.id,
      { type: 'role', roleCode: 'NONEXISTENT' },
      testProject.id,
    );

    expect(result).toBe(false);
  });
});
