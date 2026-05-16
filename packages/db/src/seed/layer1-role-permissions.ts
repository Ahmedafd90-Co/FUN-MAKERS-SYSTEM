import type { PrismaClient } from '@prisma/client';

/**
 * Layer 1 role-permission mappings — PIC-26.
 *
 * PR-A2 (PIC-13) added 24 Layer 1 permission codes to the catalog but never
 * granted them to any role. The base `seedRolePermissions` runs BEFORE the
 * Layer 1 catalog is seeded, so its `'*'` for master_admin only captures
 * permissions that exist at that moment — Layer 1 codes added later are
 * silently missed. Symptom: Participants tab hidden for master_admin (May 5
 * smoke test). This file is the fix.
 *
 * Mirrors the commercial-role-permissions.ts and procurement-role-permissions.ts
 * structure exactly (per-domain grant file, runs after the matching domain
 * catalog seed).
 */

function expand(family: string, actions: string[]): string[] {
  return actions.map((a) => `${family}.${a}`);
}

const ROLE_LAYER1_PERMISSIONS: Record<string, string[]> = {
  // Full grant — administers every Layer 1 surface.
  master_admin: [
    ...expand('project_participant', ['view', 'create', 'edit', 'delete']),
    ...expand('prime_contract', [
      'view',
      'create',
      'edit',
      'delete',
      'sign',
      'activate',
      'complete',
      'terminate',
      'cancel',
    ]),
    ...expand('intercompany_contract', [
      'view',
      'create',
      'edit',
      'delete',
      'sign',
      'activate',
      'close',
      'cancel',
    ]),
    ...expand('entity_legal_details', ['view', 'edit', 'delete']),
  ],

  // View-only — sees Layer 1 surfaces, cannot mutate. Mutation grants stay on
  // master_admin only for now; Layer 2 work refines per-role mutation rights.
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

// Exported for the seed-coverage regression test (PIC-27).
export { ROLE_LAYER1_PERMISSIONS };
