/**
 * Workflow status write guard (PIC-35 Step 7).
 *
 * Direct writes to `status` on the 13 workflow-driven entities are NOT
 * permitted outside the trusted layer. This extension throws on such
 * writes via `update`, `updateMany`, or `upsert`. (Initial `create()`
 * writes are allowed — initial state must be settable.)
 *
 * THERE ARE ONLY TWO BYPASSES. Do not add a third:
 *
 *   1. runAsWorkflowEngine(async () => { ... }) — the AsyncLocalStorage
 *      wrapper used by the trusted write path. Two callers qualify:
 *        a. Workflow convergence handlers (writing entity.status on
 *           workflow.approved / .returned / .rejected events).
 *        b. Entity-level transition services writing POST-workflow
 *           lifecycle states (e.g. variation's issued / client_approved;
 *           IPA's terminal transitions). The workflow engine has nothing
 *           to say about these, but they're still authorized writes by
 *           the system code that owns each entity's lifecycle past
 *           approval.
 *      Function name preserves the original PIC-35 design intent
 *      ("workflow engine marker"); expanded scope covers both classes
 *      of authorized writer.
 *
 *   2. SEED_CONTEXT=true env flag — set by `pnpm db:seed` (and the
 *      backfill / qa-fixture variants) so seed authoring can write
 *      synthetic statuses directly. Set via package.json script env
 *      ONLY; never inside app code.
 *
 * If you are about to add a bypass: STOP. The drift class this prevents
 * (entity status diverging from workflow_instances) is exactly what
 * PIC-35 fixed at significant cost. Adding a third bypass restores the
 * bug. If your use case genuinely needs a new path, file a Linear
 * ticket and propose the bypass for explicit review. Do not silently
 * add it.
 */

import { Prisma } from '@prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The 13 workflow-driven entity models (Prisma model names, Pascal case).
 * Status writes on these tables go through `runAsWorkflowEngine` or fail.
 */
const WORKFLOW_DRIVEN_MODELS = [
  // 8 auto-start (workflow.start fires on entity submit)
  'Ipa',
  'Ipc',
  'Variation',
  'Correspondence',
  'Expense',
  'PurchaseOrder',
  'RFQ',
  'SupplierInvoice',
  // 5 manual-start (workflow_instance auto-seeded on entity create, PR-W2A Step 5)
  'CostProposal',
  'TaxInvoice',
  'VendorContract',
  'FrameworkAgreement',
  'CreditNote',
] as const;

const WORKFLOW_MODEL_SET = new Set<string>(WORKFLOW_DRIVEN_MODELS);

// AsyncLocalStorage scopes the "authorized writer" flag to the async
// context tree, avoiding the data race that would arise from a module-
// level boolean flag under concurrent writes.
const workflowEngineContext = new AsyncLocalStorage<true>();

/**
 * Bypass #1 — run code inside this wrapper to authorize status writes
 * to workflow-driven tables within. See file header for the only-two-
 * bypasses contract.
 *
 * Callers:
 *   - packages/core/src/workflow/convergence-handlers.ts (dispatcher
 *     wraps the per-event handler chain)
 *   - The 8 entity transition services that own post-workflow lifecycle
 *     (IPA, IPC, Variation, Correspondence, Expense, PurchaseOrder, RFQ,
 *     SupplierInvoice — wrap the transitionXXX function body)
 *
 * @returns the wrapped fn's result, with the workflow-engine flag set
 *   in the async context for the duration.
 */
export function runAsWorkflowEngine<T>(fn: () => Promise<T>): Promise<T> {
  return workflowEngineContext.run(true, fn);
}

function isInWorkflowEngineScope(): boolean {
  return workflowEngineContext.getStore() === true;
}

function isSeedContext(): boolean {
  return process.env.SEED_CONTEXT === 'true';
}

function dataHasStatus(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  // Treat `{status: undefined}` as "no status write" — Prisma itself skips
  // undefined values, so flagging them would block legitimate non-status updates.
  const record = data as Record<string, unknown>;
  return 'status' in record && record.status !== undefined;
}

function guardError(model: string, operation: string): Error {
  return new Error(
    `PIC-35 guardrail: direct \`status\` write to ${model} via ${operation} is not allowed outside the workflow engine. ` +
      `Use runAsWorkflowEngine() from @fmksa/db (convergence handlers and entity transition services) ` +
      `or set SEED_CONTEXT=true (seed authoring). These are the only two bypasses; see ` +
      `packages/db/src/middleware/no-direct-status-write.ts header for the contract.`,
  );
}

/**
 * Prisma Client Extension that blocks direct `status` writes on the 13
 * workflow-driven entities unless either bypass is active.
 *
 * Hooks: update, updateMany, upsert. (Not create — initial state writes
 * are intentional.)
 */
export const noDirectStatusWriteExtension = Prisma.defineExtension({
  name: 'no-direct-status-write',
  query: {
    $allModels: {
      async update({ model, args, query }) {
        if (
          WORKFLOW_MODEL_SET.has(model) &&
          dataHasStatus((args as { data?: unknown }).data) &&
          !isInWorkflowEngineScope() &&
          !isSeedContext()
        ) {
          throw guardError(model, 'update');
        }
        return query(args);
      },
      async updateMany({ model, args, query }) {
        if (
          WORKFLOW_MODEL_SET.has(model) &&
          dataHasStatus((args as { data?: unknown }).data) &&
          !isInWorkflowEngineScope() &&
          !isSeedContext()
        ) {
          throw guardError(model, 'updateMany');
        }
        return query(args);
      },
      async upsert({ model, args, query }) {
        const u = args as { update?: unknown; create?: unknown };
        const writesStatus = dataHasStatus(u.update) || dataHasStatus(u.create);
        if (
          WORKFLOW_MODEL_SET.has(model) &&
          writesStatus &&
          !isInWorkflowEngineScope() &&
          !isSeedContext()
        ) {
          throw guardError(model, 'upsert');
        }
        return query(args);
      },
    },
  },
});
