import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@fmksa/db';
import { getScreenPermissions } from '../../src/access-control/screen-permissions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pastDate(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

let user: { id: string };
let entity: { id: string };
let project: { id: string };
let pmRoleId: string;
let siteTeamRoleId: string;
let screenPermIds: string[] = [];

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  user = await prisma.user.create({
    data: {
      email: `screen-perm-${Date.now()}@test.com`,
      name: 'Screen Perm User',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });

  entity = await prisma.entity.create({
    data: {
      code: `ENT-SP-${Date.now()}`,
      name: 'Screen Perm Test Entity',
      type: 'parent',
      status: 'active',
    },
  });

  project = await prisma.project.create({
    data: {
      code: `SP-${Date.now()}`,
      name: 'Screen Perm Project',
      entityId: entity.id,
      currencyCode: 'SAR',
      startDate: new Date(),
      createdBy: 'test',
      status: 'active',
    },
  });

  const pmRole = await prisma.role.findUniqueOrThrow({ where: { code: 'project_manager' } });
  const siteTeamRole = await prisma.role.findUniqueOrThrow({ where: { code: 'site_team' } });
  pmRoleId = pmRole.id;
  siteTeamRoleId = siteTeamRole.id;

  // Assign both roles to user
  await prisma.userRole.create({
    data: {
      userId: user.id,
      roleId: pmRoleId,
      effectiveFrom: pastDate(10),
      assignedBy: 'test',
      assignedAt: new Date(),
    },
  });

  await prisma.userRole.create({
    data: {
      userId: user.id,
      roleId: siteTeamRoleId,
      effectiveFrom: pastDate(10),
      assignedBy: 'test',
      assignedAt: new Date(),
    },
  });

  // Role-level default for PM on 'dashboard': canView=true, canEdit=true, canApprove=false
  const sp1 = await prisma.screenPermission.create({
    data: {
      roleId: pmRoleId,
      screenCode: 'dashboard',
      canView: true,
      canEdit: true,
      canApprove: false,
      projectId: null,
    },
  });

  // Role-level default for site_team on 'dashboard': canView=true, canEdit=false, canApprove=false
  const sp2 = await prisma.screenPermission.create({
    data: {
      roleId: siteTeamRoleId,
      screenCode: 'dashboard',
      canView: true,
      canEdit: false,
      canApprove: false,
      projectId: null,
    },
  });

  // Project-specific override for PM on 'dashboard' (MORE RESTRICTIVE):
  // canView=true, canEdit=false, canApprove=false
  const sp3 = await prisma.screenPermission.create({
    data: {
      roleId: pmRoleId,
      screenCode: 'dashboard',
      canView: true,
      canEdit: false,
      canApprove: false,
      projectId: project.id,
    },
  });

  // Role-level default for PM on 'approvals': canView=true, canEdit=false, canApprove=false
  const sp4 = await prisma.screenPermission.create({
    data: {
      roleId: pmRoleId,
      screenCode: 'approvals',
      canView: true,
      canEdit: false,
      canApprove: false,
      projectId: null,
    },
  });

  // Project-specific override for PM on 'approvals' (MORE PERMISSIVE):
  // canView=true, canEdit=true, canApprove=true
  const sp5 = await prisma.screenPermission.create({
    data: {
      roleId: pmRoleId,
      screenCode: 'approvals',
      canView: true,
      canEdit: true,
      canApprove: true,
      projectId: project.id,
    },
  });

  screenPermIds = [sp1.id, sp2.id, sp3.id, sp4.id, sp5.id];
});

afterAll(async () => {
  await prisma.screenPermission.deleteMany({
    where: { id: { in: screenPermIds } },
  });
  await prisma.userRole.deleteMany({ where: { userId: user.id } });
  await prisma.project.deleteMany({ where: { id: project.id } });
  await prisma.entity.deleteMany({ where: { id: entity.id } });
  await prisma.user.deleteMany({ where: { id: user.id } });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getScreenPermissions', () => {
  it('returns role-default permissions when no projectId is given', async () => {
    const result = await getScreenPermissions(user.id, 'dashboard');
    // Union of PM (view+edit) and site_team (view) defaults
    expect(result.canView).toBe(true);
    expect(result.canEdit).toBe(true); // from PM default
    expect(result.canApprove).toBe(false);
  });

  it('uses project-specific override (more restrictive) over role default', async () => {
    const result = await getScreenPermissions(user.id, 'dashboard', project.id);
    // PM has project override: view=true, edit=false, approve=false
    // site_team has no project override, so falls back to default: view=true, edit=false, approve=false
    // Union: view=true, edit=false, approve=false
    expect(result.canView).toBe(true);
    expect(result.canEdit).toBe(false);
    expect(result.canApprove).toBe(false);
  });

  it('uses project-specific override (more permissive) over role default', async () => {
    const result = await getScreenPermissions(user.id, 'approvals', project.id);
    // PM has project override: view=true, edit=true, approve=true
    // site_team has no row for 'approvals' at all
    expect(result.canView).toBe(true);
    expect(result.canEdit).toBe(true);
    expect(result.canApprove).toBe(true);
  });

  it('returns all false for a screen with no permissions defined', async () => {
    const result = await getScreenPermissions(user.id, 'nonexistent_screen');
    expect(result.canView).toBe(false);
    expect(result.canEdit).toBe(false);
    expect(result.canApprove).toBe(false);
  });
});
