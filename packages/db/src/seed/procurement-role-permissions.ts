import type { PrismaClient } from '@prisma/client';

function expand(resource: string, actions: string[]): string[] {
  return actions.map(a => `${resource}.${a}`);
}

const ROLE_PROCUREMENT_PERMISSIONS: Record<string, string[]> = {
  master_admin: [
    // PIC-27: explicit `delete` grants below — the seed-coverage regression
    // test surfaced these 5 codes as orphaned in the catalog (declared in
    // procurement-permissions.ts but no role ever held them). master_admin
    // owns hard-delete authority across procurement, alongside the soft-delete
    // `terminate` flow used by other roles.
    ...expand('vendor', ['view', 'create', 'edit', 'delete', 'activate', 'suspend', 'blacklist']),
    ...expand('vendor_contract', ['view', 'create', 'edit', 'delete', 'submit', 'review', 'approve', 'sign', 'terminate']),
    ...expand('framework_agreement', ['view', 'create', 'edit', 'delete', 'submit', 'review', 'approve', 'sign', 'terminate']),
    // PIC-59: 'materialise' was added to the rfq actions catalog in PIC-53
    // but never added to master_admin grants — PIC-27 seed-coverage test was
    // failing on main because of this exact gap. Adding here closes the loop.
    ...expand('rfq', ['view', 'create', 'edit', 'delete', 'submit', 'review', 'approve', 'issue', 'evaluate', 'award', 'materialise', 'terminate']),
    ...expand('quotation', ['view', 'create', 'edit', 'delete', 'review', 'shortlist', 'award', 'reject', 'terminate']),
    ...expand('purchase_order', ['view', 'create', 'edit', 'submit', 'review', 'approve', 'sign', 'issue']),
    ...expand('supplier_invoice', ['view', 'create', 'edit', 'submit', 'review', 'approve', 'prepare_payment']),
    ...expand('expense', ['view', 'create', 'edit', 'submit', 'review', 'approve']),
    ...expand('credit_note', ['view', 'create', 'edit', 'review', 'verify', 'apply']),
    ...expand('procurement_dashboard', ['view']),
    ...expand('procurement_category', ['view', 'manage']),
    ...expand('item_catalog', ['view', 'manage']),
    ...expand('project_vendor', ['view', 'manage']),
  ],
  project_director: [
    ...expand('vendor', ['view']),
    ...expand('vendor_contract', ['view', 'approve', 'sign']),
    ...expand('framework_agreement', ['view', 'approve', 'sign']),
    // PIC-59 (PIC-53 closing-observation): 'materialise' was master_admin-only post-PIC-53.
    // Audit D3.03 recommended procurement + project_director per the deal-shape decision —
    // PD picks PO vs Subcontract per the materialise card UX. Granting here.
    ...expand('rfq', ['view', 'approve', 'materialise', 'terminate']),
    ...expand('quotation', ['view']),
    // PIC-59 audit D3.05: purchase_order.issue was master_admin-only — PD issues POs in practice.
    ...expand('purchase_order', ['view', 'approve', 'sign', 'issue']),
    ...expand('supplier_invoice', ['view', 'approve']),
    ...expand('expense', ['view', 'approve']),
    ...expand('credit_note', ['view']),
    ...expand('procurement_dashboard', ['view']),
    ...expand('procurement_category', ['view']),
  ],
  project_manager: [
    ...expand('vendor', ['view']),
    ...expand('vendor_contract', ['view', 'review']),
    ...expand('framework_agreement', ['view', 'review']),
    ...expand('rfq', ['view', 'review', 'approve', 'terminate']),
    ...expand('quotation', ['view', 'review']),
    ...expand('purchase_order', ['view', 'review']),
    ...expand('supplier_invoice', ['view', 'review']),
    ...expand('expense', ['view', 'review', 'approve']),
    ...expand('credit_note', ['view']),
    ...expand('procurement_dashboard', ['view']),
    ...expand('procurement_category', ['view']),
  ],
  contracts_manager: [
    ...expand('vendor', ['view']),
    ...expand('vendor_contract', ['view', 'create', 'edit', 'submit', 'review', 'approve', 'sign', 'terminate']),
    ...expand('framework_agreement', ['view', 'create', 'edit', 'submit', 'review', 'approve', 'sign', 'terminate']),
    ...expand('rfq', ['view', 'review']),
    ...expand('quotation', ['view', 'review']),
    ...expand('purchase_order', ['view', 'review', 'approve', 'sign']),
    ...expand('supplier_invoice', ['view', 'review']),
    ...expand('expense', ['view']),
    ...expand('credit_note', ['view', 'review']),
    ...expand('procurement_dashboard', ['view']),
    ...expand('procurement_category', ['view']),
  ],
  qs_commercial: [
    ...expand('vendor', ['view']),
    ...expand('vendor_contract', ['view']),
    ...expand('framework_agreement', ['view']),
    ...expand('rfq', ['view']),
    ...expand('quotation', ['view']),
    ...expand('purchase_order', ['view']),
    ...expand('supplier_invoice', ['view']),
    ...expand('expense', ['view', 'create', 'edit', 'submit']),
    ...expand('credit_note', ['view']),
    ...expand('procurement_dashboard', ['view']),
    ...expand('procurement_category', ['view']),
  ],
  procurement: [
    ...expand('vendor', ['view', 'create', 'edit', 'activate', 'suspend', 'blacklist']),
    ...expand('vendor_contract', ['view', 'create', 'edit', 'submit']),
    ...expand('framework_agreement', ['view', 'create', 'edit', 'submit']),
    // PIC-59 (PIC-53 closing-observation): 'materialise' was master_admin-only post-PIC-53.
    // Audit D3.03 recommended procurement + project_director — procurement operates
    // the materialise card on awarded RFQs; PD has materialise too (line 32).
    ...expand('rfq', ['view', 'create', 'edit', 'submit', 'review', 'approve', 'issue', 'evaluate', 'award', 'materialise', 'terminate']),
    ...expand('quotation', ['view', 'create', 'edit', 'review', 'shortlist', 'award', 'reject', 'terminate']),
    // PIC-59 audit D3.05: purchase_order.issue was master_admin-only — procurement issues POs in practice.
    ...expand('purchase_order', ['view', 'create', 'edit', 'submit', 'review', 'issue']),
    ...expand('supplier_invoice', ['view', 'create', 'edit', 'submit']),
    ...expand('expense', ['view', 'create', 'edit', 'submit']),
    ...expand('credit_note', ['view', 'create', 'edit']),
    ...expand('procurement_dashboard', ['view']),
    ...expand('procurement_category', ['view']),
    ...expand('item_catalog', ['view']),
    ...expand('project_vendor', ['view', 'manage']),
  ],
  finance: [
    ...expand('vendor', ['view']),
    ...expand('vendor_contract', ['view', 'review']),
    ...expand('framework_agreement', ['view', 'review']),
    ...expand('rfq', ['view']),
    ...expand('quotation', ['view']),
    ...expand('purchase_order', ['view', 'review']),
    ...expand('supplier_invoice', ['view', 'create', 'edit', 'submit', 'review', 'approve', 'prepare_payment']),
    ...expand('expense', ['view', 'review', 'approve']),
    ...expand('credit_note', ['view', 'create', 'edit', 'review', 'verify', 'apply']),
    ...expand('procurement_dashboard', ['view']),
    ...expand('procurement_category', ['view']),
  ],
  cost_controller: [
    ...expand('vendor', ['view']),
    ...expand('vendor_contract', ['view']),
    ...expand('framework_agreement', ['view']),
    ...expand('rfq', ['view']),
    ...expand('quotation', ['view']),
    ...expand('purchase_order', ['view']),
    ...expand('supplier_invoice', ['view', 'review']),
    ...expand('expense', ['view', 'review']),
    ...expand('credit_note', ['view']),
    ...expand('procurement_dashboard', ['view']),
    ...expand('procurement_category', ['view']),
  ],
  site_team: [
    ...expand('vendor', ['view']),
    ...expand('purchase_order', ['view']),
    ...expand('expense', ['view', 'create', 'edit', 'submit']),
  ],
  design: [
    ...expand('vendor', ['view']),
    ...expand('purchase_order', ['view']),
    ...expand('expense', ['view', 'create', 'edit', 'submit']),
  ],
  qa_qc: [
    ...expand('vendor', ['view']),
    ...expand('purchase_order', ['view']),
    ...expand('expense', ['view', 'create', 'edit', 'submit']),
  ],
  document_controller: [
    ...expand('vendor', ['view']),
    ...expand('vendor_contract', ['view']),
    ...expand('framework_agreement', ['view']),
    ...expand('rfq', ['view']),
    ...expand('quotation', ['view']),
    ...expand('purchase_order', ['view']),
    ...expand('supplier_invoice', ['view']),
    ...expand('expense', ['view']),
    ...expand('credit_note', ['view']),
    ...expand('procurement_dashboard', ['view']),
    ...expand('procurement_category', ['view']),
  ],
  pmo: [
    ...expand('vendor', ['view']),
    ...expand('vendor_contract', ['view']),
    ...expand('framework_agreement', ['view']),
    ...expand('rfq', ['view']),
    ...expand('quotation', ['view']),
    ...expand('purchase_order', ['view']),
    ...expand('supplier_invoice', ['view']),
    ...expand('expense', ['view']),
    ...expand('credit_note', ['view']),
    ...expand('procurement_dashboard', ['view']),
    ...expand('procurement_category', ['view']),
  ],
  executive_approver: [
    ...expand('vendor', ['view']),
    ...expand('vendor_contract', ['view', 'approve']),
    ...expand('framework_agreement', ['view', 'approve']),
    ...expand('rfq', ['view', 'approve']),
    ...expand('quotation', ['view']),
    ...expand('purchase_order', ['view', 'approve']),
    ...expand('supplier_invoice', ['view', 'approve']),
    ...expand('expense', ['view', 'approve']),
    ...expand('credit_note', ['view']),
    ...expand('procurement_dashboard', ['view']),
    ...expand('procurement_category', ['view']),
  ],
};

export async function seedProcurementRolePermissions(prisma: PrismaClient) {
  console.log('  Seeding procurement role-permission mappings...');
  for (const [roleCode, permCodes] of Object.entries(ROLE_PROCUREMENT_PERMISSIONS)) {
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
  console.log('  ✅ Procurement role-permission mappings seeded.');
}
