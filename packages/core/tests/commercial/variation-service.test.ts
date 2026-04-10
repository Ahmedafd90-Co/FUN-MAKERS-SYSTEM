import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '@fmksa/db';
import {
  createVariation,
  transitionVariation,
  getVariation,
  listVariations,
  deleteVariation,
} from '../../src/commercial/variation/service';
import { registerCommercialEventTypes } from '../../src/commercial/posting-hooks/register';

describe('Variation Service', () => {
  let testProject: { id: string; code: string; entityId: string };
  const ts = Date.now();

  beforeAll(async () => {
    registerCommercialEventTypes();

    const entity = await prisma.entity.create({
      data: { code: `ENT-VAR-${ts}`, name: 'Variation Test Entity', type: 'parent', status: 'active' },
    });
    await prisma.currency.upsert({
      where: { code: 'SAR' }, update: {},
      create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
    });
    const project = await prisma.project.create({
      data: {
        code: `PROJ-VAR-${ts}`, name: 'Variation Test', entityId: entity.id,
        status: 'active', currencyCode: 'SAR', startDate: new Date(), createdBy: 'test',
      },
    });
    testProject = { id: project.id, code: project.code, entityId: entity.id };
  });

  const makeVoInput = (overrides = {}) => ({
    projectId: testProject.id,
    subtype: 'vo' as const,
    title: 'Test VO',
    description: 'VO description',
    reason: 'scope change',
    costImpact: 50000,
    timeImpactDays: 30,
    currency: 'SAR',
    ...overrides,
  });

  const makeCoInput = (overrides = {}) => ({
    projectId: testProject.id,
    subtype: 'change_order' as const,
    title: 'Test CO',
    description: 'CO description',
    reason: 'contract adjustment',
    costImpact: 100000,
    timeImpactDays: 60,
    currency: 'SAR',
    originalContractValue: 1000000,
    adjustmentAmount: 100000,
    newContractValue: 1100000,
    ...overrides,
  });

  // 1. Create VO in draft status
  it('creates VO in draft status', async () => {
    const variation = await createVariation(makeVoInput(), 'test-user');
    expect(variation.status).toBe('draft');
    expect(variation.subtype).toBe('vo');
    expect(variation.projectId).toBe(testProject.id);
  });

  // 2. Create CO in draft status
  it('creates CO in draft status', async () => {
    const variation = await createVariation(makeCoInput(), 'test-user');
    expect(variation.status).toBe('draft');
    expect(variation.subtype).toBe('change_order');
    expect(variation.projectId).toBe(testProject.id);
  });

  // 3. VO full lifecycle: draft -> submitted -> under_review -> approved_internal -> signed -> issued -> client_pending -> client_approved -> closed
  it('VO full lifecycle through client_approved -> closed', async () => {
    const variation = await createVariation(makeVoInput({ title: 'VO lifecycle' }), 'test-user');

    await transitionVariation(variation.id, 'submit', 'test-user');
    await transitionVariation(variation.id, 'review', 'test-user');
    const approved = await transitionVariation(variation.id, 'approve', 'test-user');
    expect(approved.status).toBe('approved_internal');

    await transitionVariation(variation.id, 'sign', 'test-user');
    const issued = await transitionVariation(variation.id, 'issue', 'test-user');
    expect(issued.status).toBe('issued');

    await transitionVariation(variation.id, 'client_pending', 'test-user');
    const clientApproved = await transitionVariation(variation.id, 'client_approved', 'test-user');
    expect(clientApproved.status).toBe('client_approved');

    const closed = await transitionVariation(variation.id, 'close', 'test-user');
    expect(closed.status).toBe('closed');
  });

  // 4. CO cannot transition to client_pending from issued
  it('CO cannot transition to client_pending from issued', async () => {
    const variation = await createVariation(makeCoInput({ title: 'CO no client' }), 'test-user');
    await transitionVariation(variation.id, 'submit', 'test-user');
    await transitionVariation(variation.id, 'review', 'test-user');
    await transitionVariation(variation.id, 'approve', 'test-user');
    await transitionVariation(variation.id, 'sign', 'test-user');
    await transitionVariation(variation.id, 'issue', 'test-user');

    await expect(
      transitionVariation(variation.id, 'client_pending', 'test-user'),
    ).rejects.toThrow(/Invalid Variation transition/);
  });

  // 5. VARIATION_APPROVED_INTERNAL fires at approved_internal
  it('VARIATION_APPROVED_INTERNAL fires at approved_internal', async () => {
    const variation = await createVariation(makeVoInput({ title: 'VO posting internal' }), 'test-user');
    await transitionVariation(variation.id, 'submit', 'test-user');
    await transitionVariation(variation.id, 'review', 'test-user');
    await transitionVariation(variation.id, 'approve', 'test-user');

    const postingEvent = await prisma.postingEvent.findFirst({
      where: { sourceRecordId: variation.id, eventType: 'VARIATION_APPROVED_INTERNAL' },
    });
    expect(postingEvent).toBeTruthy();
    expect(postingEvent!.idempotencyKey).toBe(`variation:${variation.id}:approved_internal`);
  });

  // 6. VARIATION_APPROVED_CLIENT fires at client_approved
  it('VARIATION_APPROVED_CLIENT fires at client_approved', async () => {
    const variation = await createVariation(makeVoInput({ title: 'VO posting client' }), 'test-user');
    await transitionVariation(variation.id, 'submit', 'test-user');
    await transitionVariation(variation.id, 'review', 'test-user');
    await transitionVariation(variation.id, 'approve', 'test-user');
    await transitionVariation(variation.id, 'sign', 'test-user');
    await transitionVariation(variation.id, 'issue', 'test-user');
    await transitionVariation(variation.id, 'client_pending', 'test-user');
    await transitionVariation(variation.id, 'client_approved', 'test-user');

    const postingEvent = await prisma.postingEvent.findFirst({
      where: { sourceRecordId: variation.id, eventType: 'VARIATION_APPROVED_CLIENT' },
    });
    expect(postingEvent).toBeTruthy();
    expect(postingEvent!.idempotencyKey).toBe(`variation:${variation.id}:client_approved`);
  });

  // 7. Reference number uses VO type code for vo, CO for change_order
  it('reference number uses VO type code for vo subtype', async () => {
    const variation = await createVariation(makeVoInput({ title: 'VO ref num' }), 'test-user');
    await transitionVariation(variation.id, 'submit', 'test-user');
    await transitionVariation(variation.id, 'review', 'test-user');
    await transitionVariation(variation.id, 'approve', 'test-user');
    await transitionVariation(variation.id, 'sign', 'test-user');
    const issued = await transitionVariation(variation.id, 'issue', 'test-user');
    expect(issued.referenceNumber).toMatch(new RegExp(`^${testProject.code}-VO-\\d{3}$`));
  });

  it('reference number uses CO type code for change_order subtype', async () => {
    const variation = await createVariation(makeCoInput({ title: 'CO ref num' }), 'test-user');
    await transitionVariation(variation.id, 'submit', 'test-user');
    await transitionVariation(variation.id, 'review', 'test-user');
    await transitionVariation(variation.id, 'approve', 'test-user');
    await transitionVariation(variation.id, 'sign', 'test-user');
    const issued = await transitionVariation(variation.id, 'issue', 'test-user');
    expect(issued.referenceNumber).toMatch(new RegExp(`^${testProject.code}-CO-\\d{3}$`));
  });

  // 8. Assessment fields populated at review (assessed) and approve (approved)
  it('assessment fields populated at review and approve', async () => {
    const variation = await createVariation(makeVoInput({ title: 'VO assessment' }), 'test-user');
    await transitionVariation(variation.id, 'submit', 'test-user');

    // Review with assessment data
    const reviewed = await transitionVariation(
      variation.id, 'review', 'test-user', undefined,
      { assessedCostImpact: 45000, assessedTimeImpactDays: 25 },
    );
    expect(Number(reviewed.assessedCostImpact)).toBe(45000);
    expect(reviewed.assessedTimeImpactDays).toBe(25);

    // Approve with approved data
    const approved = await transitionVariation(
      variation.id, 'approve', 'test-user', undefined,
      { approvedCostImpact: 42000, approvedTimeImpactDays: 20 },
    );
    expect(Number(approved.approvedCostImpact)).toBe(42000);
    expect(approved.approvedTimeImpactDays).toBe(20);
  });

  // 9. Assessment fields remain null when not provided
  it('assessment fields remain null when not provided in transition data', async () => {
    const variation = await createVariation(makeVoInput({ title: 'VO no assessment' }), 'test-user');
    await transitionVariation(variation.id, 'submit', 'test-user');

    const reviewed = await transitionVariation(variation.id, 'review', 'test-user');
    expect(reviewed.assessedCostImpact).toBeNull();
    expect(reviewed.assessedTimeImpactDays).toBeNull();

    const approved = await transitionVariation(variation.id, 'approve', 'test-user');
    expect(approved.approvedCostImpact).toBeNull();
    expect(approved.approvedTimeImpactDays).toBeNull();
  });

  // 10. Terminal status cannot be transitioned
  it('terminal status cannot be transitioned', async () => {
    const variation = await createVariation(makeVoInput({ title: 'VO terminal' }), 'test-user');
    await transitionVariation(variation.id, 'submit', 'test-user');
    await transitionVariation(variation.id, 'review', 'test-user');
    await transitionVariation(variation.id, 'reject', 'test-user');

    await expect(
      transitionVariation(variation.id, 'submit', 'test-user'),
    ).rejects.toThrow(/terminal status/);
  });

  // 11. Delete only in draft
  it('delete only in draft', async () => {
    const variation = await createVariation(makeVoInput({ title: 'VO delete draft' }), 'test-user');
    await deleteVariation(variation.id, 'test-user');
    const deleted = await prisma.variation.findUnique({ where: { id: variation.id } });
    expect(deleted).toBeNull();
  });

  it('delete rejects non-draft variation', async () => {
    const variation = await createVariation(makeVoInput({ title: 'VO delete submitted' }), 'test-user');
    await transitionVariation(variation.id, 'submit', 'test-user');
    await expect(deleteVariation(variation.id, 'test-user')).rejects.toThrow(/Only draft/);
  });
});
