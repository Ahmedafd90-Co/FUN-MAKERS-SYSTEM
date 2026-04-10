/**
 * Workflow event bus — typed in-process event emitter.
 *
 * Deliberately "boring": no Kafka, no Redis pub/sub. A simple Map of
 * event-name → handler arrays. Phase 1.8 (notifications) will subscribe
 * to these events. Handlers are called sequentially; errors are logged
 * but do not crash the emitter.
 */

import type { WorkflowEventName, WorkflowEventPayload } from '@fmksa/contracts';

const handlers = new Map<
  WorkflowEventName,
  Array<(payload: WorkflowEventPayload) => Promise<void>>
>();

/**
 * Register a handler for a workflow event.
 */
export function on(
  event: WorkflowEventName,
  handler: (payload: WorkflowEventPayload) => Promise<void>,
) {
  if (!handlers.has(event)) handlers.set(event, []);
  handlers.get(event)!.push(handler);
}

/**
 * Emit a workflow event. All registered handlers are invoked sequentially.
 * Errors in individual handlers are logged but do not prevent remaining
 * handlers from executing.
 */
export async function emit(
  event: WorkflowEventName,
  payload: WorkflowEventPayload,
) {
  const eventHandlers = handlers.get(event) ?? [];
  for (const handler of eventHandlers) {
    try {
      await handler(payload);
    } catch (err) {
      console.error(`[workflow-event] Error in handler for ${event}:`, err);
      // Don't crash the emitter — log and continue
    }
  }
}

/**
 * Remove all registered handlers. Used in tests to prevent handler leakage
 * between test cases.
 */
export function clearHandlers() {
  handlers.clear();
}
