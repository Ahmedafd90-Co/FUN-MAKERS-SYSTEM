import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@fmksa/db';
import { referenceDataService } from '../../src/reference-data/service';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let testUser: { id: string };
const ts = Date.now();

beforeAll(async () => {
  await (prisma as any).$executeRaw`TRUNCATE TABLE audit_logs CASCADE`;

  testUser = await prisma.user.create({
    data: {
      email: `refdata-test-${ts}@test.com`,
      name: 'RefData Test User',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });

  // Ensure seed data exists (defensive)
  await prisma.country.upsert({
    where: { code: 'SA' },
    create: { code: 'SA', name: 'Saudi Arabia', iso3: 'SAU', phonePrefix: '+966' },
    update: {},
  });
  await prisma.currency.upsert({
    where: { code: 'SAR' },
    create: { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼', decimalPlaces: 2 },
    update: {},
  });
});

afterAll(async () => {
  await prisma.statusDictionary.deleteMany({
    where: { dictionaryCode: { startsWith: `TEST-${ts}` } },
  });
  await prisma.appSetting.deleteMany({
    where: { key: { startsWith: `test_${ts}` } },
  });
  await prisma.user.deleteMany({
    where: { email: `refdata-test-${ts}@test.com` },
  });
});

// ---------------------------------------------------------------------------
// Read-only
// ---------------------------------------------------------------------------

describe('referenceDataService — read', () => {
  it('lists countries', async () => {
    const countries = await referenceDataService.listCountries();
    expect(countries.length).toBeGreaterThanOrEqual(1);
    const sa = countries.find((c) => c.code === 'SA');
    expect(sa).toBeDefined();
    expect(sa?.name).toBe('Saudi Arabia');
  });

  it('lists currencies', async () => {
    const currencies = await referenceDataService.listCurrencies();
    expect(currencies.length).toBeGreaterThanOrEqual(1);
    const sar = currencies.find((c) => c.code === 'SAR');
    expect(sar).toBeDefined();
  });

  it('returns null for unknown app setting', async () => {
    const val = await referenceDataService.getAppSetting('nonexistent_key');
    expect(val).toBeNull();
  });

  it('returns empty array for unknown dictionary code', async () => {
    const entries = await referenceDataService.getStatusDictionary(
      'nonexistent_dict',
    );
    expect(entries).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

describe('referenceDataService — write', () => {
  it('upserts an app setting', async () => {
    const key = `test_${ts}_setting`;

    // Create
    await referenceDataService.setAppSetting(key, 'hello', testUser.id);
    const val1 = await referenceDataService.getAppSetting(key);
    expect(val1).toBe('hello');

    // Update
    await referenceDataService.setAppSetting(key, 'world', testUser.id);
    const val2 = await referenceDataService.getAppSetting(key);
    expect(val2).toBe('world');
  });

  it('adds a status dictionary entry', async () => {
    const entry = await referenceDataService.addStatusDictEntry({
      dictionaryCode: `TEST-${ts}-dict`,
      statusCode: 'open',
      label: 'Open',
      orderIndex: 0,
      colorHint: '#00FF00',
      isTerminal: false,
      createdBy: testUser.id,
    });

    expect(entry.id).toBeDefined();
    expect(entry.label).toBe('Open');
    expect(entry.isTerminal).toBe(false);
  });

  it('rejects duplicate status dictionary entry', async () => {
    await expect(
      referenceDataService.addStatusDictEntry({
        dictionaryCode: `TEST-${ts}-dict`,
        statusCode: 'open',
        label: 'Duplicate',
        orderIndex: 1,
        isTerminal: false,
        createdBy: testUser.id,
      }),
    ).rejects.toThrow(/already exists/);
  });

  it('updates a status dictionary entry', async () => {
    const entry = await referenceDataService.addStatusDictEntry({
      dictionaryCode: `TEST-${ts}-dict`,
      statusCode: 'closed',
      label: 'Closed',
      orderIndex: 1,
      isTerminal: true,
      createdBy: testUser.id,
    });

    const updated = await referenceDataService.updateStatusDictEntry(
      entry.id,
      { label: 'Done', colorHint: '#FF0000' },
      testUser.id,
    );

    expect(updated.label).toBe('Done');
    expect(updated.colorHint).toBe('#FF0000');
    expect(updated.isTerminal).toBe(true); // unchanged
  });

  it('getStatusDictionary returns entries ordered by orderIndex', async () => {
    const entries = await referenceDataService.getStatusDictionary(
      `TEST-${ts}-dict`,
    );
    expect(entries.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i]!.orderIndex).toBeGreaterThanOrEqual(
        entries[i - 1]!.orderIndex,
      );
    }
  });

  it('writes audit log on app setting change', async () => {
    const key = `test_${ts}_audited`;
    await referenceDataService.setAppSetting(key, 42, testUser.id);

    const logs = await (prisma as any).auditLog.findMany({
      where: { resourceId: key, action: 'app_setting.update' },
    });
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});
