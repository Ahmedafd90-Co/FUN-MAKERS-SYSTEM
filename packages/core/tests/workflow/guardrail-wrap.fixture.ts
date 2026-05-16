/**
 * PIC-49 — Regression fixture for the engine-scoping guard.
 *
 * Three deliberately-named functions that exercise the three wrap patterns
 * the guard must classify:
 *
 *   1. wrapOutsideTransaction      — CORRECT. runAsWorkflowEngine wraps the
 *                                    whole prisma.$transaction call from
 *                                    outside; ALS propagates; status write
 *                                    succeeds.
 *
 *   2. noWrap                      — BROKEN (obvious case). No
 *                                    runAsWorkflowEngine anywhere; status
 *                                    write throws PIC-35 guardrail.
 *
 *   3. wrapInsideTransaction       — BROKEN (silent case). runAsWorkflowEngine
 *                                    is called INSIDE the $transaction
 *                                    callback. AsyncLocalStorage doesn't
 *                                    propagate across Prisma's `tx` callback
 *                                    boundary when set inside; status write
 *                                    throws PIC-35 guardrail.
 *
 * The engine-scoping guard (engine-scoping-guard.test.ts) asserts:
 *
 *   - behavioural test: pattern 1 succeeds; patterns 2 and 3 throw the
 *     PIC-35 guardrail error.
 *   - static AST test: pattern 1 is classified ENGINE_SCOPED; patterns 2
 *     and 3 are classified MISSING_WRAP and WRAP_INSIDE_TX respectively.
 *
 * Without these three patterns being exercised AND classified correctly, the
 * guard has no proof it catches the silent failure mode (PR #39's
 * commit aeabac9). The fixture is load-bearing: do not delete or weaken.
 *
 * IMPORTANT: This file imports prisma + runAsWorkflowEngine, but the
 * functions are NOT exported as production callers. They exist only to be
 * driven by the engine-scoping guard test. The static AST guard scans only
 * production paths (packages/core/src/**) — this test file is not scanned.
 */
import { prisma, runAsWorkflowEngine } from '@fmksa/db';

/**
 * CORRECT pattern — runAsWorkflowEngine wraps prisma.$transaction from outside.
 * ALS propagates through the tx callback. Status write authorized.
 */
export async function wrapOutsideTransaction(ipaId: string, newStatus: string) {
  return runAsWorkflowEngine(() =>
    prisma.$transaction(async (tx) => {
      return tx.ipa.update({
        where: { id: ipaId },
        data: { status: newStatus as any },
      });
    }),
  );
}

/**
 * BROKEN pattern — no runAsWorkflowEngine anywhere. Obvious bypass.
 * Guardrail throws on the status write.
 */
export async function noWrap(ipaId: string, newStatus: string) {
  return prisma.$transaction(async (tx) => {
    return tx.ipa.update({
      where: { id: ipaId },
      data: { status: newStatus as any },
    });
  });
}

/**
 * BROKEN pattern — runAsWorkflowEngine wraps the inner update, INSIDE the
 * $transaction callback. ALS does NOT propagate; guardrail throws. This is
 * the silent failure mode PR-W3-GuardrailFix (PR #39) hit on the first
 * attempt at site #6 (invoice-collection). Reproduced here as fixture so
 * the guard can prove it catches it.
 */
export async function wrapInsideTransaction(ipaId: string, newStatus: string) {
  return prisma.$transaction(async (tx) => {
    return runAsWorkflowEngine(() =>
      tx.ipa.update({
        where: { id: ipaId },
        data: { status: newStatus as any },
      }),
    );
  });
}
