import type { PrismaClient } from '@prisma/client';

export async function seedSampleProject(prisma: PrismaClient) {
  console.log('  Seeding sample project...');

  const entity = await prisma.entity.findUnique({ where: { code: 'FMKSA-OPS' } });
  if (!entity) {
    throw new Error('Entity FMKSA-OPS not found. Run sample-entity seed first.');
  }

  await prisma.project.upsert({
    where: { code: 'FMKSA-DEMO-001' },
    create: {
      code: 'FMKSA-DEMO-001',
      name: 'Fun Makers KSA Demo Project',
      entityId: entity.id,
      status: 'active',
      currencyCode: 'SAR',
      startDate: new Date('2026-01-01'),
      createdBy: 'seed',
    },
    update: {
      name: 'Fun Makers KSA Demo Project',
      entityId: entity.id,
      status: 'active',
      currencyCode: 'SAR',
    },
  });

  console.log('  ✓ 1 project seeded (FMKSA-DEMO-001)');
}
