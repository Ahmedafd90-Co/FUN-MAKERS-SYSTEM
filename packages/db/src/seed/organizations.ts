import type { PrismaClient } from '@prisma/client';

/**
 * PIC-75 — Multi-tenancy root: Organization singleton seed.
 *
 * The platform is currently single-tenant (Pico Play KSA). This seed
 * creates the canonical 'picoplay-ksa' Organization row that all
 * existing per-tenant-scoped data (IPA/IPC/Variation/CostProposal/
 * TaxInvoice/Correspondence/VendorContract/RFQ/PurchaseOrder/
 * EngineerInstruction) defaults to via column @default.
 *
 * Hardcoded UUID — must stay byte-identical with the same constant in
 * the schema.prisma @default declarations AND in the migration SQL
 * INSERT. Single source of truth is THIS file's `SINGLETON_ORG_ID`.
 *
 * Future multi-tenant work will introduce additional Organization rows
 * and remove the @default — service code will then be required to
 * supply orgId explicitly.
 */
export const SINGLETON_ORG_ID = '00000000-0000-0000-0000-000000000001';
export const SINGLETON_ORG_SLUG = 'picoplay-ksa';
export const SINGLETON_ORG_NAME = 'Pico Play KSA';

export async function seedOrganizations(prisma: PrismaClient) {
  console.log('  Seeding organizations (PIC-75 single-tenant singleton)...');

  await prisma.organization.upsert({
    where: { id: SINGLETON_ORG_ID },
    create: {
      id: SINGLETON_ORG_ID,
      slug: SINGLETON_ORG_SLUG,
      name: SINGLETON_ORG_NAME,
    },
    update: {
      slug: SINGLETON_ORG_SLUG,
      name: SINGLETON_ORG_NAME,
    },
  });

  console.log(`  ✓ singleton org seeded (${SINGLETON_ORG_SLUG})`);
}
