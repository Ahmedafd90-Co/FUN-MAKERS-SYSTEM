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
