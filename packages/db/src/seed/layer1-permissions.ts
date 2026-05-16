import type { PrismaClient } from '@prisma/client';

type PermissionDef = {
  code: string;
  description: string;
  resource: string;
  action: string;
};

const RESOURCES: { resource: string; label: string; actions: string[] }[] = [
  {
    resource: 'project_participant',
    label: 'Project Participant',
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    resource: 'prime_contract',
    label: 'Prime Contract',
    actions: [
      'view',
      'create',
      'edit',
      'delete',
      'sign',      // transition: draft → signed
      'activate',  // transition: signed → active
      'complete',  // transition: active → completed
      'terminate', // transition: active → terminated
      'cancel',    // transition: draft|signed|active → cancelled
    ],
  },
  {
    resource: 'intercompany_contract',
    label: 'Intercompany Contract',
    actions: [
      'view',
      'create',
      'edit',
      'delete',
      'sign',      // transition: draft → signed
      'activate',  // transition: signed → active
      'close',     // transition: active → closed
      'cancel',    // transition: draft|signed|active → cancelled
    ],
  },
  {
    resource: 'entity_legal_details',
    label: 'Entity Legal Details',
    actions: ['view', 'edit', 'delete'],
  },
];

const ACTION_VERBS: Record<string, string> = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  sign: 'Digitally sign',
  activate: 'Activate',
  complete: 'Complete',
  terminate: 'Terminate',
  cancel: 'Cancel',
  close: 'Close',
};

export const LAYER1_PERMISSIONS: PermissionDef[] = [];

for (const { resource, label, actions } of RESOURCES) {
  for (const action of actions) {
    const verb = ACTION_VERBS[action] ?? action;
    LAYER1_PERMISSIONS.push({
      code: `${resource}.${action}`,
      description: `${verb} ${label} records`,
      resource,
      action,
    });
  }
}

export async function seedLayer1Permissions(prisma: PrismaClient) {
  console.log(`  Seeding Layer 1 permissions (${LAYER1_PERMISSIONS.length} codes)...`);
  for (const perm of LAYER1_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: { description: perm.description, resource: perm.resource, action: perm.action },
      create: perm,
    });
  }
  console.log('  ✅ Layer 1 permissions seeded.');
}
