import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '@fmksa/db';
import { createIpa, transitionIpa, getIpa, listIpas, deleteIpa, updateIpa } from '../../src/commercial/ipa/service';
import { registerCommercialEventTypes } from '../../src/commercial/posting-hooks/register';

describe('IPA Service', () => {
  let testProject: { id: string; code: string; entityId: string };
  const ts = Date.now();

  beforeAll(async () => {
    registerCommercialEventTypes();

    const entity = await prisma.entity.create({
      data: { code: `ENT-IPA-${ts}`, name: 'IPA Test Entity', type: 'parent', status: 'active' },
    });
    await prisma.currency.upsert({
      where: { code: 'SAR' }, update: {},
      create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
    });
    const project = await prisma.project.create({
      data: {
        code: `PROJ-IPA-${ts}`, name: 'IPA Test', entityId: entity.id,
        status: 'active', currencyCode: 'SAR', startDate: new Date(), createdBy: 'test',
      },
    });
    testProject = { id: project.id, code: project.code, entityId: entity.id };
  });

  const makeInput = (overrides = {}) => ({
    projectId: testProject.id,
    periodNumber: 1,
    periodFrom: new Date().toISOString(),
    periodTo: new Date().toISOString(),
    grossAmount: 10000,
    retentionRate: 0.1,
    retentionAmount: 1000,
    previousCertified: 0,
    currentClaim: 9000,
    netClaimed: 9000,
    currency: 'SAR',
    ...overrides,
  });

  it('creates IPA in draft status', async () => {
    const ipa = await createIpa(makeInput(), 'test-user');
    expect(ipa.status).toBe('draft');
    expect(ipa.projectId).toBe(testProject.id);
  });

  it('transitions draft -> submitted', async () => {
    const ipa = await createIpa(makeInput({ periodNumber: 2 }), 'test-user');
    const updated = await transitionIpa(ipa.id, 'submit', 'test-user');
    expect(updated.status).toBe('submitted');
  });

  it('rejects invalid transition draft -> approved_internal', async () => {
    const ipa = await createIpa(makeInput({ periodNumber: 3 }), 'test-user');
    await expect(transitionIpa(ipa.id, 'approve', 'test-user')).rejects.toThrow();
  });

  it('full lifecycle with posting at approved_internal', async () => {
    const ipa = await createIpa(makeInput({ periodNumber: 4 }), 'test-user');
    await transitionIpa(ipa.id, 'submit', 'test-user');
    await transitionIpa(ipa.id, 'review', 'test-user');
    const approved = await transitionIpa(ipa.id, 'approve', 'test-user');
    expect(approved.status).toBe('approved_internal');

    // Verify posting event was created
    const postingEvent = await prisma.postingEvent.findFirst({
      where: { sourceRecordId: ipa.id, eventType: 'IPA_APPROVED' },
    });
    expect(postingEvent).toBeTruthy();
  });

  it('assigns reference number at issued', async () => {
    const ipa = await createIpa(makeInput({ periodNumber: 5 }), 'test-user');
    await transitionIpa(ipa.id, 'submit', 'test-user');
    await transitionIpa(ipa.id, 'review', 'test-user');
    await transitionIpa(ipa.id, 'approve', 'test-user');
    const issued = await transitionIpa(ipa.id, 'issue', 'test-user');
    expect(issued.status).toBe('issued');
    expect(issued.referenceNumber).toMatch(new RegExp(`^${testProject.code}-IPA-\\d{3}$`));
  });

  it('terminal status cannot be transitioned', async () => {
    const ipa = await createIpa(makeInput({ periodNumber: 6 }), 'test-user');
    await transitionIpa(ipa.id, 'submit', 'test-user');
    await transitionIpa(ipa.id, 'review', 'test-user');
    await transitionIpa(ipa.id, 'reject', 'test-user');
    await expect(transitionIpa(ipa.id, 'submit', 'test-user')).rejects.toThrow();
  });

  it('updateIpa only works in draft/returned status', async () => {
    const ipa = await createIpa(makeInput({ periodNumber: 8 }), 'test-user');
    // Should work in draft
    const updated = await updateIpa({ id: ipa.id, grossAmount: 20000 }, 'test-user');
    expect(Number(updated.grossAmount)).toBe(20000);

    // Transition to submitted — update should fail
    await transitionIpa(ipa.id, 'submit', 'test-user');
    await expect(updateIpa({ id: ipa.id, grossAmount: 30000 }, 'test-user')).rejects.toThrow();
  });

  it('deleteIpa only works in draft', async () => {
    const ipa = await createIpa(makeInput({ periodNumber: 7 }), 'test-user');
    await deleteIpa(ipa.id, 'test-user');
    const deleted = await prisma.ipa.findUnique({ where: { id: ipa.id } });
    expect(deleted).toBeNull();
  });

  it('listIpas returns paginated results', async () => {
    const result = await listIpas({
      projectId: testProject.id,
      skip: 0,
      take: 10,
      sortDirection: 'desc',
    });
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);
  });
});
