/**
 * ProjectVendor service — project-scoped junction CRUD.
 *
 * Phase 4, Task 4.4 — Module 3 Procurement Engine.
 */
import { prisma } from '@fmksa/db';
import { auditService } from '../../audit/service';
import { assertProjectScope } from '../../scope-binding';

// ---------------------------------------------------------------------------
// Link vendor to project
// ---------------------------------------------------------------------------

export async function linkVendorToProject(
  input: { projectId: string; vendorId: string },
  actorUserId: string,
) {
  // Validate vendor exists
  const vendor = await prisma.vendor.findUniqueOrThrow({
    where: { id: input.vendorId },
  });

  // Validate vendor belongs to the project's entity
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: input.projectId },
    select: { entityId: true },
  });

  if (vendor.entityId !== project.entityId) {
    throw new Error('Cannot link vendor to project: vendor does not belong to the same entity.');
  }

  const projectVendor = await prisma.projectVendor.create({
    data: {
      projectId: input.projectId,
      vendorId: input.vendorId,
      status: 'active',
      approvedDate: new Date(),
    },
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'project_vendor.link',
    resourceType: 'project_vendor',
    resourceId: projectVendor.id,
    projectId: input.projectId,
    beforeJson: null,
    afterJson: projectVendor as any,
  });

  return projectVendor;
}

// ---------------------------------------------------------------------------
// Unlink vendor from project (soft removal)
// ---------------------------------------------------------------------------

export async function unlinkVendorFromProject(id: string, actorUserId: string, projectId?: string) {
  const existing = await prisma.projectVendor.findUniqueOrThrow({
    where: { id },
  });
  if (projectId) assertProjectScope(existing, projectId, 'ProjectVendor', id);

  const updated = await prisma.projectVendor.update({
    where: { id },
    data: { status: 'inactive' },
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'project_vendor.unlink',
    resourceType: 'project_vendor',
    resourceId: id,
    projectId: existing.projectId,
    beforeJson: existing as any,
    afterJson: updated as any,
  });

  return updated;
}

// ---------------------------------------------------------------------------
// List active vendors linked to project
// ---------------------------------------------------------------------------

export async function listProjectVendors(projectId: string) {
  return prisma.projectVendor.findMany({
    where: { projectId, status: 'active' },
    include: { vendor: true },
    orderBy: { createdAt: 'desc' },
  });
}

// ---------------------------------------------------------------------------
// Get
// ---------------------------------------------------------------------------

export async function getProjectVendor(id: string, projectId?: string) {
  const record = await prisma.projectVendor.findUniqueOrThrow({
    where: { id },
    include: { vendor: true },
  });
  if (projectId) assertProjectScope(record, projectId, 'ProjectVendor', id);
  return record;
}
