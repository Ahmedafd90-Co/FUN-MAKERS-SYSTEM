import type { PrismaClient } from '@prisma/client';

const DEFAULTS: Array<{ key: string; valueJson: string }> = [
  { key: 'default_currency', valueJson: '"SAR"' },
  { key: 'date_format', valueJson: '"DD/MM/YYYY"' },
  { key: 'timezone', valueJson: '"Asia/Riyadh"' },
  { key: 'default_language', valueJson: '"en"' },
  { key: 'platform_name', valueJson: '"Pico Play Fun Makers KSA"' },
  { key: 'session_max_age_seconds', valueJson: '28800' },
  { key: 'password_min_length', valueJson: '12' },
  { key: 'failed_login_lockout_threshold', valueJson: '5' },
  { key: 'failed_login_lockout_minutes', valueJson: '15' },
];

export async function seedAppSettings(prisma: PrismaClient) {
  console.log('  Seeding app settings...');
  for (const s of DEFAULTS) {
    await prisma.appSetting.upsert({
      where: { key: s.key },
      create: {
        key: s.key,
        valueJson: JSON.parse(s.valueJson),
        updatedBy: 'seed',
      },
      update: {},
    });
  }
  console.log(`  ✓ ${DEFAULTS.length} app settings seeded`);
}
