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
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    primeContract: {
      findFirst: vi.fn(),
    },
    intercompanyContract: {
      findFirst: vi.fn(),
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
  createProjectParticipant,
  getProjectParticipant,
  listProjectParticipants,
  updateProjectParticipant,
  deleteProjectParticipant,
} from '../../src/layer1/project-participants/service';

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

function fakeParticipant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pp1',
    projectId: PROJECT_ID,
    entityId: ENTITY_ID,
    role: 'sub_contractor',
    isPrime: false,
    notes: null,
    createdBy: ACTOR,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProjectParticipant Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -- Create --

  it('create: success', async () => {
    mockPrisma.entity.findUniqueOrThrow.mockResolvedValue(fakeEntity());
    const created = fakeParticipant({ role: 'factory' });
    mockPrisma.projectParticipant.create.mockResolvedValue(created);

    const result = await createProjectParticipant({
      projectId: PROJECT_ID,
      entityId: ENTITY_ID,
      role: 'factory',
      isPrime: false,
      createdBy: ACTOR,
    });

    expect(result.role).toBe('factory');
    expect(mockAuditLog).toHaveBeenCalledTimes(1);
    expect(mockAuditLog.mock.calls[0]![0].action).toBe('project_participant.create');
  });

  it('create: rejects when entity not in active status', async () => {
    mockPrisma.entity.findUniqueOrThrow.mockResolvedValue(fakeEntity({ status: 'archived' }));

    await expect(
      createProjectParticipant({
        projectId: PROJECT_ID,
        entityId: ENTITY_ID,
        role: 'sub_contractor',
        isPrime: false,
        createdBy: ACTOR,
      }),
    ).rejects.toThrow(/active entities can participate/);

    expect(mockPrisma.projectParticipant.create).not.toHaveBeenCalled();
    expect(mockAuditLog).not.toHaveBeenCalled();
  });

  it('create: rejects on duplicate (project_id, entity_id) with friendly P2002 message', async () => {
    mockPrisma.entity.findUniqueOrThrow.mockResolvedValue(fakeEntity());
    const error = new mockPrismaNamespace.PrismaClientKnownRequestError(
      'Unique constraint',
      { code: 'P2002' },
    );
    mockPrisma.projectParticipant.create.mockRejectedValue(error);

    await expect(
      createProjectParticipant({
        projectId: PROJECT_ID,
        entityId: ENTITY_ID,
        role: 'sub_contractor',
        isPrime: false,
        createdBy: ACTOR,
      }),
    ).rejects.toThrow(/already a participant/);
  });

  // -- Get --

  it('get: success', async () => {
    const existing = fakeParticipant();
    mockPrisma.projectParticipant.findUniqueOrThrow.mockResolvedValue(existing);

    const result = await getProjectParticipant('pp1', PROJECT_ID);
    expect(result.id).toBe('pp1');
  });

  it('get: throws ScopeMismatchError when wrong projectId', async () => {
    const existing = fakeParticipant({ projectId: 'other-project' });
    mockPrisma.projectParticipant.findUniqueOrThrow.mockResolvedValue(existing);

    await expect(getProjectParticipant('pp1', PROJECT_ID)).rejects.toThrow(
      /does not belong to the expected project/,
    );
  });

  // -- List --

  it('list: filters by role', async () => {
    mockPrisma.projectParticipant.findMany.mockResolvedValue([
      fakeParticipant({ role: 'factory' }),
    ]);

    const result = await listProjectParticipants({ projectId: PROJECT_ID, role: 'factory' });
    expect(result).toHaveLength(1);
    expect(mockPrisma.projectParticipant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: PROJECT_ID, role: 'factory' },
      }),
    );
  });

  // -- Update --

  it('update: only updates allowed fields (role + notes); entityId attempt is silently ignored', async () => {
    const existing = fakeParticipant({ role: 'sub_contractor', notes: null });
    mockPrisma.projectParticipant.findUniqueOrThrow.mockResolvedValue(existing);
    const updated = fakeParticipant({ role: 'factory', notes: 'changed' });
    mockPrisma.projectParticipant.update.mockResolvedValue(updated);

    const result = await updateProjectParticipant(
      { id: 'pp1', projectId: PROJECT_ID, role: 'factory', notes: 'changed' },
      ACTOR,
    );

    expect(result.role).toBe('factory');
    expect(result.notes).toBe('changed');
    // entityId is not part of UpdateProjectParticipantInput — TypeScript prevents passing it.
    const updateCall = mockPrisma.projectParticipant.update.mock.calls[0]![0];
    expect(updateCall.data).not.toHaveProperty('entityId');
  });

  // -- Delete --

  it('delete: success path (no prime contract, no active intercompany)', async () => {
    const existing = fakeParticipant();
    mockPrisma.projectParticipant.findUniqueOrThrow.mockResolvedValue(existing);
    mockPrisma.primeContract.findFirst.mockResolvedValue(null);
    mockPrisma.intercompanyContract.findFirst.mockResolvedValue(null);
    mockPrisma.projectParticipant.delete.mockResolvedValue(existing);

    await deleteProjectParticipant('pp1', PROJECT_ID, ACTOR);

    expect(mockPrisma.projectParticipant.delete).toHaveBeenCalledTimes(1);
    expect(mockAuditLog).toHaveBeenCalledTimes(1);
    expect(mockAuditLog.mock.calls[0]![0].action).toBe('project_participant.delete');
  });

  it('delete: rejects when participant is prime contract holder', async () => {
    const existing = fakeParticipant({ isPrime: true });
    mockPrisma.projectParticipant.findUniqueOrThrow.mockResolvedValue(existing);
    mockPrisma.primeContract.findFirst.mockResolvedValue({
      id: 'pc1',
      status: 'active',
    });

    await expect(deleteProjectParticipant('pp1', PROJECT_ID, ACTOR)).rejects.toThrow(
      /prime contract/,
    );

    expect(mockPrisma.projectParticipant.delete).not.toHaveBeenCalled();
  });

  it('delete: rejects when intercompany contract is in active status (positive list)', async () => {
    const existing = fakeParticipant();
    mockPrisma.projectParticipant.findUniqueOrThrow.mockResolvedValue(existing);
    mockPrisma.primeContract.findFirst.mockResolvedValue(null);
    mockPrisma.intercompanyContract.findFirst.mockResolvedValue({
      id: 'ic1',
      status: 'active',
    });

    await expect(deleteProjectParticipant('pp1', PROJECT_ID, ACTOR)).rejects.toThrow(
      /intercompany contract/,
    );

    expect(mockPrisma.projectParticipant.delete).not.toHaveBeenCalled();
    // Verify the positive-list filter was applied (status IN draft/signed/active).
    const ic = mockPrisma.intercompanyContract.findFirst.mock.calls[0]![0];
    expect(ic.where.status).toEqual({ in: ['draft', 'signed', 'active'] });
  });

  it('delete: allows when intercompany contracts are only cancelled or closed', async () => {
    // Positive-list filter excludes cancelled/closed → findFirst returns null
    // even if such contracts exist in the DB. Simulate that here.
    const existing = fakeParticipant();
    mockPrisma.projectParticipant.findUniqueOrThrow.mockResolvedValue(existing);
    mockPrisma.primeContract.findFirst.mockResolvedValue(null);
    mockPrisma.intercompanyContract.findFirst.mockResolvedValue(null);
    mockPrisma.projectParticipant.delete.mockResolvedValue(existing);

    await deleteProjectParticipant('pp1', PROJECT_ID, ACTOR);

    expect(mockPrisma.projectParticipant.delete).toHaveBeenCalledTimes(1);
  });
});
