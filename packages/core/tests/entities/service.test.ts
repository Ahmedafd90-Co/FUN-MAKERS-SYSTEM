import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@fmksa/db';
import { entitiesService } from '../../src/entities/service';
import {
  getAncestors,
  getDescendants,
  getSiblings,
} from '../../src/entities/hierarchy';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let testUser: { id: string };
const ts = Date.now();

beforeAll(async () => {
  await (prisma as any).$executeRaw`TRUNCATE TABLE audit_logs CASCADE`;

  testUser = await prisma.user.create({
    data: {
      email: `ent-test-${ts}@test.com`,
      name: 'Entity Test User',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });
});

afterAll(async () => {
  // Delete entities in reverse order (children first)
  await prisma.entity.deleteMany({
    where: { code: { startsWith: `ET-${ts}` } },
  });
  await prisma.user.deleteMany({
    where: { email: `ent-test-${ts}@test.com` },
  });
});

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

describe('entitiesService', () => {
  it('creates a parent entity', async () => {
    const entity = await entitiesService.createEntity({
      code: `ET-${ts}-P1`,
      name: 'Parent Corp',
      type: 'parent',
      createdBy: testUser.id,
    });

    expect(entity.id).toBeDefined();
    expect(entity.code).toBe(`ET-${ts}-P1`);
    expect(entity.type).toBe('parent');
    expect(entity.status).toBe('active');
    expect(entity.parentEntityId).toBeNull();
  });

  it('creates a subsidiary under a parent', async () => {
    const parent = await entitiesService.createEntity({
      code: `ET-${ts}-P2`,
      name: 'Parent 2',
      type: 'parent',
      createdBy: testUser.id,
    });

    const sub = await entitiesService.createEntity({
      code: `ET-${ts}-S1`,
      name: 'Subsidiary 1',
      type: 'subsidiary',
      parentEntityId: parent.id,
      createdBy: testUser.id,
    });

    expect(sub.parentEntityId).toBe(parent.id);
    expect(sub.type).toBe('subsidiary');
  });

  it('rejects duplicate code', async () => {
    await expect(
      entitiesService.createEntity({
        code: `ET-${ts}-P1`,
        name: 'Duplicate',
        type: 'parent',
        createdBy: testUser.id,
      }),
    ).rejects.toThrow(/already exists/);
  });

  it('rejects parent type with parentEntityId', async () => {
    const someParent = await prisma.entity.findFirst({
      where: { code: `ET-${ts}-P1` },
    });

    await expect(
      entitiesService.createEntity({
        code: `ET-${ts}-BAD1`,
        name: 'Bad Parent',
        type: 'parent',
        parentEntityId: someParent!.id,
        createdBy: testUser.id,
      }),
    ).rejects.toThrow(/cannot have a parentEntityId/);
  });

  it('rejects subsidiary without parentEntityId', async () => {
    await expect(
      entitiesService.createEntity({
        code: `ET-${ts}-BAD2`,
        name: 'Bad Subsidiary',
        type: 'subsidiary',
        createdBy: testUser.id,
      }),
    ).rejects.toThrow(/must have a parentEntityId/);
  });

  it('updates an entity', async () => {
    const entity = await entitiesService.createEntity({
      code: `ET-${ts}-UPD`,
      name: 'Before',
      type: 'branch',
      createdBy: testUser.id,
    });

    const updated = await entitiesService.updateEntity(
      entity.id,
      { name: 'After' },
      testUser.id,
    );

    expect(updated.name).toBe('After');
  });

  it('archives an entity with reason', async () => {
    const entity = await entitiesService.createEntity({
      code: `ET-${ts}-ARCH`,
      name: 'To Archive',
      type: 'branch',
      createdBy: testUser.id,
    });

    const archived = await entitiesService.archiveEntity(
      entity.id,
      'Closing branch',
      testUser.id,
    );
    expect(archived.status).toBe('archived');
  });

  it('rejects archive without reason', async () => {
    const entity = await entitiesService.createEntity({
      code: `ET-${ts}-ARCH2`,
      name: 'No Reason',
      type: 'branch',
      createdBy: testUser.id,
    });

    await expect(
      entitiesService.archiveEntity(entity.id, '', testUser.id),
    ).rejects.toThrow(/reason is required/i);
  });

  it('getEntity includes parent and children', async () => {
    const parent = await entitiesService.createEntity({
      code: `ET-${ts}-GP`,
      name: 'Get Parent',
      type: 'parent',
      createdBy: testUser.id,
    });

    await entitiesService.createEntity({
      code: `ET-${ts}-GC`,
      name: 'Get Child',
      type: 'subsidiary',
      parentEntityId: parent.id,
      createdBy: testUser.id,
    });

    const result = await entitiesService.getEntity(parent.id);
    expect(result.children.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Hierarchy helpers
// ---------------------------------------------------------------------------

describe('hierarchy helpers', () => {
  let rootId: string;
  let midId: string;
  let leafId: string;
  let siblingId: string;

  beforeAll(async () => {
    const root = await entitiesService.createEntity({
      code: `ET-${ts}-HR`,
      name: 'Root',
      type: 'parent',
      createdBy: testUser.id,
    });
    rootId = root.id;

    const mid = await entitiesService.createEntity({
      code: `ET-${ts}-HM`,
      name: 'Mid',
      type: 'subsidiary',
      parentEntityId: rootId,
      createdBy: testUser.id,
    });
    midId = mid.id;

    const leaf = await entitiesService.createEntity({
      code: `ET-${ts}-HL`,
      name: 'Leaf',
      type: 'branch',
      parentEntityId: midId,
      createdBy: testUser.id,
    });
    leafId = leaf.id;

    const sibling = await entitiesService.createEntity({
      code: `ET-${ts}-HS`,
      name: 'Sibling',
      type: 'branch',
      parentEntityId: midId,
      createdBy: testUser.id,
    });
    siblingId = sibling.id;
  });

  it('getAncestors returns ordered path from root', async () => {
    const ancestors = await getAncestors(leafId);
    expect(ancestors.length).toBe(2);
    expect(ancestors[0]!.id).toBe(rootId);
    expect(ancestors[1]!.id).toBe(midId);
  });

  it('getAncestors returns empty for root', async () => {
    const ancestors = await getAncestors(rootId);
    expect(ancestors).toHaveLength(0);
  });

  it('getDescendants returns flat list with depth', async () => {
    const desc = await getDescendants(rootId);
    expect(desc.length).toBeGreaterThanOrEqual(3); // mid + leaf + sibling
    const midNode = desc.find((d) => d.id === midId);
    expect(midNode?.depth).toBe(1);
    const leafNode = desc.find((d) => d.id === leafId);
    expect(leafNode?.depth).toBe(2);
  });

  it('getSiblings excludes the entity itself', async () => {
    const siblings = await getSiblings(leafId);
    expect(siblings.some((s) => s.id === siblingId)).toBe(true);
    expect(siblings.some((s) => s.id === leafId)).toBe(false);
  });
});
