import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@fmksa/db';
import { createIpc, transitionIpc, getIpc, listIpcs, deleteIpc } from '../../src/commercial/ipc/service';
import { createIpa, transitionIpa } from '../../src/commercial/ipa/service';
import { registerCommercialEventTypes } from '../../src/commercial/posting-hooks/register';

describe('IPC Service', () => {
  let testProject: { id: string; code: string; entityId: string };
  let approvedIpa: { id: string };
  const ts = Date.now();
  /** IDs of workflow templates deactivated for this test (legacy manual path) */
  const deactivatedTemplateIds: string[] = [];

  beforeAll(async () => {
    registerCommercialEventTypes();

    // Deactivate IPA + IPC workflow templates so manual transitions work (legacy path)
    const templates = await prisma.workflowTemplate.findMany({
      where: { recordType: { in: ['ipa', 'ipc'] }, isActive: true },
    });
    for (const t of templates) {
      await prisma.workflowTemplate.update({ where: { id: t.id }, data: { isActive: false } });
      deactivatedTemplateIds.push(t.id);
    }

    const entity = await prisma.entity.create({
      data: { code: `ENT-IPC-${ts}`, name: 'IPC Test Entity', type: 'parent', status: 'active' },
    });
    await prisma.currency.upsert({
      where: { code: 'SAR' }, update: {},
      create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
    });
    const project = await prisma.project.create({
      data: {
        code: `PROJ-IPC-${ts}`, name: 'IPC Test', entityId: entity.id,
        status: 'active', currencyCode: 'SAR', startDate: new Date(), createdBy: 'test',
      },
    });
    testProject = { id: project.id, code: project.code, entityId: entity.id };

    // Create an IPA and transition it to approved_internal so IPC can be created against it
    const ipa = await createIpa({
      projectId: testProject.id,
      periodNumber: 1,
      periodFrom: new Date().toISOString(),
      periodTo: new Date().toISOString(),
      grossAmount: 100000,
      retentionRate: 0.1,
      retentionAmount: 10000,
      previousCertified: 0,
      currentClaim: 90000,
      netClaimed: 90000,
      currency: 'SAR',
    }, 'test-user');

    await transitionIpa(ipa.id, 'submit', 'test-user');
    await transitionIpa(ipa.id, 'review', 'test-user');
    await transitionIpa(ipa.id, 'approve', 'test-user');
    approvedIpa = { id: ipa.id };
  });

  afterAll(async () => {
    // Reactivate templates for other tests
    for (const id of deactivatedTemplateIds) {
      await prisma.workflowTemplate.update({ where: { id }, data: { isActive: true } });
    }
  });

  const makeInput = (overrides = {}) => ({
    projectId: testProject.id,
    ipaId: approvedIpa.id,
    certifiedAmount: 80000,
    retentionAmount: 8000,
    netCertified: 72000,
    certificationDate: new Date().toISOString(),
    currency: 'SAR',
    ...overrides,
  });

  it('cannot create IPC if parent IPA is in draft status', async () => {
    // Create a new IPA that stays in draft
    const draftIpa = await createIpa({
      projectId: testProject.id,
      periodNumber: 99,
      periodFrom: new Date().toISOString(),
      periodTo: new Date().toISOString(),
      grossAmount: 50000,
      retentionRate: 0.1,
      retentionAmount: 5000,
      previousCertified: 0,
      currentClaim: 45000,
      netClaimed: 45000,
      currency: 'SAR',
    }, 'test-user');

    await expect(
      createIpc(makeInput({ ipaId: draftIpa.id }), 'test-user'),
    ).rejects.toThrow(/parent IPA is in 'draft' status/);
  });

  it('can create IPC when parent IPA is approved_internal', async () => {
    const ipc = await createIpc(makeInput(), 'test-user');
    expect(ipc).toBeTruthy();
    expect(ipc.ipaId).toBe(approvedIpa.id);
    expect(ipc.status).toBe('draft');
  });

  it('creates IPC in draft status', async () => {
    const ipc = await createIpc(makeInput(), 'test-user');
    expect(ipc.status).toBe('draft');
    expect(ipc.projectId).toBe(testProject.id);
  });

  it('transitions draft -> submitted', async () => {
    const ipc = await createIpc(makeInput(), 'test-user');
    const updated = await transitionIpc(ipc.id, 'submit', 'test-user');
    expect(updated.status).toBe('submitted');
  });

  it('rejects invalid transition draft -> approved_internal', async () => {
    const ipc = await createIpc(makeInput(), 'test-user');
    await expect(transitionIpc(ipc.id, 'approve', 'test-user')).rejects.toThrow();
  });

  it('full lifecycle: draft -> submitted -> under_review -> approved_internal -> signed -> issued -> closed', async () => {
    const ipc = await createIpc(makeInput(), 'test-user');
    await transitionIpc(ipc.id, 'submit', 'test-user');
    await transitionIpc(ipc.id, 'review', 'test-user');
    await transitionIpc(ipc.id, 'approve', 'test-user');
    await transitionIpc(ipc.id, 'sign', 'test-user');
    await transitionIpc(ipc.id, 'issue', 'test-user');
    const closed = await transitionIpc(ipc.id, 'close', 'test-user');
    expect(closed.status).toBe('closed');
  });

  it('IPC_SIGNED posting event fires at signed transition', async () => {
    const ipc = await createIpc(makeInput(), 'test-user');
    await transitionIpc(ipc.id, 'submit', 'test-user');
    await transitionIpc(ipc.id, 'review', 'test-user');
    await transitionIpc(ipc.id, 'approve', 'test-user');
    await transitionIpc(ipc.id, 'sign', 'test-user');

    const postingEvent = await prisma.postingEvent.findFirst({
      where: { sourceRecordId: ipc.id, eventType: 'IPC_SIGNED' },
    });
    expect(postingEvent).toBeTruthy();
  });

  it('assigns reference number at issued', async () => {
    const ipc = await createIpc(makeInput(), 'test-user');
    await transitionIpc(ipc.id, 'submit', 'test-user');
    await transitionIpc(ipc.id, 'review', 'test-user');
    await transitionIpc(ipc.id, 'approve', 'test-user');
    await transitionIpc(ipc.id, 'sign', 'test-user');
    const issued = await transitionIpc(ipc.id, 'issue', 'test-user');
    expect(issued.status).toBe('issued');
    expect(issued.referenceNumber).toMatch(new RegExp(`^${testProject.code}-IPC-\\d{3}$`));
  });

  it('terminal status cannot be transitioned', async () => {
    const ipc = await createIpc(makeInput(), 'test-user');
    await transitionIpc(ipc.id, 'submit', 'test-user');
    await transitionIpc(ipc.id, 'review', 'test-user');
    await transitionIpc(ipc.id, 'reject', 'test-user');
    await expect(transitionIpc(ipc.id, 'submit', 'test-user')).rejects.toThrow();
  });

  it('deleteIpc only works in draft', async () => {
    const ipc = await createIpc(makeInput(), 'test-user');
    await deleteIpc(ipc.id, 'test-user', testProject.id);
    const deleted = await prisma.ipc.findUnique({ where: { id: ipc.id } });
    expect(deleted).toBeNull();
  });
});
