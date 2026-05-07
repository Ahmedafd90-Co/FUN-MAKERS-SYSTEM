/**
 * PIC-35 — wire workflow handlers at production startup.
 *
 * `registerWorkflowNotificationHandlers()` registers BOTH:
 *   1. Convergence handlers — sync workflow.approved → entity.status='approved_internal' etc.
 *      (`packages/core/src/workflow/convergence-handlers.ts` — handlers existed
 *      since Module 2 but were never wired in production. Tests called them
 *      directly; production code never did. This is the cause of the entity-
 *      vs-workflow status drift PIC-35 was filed for.)
 *   2. Notification handlers — fan-out emails on workflow.started / .stepApproved
 *      / .approved / .rejected / .returned. Same registration gap; silently
 *      disabled in production for the same reason.
 *
 * Next.js 15+ runs `register()` once per server boot, before any request is
 * handled. The Node.js runtime guard prevents this from firing on the Edge
 * runtime where Prisma can't run.
 *
 * Idempotent — `registerWorkflowNotificationHandlers` short-circuits on the
 * second call (Next.js HMR re-evaluates this file on edits).
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerWorkflowNotificationHandlers } = await import(
      '@fmksa/core/notifications/event-handlers'
    );
    registerWorkflowNotificationHandlers();
  }
}
