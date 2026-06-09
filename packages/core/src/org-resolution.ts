import { prisma } from '@fmksa/db';

/**
 * PIC-108 (Phase MT cutover) — resolve a project's `orgId` for tenant-write
 * attribution.
 *
 * The record being created belongs to `projectId`; its `orgId` is therefore the
 * project's `orgId`. This is the established supply pattern already used inline
 * by the MT-safe sites (e.g. `procurement/rfq/service.ts`,
 * `commercial/reference-number/service.ts`,
 * `procurement/vendor-contract/service.ts`) — extracted here so the 33 cutover
 * sites (PIC-108 B–F) share ONE idiom instead of duplicating it.
 *
 * SAFE by-id read: `id` IS the projectProcedure-validated scope at the call
 * chokepoint (same justification as `projects/service.ts:getProject`), so an
 * assert would be a tautology. The write-side guard (PIC-108-A) enforces that
 * every tenant-model create supplies the resulting `orgId`.
 *
 * Pass the transaction client when called inside a `prisma.$transaction` so the
 * read participates in the same transaction; otherwise it defaults to `prisma`.
 */
type ProjectOrgReader = {
  project: {
    findUniqueOrThrow: (args: {
      where: { id: string };
      select: { orgId: true };
    }) => Promise<{ orgId: string }>;
  };
};

export async function resolveProjectOrgId(
  projectId: string,
  client: unknown = prisma,
): Promise<string> {
  const { orgId } = await (client as ProjectOrgReader).project.findUniqueOrThrow({
    where: { id: projectId },
    select: { orgId: true },
  });
  return orgId;
}

/**
 * PIC-108-C — entity-scoped sibling of {@link resolveProjectOrgId}. Vendor,
 * ItemCatalog and ProcurementCategory are ENTITY-scoped (no `projectId`), so
 * their `orgId` is the entity's `orgId` — the established pattern already used
 * inline by `procurement/framework-agreement/service.ts`. Same SAFE by-id read
 * justification: `id` is the entity-scope chokepoint; the write-side guard
 * (PIC-108-A) enforces that the resulting `orgId` is supplied.
 */
type EntityOrgReader = {
  entity: {
    findUniqueOrThrow: (args: {
      where: { id: string };
      select: { orgId: true };
    }) => Promise<{ orgId: string }>;
  };
};

export async function resolveEntityOrgId(
  entityId: string,
  client: unknown = prisma,
): Promise<string> {
  const { orgId } = await (client as EntityOrgReader).entity.findUniqueOrThrow({
    where: { id: entityId },
    select: { orgId: true },
  });
  return orgId;
}
