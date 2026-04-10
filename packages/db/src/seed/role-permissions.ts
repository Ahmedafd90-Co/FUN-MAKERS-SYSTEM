import type { PrismaClient } from '@prisma/client';

/**
 * Role-permission mappings.
 *
 * This runs AFTER permissions.ts and roles.ts have seeded.
 * It reads the permission codes from the DB and assigns them to roles.
 *
 * Master Admin gets ALL permissions.
 * PMO gets only *.view + cross_project.read.
 * Other roles get role-appropriate subsets.
 *
 * TODO: This will be populated after Ahmed fills in permissions.ts (Pause #1).
 * For now, it seeds Master Admin with all permissions as a safe default.
 */

type RolePermissionMap = Record<string, string[]>;

// TODO(ahmed): After filling permissions.ts, define which roles get which permissions.
// For now, only master_admin is mapped (gets everything).
const ROLE_PERMISSION_MAP: RolePermissionMap = {
  master_admin: ['*'], // Special: '*' means all permissions
  // project_director: ['project.view', 'project.edit', 'document.view', 'document.sign', ...],
  // project_manager: ['project.view', 'project.edit', 'document.view', 'document.upload', ...],
  // site_team: ['project.view', 'document.view', 'document.upload', ...],
  // design: ['project.view', 'document.view', 'document.upload', ...],
  // qa_qc: ['project.view', 'document.view', 'workflow.approve', ...],
  // contracts_manager: ['project.view', 'document.view', 'document.sign', 'workflow.approve', ...],
  // qs_commercial: ['project.view', 'document.view', 'document.upload', ...],
  // procurement: ['project.view', 'document.view', 'workflow.start', 'workflow.approve', ...],
  // finance: ['project.view', 'posting.view', ...],
  // cost_controller: ['project.view', 'posting.view', ...],
  // document_controller: ['project.view', 'document.view', 'document.upload', 'document.supersede', ...],
  // pmo: ['project.view', 'document.view', 'workflow.view', 'posting.view', 'audit.view', 'cross_project.read'],
  // executive_approver: ['project.view', 'document.view', 'document.sign', 'workflow.approve', ...],
};

export async function seedRolePermissions(prisma: PrismaClient) {
  console.log('  Seeding role-permissions...');
  const allPermissions = await prisma.permission.findMany();
  const allRoles = await prisma.role.findMany();

  let count = 0;
  for (const [roleCode, permCodes] of Object.entries(ROLE_PERMISSION_MAP)) {
    const role = allRoles.find((r) => r.code === roleCode);
    if (!role) {
      console.warn(`  ⚠ Role ${roleCode} not found, skipping`);
      continue;
    }

    const permsToAssign = permCodes.includes('*')
      ? allPermissions
      : allPermissions.filter((p) => permCodes.includes(p.code));

    for (const perm of permsToAssign) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        create: { roleId: role.id, permissionId: perm.id },
        update: {},
      });
      count++;
    }
  }
  console.log(`  ✓ ${count} role-permission mappings seeded`);
}
