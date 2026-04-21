import type { PrismaClient } from '@prisma/client';

type PermissionDef = {
  code: string;
  description: string;
  resource: string;
  action: string;
};

const RECORD_FAMILIES = ['ipa', 'ipc', 'variation', 'cost_proposal', 'tax_invoice', 'correspondence'] as const;
const ACTIONS = ['view', 'create', 'edit', 'delete', 'submit', 'review', 'approve', 'sign', 'issue'] as const;

const FAMILY_DESCRIPTIONS: Record<string, string> = {
  ipa: 'Interim Payment Application',
  ipc: 'Interim Payment Certificate',
  variation: 'Variation Order / Change Order',
  cost_proposal: 'Cost Proposal',
  tax_invoice: 'Tax Invoice',
  correspondence: 'Correspondence (Letter, Notice, Claim, Back Charge)',
};

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
};

export const COMMERCIAL_PERMISSIONS: PermissionDef[] = [];

for (const family of RECORD_FAMILIES) {
  for (const action of ACTIONS) {
    COMMERCIAL_PERMISSIONS.push({
      code: `${family}.${action}`,
      description: `${ACTION_VERBS[action]} ${FAMILY_DESCRIPTIONS[family]} records`,
      resource: family,
      action,
    });
  }
}

COMMERCIAL_PERMISSIONS.push(
  {
    code: 'commercial_dashboard.view',
    description: 'View the project commercial dashboard',
    resource: 'commercial_dashboard',
    action: 'view',
  },
  {
    code: 'client_submission_history.view',
    description: 'View client submission history on the commercial dashboard',
    resource: 'client_submission_history',
    action: 'view',
  },
  {
    code: 'ipa_forecast.view',
    description: 'View the per-period IPA forecast (plan of record) on the commercial dashboard and forecast admin page',
    resource: 'ipa_forecast',
    action: 'view',
  },
  {
    code: 'ipa_forecast.edit',
    description: 'Create, update, and delete per-period IPA forecast entries',
    resource: 'ipa_forecast',
    action: 'edit',
  },
);

export async function seedCommercialPermissions(prisma: PrismaClient) {
  console.log(`  Seeding commercial permissions (${COMMERCIAL_PERMISSIONS.length} codes)...`);
  for (const perm of COMMERCIAL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: { description: perm.description, resource: perm.resource, action: perm.action },
      create: perm,
    });
  }
  console.log('  ✅ Commercial permissions seeded.');
}
