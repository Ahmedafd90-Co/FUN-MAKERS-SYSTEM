import type { PrismaClient } from '@prisma/client';

/**
 * Layer 1 role-permission mappings — PIC-26.
 *
 * Grants the non-master Layer 1 roles their per-surface permissions.
 *
 * Originally this file also carried a platform_admin full-grant to work around
 * the base `seedRolePermissions` `'*'` ordering bug — it ran BEFORE the Layer 1
 * catalog seeded, so Layer 1 codes added later were silently missed (symptom:
 * Participants tab hidden for platform_admin, May 5 smoke test). Cluster 4 fixed
 * that bug at its root: platform_admin's full grant is now centralized in
 * `seedMasterAdminAllPermissions()` (runs LAST, after every catalog), so the
 * per-domain platform_admin entry here is no longer needed and has been removed.
 *
 * Mirrors the commercial-role-permissions.ts and procurement-role-permissions.ts
 * structure (per-domain grant file, runs after the matching domain catalog seed).
 */

function expand(family: string, actions: string[]): string[] {
  return actions.map((a) => `${family}.${a}`);
}

const ROLE_LAYER1_PERMISSIONS: Record<string, string[]> = {
  // platform_admin intentionally omitted — full catalog grant is centralized in
  // seedMasterAdminAllPermissions() (cluster 4 / Option B), which runs after
  // the Layer 1 catalog seeds.

  // View-only — sees Layer 1 surfaces, cannot mutate. Mutation grants stay on
  // platform_admin only for now; Layer 2 work refines per-role mutation rights.
  project_manager: [
    'project_participant.view',
    'prime_contract.view',
    'intercompany_contract.view',
    'entity_legal_details.view',
  ],
  qs_commercial: [
    'project_participant.view',
    'prime_contract.view',
    'intercompany_contract.view',
    'entity_legal_details.view',
  ],
  finance: [
    'project_participant.view',
    'prime_contract.view',
    'intercompany_contract.view',
    'entity_legal_details.view',
  ],

  // Procurement: only entity-legal-details visibility (KYC / vendor-side
  // compliance need); other Layer 1 surfaces are project-internal.
  procurement: ['entity_legal_details.view'],

  // PIC-59 audit D3.04 (Layer 1 contract operations were platform-admin-only
  // entirely; contracts_manager role existed but had zero Layer 1 grants).
  // Operational discipline: contracts_manager runs the contract workflow
  // (drafting, editing, signing) for client + intercompany contracts.
  // Lifecycle verbs (activate / complete / terminate / cancel / close / delete)
  // stay platform_admin-only per audit recommendation — those are PD-level
  // operations beyond contracts_manager's typical workflow scope.
  contracts_manager: [
    'project_participant.view',
    'prime_contract.view',
    'prime_contract.create',
    'prime_contract.edit',
    'prime_contract.sign',
    'intercompany_contract.view',
    'intercompany_contract.create',
    'intercompany_contract.edit',
    'intercompany_contract.sign',
    'entity_legal_details.view',
  ],
};

export async function seedLayer1RolePermissions(prisma: PrismaClient) {
  console.log('  Seeding Layer 1 role-permission mappings...');
  let count = 0;
  for (const [roleCode, permCodes] of Object.entries(ROLE_LAYER1_PERMISSIONS)) {
    const role = await prisma.role.findFirst({ where: { code: roleCode } });
    if (!role) {
      console.warn(`  ⚠ Role '${roleCode}' not found, skipping`);
      continue;
    }
    for (const permCode of permCodes) {
      const permission = await prisma.permission.findFirst({ where: { code: permCode } });
      if (!permission) {
        console.warn(`  ⚠ Permission '${permCode}' not found, skipping`);
        continue;
      }
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
      count++;
    }
  }
  console.log(`  ✅ Layer 1 role-permission mappings seeded (${count} grants).`);
}
