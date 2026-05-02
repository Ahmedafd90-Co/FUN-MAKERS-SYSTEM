import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Prisma + audit (hoisted)
// ---------------------------------------------------------------------------

const { mockPrisma, mockAuditLog, mockPrismaNamespace } = vi.hoisted(() => {
  const mockAuditLog = vi.fn().mockResolvedValue({});
  const mockPrisma: Record<string, any> = {
    entity: {
      findUniqueOrThrow: vi.fn(),
    },
    projectParticipant: {
      findMany: vi.fn(),
    },
    intercompanyContract: {
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  class PrismaClientKnownRequestError extends Error {
    code: string;
    constructor(message: string, { code }: { code: string }) {
      super(message);
      this.code = code;
    }
  }
  const mockPrismaNamespace = { PrismaClientKnownRequestError };
  return { mockPrisma, mockAuditLog, mockPrismaNamespace };
});

vi.mock('@fmksa/db', () => ({ prisma: mockPrisma, Prisma: mockPrismaNamespace }));
vi.mock('../../src/audit/service', () => ({
  auditService: { log: (...args: unknown[]) => mockAuditLog(...args) },
}));

import {
  createIntercompanyContract,
  getIntercompanyContract,
  listIntercompanyContracts,
  updateIntercompanyContract,
  transitionIntercompanyContractStatus,
  deleteIntercompanyContract,
} from '../../src/layer1/intercompany-contracts/service';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROJECT_ID = '00000000-0000-0000-0000-000000000001';
const FROM_ENTITY_ID = '00000000-0000-0000-0000-000000000010';
const TO_ENTITY_ID = '00000000-0000-0000-0000-000000000011';
const ACTOR = '00000000-0000-0000-0000-0000000000aa';

function fakeEntity(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    code: id.slice(-4),
    name: `Entity ${id.slice(-4)}`,
    type: 'subsidiary',
    status: 'active',
    parentEntityId: null,
    metadataJson: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function fakeIntercompany(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ic1',
    projectId: PROJECT_ID,
    fromEntityId: FROM_ENTITY_ID,
    toEntityId: TO_ENTITY_ID,
    scope: 'Design services',
    pricingType: 'cost_plus_markup',
    markupPercent: { toString: () => '0.1500' },
    contractValue: null,
    contractCurrency: 'SAR',
    managingDepartment: 'me_contract',
    signedDate: null,
    status: 'draft',
    notes: null,
    createdBy: ACTOR,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const baseCreateInput = {
  projectId: PROJECT_ID,
  fromEntityId: FROM_ENTITY_ID,
  toEntityId: TO_ENTITY_ID,
  scope: 'Design services',
  pricingType: 'cost_plus_markup' as const,
  markupPercent: 0.15,
  contractCurrency: 'SAR',
  managingDepartment: 'me_contract' as const,
  status: 'draft' as const,
  createdBy: ACTOR,
};

function bothActiveEntities() {
  mockPrisma.entity.findUniqueOrThrow.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve(fakeEntity(where.id)),
  );
}

function bothParticipants() {
  mockPrisma.projectParticipant.findMany.mockResolvedValue([
    { entityId: FROM_ENTITY_ID },
    { entityId: TO_ENTITY_ID },
  ]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IntercompanyContract Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -- Create --

  it('create: success path', async () => {
    bothActiveEntities();
    bothParticipants();
    mockPrisma.intercompanyContract.create.mockResolvedValue(fakeIntercompany());

    const result = await createIntercompanyContract(baseCreateInput);

    expect(result.id).toBe('ic1');
    expect(mockAuditLog.mock.calls[0]![0].action).toBe('intercompany_contract.create');
  });

  it('create: rejects when from === to (service-level, in addition to schema)', async () => {
    await expect(
      createIntercompanyContract({ ...baseCreateInput, toEntityId: FROM_ENTITY_ID }),
    ).rejects.toThrow(/must be different/);

    expect(mockPrisma.intercompanyContract.create).not.toHaveBeenCalled();
  });

  it('create: rejects when fromEntity not project participant', async () => {
    bothActiveEntities();
    // Only toEntity is a participant
    mockPrisma.projectParticipant.findMany.mockResolvedValue([{ entityId: TO_ENTITY_ID }]);

    await expect(createIntercompanyContract(baseCreateInput)).rejects.toThrow(
      /fromEntity .* is not a participant/,
    );
  });

  it('create: rejects when toEntity not project participant', async () => {
    bothActiveEntities();
    mockPrisma.projectParticipant.findMany.mockResolvedValue([{ entityId: FROM_ENTITY_ID }]);

    await expect(createIntercompanyContract(baseCreateInput)).rejects.toThrow(
      /toEntity .* is not a participant/,
    );
  });

  it('create: rejects when fromEntity is not active', async () => {
    mockPrisma.entity.findUniqueOrThrow.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(
        fakeEntity(where.id, where.id === FROM_ENTITY_ID ? { status: 'archived' } : {}),
      ),
    );

    await expect(createIntercompanyContract(baseCreateInput)).rejects.toThrow(
      /fromEntity .* is in status 'archived'/,
    );
  });

  it('create: rejects when toEntity is not active', async () => {
    mockPrisma.entity.findUniqueOrThrow.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(
        fakeEntity(where.id, where.id === TO_ENTITY_ID ? { status: 'archived' } : {}),
      ),
    );

    await expect(createIntercompanyContract(baseCreateInput)).rejects.toThrow(
      /toEntity .* is in status 'archived'/,
    );
  });

  // -- Get --

  it('get: success', async () => {
    mockPrisma.intercompanyContract.findUniqueOrThrow.mockResolvedValue(fakeIntercompany());
    const result = await getIntercompanyContract('ic1', PROJECT_ID);
    expect(result.id).toBe('ic1');
  });

  it('get: throws ScopeMismatchError on wrong projectId', async () => {
    mockPrisma.intercompanyContract.findUniqueOrThrow.mockResolvedValue(
      fakeIntercompany({ projectId: 'other-project' }),
    );

    await expect(getIntercompanyContract('ic1', PROJECT_ID)).rejects.toThrow(
      /does not belong to the expected project/,
    );
  });

  // -- List --

  it('list: filters by managingDepartment', async () => {
    mockPrisma.intercompanyContract.findMany.mockResolvedValue([
      fakeIntercompany({ managingDepartment: 'asia_pac_contract' }),
    ]);

    const result = await listIntercompanyContracts({
      projectId: PROJECT_ID,
      managingDepartment: 'asia_pac_contract',
    });

    expect(result).toHaveLength(1);
    expect(mockPrisma.intercompanyContract.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: PROJECT_ID, managingDepartment: 'asia_pac_contract' },
      }),
    );
  });

  it('list: filters by status', async () => {
    mockPrisma.intercompanyContract.findMany.mockResolvedValue([
      fakeIntercompany({ status: 'active' }),
    ]);

    await listIntercompanyContracts({ projectId: PROJECT_ID, status: 'active' });

    expect(mockPrisma.intercompanyContract.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: PROJECT_ID, status: 'active' },
      }),
    );
  });

  // -- Update --

  it('update: scope/markupPercent change accepted; entities are immutable at type level', async () => {
    const existing = fakeIntercompany();
    mockPrisma.intercompanyContract.findUniqueOrThrow.mockResolvedValue(existing);
    const updated = fakeIntercompany({ scope: 'Updated scope', markupPercent: { toString: () => '0.2000' } });
    mockPrisma.intercompanyContract.update.mockResolvedValue(updated);

    const result = await updateIntercompanyContract(
      { id: 'ic1', projectId: PROJECT_ID, scope: 'Updated scope', markupPercent: 0.2 },
      ACTOR,
    );

    expect(result.scope).toBe('Updated scope');
    // fromEntityId / toEntityId are NOT in UpdateIntercompanyContractInput — TS prevents passing them.
    const updateCall = mockPrisma.intercompanyContract.update.mock.calls[0][0];
    expect(updateCall.data).not.toHaveProperty('fromEntityId');
    expect(updateCall.data).not.toHaveProperty('toEntityId');
  });

  it('update: rejects status field (defense-in-depth — schema strips, service guards too)', async () => {
    await expect(
      updateIntercompanyContract(
        // Cast to bypass TS — simulates a non-Zod-validated caller
        { id: 'ic1', projectId: PROJECT_ID, status: 'signed' } as any,
        ACTOR,
      ),
    ).rejects.toThrow(/transitionIntercompanyContractStatus/);

    expect(mockPrisma.intercompanyContract.update).not.toHaveBeenCalled();
    expect(mockAuditLog).not.toHaveBeenCalled();
  });

  it('update: rejects fromEntityId field (entities immutable)', async () => {
    await expect(
      updateIntercompanyContract(
        { id: 'ic1', projectId: PROJECT_ID, fromEntityId: 'other-entity' } as any,
        ACTOR,
      ),
    ).rejects.toThrow(/immutable/);

    expect(mockPrisma.intercompanyContract.update).not.toHaveBeenCalled();
  });

  it('update: rejects toEntityId field (entities immutable)', async () => {
    await expect(
      updateIntercompanyContract(
        { id: 'ic1', projectId: PROJECT_ID, toEntityId: 'other-entity' } as any,
        ACTOR,
      ),
    ).rejects.toThrow(/immutable/);

    expect(mockPrisma.intercompanyContract.update).not.toHaveBeenCalled();
  });

  // -- Transition --

  it('transition: draft → signed → active → closed (full happy path)', async () => {
    let current = 'draft';
    mockPrisma.intercompanyContract.findUniqueOrThrow.mockImplementation(() =>
      Promise.resolve(fakeIntercompany({ status: current })),
    );
    mockPrisma.intercompanyContract.update.mockImplementation(
      ({ data }: { data: { status: string } }) => {
        current = data.status;
        return Promise.resolve(fakeIntercompany({ status: current }));
      },
    );

    let r = await transitionIntercompanyContractStatus('ic1', PROJECT_ID, 'sign', ACTOR);
    expect(r.status).toBe('signed');
    r = await transitionIntercompanyContractStatus('ic1', PROJECT_ID, 'activate', ACTOR);
    expect(r.status).toBe('active');
    r = await transitionIntercompanyContractStatus('ic1', PROJECT_ID, 'close', ACTOR);
    expect(r.status).toBe('closed');
  });

  it('transition: invalid (closed → draft via cancel) rejected — closed is terminal', async () => {
    mockPrisma.intercompanyContract.findUniqueOrThrow.mockResolvedValue(
      fakeIntercompany({ status: 'closed' }),
    );

    await expect(
      transitionIntercompanyContractStatus('ic1', PROJECT_ID, 'cancel', ACTOR),
    ).rejects.toThrow(/Invalid intercompany contract transition/);
  });

  // -- Delete --

  it('delete: allowed when draft', async () => {
    const existing = fakeIntercompany({ status: 'draft' });
    mockPrisma.intercompanyContract.findUniqueOrThrow.mockResolvedValue(existing);
    mockPrisma.intercompanyContract.delete.mockResolvedValue(existing);

    await deleteIntercompanyContract('ic1', PROJECT_ID, ACTOR);

    expect(mockPrisma.intercompanyContract.delete).toHaveBeenCalledTimes(1);
    expect(mockAuditLog.mock.calls[0]![0].action).toBe('intercompany_contract.delete');
  });

  it('delete: rejects when active', async () => {
    mockPrisma.intercompanyContract.findUniqueOrThrow.mockResolvedValue(
      fakeIntercompany({ status: 'active' }),
    );

    await expect(deleteIntercompanyContract('ic1', PROJECT_ID, ACTOR)).rejects.toThrow(
      /Only draft or cancelled contracts can be deleted/,
    );

    expect(mockPrisma.intercompanyContract.delete).not.toHaveBeenCalled();
  });
});
