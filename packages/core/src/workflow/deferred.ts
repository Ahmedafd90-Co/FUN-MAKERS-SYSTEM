/**
 * PIC-80 — outbox-ready deferred workflow-event dispatch.
 *
 * Atomicity fix for create+autoSeed. When a workflow is started inside an outer
 * transaction (entity create + workflow_instance create committed as ONE atomic
 * unit), the 'workflow.started' event must NOT fire inline — its handlers send
 * email (a non-rollback-able side effect). `startInstance` therefore returns a
 * deferred descriptor instead of emitting; the caller dispatches it via
 * `dispatchDeferred` AFTER the transaction commits, so a rollback leaks nothing
 * (no false atomicity).
 *
 * This function is the SINGLE outbox swap-point (PIC-80 ruling ce09edc9, Option 1):
 * a future transactional outbox (record intent in-tx → dispatch after commit)
 * replaces exactly this body without touching any call site.
 *
 * RESIDUAL RISK (Option 1, accepted/revisitable): a process crash between the
 * transaction commit and this emit drops the notification. Acceptable now —
 * the entity + workflow_instance are durably committed (the data-integrity goal);
 * only the notification is at risk, and the My-Approvals query still surfaces the
 * pending step. Upgrading to a true outbox closes this gap via this same seam.
 */
import * as workflowEvents from './events';
import type { WorkflowEventName, WorkflowEventPayload } from '@fmksa/contracts';

export type DeferredWorkflowEvent = {
  name: WorkflowEventName;
  payload: WorkflowEventPayload;
};

/**
 * Publish a deferred workflow event after its originating transaction has
 * committed. `null`/`undefined` = nothing to dispatch (no-op) — e.g. no template
 * configured, or a swallowed TemplateNotActive/Duplicate.
 */
export async function dispatchDeferred(
  deferred: DeferredWorkflowEvent | null | undefined,
): Promise<void> {
  if (!deferred) return;
  await workflowEvents.emit(deferred.name, deferred.payload);
}
