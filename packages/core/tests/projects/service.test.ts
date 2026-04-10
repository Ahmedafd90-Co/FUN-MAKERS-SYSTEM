import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@fmksa/db';
import { projectsService } from '../../src/projects/service';
import { projectSettingsService } from '../../src/projects/settings';
import { projectAssignmentsService } from '../../src/projects/assignments';
import { PROJECT_SETTINGS_DEFAULTS } from '../../src/projects/project-settings-defaults';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

let testUser: { id: string };
let testUser2: { id: string };
let testEntity: { id: string };
let testRole: { id: string };

const ts = Date.now();

beforeAll(async () => {
  // Clean up stale test data
  await (prisma as any).$executeRaw`TRUNCATE TABLE audit_logs CASCADE`;

  testUser = await prisma.user.create({
    data: {
      email: `proj-test-1-${ts}@test.com`,
      name: 'Project Test User 1',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });

  testUser2 = await prisma.user.create({
    data: {
      email: `proj-test-2-${ts}@test.com`,
      name: 'Project Test User 2',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });

  testEntity = await prisma.entity.create({
    data: {
      code: `ENT-TEST-${ts}`,
      name: 'Test Entity',
      type: 'parent',
      status: 'active',
    },
  });

  testRole = await prisma.role.create({
    data: {
      code: `TEST-ROLE-${ts}`,
      name: 'Test Role',
      isSystem: false,
    },
  });

  // Ensure SAR currency exists (seeded, but defensive)
  await prisma.currency.upsert({
    where: { code: 'SAR' },
    create: { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼', decimalPlaces: 2 },
    update: {},
  });
});

afterAll(async () => {
  // Clean up in reverse dependency order
  await prisma.projectSetting.deleteMany({
    where: { project: { code: { startsWith: `PROJ-T-${ts}` } } },
  });
  await prisma.projectAssignment.deleteMany({
    where: { project: { code: { startsWith: `PROJ-T-${ts}` } } },
  });
  await prisma.project.deleteMany({
    where: { code: { startsWith: `PROJ-T-${ts}` } },
  });
  await prisma.entity.deleteMany({ where: { code: `ENT-TEST-${ts}` } });
  await prisma.role.deleteMany({ where: { code: `TEST-ROLE-${ts}` } });
  await prisma.user.deleteMany({
    where: { email: { endsWith: `${ts}@test.com` } },
  });
});

// ---------------------------------------------------------------------------
// Projects CRUD
// ---------------------------------------------------------------------------

describe('projectsService', () => {
  it('creates a project with default settings', async () => {
    const project = await projectsService.createProject({
      code: `PROJ-T-${ts}-1`,
      name: 'Test Project 1',
      entityId: testEntity.id,
      currencyCode: 'SAR',
      startDate: new Date('2026-01-01'),
      createdBy: testUser.id,
    });

    expect(project.id).toBeDefined();
    expect(project.code).toBe(`PROJ-T-${ts}-1`);
    expect(project.status).toBe('active');
    expect(project.entity).toBeDefined();
    expect(project.currency).toBeDefined();

    // Check default settings were applied
    const settings = await prisma.projectSetting.findMany({
      where: { projectId: project.id },
    });
    expect(settings.length).toBe(Object.keys(PROJECT_SETTINGS_DEFAULTS).length);
  });

  it('rejects duplicate project code', async () => {
    await expect(
      projectsService.createProject({
        code: `PROJ-T-${ts}-1`,
        name: 'Duplicate',
        entityId: testEntity.id,
        currencyCode: 'SAR',
        startDate: new Date(),
        createdBy: testUser.id,
      }),
    ).rejects.toThrow(/already exists/);
  });

  it('rejects invalid entity reference', async () => {
    await expect(
      projectsService.createProject({
        code: `PROJ-T-${ts}-bad-ent`,
        name: 'Bad Entity',
        entityId: '00000000-0000-0000-0000-000000000000',
        currencyCode: 'SAR',
        startDate: new Date(),
        createdBy: testUser.id,
      }),
    ).rejects.toThrow(/not found/);
  });

  it('rejects invalid currency reference', async () => {
    await expect(
      projectsService.createProject({
        code: `PROJ-T-${ts}-bad-cur`,
        name: 'Bad Currency',
        entityId: testEntity.id,
        currencyCode: 'XXX',
        startDate: new Date(),
        createdBy: testUser.id,
      }),
    ).rejects.toThrow(/not found/);
  });

  it('updates a project and writes audit log', async () => {
    const project = await projectsService.createProject({
      code: `PROJ-T-${ts}-upd`,
      name: 'Before Update',
      entityId: testEntity.id,
      currencyCode: 'SAR',
      startDate: new Date(),
      createdBy: testUser.id,
    });

    const updated = await projectsService.updateProject(
      project.id,
      { name: 'After Update' },
      testUser.id,
    );

    expect(updated.name).toBe('After Update');

    // Check audit log
    const logs = await (prisma as any).auditLog.findMany({
      where: { resourceId: project.id, action: 'project.update' },
    });
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });

  it('archives a project with reason', async () => {
    const project = await projectsService.createProject({
      code: `PROJ-T-${ts}-arch`,
      name: 'To Archive',
      entityId: testEntity.id,
      currencyCode: 'SAR',
      startDate: new Date(),
      createdBy: testUser.id,
    });

    const archived = await projectsService.archiveProject(
      project.id,
      'No longer needed',
      testUser.id,
    );
    expect(archived.status).toBe('archived');
  });

  it('rejects archive without reason', async () => {
    const project = await projectsService.createProject({
      code: `PROJ-T-${ts}-arch2`,
      name: 'No Reason Archive',
      entityId: testEntity.id,
      currencyCode: 'SAR',
      startDate: new Date(),
      createdBy: testUser.id,
    });

    await expect(
      projectsService.archiveProject(project.id, '', testUser.id),
    ).rejects.toThrow(/reason is required/i);
  });
});

// ---------------------------------------------------------------------------
// Project settings
// ---------------------------------------------------------------------------

describe('projectSettingsService', () => {
  let projectId: string;

  beforeAll(async () => {
    const p = await projectsService.createProject({
      code: `PROJ-T-${ts}-set`,
      name: 'Settings Test',
      entityId: testEntity.id,
      currencyCode: 'SAR',
      startDate: new Date(),
      createdBy: testUser.id,
    });
    projectId = p.id;
  });

  it('returns default value when no override', async () => {
    const val = await projectSettingsService.getSetting(
      projectId,
      'requireDocumentApprovalWorkflow',
    );
    expect(val).toBe(true);
  });

  it('sets and gets a project-level override', async () => {
    await projectSettingsService.setSetting(
      projectId,
      'requireDocumentApprovalWorkflow',
      false,
      testUser.id,
    );

    const val = await projectSettingsService.getSetting(
      projectId,
      'requireDocumentApprovalWorkflow',
    );
    expect(val).toBe(false);
  });

  it('getAllSettings merges defaults with overrides', async () => {
    const all = await projectSettingsService.getAllSettings(projectId);
    expect(all.requireDocumentApprovalWorkflow).toBe(false); // overridden
    expect(all.requireMaterialSubmittalWorkflow).toBe(true); // default
  });
});

// ---------------------------------------------------------------------------
// Project assignments
// ---------------------------------------------------------------------------

describe('projectAssignmentsService', () => {
  let projectId: string;

  beforeAll(async () => {
    const p = await projectsService.createProject({
      code: `PROJ-T-${ts}-asgn`,
      name: 'Assignment Test',
      entityId: testEntity.id,
      currencyCode: 'SAR',
      startDate: new Date(),
      createdBy: testUser.id,
    });
    projectId = p.id;
  });

  it('assigns a user to a project', async () => {
    const a = await projectAssignmentsService.assign({
      projectId,
      userId: testUser2.id,
      roleId: testRole.id,
      effectiveFrom: new Date(),
      assignedBy: testUser.id,
    });

    expect(a.id).toBeDefined();
    expect(a.userId).toBe(testUser2.id);
    expect(a.projectId).toBe(projectId);
  });

  it('lists active assignments', async () => {
    const list = await projectAssignmentsService.listAssignments({
      projectId,
    });
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0]!.user).toBeDefined();
    expect(list[0]!.role).toBeDefined();
  });

  it('revokes an assignment with reason', async () => {
    const a = await projectAssignmentsService.assign({
      projectId,
      userId: testUser.id,
      roleId: testRole.id,
      effectiveFrom: new Date(),
      assignedBy: testUser.id,
    });

    const revoked = await projectAssignmentsService.revoke({
      assignmentId: a.id,
      reason: 'Reassigned to another project',
      revokedBy: testUser.id,
    });

    expect(revoked.revokedAt).toBeDefined();
    expect(revoked.reason).toBe('Reassigned to another project');
  });

  it('rejects revoke without reason', async () => {
    const a = await projectAssignmentsService.assign({
      projectId,
      userId: testUser2.id,
      roleId: testRole.id,
      effectiveFrom: new Date(),
      assignedBy: testUser.id,
    });

    await expect(
      projectAssignmentsService.revoke({
        assignmentId: a.id,
        reason: '',
        revokedBy: testUser.id,
      }),
    ).rejects.toThrow(/reason is required/i);
  });

  it('revoked assignments do not appear in active list', async () => {
    // Create and immediately revoke
    const a = await projectAssignmentsService.assign({
      projectId,
      userId: testUser.id,
      roleId: testRole.id,
      effectiveFrom: new Date(),
      assignedBy: testUser.id,
    });
    await projectAssignmentsService.revoke({
      assignmentId: a.id,
      reason: 'Test revoke',
      revokedBy: testUser.id,
    });

    const list = await projectAssignmentsService.listAssignments({
      projectId,
    });
    const found = list.find((x) => x.id === a.id);
    expect(found).toBeUndefined();
  });
});
