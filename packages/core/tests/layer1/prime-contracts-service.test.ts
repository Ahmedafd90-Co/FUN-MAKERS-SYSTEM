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
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    primeContract: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    project: {
      update: vi.fn(),
    },
  };
  mockPrisma.$transaction = vi
    .fn()
    .mockImplementation((cb: (tx: any) => any) => cb(mockPrisma));
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
  createPrimeContract,
  getPrimeContract,
  updatePrimeContract,
  transitionPrimeContractStatus,
  deletePrimeContract,
} from '../../src/layer1/prime-contracts/service';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROJECT_ID = '00000000-0000-0000-0000-000000000001';
const ENTITY_ID = '00000000-0000-0000-0000-000000000010';
const ACTOR = '00000000-0000-0000-0000-0000000000aa';

function fakeEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: ENTITY_ID,
    code: 'TEST-ENT',
    name: 'Test Entity',
    type: 'subsidiary',
    status: 'active',
    parentEntityId: null,
    metadataJson: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// Decimal-shaped (string-coercible + .equals method) for monetary fields.
function decimal(value: number | string) {
  const s = typeof value === 'number' ? value.toString() : value;
  return {
    toString: () => s,
    equals: (other: unknown) => {
      if (other === null || other === undefined) return false;
      const o =
        typeof other === 'number'
          ? other.toString()
          : typeof other === 'object' && other !== null && 'toString' in other
            ? (other as { toString: () => string }).toString()
            : String(other);
      return s === o;
    },
  };
}

function fakePrimeContract(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pc1',
    projectId: PROJECT_ID,
    contractingEntityId: ENTITY_ID,
    clientName: 'Acme Corp',
    clientReference: null,
    contractValue: decimal('1000000.00'),
    contractCurrency: 'SAR',
    signedDate: null,
    effectiveDate: null,
    expectedCompletionDate: null,
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
  contractingEntityId: ENTITY_ID,
  clientName: 'Acme Corp',
  contractValue: 1000000,
  contractCurrency: 'SAR',
  status: 'draft' as const,
  createdBy: ACTOR,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PrimeContract Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -- Create --

  it('create: success path with all required fields + audit logged', async () => {
    mockPrisma.entity.findUniqueOrThrow.mockResolvedValue(fakeEntity());
    mockPrisma.projectParticipant.findFirst.mockResolvedValue(null);
    mockPrisma.projectParticipant.create.mockResolvedValue({});
    const created = fakePrimeContract();
    mockPrisma.primeContract.create.mockResolvedValue(created);
    mockPrisma.project.update.mockResolvedValue({});

    const result = await createPrimeContract(baseCreateInput);

    expect(result.id).toBe('pc1');
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.primeContract.create).toHaveBeenCalledTimes(1);
    expect(mockAuditLog).toHaveBeenCalledTimes(1);
    expect(mockAuditLog.mock.calls[0][0].action).toBe('prime_contract.create');
  });

  it('create: creates ProjectParticipant when entity not yet a participant (role=prime_contractor, isPrime=true)', async () => {
    mockPrisma.entity.findUniqueOrThrow.mockResolvedValue(fakeEntity());
    mockPrisma.projectParticipant.findFirst.mockResolvedValue(null);
    mockPrisma.projectParticipant.create.mockResolvedValue({});
    mockPrisma.primeContract.create.mockResolvedValue(fakePrimeContract());
    mockPrisma.project.update.mockResolvedValue({});

    await createPrimeContract(baseCreateInput);

    expect(mockPrisma.projectParticipant.create).toHaveBeenCalledTimes(1);
    const ppCreateData = mockPrisma.projectParticipant.create.mock.calls[0][0].data;
    expect(ppCreateData.role).toBe('prime_contractor');
    expect(ppCreateData.isPrime).toBe(true);
    expect(ppCreateData.entityId).toBe(ENTITY_ID);
    expect(mockPrisma.projectParticipant.update).not.toHaveBeenCalled();
  });

  it('create: promotes existing non-prime participant to isPrime=true', async () => {
    mockPrisma.entity.findUniqueOrThrow.mockResolvedValue(fakeEntity());
    // Entity is already a participant (e.g., as sub_contractor, isPrime=false)
    mockPrisma.projectParticipant.findFirst.mockResolvedValue({
      id: 'pp1',
      isPrime: false,
      role: 'sub_contractor',
    });
    mockPrisma.projectParticipant.update.mockResolvedValue({});
    mockPrisma.primeContract.create.mockResolvedValue(fakePrimeContract());
    mockPrisma.project.update.mockResolvedValue({});

    await createPrimeContract(baseCreateInput);

    expect(mockPrisma.projectParticipant.update).toHaveBeenCalledWith({
      where: { id: 'pp1' },
      data: { isPrime: true },
    });
    expect(mockPrisma.projectParticipant.create).not.toHaveBeenCalled();
  });

  it('create: rejects when contractingEntity is archived', async () => {
    mockPrisma.entity.findUniqueOrThrow.mockResolvedValue(fakeEntity({ status: 'archived' }));

    await expect(createPrimeContract(baseCreateInput)).rejects.toThrow(
      /Only active entities can hold prime contracts/,
    );

    expect(mockPrisma.primeContract.create).not.toHaveBeenCalled();
    expect(mockAuditLog).not.toHaveBeenCalled();
  });

  it('create: syncs Project.primeContractId AND Project.contractValue atomically', async () => {
    mockPrisma.entity.findUniqueOrThrow.mockResolvedValue(fakeEntity());
    mockPrisma.projectParticipant.findFirst.mockResolvedValue(null);
    mockPrisma.projectParticipant.create.mockResolvedValue({});
    mockPrisma.primeContract.create.mockResolvedValue(fakePrimeContract());
    mockPrisma.project.update.mockResolvedValue({});

    await createPrimeContract(baseCreateInput);

    expect(mockPrisma.project.update).toHaveBeenCalledWith({
      where: { id: PROJECT_ID },
      data: {
        primeContractId: 'pc1',
        contractValue: 1000000,
      },
    });
  });

  // -- Get --

  it('get: returns the row when present', async () => {
    const existing = fakePrimeContract();
    mockPrisma.primeContract.findUnique.mockResolvedValue(existing);

    const result = await getPrimeContract(PROJECT_ID);
    expect(result?.id).toBe('pc1');
  });

  it('get: returns null when no PrimeContract for projectId', async () => {
    mockPrisma.primeContract.findUnique.mockResolvedValue(null);
    const result = await getPrimeContract(PROJECT_ID);
    expect(result).toBeNull();
  });

  // -- Update — defense-in-depth tightening --

  it('update: rejects status field (defense-in-depth — schema strips, service guards too)', async () => {
    await expect(
      updatePrimeContract(
        // Cast to bypass TS — simulates a non-Zod-validated caller
        { projectId: PROJECT_ID, status: 'signed' } as any,
        ACTOR,
      ),
    ).rejects.toThrow(/transitionPrimeContractStatus/);

    expect(mockPrisma.primeContract.update).not.toHaveBeenCalled();
    expect(mockAuditLog).not.toHaveBeenCalled();
  });

  it('update: rejects contractingEntityId field (defense-in-depth)', async () => {
    await expect(
      updatePrimeContract(
        { projectId: PROJECT_ID, contractingEntityId: 'other-entity' } as any,
        ACTOR,
      ),
    ).rejects.toThrow(/immutable/);

    expect(mockPrisma.primeContract.update).not.toHaveBeenCalled();
    expect(mockAuditLog).not.toHaveBeenCalled();
  });

  it('update: contractValue change syncs Project.contractValue in same transaction', async () => {
    const existing = fakePrimeContract({ contractValue: decimal('1000000.00') });
    mockPrisma.primeContract.findUniqueOrThrow.mockResolvedValue(existing);
    const updated = fakePrimeContract({ contractValue: decimal('1500000.00') });
    mockPrisma.primeContract.update.mockResolvedValue(updated);
    mockPrisma.project.update.mockResolvedValue({});

    await updatePrimeContract(
      { projectId: PROJECT_ID, contractValue: 1500000 },
      ACTOR,
    );

    expect(mockPrisma.project.update).toHaveBeenCalledWith({
      where: { id: PROJECT_ID },
      data: { contractValue: 1500000 },
    });
  });

  // -- Transition --

  it('transition: draft → signed allowed (action = sign)', async () => {
    const existing = fakePrimeContract({ status: 'draft' });
    mockPrisma.primeContract.findUniqueOrThrow.mockResolvedValue(existing);
    const updated = fakePrimeContract({ status: 'signed' });
    mockPrisma.primeContract.update.mockResolvedValue(updated);

    const result = await transitionPrimeContractStatus(PROJECT_ID, 'sign', ACTOR);
    expect(result.status).toBe('signed');
    expect(mockAuditLog.mock.calls[0][0].action).toBe('prime_contract.transition.sign');
  });

  it('transition: draft → completed NOT allowed', async () => {
    const existing = fakePrimeContract({ status: 'draft' });
    mockPrisma.primeContract.findUniqueOrThrow.mockResolvedValue(existing);

    await expect(
      transitionPrimeContractStatus(PROJECT_ID, 'complete', ACTOR),
    ).rejects.toThrow(/Invalid prime contract transition/);

    expect(mockPrisma.primeContract.update).not.toHaveBeenCalled();
  });

  it('transition: terminal status (completed) rejects all transitions', async () => {
    const existing = fakePrimeContract({ status: 'completed' });
    mockPrisma.primeContract.findUniqueOrThrow.mockResolvedValue(existing);

    await expect(
      transitionPrimeContractStatus(PROJECT_ID, 'cancel', ACTOR),
    ).rejects.toThrow(/Invalid prime contract transition/);
  });

  // -- Delete --

  it('delete: allowed when draft + clears Project cache fields atomically', async () => {
    const existing = fakePrimeContract({ status: 'draft' });
    mockPrisma.primeContract.findUniqueOrThrow.mockResolvedValue(existing);
    mockPrisma.project.update.mockResolvedValue({});
    mockPrisma.primeContract.delete.mockResolvedValue(existing);

    await deletePrimeContract(PROJECT_ID, ACTOR);

    expect(mockPrisma.primeContract.delete).toHaveBeenCalledTimes(1);
    expect(mockPrisma.project.update).toHaveBeenCalledWith({
      where: { id: PROJECT_ID },
      data: { primeContractId: null, contractValue: null },
    });
    expect(mockAuditLog.mock.calls[0][0].action).toBe('prime_contract.delete');
  });

  it('delete: rejects when active', async () => {
    const existing = fakePrimeContract({ status: 'active' });
    mockPrisma.primeContract.findUniqueOrThrow.mockResolvedValue(existing);

    await expect(deletePrimeContract(PROJECT_ID, ACTOR)).rejects.toThrow(
      /Only draft or cancelled prime contracts can be deleted/,
    );

    expect(mockPrisma.primeContract.delete).not.toHaveBeenCalled();
  });
});
