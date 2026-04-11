import type { PrismaClient } from '@prisma/client';

type SubcategoryDef = {
  name: string;
  code: string;
};

type CategoryDef = {
  name: string;
  code: string;
  subcategories: SubcategoryDef[];
};

const CATEGORIES: CategoryDef[] = [
  {
    name: 'Materials',
    code: 'MAT',
    subcategories: [
      { name: 'Steel', code: 'MAT-STL' },
      { name: 'Concrete', code: 'MAT-CON' },
      { name: 'Electrical', code: 'MAT-ELC' },
      { name: 'Plumbing', code: 'MAT-PLB' },
      { name: 'Finishing', code: 'MAT-FIN' },
      { name: 'Landscaping', code: 'MAT-LND' },
    ],
  },
  {
    name: 'Equipment',
    code: 'EQP',
    subcategories: [
      { name: 'Rental', code: 'EQP-RNT' },
      { name: 'Purchase', code: 'EQP-PUR' },
      { name: 'Maintenance', code: 'EQP-MNT' },
    ],
  },
  {
    name: 'Professional Services',
    code: 'SVC',
    subcategories: [
      { name: 'Engineering', code: 'SVC-ENG' },
      { name: 'Design', code: 'SVC-DES' },
      { name: 'Legal', code: 'SVC-LEG' },
      { name: 'Consulting', code: 'SVC-CON' },
    ],
  },
  {
    name: 'Subcontracting',
    code: 'SUB',
    subcategories: [
      { name: 'Civil Works', code: 'SUB-CIV' },
      { name: 'MEP', code: 'SUB-MEP' },
      { name: 'Finishing', code: 'SUB-FIN' },
      { name: 'Specialized', code: 'SUB-SPC' },
    ],
  },
  {
    name: 'Labor',
    code: 'LBR',
    subcategories: [
      { name: 'Direct Hire', code: 'LBR-DIR' },
      { name: 'Outsourced', code: 'LBR-OUT' },
      { name: 'Overtime', code: 'LBR-OVT' },
    ],
  },
  {
    name: 'Travel & Accommodation',
    code: 'TRV',
    subcategories: [
      { name: 'Flights', code: 'TRV-FLT' },
      { name: 'Hotels', code: 'TRV-HTL' },
      { name: 'Ground Transport', code: 'TRV-GND' },
      { name: 'Per Diem', code: 'TRV-PDM' },
    ],
  },
  {
    name: 'Consumables',
    code: 'CSM',
    subcategories: [
      { name: 'Office Supplies', code: 'CSM-OFC' },
      { name: 'Safety Equipment', code: 'CSM-SAF' },
      { name: 'Tools', code: 'CSM-TLS' },
    ],
  },
  {
    name: 'Entertainment / Event',
    code: 'EVT',
    subcategories: [
      { name: 'Staging', code: 'EVT-STG' },
      { name: 'Lighting', code: 'EVT-LGT' },
      { name: 'AV', code: 'EVT-AV' },
      { name: 'Decor', code: 'EVT-DCR' },
      { name: 'Catering', code: 'EVT-CTR' },
    ],
  },
  {
    name: 'Transportation / Logistics',
    code: 'LOG',
    subcategories: [
      { name: 'Freight', code: 'LOG-FRT' },
      { name: 'Local Delivery', code: 'LOG-LCL' },
      { name: 'Storage', code: 'LOG-STR' },
    ],
  },
];

export async function seedProcurementCategories(prisma: PrismaClient) {
  console.log('  Seeding procurement categories...');

  const entity = await prisma.entity.findFirst();
  if (!entity) {
    console.warn('  ⚠ No entities found in database, skipping procurement categories seed');
    return;
  }

  let totalCount = 0;

  for (const cat of CATEGORIES) {
    const parent = await prisma.procurementCategory.upsert({
      where: { entityId_code: { entityId: entity.id, code: cat.code } },
      update: { name: cat.name, status: 'active' },
      create: {
        entityId: entity.id,
        name: cat.name,
        code: cat.code,
        level: 'category',
        status: 'active',
      },
    });
    totalCount++;

    for (const sub of cat.subcategories) {
      await prisma.procurementCategory.upsert({
        where: { entityId_code: { entityId: entity.id, code: sub.code } },
        update: { name: sub.name, parentId: parent.id, status: 'active' },
        create: {
          entityId: entity.id,
          name: sub.name,
          code: sub.code,
          level: 'subcategory',
          parentId: parent.id,
          status: 'active',
        },
      });
      totalCount++;
    }
  }

  console.log(`  ✓ ${totalCount} procurement categories seeded (9 top-level, ${totalCount - 9} subcategories)`);
}
