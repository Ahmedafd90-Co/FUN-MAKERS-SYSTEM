import type { PrismaClient } from '@prisma/client';

const DASHBOARD_PERMS = ['commercial_dashboard.view', 'client_submission_history.view'];

function expand(family: string, actions: string[]): string[] {
  return actions.map(a => `${family}.${a}`);
}

const ROLE_COMMERCIAL_PERMISSIONS: Record<string, string[]> = {
  // master_admin intentionally omitted — its full catalog grant is centralized
  // in seedMasterAdminAllPermissions() (cluster 4 / Option B), which runs after
  // this commercial catalog seeds. master_admin still receives every commercial
  // permission without a per-domain catch-up entry (proven by seed-coverage.test.ts).
  project_director: [
    ...expand('ipa', ['view', 'review', 'approve', 'sign']),
    ...expand('ipc', ['view', 'review', 'approve', 'sign']),
    ...expand('variation', ['view', 'review', 'approve', 'sign']),
    // PIC-59 audit D3.05: cost_proposal.issue + cost_proposal.sign were master_admin-only —
    // PD issues + signs cost proposals to client in practice.
    ...expand('cost_proposal', ['view', 'review', 'approve', 'issue', 'sign']),
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
    ...expand('variation', ['view', 'create', 'edit', 'delete', 'submit', 'review', 'issue']),
    ...expand('cost_proposal', ['view', 'review']),
    ...expand('tax_invoice', ['view', 'review']),
    ...expand('correspondence', ['view', 'create', 'edit', 'delete', 'submit', 'review', 'issue']),
    ...DASHBOARD_PERMS,
  ],
  qs_commercial: [
    ...expand('ipa', ['view', 'create', 'edit', 'delete', 'submit']),
    ...expand('ipc', ['view', 'create', 'edit', 'delete', 'submit']),
    ...expand('variation', ['view', 'create', 'edit', 'delete', 'submit']),
    // PIC-59 audit D3.05: cost_proposal.issue was master_admin-only — QS drafts and issues cost proposals.
    ...expand('cost_proposal', ['view', 'create', 'edit', 'delete', 'submit', 'issue']),
    ...expand('tax_invoice', ['view', 'create', 'edit', 'delete', 'submit']),
    ...expand('correspondence', ['view', 'create', 'edit', 'delete', 'submit']),
    ...DASHBOARD_PERMS,
  ],
  finance: [
    ...expand('ipa', ['view', 'review']),
    ...expand('ipc', ['view', 'review']),
    ...expand('variation', ['view']),
    ...expand('cost_proposal', ['view']),
    ...expand('tax_invoice', ['view', 'create', 'edit', 'delete', 'review', 'sign', 'issue']),
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
    // PIC-59 audit D3.05: cost_proposal.sign was master_admin-only — exec also signs high-value cost proposals.
    ...expand('cost_proposal', ['view', 'review', 'approve', 'sign']),
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
