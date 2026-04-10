import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '@fmksa/db';
import { generateReferenceNumber } from '../../src/commercial/reference-number/service';

describe('generateReferenceNumber', () => {
  let testProject: { id: string; code: string };
  const ts = Date.now();

  beforeAll(async () => {
    const entity = await prisma.entity.create({
      data: { code: `ENT-REF-${ts}`, name: 'Ref Test Entity', type: 'parent', status: 'active' },
    });
    await prisma.currency.upsert({
      where: { code: 'SAR' }, update: {},
      create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
    });
    testProject = await prisma.project.create({
      data: {
        code: `PROJ-REF-${ts}`, name: 'Ref Test', entityId: entity.id,
        status: 'active', currencyCode: 'SAR', startDate: new Date(), createdBy: 'test',
      },
    });
  });

  it('generates sequential numbers for the same project + type', async () => {
    const ref1 = await prisma.$transaction(tx =>
      generateReferenceNumber(testProject.id, 'IPA', tx),
    );
    const ref2 = await prisma.$transaction(tx =>
      generateReferenceNumber(testProject.id, 'IPA', tx),
    );

    expect(ref1).toBe(`${testProject.code}-IPA-001`);
    expect(ref2).toBe(`${testProject.code}-IPA-002`);
  });

  it('generates independent sequences per type code', async () => {
    const refVO = await prisma.$transaction(tx =>
      generateReferenceNumber(testProject.id, 'VO', tx),
    );
    expect(refVO).toBe(`${testProject.code}-VO-001`);
  });
});
