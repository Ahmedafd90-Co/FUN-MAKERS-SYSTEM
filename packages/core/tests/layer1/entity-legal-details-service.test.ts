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
    entityLegalDetails: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
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
  getEntityLegalDetails,
  upsertEntityLegalDetails,
  deleteEntityLegalDetails,
} from '../../src/layer1/entity-legal-details/service';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ENTITY_ID = '00000000-0000-0000-0000-000000000010';
const ACTOR = '00000000-0000-0000-0000-0000000000aa';

function fakeEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: ENTITY_ID,
    code: 'TEST-ENT',
    name: 'Test Entity',
    type: 'subsidiary',
    parentEntityId: null,
    status: 'active',
    metadataJson: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function fakeLegalDetails(overrides: Record<string, unknown> = {}) {
  return {
    id: 'eld1',
    entityId: ENTITY_ID,
    taxId: '300000000000003',
    registrationNumber: 'CR-1234567890',
    jurisdiction: 'KSA',
    registeredAddress: 'Riyadh',
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    bankName: null,
    bankAccountNumber: null,
    bankIban: null,
    bankSwift: null,
    notes: null,
    updatedBy: ACTOR,
    updatedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EntityLegalDetails Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('get: returns null when no details exist', async () => {
    mockPrisma.entityLegalDetails.findUnique.mockResolvedValue(null);
    const result = await getEntityLegalDetails(ENTITY_ID);
    expect(result).toBeNull();
    expect(mockPrisma.entityLegalDetails.findUnique).toHaveBeenCalledWith({
      where: { entityId: ENTITY_ID },
    });
  });

  it('get: returns details when they exist', async () => {
    const existing = fakeLegalDetails();
    mockPrisma.entityLegalDetails.findUnique.mockResolvedValue(existing);
    const result = await getEntityLegalDetails(ENTITY_ID);
    expect(result).toEqual(existing);
  });

  it('upsert: creates row when none exists (audit action = create)', async () => {
    mockPrisma.entity.findUniqueOrThrow.mockResolvedValue(fakeEntity());
    mockPrisma.entityLegalDetails.findUnique.mockResolvedValue(null);
    const created = fakeLegalDetails();
    mockPrisma.entityLegalDetails.upsert.mockResolvedValue(created);

    const result = await upsertEntityLegalDetails({
      entityId: ENTITY_ID,
      taxId: '300000000000003',
      registrationNumber: 'CR-1234567890',
      jurisdiction: 'KSA',
      registeredAddress: 'Riyadh',
      updatedBy: ACTOR,
    });

    expect(result).toEqual(created);
    expect(mockPrisma.entityLegalDetails.upsert).toHaveBeenCalledTimes(1);
    expect(mockAuditLog).toHaveBeenCalledTimes(1);
    expect(mockAuditLog.mock.calls[0]![0].action).toBe('entity_legal_details.create');
  });

  it('upsert: updates existing row (audit action = update)', async () => {
    mockPrisma.entity.findUniqueOrThrow.mockResolvedValue(fakeEntity());
    const existing = fakeLegalDetails();
    mockPrisma.entityLegalDetails.findUnique.mockResolvedValue(existing);
    const updated = fakeLegalDetails({ taxId: '300000000000099' });
    mockPrisma.entityLegalDetails.upsert.mockResolvedValue(updated);

    const result = await upsertEntityLegalDetails({
      entityId: ENTITY_ID,
      taxId: '300000000000099',
      updatedBy: ACTOR,
    });

    expect(result.taxId).toBe('300000000000099');
    expect(mockAuditLog.mock.calls[0]![0].action).toBe('entity_legal_details.update');
  });

  it('upsert: rejects when entity is archived', async () => {
    mockPrisma.entity.findUniqueOrThrow.mockResolvedValue(fakeEntity({ status: 'archived' }));

    await expect(
      upsertEntityLegalDetails({ entityId: ENTITY_ID, updatedBy: ACTOR }),
    ).rejects.toThrow(/archived/);

    expect(mockPrisma.entityLegalDetails.upsert).not.toHaveBeenCalled();
    expect(mockAuditLog).not.toHaveBeenCalled();
  });

  it('delete: removes the row', async () => {
    const existing = fakeLegalDetails();
    mockPrisma.entityLegalDetails.findUnique.mockResolvedValue(existing);
    mockPrisma.entityLegalDetails.delete.mockResolvedValue(existing);

    await deleteEntityLegalDetails(ENTITY_ID, ACTOR);

    expect(mockPrisma.entityLegalDetails.delete).toHaveBeenCalledWith({
      where: { entityId: ENTITY_ID },
    });
    expect(mockAuditLog).toHaveBeenCalledTimes(1);
    expect(mockAuditLog.mock.calls[0]![0].action).toBe('entity_legal_details.delete');
  });

  it('delete: throws when no row exists', async () => {
    mockPrisma.entityLegalDetails.findUnique.mockResolvedValue(null);

    await expect(deleteEntityLegalDetails(ENTITY_ID, ACTOR)).rejects.toThrow(
      /No legal details exist/,
    );

    expect(mockPrisma.entityLegalDetails.delete).not.toHaveBeenCalled();
    expect(mockAuditLog).not.toHaveBeenCalled();
  });
});
