/**
 * PIC-49 — Structural guard: every workflow-managed transition is engine-scoped.
 *
 * Two complementary checks, both load-bearing:
 *
 *   1. Static AST check — TypeScript compiler API walks each of the 13
 *      transition service files. For every prisma.<entity>.update / updateMany
 *      / upsert call site, ancestor-walks to verify:
 *        (a) a runAsWorkflowEngine call is an enclosing ancestor (engine-
 *            scoped), AND
 *        (b) the wrap is NOT inside a prisma.$transaction callback (i.e.
 *            no $transaction CallExpression appears between the
 *            runAsWorkflowEngine ancestor and the update call — the
 *            inside-$transaction silent failure mode from commit aeabac9).
 *
 *   2. Behavioural check — for each of the 13 entities, drive a non-
 *      WORKFLOW_MANAGED_ACTIONS action that writes status. Assert no
 *      PIC-35 guardrail throw. The PIC-35 Step 7 guardrail extension IS
 *      the oracle — if the wrap doesn't propagate ALS correctly through
 *      the runtime call stack, the extension throws and this test fails.
 *      Cannot have false negatives on the silent failure mode because it
 *      tests runtime behaviour, not lexical shape.
 *
 * Both checks parameterise over the same 13-entity table. The regression
 * fixture (guardrail-wrap.fixture.ts) proves both checks catch the two
 * broken patterns (no-wrap, inside-$transaction-wrap) — without that
 * proof, the guard has no evidence it catches the bug it exists for.
 *
 * Important: this guard exists because PR-W2A Step 10's "wrapped-write
 * smoke" used substring includes() — passes on token presence even if the
 * token is in the wrong position. PIC-47 was the consequence (5 services
 * missed for ~24 hours). PIC-49 closes that recurrence surface.
 *
 * IMPORTANT honesty note (per Condition 2 of the proceed-conditions): the
 * static AST check proves the three NAMED patterns. It does not model
 * wrap-via-helper, re-exported wrappers, conditional-branch wraps, or
 * nested $transaction. For indirections it doesn't model, the behavioural
 * check is the real guarantee.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as ts from 'typescript';
import { prisma, runAsWorkflowEngine, SINGLETON_ORG_ID } from '@fmksa/db';
import { assertTestDb } from '../helpers/assert-test-db';
import {
  wrapOutsideTransaction,
  noWrap,
  wrapInsideTransaction,
} from './guardrail-wrap.fixture';

// ---------------------------------------------------------------------------
// The 13 workflow-managed entity table — must match
// packages/db/src/middleware/no-direct-status-write.ts WORKFLOW_DRIVEN_MODELS
// ---------------------------------------------------------------------------

interface EntityDescriptor {
  /** Display name for test naming + error messages. */
  name: string;
  /** Prisma model identifier as used in `prisma.<this>.update(...)` (camelCase). */
  prismaModel: string;
  /** Absolute-style path to the transition service file (from repo root). */
  servicePath: string;
  /** Initial status of the per-test fixture entity created in beforeAll. */
  initialStatus: string;
  /** Non-WORKFLOW_MANAGED_ACTIONS action that writes status, reachable from initialStatus. */
  action: string;
  /** Expected status after the action — the behavioural assertion target. */
  expectedStatusAfter: string;
  /**
   * Calls the transition service for this entity with the given entityId +
   * action. Per-entity adapter because each transition*() has its own
   * argument shape (some take (id, action, actorUserId, ...), some take
   * (params: { id, action, ... }, actorUserId)).
   * Returns a Promise that resolves on success and rejects on guardrail
   * throw (the behavioural test's signal).
   */
  callTransition: (
    entityId: string,
    action: string,
    actorUserId: string,
    projectId: string,
    entityRecordEntityId: string,
  ) => Promise<unknown>;
}

const ENTITIES: ReadonlyArray<EntityDescriptor> = [
  {
    name: 'IPA',
    prismaModel: 'ipa',
    servicePath: 'packages/core/src/commercial/ipa/service.ts',
    initialStatus: 'draft',
    action: 'submit',
    expectedStatusAfter: 'submitted',
    callTransition: async (id, action, actorUserId, projectId) => {
      const { transitionIpa } = await import('../../src/commercial/ipa/service');
      return transitionIpa(id, action, actorUserId, undefined, projectId);
    },
  },
  {
    name: 'IPC',
    prismaModel: 'ipc',
    servicePath: 'packages/core/src/commercial/ipc/service.ts',
    initialStatus: 'draft',
    action: 'submit',
    expectedStatusAfter: 'submitted',
    callTransition: async (id, action, actorUserId, projectId) => {
      const { transitionIpc } = await import('../../src/commercial/ipc/service');
      return transitionIpc(id, action, actorUserId, undefined, projectId);
    },
  },
  {
    name: 'Variation',
    prismaModel: 'variation',
    servicePath: 'packages/core/src/commercial/variation/service.ts',
    initialStatus: 'draft',
    action: 'submit',
    expectedStatusAfter: 'submitted',
    callTransition: async (id, action, actorUserId, projectId) => {
      const { transitionVariation } = await import('../../src/commercial/variation/service');
      // (id, action, actorUserId, comment?, assessmentData?, projectId?)
      return transitionVariation(id, action, actorUserId, undefined, undefined, projectId);
    },
  },
  {
    name: 'Correspondence',
    prismaModel: 'correspondence',
    servicePath: 'packages/core/src/commercial/correspondence/service.ts',
    initialStatus: 'draft',
    action: 'submit',
    expectedStatusAfter: 'under_review',
    callTransition: async (id, action, actorUserId, projectId) => {
      const { transitionCorrespondence } = await import('../../src/commercial/correspondence/service');
      return transitionCorrespondence(id, action, actorUserId, undefined, projectId);
    },
  },
  {
    name: 'CostProposal',
    prismaModel: 'costProposal',
    servicePath: 'packages/core/src/commercial/cost-proposal/service.ts',
    initialStatus: 'draft',
    action: 'submit',
    expectedStatusAfter: 'submitted',
    callTransition: async (id, action, actorUserId, projectId) => {
      const { transitionCostProposal } = await import('../../src/commercial/cost-proposal/service');
      return transitionCostProposal(id, action, actorUserId, undefined, undefined, projectId);
    },
  },
  {
    name: 'TaxInvoice',
    prismaModel: 'taxInvoice',
    servicePath: 'packages/core/src/commercial/tax-invoice/service.ts',
    initialStatus: 'draft',
    action: 'submit',
    expectedStatusAfter: 'under_review',
    callTransition: async (id, action, actorUserId, projectId) => {
      const { transitionTaxInvoice } = await import('../../src/commercial/tax-invoice/service');
      return transitionTaxInvoice(id, action, actorUserId, undefined, projectId);
    },
  },
  {
    name: 'Expense',
    prismaModel: 'expense',
    servicePath: 'packages/core/src/procurement/expense/service.ts',
    initialStatus: 'draft',
    action: 'submit',
    expectedStatusAfter: 'submitted',
    callTransition: async (id, action, actorUserId, projectId) => {
      const { transitionExpense } = await import('../../src/procurement/expense/service');
      return transitionExpense({ projectId, id, action }, actorUserId);
    },
  },
  {
    name: 'PurchaseOrder',
    prismaModel: 'purchaseOrder',
    servicePath: 'packages/core/src/procurement/purchase-order/service.ts',
    initialStatus: 'draft',
    action: 'submit',
    expectedStatusAfter: 'submitted',
    callTransition: async (id, action, actorUserId, projectId) => {
      const { transitionPurchaseOrder } = await import('../../src/procurement/purchase-order/service');
      return transitionPurchaseOrder({ projectId, id, action }, actorUserId);
    },
  },
  {
    name: 'RFQ',
    prismaModel: 'rFQ',
    servicePath: 'packages/core/src/procurement/rfq/service.ts',
    initialStatus: 'draft',
    action: 'submit',
    expectedStatusAfter: 'under_review',
    callTransition: async (id, action, actorUserId, projectId) => {
      const { transitionRfq } = await import('../../src/procurement/rfq/service');
      // (id, action, actorUserId, comment?, projectId?, awardData?)
      return transitionRfq(id, action, actorUserId, undefined, projectId);
    },
  },
  {
    name: 'SupplierInvoice',
    prismaModel: 'supplierInvoice',
    servicePath: 'packages/core/src/procurement/supplier-invoice/service.ts',
    initialStatus: 'received',
    action: 'review',
    expectedStatusAfter: 'under_review',
    callTransition: async (id, action, actorUserId, projectId) => {
      const { transitionSupplierInvoice } = await import('../../src/procurement/supplier-invoice/service');
      return transitionSupplierInvoice({ projectId, id, action }, actorUserId);
    },
  },
  {
    name: 'CreditNote',
    prismaModel: 'creditNote',
    servicePath: 'packages/core/src/procurement/credit-note/service.ts',
    initialStatus: 'received',
    action: 'verify',
    expectedStatusAfter: 'verified',
    callTransition: async (id, action, actorUserId, projectId) => {
      const { transitionCreditNote } = await import('../../src/procurement/credit-note/service');
      return transitionCreditNote({ projectId, id, action }, actorUserId);
    },
  },
  {
    name: 'VendorContract',
    prismaModel: 'vendorContract',
    servicePath: 'packages/core/src/procurement/vendor-contract/service.ts',
    initialStatus: 'draft',
    action: 'submit',
    expectedStatusAfter: 'under_review',
    callTransition: async (id, action, actorUserId, projectId) => {
      const { transitionVendorContract } = await import('../../src/procurement/vendor-contract/service');
      return transitionVendorContract(id, action, actorUserId, undefined, projectId);
    },
  },
  {
    name: 'FrameworkAgreement',
    prismaModel: 'frameworkAgreement',
    servicePath: 'packages/core/src/procurement/framework-agreement/service.ts',
    initialStatus: 'draft',
    action: 'submit',
    expectedStatusAfter: 'under_review',
    callTransition: async (id, action, actorUserId, _projectId, entityId) => {
      const { transitionFrameworkAgreement } = await import(
        '../../src/procurement/framework-agreement/service'
      );
      return transitionFrameworkAgreement(id, action, actorUserId, undefined, entityId);
    },
  },
] as const;

// ---------------------------------------------------------------------------
// Static AST check — classify wrap pattern for each prisma write site
// ---------------------------------------------------------------------------

type Classification = 'ENGINE_SCOPED' | 'MISSING_WRAP' | 'WRAP_INSIDE_TX';

interface WriteSite {
  line: number;
  column: number;
  prismaModel: string;
  classification: Classification;
  detail: string;
}

/** Read a TS source file and return its parsed SourceFile. */
function parseSource(filePath: string): ts.SourceFile {
  const text = readFileSync(filePath, 'utf-8');
  return ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, /*setParentNodes*/ true, ts.ScriptKind.TS);
}

/**
 * Returns the property-access prisma model from a CallExpression like
 * `prisma.ipa.update(...)` or `tx.ipa.update(...)` or `(tx as any).ipa.update(...)`.
 * Returns null if not a recognized status-write call.
 */
function getPrismaWriteModel(
  call: ts.CallExpression,
  targetModelLower: string,
): { model: string; method: string } | null {
  if (!ts.isPropertyAccessExpression(call.expression)) return null;
  const methodName = call.expression.name.text;
  if (methodName !== 'update' && methodName !== 'updateMany' && methodName !== 'upsert') {
    return null;
  }
  // call.expression.expression is the model: prisma.X / tx.X / (tx as any).X
  const inner = call.expression.expression;
  let modelName: string | null = null;
  if (ts.isPropertyAccessExpression(inner)) {
    // prisma.X or tx.X
    const receiver = inner.expression;
    const receiverName = ts.isIdentifier(receiver)
      ? receiver.text
      : ts.isParenthesizedExpression(receiver) &&
          ts.isAsExpression(receiver.expression) &&
          ts.isIdentifier(receiver.expression.expression)
        ? receiver.expression.expression.text
        : null;
    if (receiverName === 'prisma' || receiverName === 'tx') {
      modelName = inner.name.text;
    }
  }
  if (!modelName) return null;
  if (modelName.toLowerCase() !== targetModelLower.toLowerCase()) return null;
  return { model: modelName, method: methodName };
}

/**
 * Does this CallExpression argument list include a `status` key in its `data`
 * property literal? Returns true if it does. (Skip dynamic data spreads — the
 * static check is best-effort for those; behavioural test covers them.)
 */
function callDataIncludesStatus(call: ts.CallExpression): boolean {
  if (call.arguments.length === 0) return false;
  const arg = call.arguments[0];
  if (!ts.isObjectLiteralExpression(arg!)) return false;
  for (const prop of arg.properties) {
    // Walk both 'data' (update/updateMany) and 'create'/'update' (upsert)
    if (!ts.isPropertyAssignment(prop)) continue;
    const propName = prop.name.getText();
    if (propName !== 'data' && propName !== 'update' && propName !== 'create') continue;
    if (!ts.isObjectLiteralExpression(prop.initializer)) {
      // dynamic spread — be permissive (don't classify), defer to behavioural
      return true;
    }
    for (const inner of prop.initializer.properties) {
      if (ts.isPropertyAssignment(inner) && inner.name.getText() === 'status') {
        return true;
      }
      if (ts.isShorthandPropertyAssignment(inner) && inner.name.text === 'status') {
        return true;
      }
      if (ts.isSpreadAssignment(inner)) {
        // dynamic spread — be permissive
        return true;
      }
    }
  }
  return false;
}

/** Find the CallExpression of `runAsWorkflowEngine(...)` if `node` is one; otherwise null. */
function asRunAsWorkflowEngineCall(node: ts.Node): ts.CallExpression | null {
  if (!ts.isCallExpression(node)) return null;
  if (ts.isIdentifier(node.expression) && node.expression.text === 'runAsWorkflowEngine') {
    return node;
  }
  return null;
}

/** Find the CallExpression of `prisma.$transaction(...)` / `tx.$transaction(...)` if so; otherwise null. */
function asPrismaTransactionCall(node: ts.Node): ts.CallExpression | null {
  if (!ts.isCallExpression(node)) return null;
  if (!ts.isPropertyAccessExpression(node.expression)) return null;
  return node.expression.name.text === '$transaction' ? node : null;
}

/**
 * Classify a single prisma write call site by walking ancestors UP from the
 * update call:
 *
 *   - CORRECT pattern: runAsWorkflowEngine(() => prisma.$transaction(async (tx) => tx.X.update(...)))
 *     Walking up from update: tx callback → $transaction call → runAsWorkflowEngine
 *     → $transaction appears BEFORE runAsWorkflowEngine in walk-up order
 *     → wrap is the OUTER ancestor of tx → ENGINE_SCOPED.
 *
 *   - BROKEN (silent) pattern: prisma.$transaction(async (tx) => runAsWorkflowEngine(() => tx.X.update(...)))
 *     Walking up from update: runAsWorkflowEngine → tx callback → $transaction
 *     → runAsWorkflowEngine appears BEFORE $transaction in walk-up order
 *     → wrap is the INNER node, tx is the OUTER ancestor → WRAP_INSIDE_TX.
 *
 *   - CORRECT (no tx): runAsWorkflowEngine(() => prisma.X.update(...)) — direct write, no tx
 *     → only runAsWorkflowEngine in walk, no $transaction → ENGINE_SCOPED.
 *
 *   - BROKEN (obvious): no runAsWorkflowEngine in any ancestor → MISSING_WRAP.
 */
function classifyWriteSite(call: ts.CallExpression): Classification {
  let node: ts.Node | undefined = call.parent;
  while (node) {
    if (asRunAsWorkflowEngineCall(node)) {
      // Encountered runAsWorkflowEngine first (i.e. it's the innermost
      // candidate ancestor). If we did NOT see $transaction below it (in the
      // walk-up direction from `call`), then runAsWorkflowEngine is the outer
      // node and any $transaction lives inside its callback — that's correct.
      // We continue walking up to check if there's a $transaction OUTSIDE
      // this wrap; if so, the wrap was set inside a tx callback → WRAP_INSIDE_TX.
      let upper: ts.Node | undefined = node.parent;
      while (upper) {
        if (asPrismaTransactionCall(upper)) {
          // $transaction ancestor of the wrap → wrap is inside tx → broken
          return 'WRAP_INSIDE_TX';
        }
        if (asRunAsWorkflowEngineCall(upper)) {
          // Outer wrap exists too — keep walking, but the inner wrap is enough
          // to mark engine-scoped. We still want to check the outermost
          // context; for now treat as correct.
          break;
        }
        upper = upper.parent;
      }
      return 'ENGINE_SCOPED';
    }
    if (asPrismaTransactionCall(node)) {
      // $transaction encountered before any runAsWorkflowEngine — keep walking
      // up to see if the wrap is OUTSIDE the tx. If we find a wrap above, the
      // tx is INSIDE the wrap (correct). If we exit without finding one,
      // MISSING_WRAP.
      let upper: ts.Node | undefined = node.parent;
      while (upper) {
        if (asRunAsWorkflowEngineCall(upper)) {
          return 'ENGINE_SCOPED';
        }
        upper = upper.parent;
      }
      return 'MISSING_WRAP';
    }
    node = node.parent;
  }
  return 'MISSING_WRAP';
}

/**
 * Walk a source file collecting every status-writing prisma call site for
 * the target prisma model, with classification.
 */
function findWriteSites(sourceFile: ts.SourceFile, prismaModelLower: string): WriteSite[] {
  const sites: WriteSite[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const m = getPrismaWriteModel(node, prismaModelLower);
      if (m && callDataIncludesStatus(node)) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        sites.push({
          line: line + 1,
          column: character + 1,
          prismaModel: m.model,
          classification: classifyWriteSite(node),
          detail: `${m.model}.${m.method}`,
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return sites;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

const repoRoot = resolve(__dirname, '..', '..', '..', '..');

describe('PIC-49 — engine-scoping structural guard', () => {
  // -------------------------------------------------------------------------
  // Static AST check (backstop). Fast — no DB.
  //
  // For each of the 13 entities, the entity's transition service file must
  // contain at least one ENGINE_SCOPED status write to that prisma model,
  // and ZERO WRAP_INSIDE_TX or MISSING_WRAP sites.
  // -------------------------------------------------------------------------

  describe('static AST: every status write is ENGINE_SCOPED, no MISSING_WRAP, no WRAP_INSIDE_TX', () => {
    for (const entity of ENTITIES) {
      it(`${entity.name} — ${entity.servicePath}`, () => {
        const filePath = resolve(repoRoot, entity.servicePath);
        const sf = parseSource(filePath);
        const sites = findWriteSites(sf, entity.prismaModel);

        // CONDITION 1 — no silent skips. If no status write found, that's a
        // loud finding, not a pass.
        expect(
          sites.length,
          `${entity.name}: AST found ZERO status-writing prisma.${entity.prismaModel}.update/updateMany/upsert calls in ${entity.servicePath}. ` +
            `Either the file structure changed (the AST detector needs updating) or there are no production writes at all (verify and remove the entity from this guard if so). ` +
            `A skipped entity is the PIC-47 failure mode reproduced — investigate, do not weaken the assertion.`,
        ).toBeGreaterThan(0);

        const missing = sites.filter((s) => s.classification === 'MISSING_WRAP');
        const insideTx = sites.filter((s) => s.classification === 'WRAP_INSIDE_TX');

        expect(
          missing,
          `${entity.name}: found ${missing.length} status write(s) with NO runAsWorkflowEngine wrap. ` +
            `Sites: ${missing.map((s) => `${s.detail} at ${entity.servicePath}:${s.line}:${s.column}`).join(', ')}. ` +
            `Fix: wrap the function body in 'return runAsWorkflowEngine(async () => { ... })' (see correspondence/service.ts:170 for the canonical Step-7 pattern).`,
        ).toHaveLength(0);

        expect(
          insideTx,
          `${entity.name}: found ${insideTx.length} status write(s) where runAsWorkflowEngine is INSIDE a prisma.$transaction callback. ` +
            `Sites: ${insideTx.map((s) => `${s.detail} at ${entity.servicePath}:${s.line}:${s.column}`).join(', ')}. ` +
            `AsyncLocalStorage does NOT propagate across Prisma's tx callback boundary; the wrap looks present but is silently broken at runtime. ` +
            `Fix: move the wrap OUTSIDE the $transaction call — runAsWorkflowEngine(() => prisma.$transaction(...)). See commit aeabac9 for the rationale.`,
        ).toHaveLength(0);
      });
    }
  });

  // -------------------------------------------------------------------------
  // Regression-fixture check: the static AST classifier must correctly catch
  // the three named patterns. Without this, the guard has no proof it catches
  // the bug it exists for.
  // -------------------------------------------------------------------------

  describe('static AST: regression fixture proves classifier catches both broken patterns', () => {
    const fixturePath = resolve(repoRoot, 'packages/core/tests/workflow/guardrail-wrap.fixture.ts');
    const sf = parseSource(fixturePath);

    /**
     * Find the body of a named exported function in the fixture, then run
     * findWriteSites on the synthetic SourceFile slice (parented to the
     * exported function so ancestor walks terminate at the function
     * boundary, not at the file level).
     */
    function classifyFnBody(fnName: string): Classification[] {
      let target: ts.FunctionDeclaration | null = null;
      function visit(node: ts.Node) {
        if (ts.isFunctionDeclaration(node) && node.name?.text === fnName) {
          target = node;
        }
        ts.forEachChild(node, visit);
      }
      visit(sf);
      if (!target) {
        throw new Error(`fixture: function ${fnName} not found`);
      }
      const fnBody = target as ts.FunctionDeclaration;
      const classifications: Classification[] = [];
      function visit2(node: ts.Node) {
        if (ts.isCallExpression(node)) {
          const m = getPrismaWriteModel(node, 'ipa');
          if (m && callDataIncludesStatus(node)) {
            classifications.push(classifyWriteSite(node));
          }
        }
        ts.forEachChild(node, visit2);
      }
      visit2(fnBody);
      return classifications;
    }

    it('wrapOutsideTransaction → ENGINE_SCOPED', () => {
      expect(classifyFnBody('wrapOutsideTransaction')).toEqual(['ENGINE_SCOPED']);
    });

    it('noWrap → MISSING_WRAP', () => {
      expect(classifyFnBody('noWrap')).toEqual(['MISSING_WRAP']);
    });

    it('wrapInsideTransaction → WRAP_INSIDE_TX', () => {
      expect(classifyFnBody('wrapInsideTransaction')).toEqual(['WRAP_INSIDE_TX']);
    });
  });

  // -------------------------------------------------------------------------
  // Behavioural check (primary). Uses the PIC-35 Step 7 guardrail extension
  // as the runtime oracle. If a wrap is missing OR is inside-$transaction,
  // the extension throws PIC-35 guardrail — test fails. Catches BOTH failure
  // modes by construction, no false negatives on lexical-vs-dynamic.
  // -------------------------------------------------------------------------

  describe('behavioural: every transition service propagates engine scope to status writes', () => {
    const ts = Date.now();
    let testProjectId: string;
    let testEntityId: string;
    let testUserId: string;
    let testVendorId: string;
    let testIpaId: string; // shared parent for IPC + TaxInvoice
    let testIpcId: string;
    const recordIds = new Map<string, string>();

    beforeAll(async () => {
      assertTestDb();
      process.env.SEED_CONTEXT = 'true';

      await prisma.currency.upsert({
        where: { code: 'SAR' },
        update: {},
        create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
      });

      const ent = await prisma.entity.create({
        data: {
          orgId: SINGLETON_ORG_ID,
          code: `ENT-PIC49-${ts}`,
          name: 'PIC-49 Test Entity',
          type: 'parent',
          status: 'active',
        },
      });
      testEntityId = ent.id;

      const project = await prisma.project.create({
        data: {
          orgId: SINGLETON_ORG_ID,
          code: `PROJ-PIC49-${ts}`,
          name: 'PIC-49 Test Project',
          entityId: ent.id,
          status: 'active',
          currencyCode: 'SAR',
          startDate: new Date(),
          createdBy: 'test',
        },
      });
      testProjectId = project.id;

      const user = await prisma.user.create({
        data: {
          orgId: SINGLETON_ORG_ID,
          name: `PIC-49 User ${ts}`,
          email: `pic49-${ts}@test.fmksa`,
          passwordHash: 'test-hash',
          status: 'active',
        },
      });
      testUserId = user.id;

      const vendor = await prisma.vendor.create({
        data: {
          orgId: SINGLETON_ORG_ID,
          entityId: testEntityId,
          vendorCode: `VEN-PIC49-${ts}`,
          name: `PIC-49 Vendor ${ts}`,
          status: 'active',
          createdBy: testUserId,
        },
      });
      testVendorId = vendor.id;

      // Per-entity fixture creation in initial status
      const ipa = await prisma.ipa.create({
        data: {
          orgId: SINGLETON_ORG_ID,
          projectId: testProjectId,
          periodNumber: 99,
          periodFrom: new Date('2026-01-01'),
          periodTo: new Date('2026-01-31'),
          grossAmount: 100000,
          retentionRate: 0.1,
          retentionAmount: 10000,
          previousCertified: 0,
          currentClaim: 90000,
          netClaimed: 90000,
          currency: 'SAR',
          status: 'draft',
          createdBy: testUserId,
        },
      });
      testIpaId = ipa.id;
      recordIds.set('IPA', ipa.id);

      const ipc = await prisma.ipc.create({
        data: {
          orgId: SINGLETON_ORG_ID,
          projectId: testProjectId,
          ipaId: ipa.id,
          certifiedAmount: 90000,
          retentionAmount: 10000,
          netCertified: 80000,
          certificationDate: new Date(),
          currency: 'SAR',
          status: 'draft',
          createdBy: testUserId,
        },
      });
      testIpcId = ipc.id;
      recordIds.set('IPC', ipc.id);

      const variation = await prisma.variation.create({
        data: {
          orgId: SINGLETON_ORG_ID,
          projectId: testProjectId,
          subtype: 'vo',
          status: 'draft',
          title: 'PIC-49 Variation',
          description: 'guard fixture',
          reason: 'test',
          currency: 'SAR',
          createdBy: testUserId,
        },
      });
      recordIds.set('Variation', variation.id);

      const correspondence = await prisma.correspondence.create({
        data: {
          orgId: SINGLETON_ORG_ID,
          projectId: testProjectId,
          subtype: 'letter',
          status: 'draft',
          subject: 'PIC-49 Letter',
          body: 'guard fixture',
          recipientName: 'Test Recipient',
          createdBy: testUserId,
        },
      });
      recordIds.set('Correspondence', correspondence.id);

      const cp = await prisma.costProposal.create({
        data: {
          orgId: SINGLETON_ORG_ID,
          projectId: testProjectId,
          revisionNumber: 1,
          estimatedCost: 75000,
          currency: 'SAR',
          status: 'draft',
          createdBy: testUserId,
        },
      });
      recordIds.set('CostProposal', cp.id);

      const ti = await prisma.taxInvoice.create({
        data: {
          orgId: SINGLETON_ORG_ID,
          projectId: testProjectId,
          ipcId: testIpcId,
          invoiceNumber: `TI-PIC49-${ts}`,
          invoiceDate: new Date(),
          grossAmount: 80000,
          vatRate: 0.15,
          vatAmount: 12000,
          totalAmount: 92000,
          currency: 'SAR',
          buyerName: 'PIC-49 Buyer',
          sellerTaxId: '300000000000003',
          status: 'draft',
          createdBy: testUserId,
        },
      });
      recordIds.set('TaxInvoice', ti.id);

      const expense = await prisma.expense.create({
        data: {
          orgId: SINGLETON_ORG_ID,
          projectId: testProjectId,
          subtype: 'general',
          title: 'PIC-49 Expense',
          amount: 1000,
          currency: 'SAR',
          expenseDate: new Date(),
          status: 'draft',
          createdBy: testUserId,
        },
      });
      recordIds.set('Expense', expense.id);

      const po = await prisma.purchaseOrder.create({
        data: {
          orgId: SINGLETON_ORG_ID,
          projectId: testProjectId,
          vendorId: testVendorId,
          poNumber: `PO-PIC49-${ts}`,
          title: 'PIC-49 PO',
          totalAmount: 50000,
          currency: 'SAR',
          status: 'draft',
          createdBy: testUserId,
        },
      });
      recordIds.set('PurchaseOrder', po.id);

      const rfq = await prisma.rFQ.create({
        data: {
          orgId: SINGLETON_ORG_ID,
          projectId: testProjectId,
          rfqNumber: `RFQ-PIC49-${ts}`,
          title: 'PIC-49 RFQ',
          currency: 'SAR',
          requiredByDate: new Date(Date.now() + 86_400_000 * 14),
          status: 'draft',
          createdBy: testUserId,
        },
      });
      recordIds.set('RFQ', rfq.id);

      const si = await prisma.supplierInvoice.create({
        data: {
          orgId: SINGLETON_ORG_ID,
          projectId: testProjectId,
          vendorId: testVendorId,
          invoiceNumber: `SI-PIC49-${ts}`,
          invoiceDate: new Date(),
          grossAmount: 21739.13,
          vatRate: 0.15,
          vatAmount: 3260.87,
          totalAmount: 25000,
          currency: 'SAR',
          status: 'received',
          createdBy: testUserId,
        },
      });
      recordIds.set('SupplierInvoice', si.id);

      const cn = await prisma.creditNote.create({
        data: {
          orgId: SINGLETON_ORG_ID,
          projectId: testProjectId,
          vendorId: testVendorId,
          subtype: 'credit_note',
          creditNoteNumber: `CN-PIC49-${ts}`,
          amount: 5000,
          currency: 'SAR',
          reason: 'PIC-49 fixture',
          receivedDate: new Date(),
          status: 'received',
          createdBy: testUserId,
        },
      });
      recordIds.set('CreditNote', cn.id);

      const vc = await prisma.vendorContract.create({
        data: {
          orgId: SINGLETON_ORG_ID,
          projectId: testProjectId,
          vendorId: testVendorId,
          contractNumber: `VC-PIC49-${ts}`,
          title: 'PIC-49 Vendor Contract',
          contractType: 'supply',
          startDate: new Date(),
          endDate: new Date(Date.now() + 86_400_000 * 365),
          totalValue: 100000,
          currency: 'SAR',
          status: 'draft',
          createdBy: testUserId,
        },
      });
      recordIds.set('VendorContract', vc.id);

      const fa = await prisma.frameworkAgreement.create({
        data: {
          orgId: SINGLETON_ORG_ID,
          entityId: testEntityId,
          vendorId: testVendorId,
          projectId: testProjectId,
          agreementNumber: `FA-PIC49-${ts}`,
          title: 'PIC-49 Framework Agreement',
          validFrom: new Date(),
          validTo: new Date(Date.now() + 86_400_000 * 365),
          currency: 'SAR',
          status: 'draft',
          createdBy: testUserId,
        },
      });
      recordIds.set('FrameworkAgreement', fa.id);

      expect(recordIds.size, 'fixture must create all 13 entities').toBe(13);
    }, 60_000);

    afterAll(async () => {
      process.env.SEED_CONTEXT = 'true';
      // Auto-seed (PR-W2A Step 5) may have created workflow_instances tied
      // to the test project — delete those first or project.delete FK fails.
      await prisma.workflowAction
        .deleteMany({ where: { instance: { projectId: testProjectId } } })
        .catch(() => {});
      await prisma.workflowInstance
        .deleteMany({ where: { projectId: testProjectId } })
        .catch(() => {});
      await prisma.auditLog.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
      await prisma.postingEvent.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
      await prisma.budgetAbsorptionException.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
      await prisma.creditNote.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
      await prisma.frameworkAgreement.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
      await prisma.vendorContract.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
      await prisma.supplierInvoice.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
      await prisma.rFQ.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
      await prisma.purchaseOrder.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
      await prisma.expense.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
      await prisma.taxInvoice.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
      await prisma.costProposal.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
      await prisma.correspondence.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
      await prisma.variation.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
      await prisma.ipc.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
      await prisma.ipa.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
      await prisma.vendor.delete({ where: { id: testVendorId } }).catch(() => {});
      await prisma.project.delete({ where: { id: testProjectId } }).catch(() => {});
      await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
      await prisma.entity.delete({ where: { id: testEntityId } }).catch(() => {});
      delete process.env.SEED_CONTEXT;
    }, 60_000);

    for (const entity of ENTITIES) {
      it(`${entity.name} — transition('${entity.action}') succeeds without PIC-35 guardrail throw`, async () => {
        const recordId = recordIds.get(entity.name);
        expect(recordId, `${entity.name} fixture missing`).toBeDefined();

        // Crucial: ensure SEED_CONTEXT is NOT set — so the only bypass that
        // can allow the write is runAsWorkflowEngine inside the service.
        delete process.env.SEED_CONTEXT;

        // Call the transition service. If wrap is missing OR inside-tx, the
        // guardrail extension throws PIC-35; this assertion fails with the
        // exact guardrail message.
        await expect(
          entity.callTransition(recordId!, entity.action, testUserId, testProjectId, testEntityId),
        ).resolves.toBeDefined();

        // Verify the status actually changed — proves the wrap propagated
        // through to the write.
        const after = await (prisma as any)[entity.prismaModel].findUnique({
          where: { id: recordId! },
        });
        expect(after?.status, `${entity.name} status not updated to expected`).toBe(
          entity.expectedStatusAfter,
        );
      });
    }
  });

  // -------------------------------------------------------------------------
  // Behavioural regression-fixture check: prove the three fixture functions
  // exhibit the expected runtime behaviour — wrapOutsideTransaction succeeds,
  // noWrap and wrapInsideTransaction both throw PIC-35 guardrail.
  // -------------------------------------------------------------------------

  describe('behavioural: regression fixture proves runtime catches both broken patterns', () => {
    // Use a real IPA fixture so the prisma update is valid SQL — the guardrail
    // check runs before SQL execution.
    let testProjectId: string;
    let testEntityId: string;
    let testIpaId: string;

    beforeAll(async () => {
      assertTestDb();
      process.env.SEED_CONTEXT = 'true';
      const ts = Date.now();
      const ent = await prisma.entity.create({
        data: { orgId: SINGLETON_ORG_ID, code: `ENT-PIC49F-${ts}`, name: 'PIC-49 Fixture Entity', type: 'parent', status: 'active' },
      });
      testEntityId = ent.id;
      await prisma.currency.upsert({
        where: { code: 'SAR' },
        update: {},
        create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
      });
      const project = await prisma.project.create({
        data: {
          orgId: SINGLETON_ORG_ID,
          code: `PROJ-PIC49F-${ts}`,
          name: 'PIC-49 Fixture Project',
          entityId: ent.id,
          status: 'active',
          currencyCode: 'SAR',
          startDate: new Date(),
          createdBy: 'test',
        },
      });
      testProjectId = project.id;
      const ipa = await prisma.ipa.create({
        data: {
          orgId: SINGLETON_ORG_ID,
          projectId: testProjectId,
          periodNumber: 99,
          periodFrom: new Date('2026-01-01'),
          periodTo: new Date('2026-01-31'),
          grossAmount: 100000,
          retentionRate: 0.1,
          retentionAmount: 10000,
          previousCertified: 0,
          currentClaim: 90000,
          netClaimed: 90000,
          currency: 'SAR',
          status: 'draft',
          createdBy: 'test',
        },
      });
      testIpaId = ipa.id;
      delete process.env.SEED_CONTEXT;
    }, 60_000);

    afterAll(async () => {
      process.env.SEED_CONTEXT = 'true';
      await prisma.auditLog.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
      await prisma.ipa.delete({ where: { id: testIpaId } }).catch(() => {});
      await prisma.project.delete({ where: { id: testProjectId } }).catch(() => {});
      await prisma.entity.delete({ where: { id: testEntityId } }).catch(() => {});
      delete process.env.SEED_CONTEXT;
    }, 30_000);

    it('wrapOutsideTransaction — succeeds (correct pattern)', async () => {
      await expect(wrapOutsideTransaction(testIpaId, 'submitted')).resolves.toBeDefined();
    });

    it('noWrap — throws PIC-35 guardrail', async () => {
      await expect(noWrap(testIpaId, 'submitted')).rejects.toThrow(/PIC-35 guardrail/);
    });

    it('wrapInsideTransaction — throws PIC-35 guardrail (silent-wrap failure mode)', async () => {
      await expect(wrapInsideTransaction(testIpaId, 'submitted')).rejects.toThrow(/PIC-35 guardrail/);
    });
  });
});
