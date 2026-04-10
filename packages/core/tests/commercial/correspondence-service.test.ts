import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '@fmksa/db';
import {
  createCorrespondence,
  transitionCorrespondence,
  getCorrespondence,
  listCorrespondences,
  deleteCorrespondence,
} from '../../src/commercial/correspondence/service';
import { registerCommercialEventTypes } from '../../src/commercial/posting-hooks/register';

describe('Correspondence Service', () => {
  let testProject: { id: string; code: string; entityId: string };
  const ts = Date.now();

  beforeAll(async () => {
    registerCommercialEventTypes();

    const entity = await prisma.entity.create({
      data: { code: `ENT-COR-${ts}`, name: 'Correspondence Test Entity', type: 'parent', status: 'active' },
    });
    await prisma.currency.upsert({
      where: { code: 'SAR' }, update: {},
      create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
    });
    const project = await prisma.project.create({
      data: {
        code: `PROJ-COR-${ts}`, name: 'Correspondence Test', entityId: entity.id,
        status: 'active', currencyCode: 'SAR', startDate: new Date(), createdBy: 'test',
      },
    });
    testProject = { id: project.id, code: project.code, entityId: entity.id };
  });

  const makeInput = (subtype: 'letter' | 'notice' | 'claim' | 'back_charge', overrides = {}) => ({
    projectId: testProject.id,
    subtype,
    subject: `Test ${subtype}`,
    body: `Body for ${subtype}`,
    recipientName: 'Test Recipient',
    recipientOrg: 'Test Org',
    currency: 'SAR',
    // Subtype-specific defaults
    ...(subtype === 'notice' ? { noticeType: 'general' as const, contractClause: 'Clause 1', responseDeadline: new Date(Date.now() + 86400000).toISOString() } : {}),
    ...(subtype === 'claim' ? { claimType: 'additional_cost' as const, claimedAmount: 50000, claimedTimeDays: 30 } : {}),
    ...(subtype === 'back_charge' ? { targetName: 'Subcontractor A', category: 'defect' as const, chargedAmount: 25000, evidenceDescription: 'Defective work on Zone B' } : {}),
    ...(subtype === 'letter' ? { letterType: 'instruction' as const } : {}),
    ...overrides,
  });

  // 1. Letter lifecycle WITHOUT signing (optional signing for letters)
  it('letter lifecycle without signing: create -> submit -> approve -> issue -> close', async () => {
    const corr = await createCorrespondence(makeInput('letter', { subject: 'Letter no sign' }), 'test-user');
    expect(corr.status).toBe('draft');
    expect(corr.subtype).toBe('letter');

    await transitionCorrespondence(corr.id, 'submit', 'test-user');
    const approved = await transitionCorrespondence(corr.id, 'approve', 'test-user');
    expect(approved.status).toBe('approved_internal');

    // Letter can skip signing and go directly to issued
    const issued = await transitionCorrespondence(corr.id, 'issue', 'test-user');
    expect(issued.status).toBe('issued');

    const closed = await transitionCorrespondence(corr.id, 'close', 'test-user');
    expect(closed.status).toBe('closed');
  });

  // 2. Letter lifecycle WITH signing
  it('letter lifecycle with signing: create -> submit -> approve -> sign -> issue -> close', async () => {
    const corr = await createCorrespondence(makeInput('letter', { subject: 'Letter with sign' }), 'test-user');
    await transitionCorrespondence(corr.id, 'submit', 'test-user');
    await transitionCorrespondence(corr.id, 'approve', 'test-user');
    await transitionCorrespondence(corr.id, 'sign', 'test-user');
    const issued = await transitionCorrespondence(corr.id, 'issue', 'test-user');
    expect(issued.status).toBe('issued');

    const closed = await transitionCorrespondence(corr.id, 'close', 'test-user');
    expect(closed.status).toBe('closed');
  });

  // 3. Notice lifecycle with response tracking
  it('notice lifecycle with response tracking', async () => {
    const corr = await createCorrespondence(makeInput('notice', { subject: 'Notice lifecycle' }), 'test-user');
    expect(corr.subtype).toBe('notice');

    await transitionCorrespondence(corr.id, 'submit', 'test-user');
    await transitionCorrespondence(corr.id, 'approve', 'test-user');
    await transitionCorrespondence(corr.id, 'sign', 'test-user');
    const issued = await transitionCorrespondence(corr.id, 'issue', 'test-user');
    expect(issued.status).toBe('issued');

    const responseDue = await transitionCorrespondence(corr.id, 'mark_response_due', 'test-user');
    expect(responseDue.status).toBe('response_due');

    const responded = await transitionCorrespondence(corr.id, 'mark_responded', 'test-user');
    expect(responded.status).toBe('responded');

    const closed = await transitionCorrespondence(corr.id, 'close', 'test-user');
    expect(closed.status).toBe('closed');
  });

  // 4. Claim lifecycle with posting
  it('claim lifecycle with CLAIM_ISSUED posting event', async () => {
    const corr = await createCorrespondence(makeInput('claim', { subject: 'Claim lifecycle' }), 'test-user');
    expect(corr.subtype).toBe('claim');

    await transitionCorrespondence(corr.id, 'submit', 'test-user');
    await transitionCorrespondence(corr.id, 'approve', 'test-user');
    await transitionCorrespondence(corr.id, 'sign', 'test-user');
    await transitionCorrespondence(corr.id, 'issue', 'test-user');

    // Verify CLAIM_ISSUED posting event
    const postingEvent = await prisma.postingEvent.findFirst({
      where: { sourceRecordId: corr.id, eventType: 'CLAIM_ISSUED' },
    });
    expect(postingEvent).toBeTruthy();
    expect(postingEvent!.idempotencyKey).toBe(`correspondence:${corr.id}:claim_issued`);

    await transitionCorrespondence(corr.id, 'evaluate', 'test-user');
    const accepted = await transitionCorrespondence(corr.id, 'accept', 'test-user');
    expect(accepted.status).toBe('accepted');

    const closed = await transitionCorrespondence(corr.id, 'close', 'test-user');
    expect(closed.status).toBe('closed');
  });

  // 5. Back charge lifecycle with posting
  it('back charge lifecycle with BACK_CHARGE_ISSUED posting event', async () => {
    const corr = await createCorrespondence(makeInput('back_charge', { subject: 'BC lifecycle' }), 'test-user');
    expect(corr.subtype).toBe('back_charge');

    await transitionCorrespondence(corr.id, 'submit', 'test-user');
    await transitionCorrespondence(corr.id, 'approve', 'test-user');
    await transitionCorrespondence(corr.id, 'sign', 'test-user');
    await transitionCorrespondence(corr.id, 'issue', 'test-user');

    // Verify BACK_CHARGE_ISSUED posting event
    const postingEvent = await prisma.postingEvent.findFirst({
      where: { sourceRecordId: corr.id, eventType: 'BACK_CHARGE_ISSUED' },
    });
    expect(postingEvent).toBeTruthy();
    expect(postingEvent!.idempotencyKey).toBe(`correspondence:${corr.id}:back_charge_issued`);

    await transitionCorrespondence(corr.id, 'acknowledge', 'test-user');
    const recovered = await transitionCorrespondence(corr.id, 'recover', 'test-user');
    expect(recovered.status).toBe('recovered');

    const closed = await transitionCorrespondence(corr.id, 'close', 'test-user');
    expect(closed.status).toBe('closed');
  });

  // 6. Subtype isolation: claim cannot use notice-specific statuses
  it('claim cannot use notice-specific action mark_response_due', async () => {
    const corr = await createCorrespondence(makeInput('claim', { subject: 'Claim isolation' }), 'test-user');
    await transitionCorrespondence(corr.id, 'submit', 'test-user');
    await transitionCorrespondence(corr.id, 'approve', 'test-user');
    await transitionCorrespondence(corr.id, 'sign', 'test-user');
    await transitionCorrespondence(corr.id, 'issue', 'test-user');

    await expect(
      transitionCorrespondence(corr.id, 'mark_response_due', 'test-user'),
    ).rejects.toThrow(/Invalid Correspondence transition/);
  });

  // 7. Letter and Notice do not fire posting events at issued
  it('letter does not fire posting events at issued', async () => {
    const corr = await createCorrespondence(makeInput('letter', { subject: 'Letter no posting' }), 'test-user');
    await transitionCorrespondence(corr.id, 'submit', 'test-user');
    await transitionCorrespondence(corr.id, 'approve', 'test-user');
    await transitionCorrespondence(corr.id, 'issue', 'test-user');

    const claimEvent = await prisma.postingEvent.findFirst({
      where: { sourceRecordId: corr.id, eventType: 'CLAIM_ISSUED' },
    });
    const bcEvent = await prisma.postingEvent.findFirst({
      where: { sourceRecordId: corr.id, eventType: 'BACK_CHARGE_ISSUED' },
    });
    expect(claimEvent).toBeNull();
    expect(bcEvent).toBeNull();
  });

  it('notice does not fire posting events at issued', async () => {
    const corr = await createCorrespondence(makeInput('notice', { subject: 'Notice no posting' }), 'test-user');
    await transitionCorrespondence(corr.id, 'submit', 'test-user');
    await transitionCorrespondence(corr.id, 'approve', 'test-user');
    await transitionCorrespondence(corr.id, 'sign', 'test-user');
    await transitionCorrespondence(corr.id, 'issue', 'test-user');

    const claimEvent = await prisma.postingEvent.findFirst({
      where: { sourceRecordId: corr.id, eventType: 'CLAIM_ISSUED' },
    });
    const bcEvent = await prisma.postingEvent.findFirst({
      where: { sourceRecordId: corr.id, eventType: 'BACK_CHARGE_ISSUED' },
    });
    expect(claimEvent).toBeNull();
    expect(bcEvent).toBeNull();
  });

  // 8. Reference number type codes
  it('letter reference number uses LTR type code', async () => {
    const corr = await createCorrespondence(makeInput('letter', { subject: 'Letter ref' }), 'test-user');
    await transitionCorrespondence(corr.id, 'submit', 'test-user');
    await transitionCorrespondence(corr.id, 'approve', 'test-user');
    const issued = await transitionCorrespondence(corr.id, 'issue', 'test-user');
    expect(issued.referenceNumber).toMatch(new RegExp(`^${testProject.code}-LTR-\\d{3}$`));
  });

  it('notice reference number uses NTC type code', async () => {
    const corr = await createCorrespondence(makeInput('notice', { subject: 'Notice ref' }), 'test-user');
    await transitionCorrespondence(corr.id, 'submit', 'test-user');
    await transitionCorrespondence(corr.id, 'approve', 'test-user');
    await transitionCorrespondence(corr.id, 'sign', 'test-user');
    const issued = await transitionCorrespondence(corr.id, 'issue', 'test-user');
    expect(issued.referenceNumber).toMatch(new RegExp(`^${testProject.code}-NTC-\\d{3}$`));
  });

  it('claim reference number uses CLM type code', async () => {
    const corr = await createCorrespondence(makeInput('claim', { subject: 'Claim ref' }), 'test-user');
    await transitionCorrespondence(corr.id, 'submit', 'test-user');
    await transitionCorrespondence(corr.id, 'approve', 'test-user');
    await transitionCorrespondence(corr.id, 'sign', 'test-user');
    const issued = await transitionCorrespondence(corr.id, 'issue', 'test-user');
    expect(issued.referenceNumber).toMatch(new RegExp(`^${testProject.code}-CLM-\\d{3}$`));
  });

  it('back_charge reference number uses BCH type code', async () => {
    const corr = await createCorrespondence(makeInput('back_charge', { subject: 'BC ref' }), 'test-user');
    await transitionCorrespondence(corr.id, 'submit', 'test-user');
    await transitionCorrespondence(corr.id, 'approve', 'test-user');
    await transitionCorrespondence(corr.id, 'sign', 'test-user');
    const issued = await transitionCorrespondence(corr.id, 'issue', 'test-user');
    expect(issued.referenceNumber).toMatch(new RegExp(`^${testProject.code}-BCH-\\d{3}$`));
  });

  // 9. Delete only in draft
  it('delete only in draft', async () => {
    const corr = await createCorrespondence(makeInput('letter'), 'test-user');
    await deleteCorrespondence(corr.id, 'test-user');
    const deleted = await prisma.correspondence.findUnique({ where: { id: corr.id } });
    expect(deleted).toBeNull();
  });

  it('delete rejects non-draft correspondence', async () => {
    const corr = await createCorrespondence(makeInput('letter', { subject: 'Delete non-draft' }), 'test-user');
    await transitionCorrespondence(corr.id, 'submit', 'test-user');
    await expect(deleteCorrespondence(corr.id, 'test-user')).rejects.toThrow(/Only draft/);
  });

  // 10. List with subtypeFilter
  it('list with subtypeFilter', async () => {
    // Create one of each subtype
    await createCorrespondence(makeInput('letter', { subject: 'List letter' }), 'test-user');
    await createCorrespondence(makeInput('notice', { subject: 'List notice' }), 'test-user');
    await createCorrespondence(makeInput('claim', { subject: 'List claim' }), 'test-user');

    const result = await listCorrespondences(
      { projectId: testProject.id, skip: 0, take: 20, sortDirection: 'desc' },
      { subtypeFilter: 'letter' },
    );
    expect(result.items.length).toBeGreaterThanOrEqual(1);
    for (const item of result.items) {
      expect(item.subtype).toBe('letter');
    }

    const allResult = await listCorrespondences({ projectId: testProject.id, skip: 0, take: 50, sortDirection: 'desc' });
    expect(allResult.total).toBeGreaterThanOrEqual(3);
  });

  // 11. Terminal status cannot be transitioned
  it('terminal status cannot be transitioned', async () => {
    const corr = await createCorrespondence(makeInput('letter', { subject: 'Terminal test' }), 'test-user');
    await transitionCorrespondence(corr.id, 'submit', 'test-user');
    await transitionCorrespondence(corr.id, 'reject', 'test-user');

    await expect(
      transitionCorrespondence(corr.id, 'submit', 'test-user'),
    ).rejects.toThrow(/terminal status/);
  });
});
