import type { PrismaClient } from '@prisma/client';

export async function seedSampleEntity(prisma: PrismaClient) {
  console.log('  Seeding sample entities...');

  // Parent entity
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
  await prisma.entity.upsert({
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

  console.log('  ✓ 2 entities seeded (PICOPLAY-KSA, FMKSA-OPS)');
}
