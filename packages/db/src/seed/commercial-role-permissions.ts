import type { PrismaClient } from '@prisma/client';

const DASHBOARD_PERMS = ['commercial_dashboard.view', 'client_submission_history.view'];

function expand(family: string, actions: string[]): string[] {
  return actions.map(a => `${family}.${a}`);
}

const ROLE_COMMERCIAL_PERMISSIONS: Record<string, string[]> = {
  master_admin: [
    ...expand('ipa', ['view', 'create', 'edit', 'submit', 'review', 'approve', 'sign', 'issue']),
    ...expand('ipc', ['view', 'create', 'edit', 'submit', 'review', 'approve', 'sign', 'issue']),
    ...expand('variation', ['view', 'create', 'edit', 'submit', 'review', 'approve', 'sign', 'issue']),
    ...expand('cost_proposal', ['view', 'create', 'edit', 'submit', 'review', 'approve', 'sign', 'issue']),
    ...expand('tax_invoice', ['view', 'create', 'edit', 'submit', 'review', 'approve', 'sign', 'issue']),
    ...expand('correspondence', ['view', 'create', 'edit', 'submit', 'review', 'approve', 'sign', 'issue']),
    ...DASHBOARD_PERMS,
  ],
  project_director: [
    ...expand('ipa', ['view', 'review', 'approve', 'sign']),
    ...expand('ipc', ['view', 'review', 'approve', 'sign']),
    ...expand('variation', ['view', 'review', 'approve', 'sign']),
    ...expand('cost_proposal', ['view', 'review', 'approve']),
    ...expand('tax_invoice', ['view', 'review', 'approve', 'sign']),
    ...expand('correspondence', ['view', 'review', 'approve', 'sign', 'issue']),
    ...DASHBOARD_PERMS,
  ],
  project_manager: [
    ...expand('ipa', ['view', 'review']),
    ...expand('ipc', ['view', 'review']),
    ...expand('variation', ['view', 'review']),
    ...expand('cost_proposal', ['view', 'review']),
    ...expand('tax_invoice', ['view']),
    ...expand('correspondence', ['view', 'review', 'issue']),
    ...DASHBOARD_PERMS,
  ],
  contracts_manager: [
    ...expand('ipa', ['view', 'review', 'issue']),
    ...expand('ipc', ['view', 'review', 'issue']),
    ...expand('variation', ['view', 'create', 'edit', 'submit', 'review', 'issue']),
    ...expand('cost_proposal', ['view', 'review']),
    ...expand('tax_invoice', ['view', 'review']),
    ...expand('correspondence', ['view', 'create', 'edit', 'submit', 'review', 'issue']),
    ...DASHBOARD_PERMS,
  ],
  qs_commercial: [
    ...expand('ipa', ['view', 'create', 'edit', 'submit']),
    ...expand('ipc', ['view', 'create', 'edit', 'submit']),
    ...expand('variation', ['view', 'create', 'edit', 'submit']),
    ...expand('cost_proposal', ['view', 'create', 'edit', 'submit']),
    ...expand('tax_invoice', ['view', 'create', 'edit', 'submit']),
    ...expand('correspondence', ['view', 'create', 'edit', 'submit']),
    ...DASHBOARD_PERMS,
  ],
  finance: [
    ...expand('ipa', ['view', 'review']),
    ...expand('ipc', ['view', 'review']),
    ...expand('variation', ['view']),
    ...expand('cost_proposal', ['view']),
    ...expand('tax_invoice', ['view', 'create', 'edit', 'review', 'sign', 'issue']),
    ...expand('correspondence', ['view']),
    ...DASHBOARD_PERMS,
  ],
  cost_controller: [
    ...expand('ipa', ['view']),
    ...expand('ipc', ['view']),
    ...expand('variation', ['view']),
    ...expand('cost_proposal', ['view', 'review']),
    ...expand('tax_invoice', ['view']),
    ...expand('correspondence', ['view', 'review']),
    ...DASHBOARD_PERMS,
  ],
  site_team: [
    ...expand('ipa', ['view']),
    ...expand('ipc', ['view']),
    ...expand('variation', ['view', 'create', 'edit']),
    ...expand('cost_proposal', ['view']),
    ...expand('tax_invoice', ['view']),
    ...expand('correspondence', ['view', 'create', 'edit']),
    ...DASHBOARD_PERMS,
  ],
  design: [
    ...expand('ipa', ['view']),
    ...expand('ipc', ['view']),
    ...expand('variation', ['view', 'create', 'edit']),
    ...expand('cost_proposal', ['view']),
    ...expand('tax_invoice', ['view']),
    ...expand('correspondence', ['view', 'create', 'edit']),
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
    ...expand('ipa', ['view', 'issue']),
    ...expand('ipc', ['view', 'issue']),
    ...expand('variation', ['view', 'issue']),
    ...expand('cost_proposal', ['view']),
    ...expand('tax_invoice', ['view']),
    ...expand('correspondence', ['view', 'issue']),
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
    ...expand('ipa', ['view', 'review', 'approve', 'sign']),
    ...expand('ipc', ['view', 'review', 'approve', 'sign']),
    ...expand('variation', ['view', 'review', 'approve', 'sign']),
    ...expand('cost_proposal', ['view', 'review', 'approve']),
    ...expand('tax_invoice', ['view', 'review', 'approve']),
    ...expand('correspondence', ['view', 'review', 'approve', 'sign']),
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
