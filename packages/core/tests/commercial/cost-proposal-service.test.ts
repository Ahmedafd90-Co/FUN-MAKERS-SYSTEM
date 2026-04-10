import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '@fmksa/db';
import {
  createCostProposal,
  transitionCostProposal,
  getCostProposal,
  listCostProposals,
  deleteCostProposal,
} from '../../src/commercial/cost-proposal/service';

describe('CostProposal Service', () => {
  let testProject: { id: string; code: string; entityId: string };
  const ts = Date.now();

  beforeAll(async () => {
    const entity = await prisma.entity.create({
      data: { code: `ENT-CP-${ts}`, name: 'CostProposal Test Entity', type: 'parent', status: 'active' },
    });
    await prisma.currency.upsert({
      where: { code: 'SAR' }, update: {},
      create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
    });
    const project = await prisma.project.create({
      data: {
        code: `PROJ-CP-${ts}`, name: 'CostProposal Test', entityId: entity.id,
        status: 'active', currencyCode: 'SAR', startDate: new Date(), createdBy: 'test',
      },
    });
    testProject = { id: project.id, code: project.code, entityId: entity.id };
  });

  const makeInput = (overrides = {}) => ({
    projectId: testProject.id,
    revisionNumber: 1,
    estimatedCost: 75000,
    estimatedTimeDays: 45,
    methodology: 'Lump sum',
    costBreakdown: 'Labour 50k, Materials 25k',
    currency: 'SAR',
    ...overrides,
  });

  // 1. Create CostProposal in draft
  it('creates CostProposal in draft status', async () => {
    const cp = await createCostProposal(makeInput(), 'test-user');
    expect(cp.status).toBe('draft');
    expect(cp.projectId).toBe(testProject.id);
    expect(Number(cp.estimatedCost)).toBe(75000);
    expect(cp.revisionNumber).toBe(1);
  });

  // 2. Full lifecycle: draft -> submitted -> under_review -> approved_internal -> issued -> linked_to_variation -> closed
  it('full lifecycle through linked_to_variation -> closed', async () => {
    const cp = await createCostProposal(makeInput(), 'test-user');

    await transitionCostProposal(cp.id, 'submit', 'test-user');
    await transitionCostProposal(cp.id, 'review', 'test-user');
    const approved = await transitionCostProposal(cp.id, 'approve', 'test-user');
    expect(approved.status).toBe('approved_internal');

    const issued = await transitionCostProposal(cp.id, 'issue', 'test-user');
    expect(issued.status).toBe('issued');

    const linked = await transitionCostProposal(cp.id, 'link_to_variation', 'test-user');
    expect(linked.status).toBe('linked_to_variation');

    const closed = await transitionCostProposal(cp.id, 'close', 'test-user');
    expect(closed.status).toBe('closed');
  });

  // 3. Invalid transition throws
  it('invalid transition throws', async () => {
    const cp = await createCostProposal(makeInput(), 'test-user');

    await expect(
      transitionCostProposal(cp.id, 'approve', 'test-user'),
    ).rejects.toThrow(/Invalid CostProposal transition/);
  });

  // 4. Reference number assigned at issued (CP type code)
  it('reference number assigned at issued with CP type code', async () => {
    const cp = await createCostProposal(makeInput(), 'test-user');
    await transitionCostProposal(cp.id, 'submit', 'test-user');
    await transitionCostProposal(cp.id, 'review', 'test-user');
    await transitionCostProposal(cp.id, 'approve', 'test-user');
    const issued = await transitionCostProposal(cp.id, 'issue', 'test-user');

    expect(issued.referenceNumber).toMatch(new RegExp(`^${testProject.code}-CP-\\d{3}$`));
  });

  // 5. Assessment fields populated at review/approve
  it('assessment fields populated at review and approve', async () => {
    const cp = await createCostProposal(makeInput(), 'test-user');
    await transitionCostProposal(cp.id, 'submit', 'test-user');

    // Review with assessment data
    const reviewed = await transitionCostProposal(
      cp.id, 'review', 'test-user', undefined,
      { assessedCost: 70000, assessedTimeDays: 40 },
    );
    expect(Number(reviewed.assessedCost)).toBe(70000);
    expect(reviewed.assessedTimeDays).toBe(40);

    // Approve with approved data
    const approved = await transitionCostProposal(
      cp.id, 'approve', 'test-user', undefined,
      { approvedCost: 68000, approvedTimeDays: 38 },
    );
    expect(Number(approved.approvedCost)).toBe(68000);
    expect(approved.approvedTimeDays).toBe(38);
  });

  // 6. Assessment fields null when not provided
  it('assessment fields remain null when not provided in transition data', async () => {
    const cp = await createCostProposal(makeInput(), 'test-user');
    await transitionCostProposal(cp.id, 'submit', 'test-user');

    const reviewed = await transitionCostProposal(cp.id, 'review', 'test-user');
    expect(reviewed.assessedCost).toBeNull();
    expect(reviewed.assessedTimeDays).toBeNull();

    const approved = await transitionCostProposal(cp.id, 'approve', 'test-user');
    expect(approved.approvedCost).toBeNull();
    expect(approved.approvedTimeDays).toBeNull();
  });

  // 7. Delete only in draft
  it('delete only in draft', async () => {
    const cp = await createCostProposal(makeInput(), 'test-user');
    await deleteCostProposal(cp.id, 'test-user');
    const deleted = await prisma.costProposal.findUnique({ where: { id: cp.id } });
    expect(deleted).toBeNull();
  });

  it('delete rejects non-draft CostProposal', async () => {
    const cp = await createCostProposal(makeInput(), 'test-user');
    await transitionCostProposal(cp.id, 'submit', 'test-user');
    await expect(deleteCostProposal(cp.id, 'test-user')).rejects.toThrow(/Only draft/);
  });

  // 8. List with filters
  it('list with filters returns correct results', async () => {
    // Create a couple with known amounts
    const cp1 = await createCostProposal(makeInput({ estimatedCost: 100000, revisionNumber: 1 }), 'test-user');
    const cp2 = await createCostProposal(makeInput({ estimatedCost: 200000, revisionNumber: 2 }), 'test-user');

    // Filter by status
    const drafts = await listCostProposals({
      projectId: testProject.id,
      statusFilter: ['draft'],
      skip: 0, take: 20, sortDirection: 'desc',
    });
    expect(drafts.items.length).toBeGreaterThan(0);
    expect(drafts.items.every((item: any) => item.status === 'draft')).toBe(true);

    // Filter by amount range
    const filtered = await listCostProposals({
      projectId: testProject.id,
      amountMin: 150000,
      amountMax: 250000,
      skip: 0, take: 20, sortDirection: 'desc',
    });
    expect(filtered.items.some((item: any) => item.id === cp2.id)).toBe(true);
    expect(filtered.items.every((item: any) => Number(item.estimatedCost) >= 150000)).toBe(true);
  });

  // 9. Terminal status cannot be transitioned
  it('terminal status cannot be transitioned', async () => {
    const cp = await createCostProposal(makeInput(), 'test-user');
    await transitionCostProposal(cp.id, 'submit', 'test-user');
    await transitionCostProposal(cp.id, 'review', 'test-user');
    await transitionCostProposal(cp.id, 'reject', 'test-user');

    await expect(
      transitionCostProposal(cp.id, 'submit', 'test-user'),
    ).rejects.toThrow(/terminal status/);
  });
});
