import type { PrismaClient } from '@prisma/client';
import { SINGLETON_ORG_ID } from './organizations';

export async function seedSampleEntity(prisma: PrismaClient) {
  console.log('  Seeding sample entities...');

  // Parent holding company
  const parent = await prisma.entity.upsert({
    where: { orgId_code: { orgId: SINGLETON_ORG_ID, code: 'PICOPLAY-KSA' } },
    create: {
      orgId: SINGLETON_ORG_ID,
      code: 'PICOPLAY-KSA',
      name: 'Pico Play KSA',
      type: 'parent',
      status: 'active',
    },
    update: {
      name: 'Pico Play KSA',
      type: 'parent',
      status: 'active',
    },
  });

  // Operating subsidiary
  const ops = await prisma.entity.upsert({
    where: { orgId_code: { orgId: SINGLETON_ORG_ID, code: 'FMKSA-OPS' } },
    create: {
      orgId: SINGLETON_ORG_ID,
      code: 'FMKSA-OPS',
      name: 'Fun Makers KSA Operations',
      type: 'subsidiary',
      parentEntityId: parent.id,
      status: 'active',
    },
    update: {
      name: 'Fun Makers KSA Operations',
      type: 'subsidiary',
      parentEntityId: parent.id,
      status: 'active',
    },
  });

  // Riyadh branch
  await prisma.entity.upsert({
    where: { orgId_code: { orgId: SINGLETON_ORG_ID, code: 'FMKSA-RUH' } },
    create: {
      orgId: SINGLETON_ORG_ID,
      code: 'FMKSA-RUH',
      name: 'Fun Makers Riyadh',
      type: 'branch',
      parentEntityId: ops.id,
      status: 'active',
    },
    update: {
      name: 'Fun Makers Riyadh',
      type: 'branch',
      parentEntityId: ops.id,
      status: 'active',
    },
  });

  // Jeddah branch
  await prisma.entity.upsert({
    where: { orgId_code: { orgId: SINGLETON_ORG_ID, code: 'FMKSA-JED' } },
    create: {
      orgId: SINGLETON_ORG_ID,
      code: 'FMKSA-JED',
      name: 'Fun Makers Jeddah',
      type: 'branch',
      parentEntityId: ops.id,
      status: 'active',
    },
    update: {
      name: 'Fun Makers Jeddah',
      type: 'branch',
      parentEntityId: ops.id,
      status: 'active',
    },
  });

  console.log('  ✓ 4 entities seeded (PICOPLAY-KSA, FMKSA-OPS, FMKSA-RUH, FMKSA-JED)');
}
