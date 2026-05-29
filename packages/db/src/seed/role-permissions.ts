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

// PIC-59 (audit D3.02 + D3.06): targeted distribution of base permissions
// that had previously been master-admin-only. The Pre-PR-5 Sweep scope is
// narrow — only document.{upload,sign,supersede} (D3.02) and
// project.{create,edit,archive} (D3.06) are distributed here. Other base
// permissions (workflow.*, audit.*, posting.*, system.admin, screen.admin_*,
// override.execute, user.*) remain master-admin-only by deliberate audit
// scope.
//
// master_admin gets ALL permissions via the order-independent
// seedMasterAdminAllPermissions() (runs LAST, after every domain catalog is
// seeded) — it is deliberately ABSENT from this map. The per-role arrays here
// ADD non-master grants for the specific D3.02/D3.06 codes.
const ROLE_PERMISSION_MAP: RolePermissionMap = {
  // D3.06 — Project lifecycle. PD ruling 2026-05-20: grant all three project verbs
  // to project_director. PD owns project lifecycle in Pico Play org reality.
  // D3.02 — document.sign for PD (high-authority signing).
  project_director: [
    'project.create',
    'project.edit',
    'project.archive',
    'document.sign',
  ],

  // D3.02 — design uploads and supersedes drawings (Drawing Register workflow).
  design: ['document.upload', 'document.supersede'],

  // D3.02 — qa_qc uploads QA artefacts and signs ITP / inspection certificates.
  qa_qc: ['document.upload'],

  // D3.02 — qs_commercial uploads commercial evidence (variations, claims).
  qs_commercial: ['document.upload'],

  // D3.02 — procurement uploads vendor docs (quotations, contracts, POs).
  procurement: ['document.upload'],

  // D3.02 — contracts_manager uploads contract drafts.
  contracts_manager: ['document.upload'],

  // D3.02 — finance signs payment certificates and tax-invoice acceptance docs.
  finance: ['document.sign'],

  // D3.02 — document_controller's named role: uploads + supersedes for the
  // document library function.
  document_controller: ['document.upload', 'document.supersede'],

  // D3.02 — executive_approver signs at high-value tier alongside PD.
  executive_approver: ['document.sign'],

  // Future audit scope (intentionally NOT in PIC-59):
  // - project_manager: project.edit (D3.06 said PD-only; PM may follow if PD rules)
  // - site_team / pmo / cost_controller: no D3.02 / D3.06 grants in audit
  //   scope. They retain master-admin-only access until a future sweep
  //   surfaces explicit operational need.
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

    const permsToAssign = allPermissions.filter((p) => permCodes.includes(p.code));

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

/**
 * Master-admin full-permission grant — centralized and order-independent.
 *
 * Cluster 4 / Option B: replaces the early `master_admin: ['*']` expansion in
 * seedRolePermissions (which only saw the base catalog at that early step and
 * silently missed later-seeded domain catalogs — the bug the per-domain
 * catch-up files worked around). Mirrors the seedQaTestRolePermissions
 * "run last, query the full catalog" pattern: invoked after every permission
 * catalog is seeded, so master_admin receives the COMPLETE catalog.
 *
 * Invariant enforced by seed-coverage.test.ts: master_admin must hold every
 * permission code in the catalog.
 */
export async function seedMasterAdminAllPermissions(prisma: PrismaClient) {
  console.log('  Seeding master_admin full-permission grant (centralized, runs last)...');
  const role = await prisma.role.findFirst({ where: { code: 'master_admin' } });
  if (!role) {
    console.warn('  ⚠ Role master_admin not found, skipping full-permission grant');
    return;
  }
  const allPermissions = await prisma.permission.findMany();
  let count = 0;
  for (const perm of allPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
      create: { roleId: role.id, permissionId: perm.id },
      update: {},
    });
    count++;
  }
  console.log(`  ✓ master_admin granted all ${count} catalog permissions`);
}
