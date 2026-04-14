import type { PrismaClient } from '@prisma/client';

const DASHBOARD_PERMS = ['commercial_dashboard.view', 'client_submission_history.view'];

function expand(family: string, actions: string[]): string[] {
  return actions.map(a => `${family}.${a}`);
}

const ROLE_COMMERCIAL_PERMISSIONS: Record<string, string[]> = {
  master_admin: [
    ...expand('ipa', ['view', 'create', 'edit', 'delete', 'submit', 'review', 'approve', 'sign', 'issue', 'transition']),
    ...expand('ipc', ['view', 'create', 'edit', 'delete', 'submit', 'review', 'approve', 'sign', 'issue', 'transition']),
    ...expand('variation', ['view', 'create', 'edit', 'delete', 'submit', 'review', 'approve', 'sign', 'issue', 'transition']),
    ...expand('cost_proposal', ['view', 'create', 'edit', 'delete', 'submit', 'review', 'approve', 'sign', 'issue', 'transition']),
    ...expand('tax_invoice', ['view', 'create', 'edit', 'delete', 'submit', 'review', 'approve', 'sign', 'issue', 'transition']),
    ...expand('correspondence', ['view', 'create', 'edit', 'delete', 'submit', 'review', 'approve', 'sign', 'issue', 'transition']),
    ...DASHBOARD_PERMS,
  ],
  project_director: [
    ...expand('ipa', ['view', 'review', 'approve', 'sign', 'transition']),
    ...expand('ipc', ['view', 'review', 'approve', 'sign', 'transition']),
    ...expand('variation', ['view', 'review', 'approve', 'sign', 'transition']),
    ...expand('cost_proposal', ['view', 'review', 'approve', 'transition']),
    ...expand('tax_invoice', ['view', 'review', 'approve', 'sign', 'transition']),
    ...expand('correspondence', ['view', 'review', 'approve', 'sign', 'issue', 'transition']),
    ...DASHBOARD_PERMS,
  ],
  project_manager: [
    ...expand('ipa', ['view', 'review', 'transition']),
    ...expand('ipc', ['view', 'review', 'transition']),
    ...expand('variation', ['view', 'review', 'transition']),
    ...expand('cost_proposal', ['view', 'review', 'transition']),
    ...expand('tax_invoice', ['view']),
    ...expand('correspondence', ['view', 'review', 'issue', 'transition']),
    ...DASHBOARD_PERMS,
  ],
  contracts_manager: [
    ...expand('ipa', ['view', 'review', 'issue', 'transition']),
    ...expand('ipc', ['view', 'review', 'issue', 'transition']),
    ...expand('variation', ['view', 'create', 'edit', 'delete', 'submit', 'review', 'issue', 'transition']),
    ...expand('cost_proposal', ['view', 'review', 'transition']),
    ...expand('tax_invoice', ['view', 'review', 'transition']),
    ...expand('correspondence', ['view', 'create', 'edit', 'delete', 'submit', 'review', 'issue', 'transition']),
    ...DASHBOARD_PERMS,
  ],
  qs_commercial: [
    ...expand('ipa', ['view', 'create', 'edit', 'delete', 'submit', 'transition']),
    ...expand('ipc', ['view', 'create', 'edit', 'delete', 'submit', 'transition']),
    ...expand('variation', ['view', 'create', 'edit', 'delete', 'submit', 'transition']),
    ...expand('cost_proposal', ['view', 'create', 'edit', 'delete', 'submit', 'transition']),
    ...expand('tax_invoice', ['view', 'create', 'edit', 'delete', 'submit', 'transition']),
    ...expand('correspondence', ['view', 'create', 'edit', 'delete', 'submit', 'transition']),
    ...DASHBOARD_PERMS,
  ],
  finance: [
    ...expand('ipa', ['view', 'review', 'transition']),
    ...expand('ipc', ['view', 'review', 'transition']),
    ...expand('variation', ['view']),
    ...expand('cost_proposal', ['view']),
    ...expand('tax_invoice', ['view', 'create', 'edit', 'delete', 'review', 'sign', 'issue', 'transition']),
    ...expand('correspondence', ['view']),
    ...DASHBOARD_PERMS,
  ],
  cost_controller: [
    ...expand('ipa', ['view']),
    ...expand('ipc', ['view']),
    ...expand('variation', ['view']),
    ...expand('cost_proposal', ['view', 'review', 'transition']),
    ...expand('tax_invoice', ['view']),
    ...expand('correspondence', ['view', 'review', 'transition']),
    ...DASHBOARD_PERMS,
  ],
  site_team: [
    ...expand('ipa', ['view']),
    ...expand('ipc', ['view']),
    ...expand('variation', ['view', 'create', 'edit', 'delete']),
    ...expand('cost_proposal', ['view']),
    ...expand('tax_invoice', ['view']),
    ...expand('correspondence', ['view', 'create', 'edit', 'delete']),
    ...DASHBOARD_PERMS,
  ],
  design: [
    ...expand('ipa', ['view']),
    ...expand('ipc', ['view']),
    ...expand('variation', ['view', 'create', 'edit', 'delete']),
    ...expand('cost_proposal', ['view']),
    ...expand('tax_invoice', ['view']),
    ...expand('correspondence', ['view', 'create', 'edit', 'delete']),
    ...DASHBOARD_PERMS,
  ],
  qa_qc: [
    ...expand('ipa', ['view']),
    ...expand('ipc', ['view']),
    ...expand('variation', ['view']),
    ...expand('cost_proposal', ['view']),
    ...expand('tax_invoice', ['view']),
    ...expand('correspondence', ['view']),
    ...DASHBOARD_PERMS,
  ],
  procurement: [
    ...expand('ipa', ['view']),
    ...expand('ipc', ['view']),
    ...expand('variation', ['view']),
    ...expand('cost_proposal', ['view']),
    ...expand('tax_invoice', ['view']),
    ...expand('correspondence', ['view']),
    ...DASHBOARD_PERMS,
  ],
  document_controller: [
    ...expand('ipa', ['view', 'issue', 'transition']),
    ...expand('ipc', ['view', 'issue', 'transition']),
    ...expand('variation', ['view', 'issue', 'transition']),
    ...expand('cost_proposal', ['view']),
    ...expand('tax_invoice', ['view']),
    ...expand('correspondence', ['view', 'issue', 'transition']),
    ...DASHBOARD_PERMS,
  ],
  pmo: [
    ...expand('ipa', ['view']),
    ...expand('ipc', ['view']),
    ...expand('variation', ['view']),
    ...expand('cost_proposal', ['view']),
    ...expand('tax_invoice', ['view']),
    ...expand('correspondence', ['view']),
    ...DASHBOARD_PERMS,
  ],
  executive_approver: [
    ...expand('ipa', ['view', 'review', 'approve', 'sign', 'transition']),
    ...expand('ipc', ['view', 'review', 'approve', 'sign', 'transition']),
    ...expand('variation', ['view', 'review', 'approve', 'sign', 'transition']),
    ...expand('cost_proposal', ['view', 'review', 'approve', 'transition']),
    ...expand('tax_invoice', ['view', 'review', 'approve', 'transition']),
    ...expand('correspondence', ['view', 'review', 'approve', 'sign', 'transition']),
    ...DASHBOARD_PERMS,
  ],
};

export async function seedCommercialRolePermissions(prisma: PrismaClient) {
  console.log('  Seeding commercial role-permission mappings...');
  for (const [roleCode, permCodes] of Object.entries(ROLE_COMMERCIAL_PERMISSIONS)) {
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
    }
  }
  console.log('  ✅ Commercial role-permission mappings seeded.');
}
