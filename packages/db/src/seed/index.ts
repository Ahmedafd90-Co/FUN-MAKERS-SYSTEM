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
import { seedProcurementRolePermissions } from './procurement-role-permissions';
import { seedProcurementWorkflowTemplates } from './procurement-workflow-templates';
import { seedProcurementNotificationTemplates } from './procurement-notification-templates';
import { seedProcurementCategories } from './procurement-categories';
import { seedCommercialDemoData } from './commercial-demo-data';
import { seedBudgetCategories } from './budget-categories';

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
  await seedProcurementWorkflowTemplates(prisma);
  await seedProcurementNotificationTemplates(prisma);
  await seedProcurementCategories(prisma);
  await seedBudgetCategories(prisma);
  await seedCommercialDemoData(prisma);

  console.log('✅ Seeding complete.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
