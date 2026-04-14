import type { PrismaClient } from '@prisma/client';

/**
 * Seed default internal budget categories for Pico Play.
 *
 * These categories define the cost structure for project delivery budgets.
 * They are NOT procurement categories — they represent internal cost buckets
 * that absorb committed and actual spend from procurement, subcontracts,
 * expenses, and other sources.
 *
 * isSystem = true means the category was seeded by the platform.
 * Users can add custom categories but cannot delete system categories.
 */

const DEFAULT_CATEGORIES = [
  { code: 'materials',             name: 'Materials',               sortOrder: 1 },
  { code: 'subcontractors',        name: 'Subcontractors',          sortOrder: 2 },
  { code: 'manpower',              name: 'Manpower',                sortOrder: 3 },
  { code: 'travel',                name: 'Travel',                  sortOrder: 4 },
  { code: 'accommodation',         name: 'Accommodation',           sortOrder: 5 },
  { code: 'supplies',              name: 'Supplies',                sortOrder: 6 },
  { code: 'equipment_and_plant',   name: 'Equipment and Plant',     sortOrder: 7 },
  { code: 'design_and_engineering', name: 'Design and Engineering', sortOrder: 8 },
  { code: 'logistics',             name: 'Logistics',               sortOrder: 9 },
  { code: 'site_overheads',        name: 'Site Overheads',          sortOrder: 10 },
  { code: 'contingency',           name: 'Contingency',             sortOrder: 11 },
  { code: 'ei_reserve',            name: 'EI Reserve',              sortOrder: 12 },
  { code: 'other',                 name: 'Other',                   sortOrder: 13 },
] as const;

export async function seedBudgetCategories(prisma: PrismaClient) {
  console.log('  → Budget categories...');

  for (const cat of DEFAULT_CATEGORIES) {
    await prisma.budgetCategory.upsert({
      where: { code: cat.code },
      update: { name: cat.name, sortOrder: cat.sortOrder },
      create: {
        code: cat.code,
        name: cat.name,
        sortOrder: cat.sortOrder,
        isSystem: true,
      },
    });
  }

  console.log(`    ✓ ${DEFAULT_CATEGORIES.length} budget categories seeded`);
}
