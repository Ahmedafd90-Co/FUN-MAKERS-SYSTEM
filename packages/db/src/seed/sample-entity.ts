import type { PrismaClient } from '@prisma/client';

export async function seedSampleEntity(prisma: PrismaClient) {
  console.log('  Seeding sample entities...');

  // Parent holding company
  const parent = await prisma.entity.upsert({
    where: { code: 'PICOPLAY-KSA' },
    create: {
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
    where: { code: 'FMKSA-OPS' },
    create: {
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
    where: { code: 'FMKSA-RUH' },
    create: {
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
    where: { code: 'FMKSA-JED' },
    create: {
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
