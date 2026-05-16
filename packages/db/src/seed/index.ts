// PIC-35 Step 8: SEED_CONTEXT must be `true` in the environment when this
// script runs. It bypasses the Step 7 Prisma extension that blocks direct
// `data: { status }` writes outside the workflow engine. Seed fixtures use
// Option B (entity + workflow_instance written directly under SEED_CONTEXT,
// bypassing the workflow engine) — running real workflow transitions per
// fixture would inflate seed time without adding value for demo state.
//
// SET VIA THE PACKAGE.JSON SCRIPT, not runtime: ESM imports are hoisted to
// the top of the file, so any `process.env.SEED_CONTEXT = ...` written here
// would run AFTER all imports — too late if any imported module eagerly
// constructs a PrismaClient. The canonical invocation is:
//   pnpm --filter @fmksa/db db:seed
// which sets SEED_CONTEXT=true before tsx evaluates this file.

import { PrismaClient } from '@prisma/client';
import { cleanTestData } from './clean-test-data';
import { seedCountries } from './countries';
import { seedCurrencies } from './currencies';
import { seedAppSettings } from './app-settings';
import { seedStatusDictionaries } from './status-dictionaries';
import { seedPermissions } from './permissions';
import { seedRoles } from './roles';
import { seedRolePermissions } from './role-permissions';
import { seedNotificationTemplates } from './notification-templates';
import { seedSampleEntity } from './sample-entity';
import { seedSampleProject } from './sample-project';
import { seedMasterAdmin } from './master-admin';
import { seedWorkflowTemplates } from './workflow-templates';
import { seedCommercialPermissions } from './commercial-permissions';
import { seedCommercialRolePermissions } from './commercial-role-permissions';
import { seedCommercialWorkflowTemplates } from './commercial-workflow-templates';
import { seedCommercialNotificationTemplates } from './commercial-notification-templates';
import { seedProcurementPermissions } from './procurement-permissions';
import { seedLayer1Permissions } from './layer1-permissions';
import { seedLayer1RolePermissions } from './layer1-role-permissions';
import { seedQaTestRolePermissions } from './qa-test-role-permissions';
import { seedProcurementRolePermissions } from './procurement-role-permissions';
import { seedProcurementWorkflowTemplates } from './procurement-workflow-templates';
import { seedProcurementNotificationTemplates } from './procurement-notification-templates';
import { seedProcurementCategories } from './procurement-categories';
import { seedCommercialDemoData } from './commercial-demo-data';
import { seedBudgetCategories } from './budget-categories';
import { seedE2eDemo } from './e2e-demo';
import { seedLayer1DemoData } from './layer1-demo-data';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clean orphaned test data before seeding demo records
  await cleanTestData(prisma);

  // Order matters: no-FK tables first, then FK-dependent tables
  await seedCountries(prisma);
  await seedCurrencies(prisma);
  await seedAppSettings(prisma);
  await seedStatusDictionaries(prisma);
  await seedPermissions(prisma);
  await seedRoles(prisma);
  await seedRolePermissions(prisma);
  await seedNotificationTemplates(prisma);
  await seedSampleEntity(prisma);
  await seedSampleProject(prisma);
  await seedMasterAdmin(prisma);
  await seedWorkflowTemplates(prisma);
  await seedCommercialPermissions(prisma);
  await seedCommercialRolePermissions(prisma);
  await seedCommercialWorkflowTemplates(prisma);
  await seedCommercialNotificationTemplates(prisma);
  await seedProcurementPermissions(prisma);
  await seedProcurementRolePermissions(prisma);
  await seedLayer1Permissions(prisma);
  await seedLayer1RolePermissions(prisma);
  // QA test grants run LAST so the view_only_demo runtime query captures every
  // *.view code added by all preceding domain seeds.
  await seedQaTestRolePermissions(prisma);
  await seedProcurementWorkflowTemplates(prisma);
  await seedProcurementNotificationTemplates(prisma);
  await seedProcurementCategories(prisma);
  await seedBudgetCategories(prisma);
  await seedCommercialDemoData(prisma);
  await seedE2eDemo(prisma);
  // PIC-33: populate ProjectParticipants + PrimeContracts for the 4 demo
  // projects. Must run after sample-project (projects exist), sample-entity
  // (FMKSA-OPS exists), and master-admin (createdBy actor exists).
  await seedLayer1DemoData(prisma);

  console.log('✅ Seeding complete.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
