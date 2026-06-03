/**
 * Scope-binding assertions — hardening patch H1.
 *
 * Every service get/update/transition/delete must verify the fetched record
 * belongs to the caller's validated scope. These helpers enforce that.
 */

export class ScopeMismatchError extends Error {
  constructor(recordType: string, recordId: string, scopeField: string) {
    super(`${recordType} '${recordId}' does not belong to the expected ${scopeField}.`);
    this.name = 'ScopeMismatchError';
  }
}

/** Assert a project-scoped record belongs to the caller's project. */
export function assertProjectScope(
  record: { projectId: string },
  expectedProjectId: string,
  recordType: string,
  recordId: string,
): void {
  if (record.projectId !== expectedProjectId) {
    throw new ScopeMismatchError(recordType, recordId, 'project');
  }
}

/** Assert an entity-scoped record belongs to the caller's entity. */
export function assertEntityScope(
  record: { entityId: string },
  expectedEntityId: string,
  recordType: string,
  recordId: string,
): void {
  if (record.entityId !== expectedEntityId) {
    throw new ScopeMismatchError(recordType, recordId, 'entity');
  }
}

/**
 * Assert an org-scoped record belongs to the caller's organisation.
 *
 * PIC-71 PR-2 (β-sweep): companion to `assertProjectScope` / `assertEntityScope`
 * for by-id reads that bind at the org layer rather than project/entity. Used
 * by service fns whose routers do org-only checks (e.g.
 * `assertRecordOrgOrNotFound`/`assertEntityInOrg`). The service adds its own
 * org assert so the static-AST guard sees it AND a future router refactor
 * cannot silently un-protect the read (PD 6fec748d Path A belt-and-suspenders).
 *
 * The guard's accepted idioms must include this helper — see PD ruling
 * cad2d0cc Q2: "the guard must KNOW and ACCEPT the org helpers or it'll
 * false-RED the F3 enforcement code itself and false-GREEN any future
 * org-only by-id read."
 */
export function assertOrgScope(
  record: { orgId: string },
  expectedOrgId: string,
  recordType: string,
  recordId: string,
): void {
  if (record.orgId !== expectedOrgId) {
    throw new ScopeMismatchError(recordType, recordId, 'org');
  }
}
