import { PrismaClient } from '@prisma/client';
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

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

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
  // Workflow templates seed is optional until Phase 1.5 Pause #2
  // await seedWorkflowTemplates(prisma);

  console.log('✅ Seeding complete.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
