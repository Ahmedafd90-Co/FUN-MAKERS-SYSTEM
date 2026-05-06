import type { PrismaClient } from '@prisma/client';

/**
 * QA-test role-permission grants — PIC-25.
 *
 * Backs the two QA fixture roles defined in roles.ts:
 *   - view_only_demo: every `*.view` code across base + commercial + procurement + Layer 1
 *   - no_perm_demo:   nothing (authenticated only; every gated endpoint returns 403)
 *
 * Runs LAST in the role-permissions sequence so the runtime `*.view` query
 * captures every code added by the preceding seeds. New view codes added in
 * future PRs are automatically granted to view_only_demo without needing to
 * touch this file — that's the intended semantic for a "view-only across
 * everything" fixture.
 *
 * Mirrors the per-domain role-permissions seed pattern (commercial /
 * procurement / layer1).
 */

export async function seedQaTestRolePermissions(prisma: PrismaClient) {
  console.log('  Seeding QA test role-permission mappings...');

  const viewOnlyRole = await prisma.role.findFirst({ where: { code: 'view_only_demo' } });
  if (!viewOnlyRole) {
    console.warn(`  ⚠ Role 'view_only_demo' not found, skipping`);
    return;
  }

  // Every permission whose action is exactly 'view'. Using the action column
  // (not a code-suffix LIKE) avoids matching codes like `commercial.preview`
  // that happen to end with the substring "view".
  const viewPerms = await prisma.permission.findMany({ where: { action: 'view' } });

  let count = 0;
  for (const permission of viewPerms) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: viewOnlyRole.id, permissionId: permission.id },
      },
      update: {},
      create: { roleId: viewOnlyRole.id, permissionId: permission.id },
    });
    count++;
  }

  // no_perm_demo: intentionally no grants. The role exists in roles.ts so
  // ProjectAssignment FK is satisfiable; assignment to a project is enough
  // to reach the project workspace, but every endpoint check will fail.
  console.log(`  ✅ QA test role-permission mappings seeded (${count} view grants).`);
}
