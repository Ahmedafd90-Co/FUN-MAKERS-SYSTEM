import type { PrismaClient } from '@prisma/client';

type PermissionDef = {
  code: string;
  description: string;
  resource: string;
  action: string;
};

const RESOURCES: { resource: string; label: string; actions: string[] }[] = [
  {
    resource: 'vendor',
    label: 'Vendor',
    actions: ['view', 'create', 'edit', 'delete', 'activate', 'suspend', 'blacklist'],
  },
  {
    resource: 'vendor_contract',
    label: 'Vendor Contract',
    actions: ['view', 'create', 'edit', 'delete', 'submit', 'review', 'approve', 'sign', 'terminate'],
  },
  {
    resource: 'framework_agreement',
    label: 'Framework Agreement',
    actions: ['view', 'create', 'edit', 'delete', 'submit', 'review', 'approve', 'sign', 'terminate'],
  },
  {
    resource: 'rfq',
    label: 'Request for Quotation',
    actions: ['view', 'create', 'edit', 'delete', 'submit', 'review', 'approve', 'issue', 'evaluate', 'award'],
  },
  {
    resource: 'quotation',
    label: 'Quotation',
    actions: ['view', 'create', 'edit', 'delete', 'review', 'shortlist', 'award', 'reject'],
  },
  {
    resource: 'purchase_order',
    label: 'Purchase Order',
    actions: ['view', 'create', 'edit', 'submit', 'review', 'approve', 'sign', 'issue'],
  },
  {
    resource: 'supplier_invoice',
    label: 'Supplier Invoice',
    actions: ['view', 'create', 'edit', 'submit', 'review', 'approve', 'prepare_payment'],
  },
  {
    resource: 'expense',
    label: 'Expense',
    actions: ['view', 'create', 'edit', 'submit', 'review', 'approve'],
  },
  {
    resource: 'credit_note',
    label: 'Credit Note',
    actions: ['view', 'create', 'edit', 'review', 'verify', 'apply'],
  },
  {
    resource: 'procurement_dashboard',
    label: 'Procurement Dashboard',
    actions: ['view'],
  },
  {
    resource: 'procurement_category',
    label: 'Procurement Category',
    actions: ['view', 'manage'],
  },
  {
    resource: 'item_catalog',
    label: 'Item Catalog',
    actions: ['view', 'manage'],
  },
  {
    resource: 'project_vendor',
    label: 'Project Vendor',
    actions: ['view', 'manage'],
  },
];

const ACTION_VERBS: Record<string, string> = {
  view: 'View',
  create: 'Create',
  edit: 'Edit draft',
  delete: 'Delete draft',
  submit: 'Submit for review',
  review: 'Review and provide feedback',
  approve: 'Approve',
  sign: 'Digitally sign',
  issue: 'Issue with reference number',
  activate: 'Activate',
  suspend: 'Suspend',
  blacklist: 'Blacklist',
  terminate: 'Terminate',
  evaluate: 'Evaluate quotations',
  award: 'Award',
  shortlist: 'Shortlist',
  reject: 'Reject',
  prepare_payment: 'Prepare payment',
  verify: 'Verify',
  apply: 'Apply credit',
  manage: 'Manage',
};

export const PROCUREMENT_PERMISSIONS: PermissionDef[] = [];

for (const { resource, label, actions } of RESOURCES) {
  for (const action of actions) {
    const verb = ACTION_VERBS[action] ?? action;
    PROCUREMENT_PERMISSIONS.push({
      code: `${resource}.${action}`,
      description: `${verb} ${label} records`,
      resource,
      action,
    });
  }
}

export async function seedProcurementPermissions(prisma: PrismaClient) {
  console.log(`  Seeding procurement permissions (${PROCUREMENT_PERMISSIONS.length} codes)...`);
  for (const perm of PROCUREMENT_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: { description: perm.description, resource: perm.resource, action: perm.action },
      create: perm,
    });
  }
  console.log('  ✅ Procurement permissions seeded.');
}
