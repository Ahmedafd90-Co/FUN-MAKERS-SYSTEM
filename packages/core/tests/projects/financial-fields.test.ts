import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@fmksa/db';
import { projectsService } from '../../src/projects/service';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const ts = `fin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
let testEntity: { id: string };
let testUser: { id: string };

beforeAll(async () => {
  testEntity = await prisma.entity.create({
    data: { code: `ENT-FIN-${ts}`, name: 'Financial Fields Test Entity', type: 'parent', status: 'active' },
  });
  await prisma.currency.upsert({
    where: { code: 'SAR' }, update: {},
    create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
  });
  testUser = await prisma.user.create({
    data: {
      email: `fin-test-${ts}@test.com`, name: 'Financial Fields Tester',
      passwordHash: 'test-hash', status: 'active',
    },
  });
  // Grant cross-project read so getProject works
  const adminRole = await prisma.role.findFirst({ where: { code: 'admin' } });
  if (adminRole) {
    await prisma.userRole.create({
      data: {
        userId: testUser.id, roleId: adminRole.id,
        effectiveFrom: new Date('2020-01-01'), assignedBy: testUser.id, assignedAt: new Date(),
      },
    });
  }
});

afterAll(async () => {
  const projectCodes = [`PROJ-FIN-${ts}-1`, `PROJ-FIN-${ts}-2`, `PROJ-FIN-${ts}-3`, `PROJ-FIN-${ts}-4`];
  await prisma.projectSetting.deleteMany({
    where: { project: { code: { in: projectCodes } } },
  });
  await prisma.project.deleteMany({ where: { code: { in: projectCodes } } });
  await prisma.userRole.deleteMany({ where: { userId: testUser.id } });
  await prisma.user.deleteMany({ where: { id: testUser.id } });
  await prisma.entity.deleteMany({ where: { code: `ENT-FIN-${ts}` } });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Project Financial Fields (Phase D2)', () => {
  it('creates project with contractValue', async () => {
    const project = await projectsService.createProject({
      code: `PROJ-FIN-${ts}-1`,
      name: 'Financial Test Project 1',
      entityId: testEntity.id,
      currencyCode: 'SAR',
      startDate: new Date(),
      createdBy: testUser.id,
      contractValue: 5000000,
    });

    expect(project.contractValue).not.toBeNull();
    expect(project.contractValue!.toString()).toBe('5000000');
  });

  it('creates project without contractValue (field is null)', async () => {
    const project = await projectsService.createProject({
      code: `PROJ-FIN-${ts}-2`,
      name: 'Financial Test Project 2',
      entityId: testEntity.id,
      currencyCode: 'SAR',
      startDate: new Date(),
      createdBy: testUser.id,
    });

    expect(project.contractValue).toBeNull();
    expect(project.revisedContractValue).toBeNull();
  });

  it('updates project to set contractValue', async () => {
    const project = await projectsService.createProject({
      code: `PROJ-FIN-${ts}-3`,
      name: 'Financial Test Project 3',
      entityId: testEntity.id,
      currencyCode: 'SAR',
      startDate: new Date(),
      createdBy: testUser.id,
    });

    const updated = await projectsService.updateProject(
      project.id,
      { contractValue: 12000000 },
      testUser.id,
    );

    expect(updated.contractValue).not.toBeNull();
    expect(updated.contractValue!.toString()).toBe('12000000');
  });

  it('updates project to set revisedContractValue', async () => {
    const project = await projectsService.createProject({
      code: `PROJ-FIN-${ts}-4`,
      name: 'Financial Test Project 4',
      entityId: testEntity.id,
      currencyCode: 'SAR',
      startDate: new Date(),
      createdBy: testUser.id,
      contractValue: 8000000,
    });

    const updated = await projectsService.updateProject(
      project.id,
      { revisedContractValue: 9500000 },
      testUser.id,
    );

    expect(updated.contractValue!.toString()).toBe('8000000');
    expect(updated.revisedContractValue!.toString()).toBe('9500000');
  });

  it('audit log captures financial field changes', async () => {
    // Use the project from test 3 (already created)
    const project = await prisma.project.findFirst({
      where: { code: `PROJ-FIN-${ts}-3` },
    });
    expect(project).not.toBeNull();

    // Check audit log has contractValue in afterJson
    const logs = await prisma.auditLog.findMany({
      where: {
        resourceId: project!.id,
        action: 'project.update',
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    expect(logs.length).toBeGreaterThanOrEqual(1);
    const afterJson = logs[0]!.afterJson as Record<string, unknown>;
    expect(afterJson.contractValue).toBe('12000000');
  });

  it('revised budget fallback: when revisedContractValue is null, contractValue is the baseline', async () => {
    const project = await prisma.project.findFirst({
      where: { code: `PROJ-FIN-${ts}-1` },
    });
    expect(project).not.toBeNull();

    // contractValue is set, revisedContractValue is null
    expect(project!.contractValue).not.toBeNull();
    expect(project!.revisedContractValue).toBeNull();

    // The KPI dictionary defines: revised_budget = revisedContractValue ?? contractValue
    // Verify that the fallback logic holds:
    const revisedBudget = project!.revisedContractValue ?? project!.contractValue;
    expect(revisedBudget!.toString()).toBe('5000000');
  });
});
