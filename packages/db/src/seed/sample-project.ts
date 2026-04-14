import type { PrismaClient } from '@prisma/client';

export async function seedSampleProject(prisma: PrismaClient) {
  console.log('  Seeding sample projects...');

  // Look up entities for project assignment
  const opsEntity = await prisma.entity.findUnique({ where: { code: 'FMKSA-OPS' } });
  if (!opsEntity) {
    throw new Error('Entity FMKSA-OPS not found. Run sample-entity seed first.');
  }

  const ruhEntity = await prisma.entity.findUnique({ where: { code: 'FMKSA-RUH' } });
  const jedEntity = await prisma.entity.findUnique({ where: { code: 'FMKSA-JED' } });

  // Project 1 — flagship active project under operations
  // Financial baseline set for stakeholder KPI demo
  await prisma.project.upsert({
    where: { code: 'FMKSA-2026-001' },
    create: {
      code: 'FMKSA-2026-001',
      name: 'Al Yamamah Entertainment Complex',
      entityId: opsEntity.id,
      status: 'active',
      currencyCode: 'SAR',
      startDate: new Date('2026-01-15'),
      endDate: new Date('2027-06-30'),
      contractValue: 25000000,       // 25M SAR
      revisedContractValue: 27500000, // 27.5M SAR
      createdBy: 'seed',
    },
    update: {
      name: 'Al Yamamah Entertainment Complex',
      entityId: opsEntity.id,
      status: 'active',
      currencyCode: 'SAR',
      contractValue: 25000000,
      revisedContractValue: 27500000,
    },
  });

  // Project 2 — active project under Riyadh branch (or fallback to ops)
  await prisma.project.upsert({
    where: { code: 'FMKSA-2026-002' },
    create: {
      code: 'FMKSA-2026-002',
      name: 'Riyadh Season Pavilion',
      entityId: ruhEntity?.id ?? opsEntity.id,
      status: 'active',
      currencyCode: 'SAR',
      startDate: new Date('2026-03-01'),
      endDate: new Date('2026-12-15'),
      createdBy: 'seed',
    },
    update: {
      name: 'Riyadh Season Pavilion',
      entityId: ruhEntity?.id ?? opsEntity.id,
      status: 'active',
      currencyCode: 'SAR',
    },
  });

  // Project 3 — on-hold project under Jeddah branch (or fallback to ops)
  await prisma.project.upsert({
    where: { code: 'FMKSA-2026-003' },
    create: {
      code: 'FMKSA-2026-003',
      name: 'Jeddah Waterfront Experience Zone',
      entityId: jedEntity?.id ?? opsEntity.id,
      status: 'on_hold',
      currencyCode: 'SAR',
      startDate: new Date('2026-06-01'),
      createdBy: 'seed',
    },
    update: {
      name: 'Jeddah Waterfront Experience Zone',
      entityId: jedEntity?.id ?? opsEntity.id,
      status: 'on_hold',
      currencyCode: 'SAR',
    },
  });

  // Keep legacy demo project for backward compatibility (existing assignments reference it)
  await prisma.project.upsert({
    where: { code: 'FMKSA-DEMO-001' },
    create: {
      code: 'FMKSA-DEMO-001',
      name: 'Fun Makers KSA Demo Project',
      entityId: opsEntity.id,
      status: 'active',
      currencyCode: 'SAR',
      startDate: new Date('2026-01-01'),
      createdBy: 'seed',
    },
    update: {
      name: 'Fun Makers KSA Demo Project',
      entityId: opsEntity.id,
      status: 'active',
      currencyCode: 'SAR',
    },
  });

  console.log('  ✓ 4 projects seeded (FMKSA-2026-001, FMKSA-2026-002, FMKSA-2026-003, FMKSA-DEMO-001)');
}
