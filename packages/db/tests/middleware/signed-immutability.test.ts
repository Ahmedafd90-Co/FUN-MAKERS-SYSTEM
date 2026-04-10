import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/client';
import {
  cleanTestData,
  createTestDocumentWithVersion,
  createTestEntity,
  createTestProject,
  createTestUser,
} from '../helpers/test-data';

describe('signed-version immutability', () => {
  let userId: string;
  let projectId: string;

  beforeAll(async () => {
    await cleanTestData();
    const user = await createTestUser();
    userId = user.id;
    const entity = await createTestEntity();
    const project = await createTestProject(entity.id);
    projectId = project.id;
  });

  afterAll(async () => {
    await cleanTestData();
  });

  it('rejects UPDATE on a signed version (non-supersession field)', async () => {
    const { version } = await createTestDocumentWithVersion(
      projectId,
      userId,
      true,
    );

    await expect(
      prisma.documentVersion.update({
        where: { id: version.id },
        data: { fileKey: 'files/tampered.pdf' },
      }),
    ).rejects.toThrow(/Cannot modify signed document version/);
  });

  it('rejects UPDATE of multiple disallowed fields on a signed version', async () => {
    const { version } = await createTestDocumentWithVersion(
      projectId,
      userId,
      true,
    );

    await expect(
      prisma.documentVersion.update({
        where: { id: version.id },
        data: { fileHash: 'sha256-evil', mimeType: 'text/plain' },
      }),
    ).rejects.toThrow(/Disallowed fields: fileHash, mimeType/);
  });

  it('allows UPDATE of supersededAt on a signed version', async () => {
    const { version: signedVersion } = await createTestDocumentWithVersion(
      projectId,
      userId,
      true,
    );

    // Create a second version to supersede with
    const { version: newVersion } = await createTestDocumentWithVersion(
      projectId,
      userId,
      false,
    );

    const updated = await prisma.documentVersion.update({
      where: { id: signedVersion.id },
      data: {
        supersededAt: new Date(),
        supersededByVersionId: newVersion.id,
      },
    });

    expect(updated.supersededAt).not.toBeNull();
    expect(updated.supersededByVersionId).toBe(newVersion.id);
  });

  it('allows UPDATE on an unsigned version', async () => {
    const { version } = await createTestDocumentWithVersion(
      projectId,
      userId,
      false,
    );

    const updated = await prisma.documentVersion.update({
      where: { id: version.id },
      data: { fileKey: 'files/new-path.pdf' },
    });

    expect(updated.fileKey).toBe('files/new-path.pdf');
  });

  it('rejects DELETE on a signed version', async () => {
    const { version } = await createTestDocumentWithVersion(
      projectId,
      userId,
      true,
    );

    await expect(
      prisma.documentVersion.delete({ where: { id: version.id } }),
    ).rejects.toThrow(/Cannot delete a signed document version/);
  });

  it('allows DELETE on an unsigned version', async () => {
    const { version } = await createTestDocumentWithVersion(
      projectId,
      userId,
      false,
    );

    const deleted = await prisma.documentVersion.delete({
      where: { id: version.id },
    });

    expect(deleted.id).toBe(version.id);
  });
});
