import type { PrismaClient } from '@prisma/client';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const countriesData: Array<{ code: string; name: string; iso3: string; phonePrefix: string }> =
  require('../../data/countries.json');

export async function seedCountries(prisma: PrismaClient) {
  console.log('  Seeding countries...');
  for (const c of countriesData) {
    await prisma.country.upsert({
      where: { code: c.code },
      create: { code: c.code, name: c.name, iso3: c.iso3, phonePrefix: c.phonePrefix },
      update: { name: c.name, iso3: c.iso3, phonePrefix: c.phonePrefix },
    });
  }
  console.log(`  ✓ ${countriesData.length} countries seeded`);
}
