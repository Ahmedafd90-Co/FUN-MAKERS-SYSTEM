import type { PrismaClient } from '@prisma/client';

/**
 * Role-permission mappings.
 *
 * This runs AFTER permissions.ts and roles.ts have seeded.
 * It reads the permission codes from the DB and assigns them to roles.
 *
 * Platform Admin gets ALL permissions.
 * PMO gets only *.view + cross_project.read.
 * Other roles get role-appropriate subsets.
 *
 * TODO: This will be populated after Ahmed fills in permissions.ts (Pause #1).
 * For now, it seeds Platform Admin with all permissions as a safe default.
 */

type RolePermissionMap = Record<string, string[]>;

// PIC-59 (audit D3.02 + D3.06): targeted distribution of base permissions
// that had previously been platform-admin-only. The Pre-PR-5 Sweep scope is
// narrow — only document.{upload,sign,supersede} (D3.02) and
// project.{create,edit,archive} (D3.06) are distributed here. Other base
// permissions (workflow.*, audit.*, posting.*, system.admin, screen.admin_*,
// override.execute, user.*) remain platform-admin-only by deliberate audit
// scope.
//
// platform_admin gets ALL permissions via the order-independent
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
  //   scope. They retain platform-admin-only access until a future sweep
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
 * Cluster 4 / Option B: replaces the early `platform_admin: ['*']` expansion in
 * seedRolePermissions (which only saw the base catalog at that early step and
 * silently missed later-seeded domain catalogs — the bug the per-domain
 * catch-up files worked around). Mirrors the seedQaTestRolePermissions
 * "run last, query the full catalog" pattern: invoked after every permission
 * catalog is seeded, so platform_admin receives the COMPLETE catalog.
 *
 * Invariant enforced by seed-coverage.test.ts: platform_admin must hold every
 * permission code in the catalog.
 */
export async function seedMasterAdminAllPermissions(prisma: PrismaClient) {
  console.log('  Seeding platform_admin full-permission grant (centralized, runs last)...');
  const role = await prisma.role.findFirst({ where: { code: 'platform_admin' } });
  if (!role) {
    console.warn('  ⚠ Role platform_admin not found, skipping full-permission grant');
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
  console.log(`  ✓ platform_admin granted all ${count} catalog permissions`);
}

/**
 * PIC-98 PR-3a (F4) — tenant_admin curated grant.
 *
 * Runs LAST (like seedMasterAdminAllPermissions) so the full catalog is in
 * place. Grants tenant_admin a curated subset:
 *
 *   - **Sellable modules** (all perms on these resources — mirrors the
 *     MODULES registry in @fmksa/contracts/modules.ts):
 *       commercial: ipa / ipc / variation / cost_proposal / tax_invoice /
 *                   correspondence / commercial_dashboard /
 *                   client_submission_history
 *       procurement: rfq / purchase_order / vendor_contract /
 *                    framework_agreement / supplier_invoice / credit_note /
 *                    vendor / item_catalog / procurement_category /
 *                    procurement_dashboard / quotation / project_vendor
 *       budget:     budget / expense
 *       documents:  document
 *       drawings:   drawing
 *       layer1:     intercompany_contract / prime_contract /
 *                   project_participant / entity_legal_details
 *   - **Admin-but-tenant-scoped surfaces** (specific codes — these gate the
 *     admin.user* and admin.roleList routes that PR-3a scopes to ctx.orgId):
 *       user.view / user.create / user.edit / user.admin / role.view
 *
 * **EXPLICITLY OMITTED** (the F4 split's load-bearing exclusions):
 *   - system.admin  — the platform-admin marker; tenant_admin MUST NOT hold
 *     it or `isPlatformAdmin(ctx)` would return true and the chokepoint
 *     cross-org bypass would fire. F3 D3 survives only if tenant_admin
 *     never gains this.
 *   - posting.*     — PIC-92 c9ec11f6 ruled posting.* platform-only. The
 *     PR-1 retargeted seed-coverage.test.ts ASSERTS no tenant-scoped role
 *     holds posting.* — this curated grant must STAY consistent with that
 *     invariant.
 *   - reference_data.set/add/update — platform-only (PD ruling a0748f23).
 *   - workflow.* (templates), notification.* (templates), health.overview
 *     — admin-only per the PR-1 reachability table (workflow + health
 *     routes still use adminProcedure; tenant_admin doesn't hold
 *     system.admin so they can't reach them regardless of perms — this is
 *     belt-and-suspenders).
 *   - override.execute, screen.admin_*, role.edit — platform-admin scope.
 *   - cross_project.read — PMO-style grant, NOT a default tenant_admin
 *     grant (tenants who want PMO behavior add a separate PMO role).
 *   - entity.*, project.* — PR-3b (entities/projects reachability scoping)
 *     will add those grants alongside their org-scoping.
 *   - audit.* — PR-3c.
 *
 * The narrowness is intentional: PR-3a's scope is ONLY the admin.user*
 * routes + roleList + sellable modules (per PD ruling 97c04b5b). Other
 * tenant-admin reachable surfaces land in PR-3b / PR-3c / PR-4.
 */
export async function seedTenantAdminPermissions(prisma: PrismaClient) {
  console.log('  Seeding tenant_admin curated-permission grant (centralized, runs last)...');
  const role = await prisma.role.findFirst({ where: { code: 'tenant_admin' } });
  if (!role) {
    console.warn('  ⚠ Role tenant_admin not found, skipping curated grant');
    return;
  }

  // Sellable-module resources — every perm whose `resource` is in this set
  // is granted to tenant_admin. Mirrors the MODULES registry; if MODULES
  // gains a resource, this list must mirror (intentional duplication —
  // seeding is a DB concern, contracts is a TypeScript-types concern, and
  // we avoid pulling @fmksa/contracts into the seed runtime).
  const SELLABLE_MODULE_RESOURCES = [
    // commercial
    'ipa', 'ipa_forecast', 'ipc', 'variation', 'cost_proposal', 'tax_invoice',
    'correspondence', 'commercial_dashboard', 'client_submission_history',
    // procurement
    'rfq', 'purchase_order', 'vendor_contract', 'framework_agreement',
    'supplier_invoice', 'credit_note', 'vendor', 'item_catalog',
    'procurement_category', 'procurement_dashboard', 'quotation',
    'project_vendor',
    // budget
    'budget', 'expense',
    // documents
    'document',
    // drawings
    'drawing',
    // layer1
    'intercompany_contract', 'prime_contract', 'project_participant',
    'entity_legal_details',
  ];

  // Admin-but-tenant-scoped specific perm codes — these gate the routes
  // PR-3a (admin.user* + roleList) and PR-3b (entities + projects) scope to
  // ctx.orgId via service-layer expectedOrgId param.
  const ADMIN_TENANT_PERM_CODES = [
    // PR-3a: admin.user* + admin.roleList surfaces
    'user.view',
    'user.create',
    'user.edit',
    'user.admin',
    'role.view',
    // PIC-98 PR-3b (F4): entities + projects own-org reachability.
    // tenant_admin GETS these to manage own-org entity hierarchy + project
    // CRUD; service layer scopes to ctx.orgId via expectedOrgId pattern.
    // EXPLICITLY NOT GRANTED: cross_project.read (PMO-style; tenants who
    // want PMO behavior add a separate PMO role).
    'entity.view',
    'entity.edit',
    'project.view',
    'project.create',
    'project.edit',
    'project.archive',
    // PIC-98 PR-3c (F4): audit + override own-org reachability.
    // tenant_admin GETS audit.view (read-only over AuditLog + OverrideLog
    // both scoped to ctx.orgId via direct denormalized orgId columns).
    // EXPLICITLY NOT GRANTED: audit.export — export is platform-only until
    // a deliberate decision (export ≠ view). PR-3c is read-only reachability.
    'audit.view',
  ];

  const grants = await prisma.permission.findMany({
    where: {
      OR: [
        { resource: { in: SELLABLE_MODULE_RESOURCES } },
        { code: { in: ADMIN_TENANT_PERM_CODES } },
      ],
    },
  });

  let count = 0;
  for (const perm of grants) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
      create: { roleId: role.id, permissionId: perm.id },
      update: {},
    });
    count++;
  }

  console.log(`  ✓ tenant_admin granted ${count} curated permissions (sellable modules + admin.user/role surfaces)`);
}
