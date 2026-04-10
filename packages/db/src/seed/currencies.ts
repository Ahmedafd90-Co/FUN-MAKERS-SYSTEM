import type { PrismaClient } from '@prisma/client';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const currenciesData: Array<{ code: string; name: string; symbol: string; decimalPlaces: number }> =
  require('../../data/currencies.json');

export async function seedCurrencies(prisma: PrismaClient) {
  console.log('  Seeding currencies...');
  for (const c of currenciesData) {
    await prisma.currency.upsert({
      where: { code: c.code },
      create: { code: c.code, name: c.name, symbol: c.symbol, decimalPlaces: c.decimalPlaces },
      update: { name: c.name, symbol: c.symbol, decimalPlaces: c.decimalPlaces },
    });
  }
  console.log(`  ✓ ${currenciesData.length} currencies seeded`);
}
