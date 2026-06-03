/**
 * PIC-71 PR-2 — Static-AST scope-binding guard (CI ISOLATION GATE).
 *
 * This is the F3 closure for disclosure A: runs in the @fmksa/core Test job
 * (CI executes it — verified by F3 run 26841871907 which ran 964 core tests
 * + the post-hotfix run 26858677057 which ran the same). Replaces the
 * apps/web isolation suite as the regression-lock for tenant scope binding.
 *
 * THE PROPERTY proven: every by-id read on a tenant model in @fmksa/core
 * services reaches a tenant-isolation assertion of any kind — OR is in the
 * exemption table with a documented reason. Adapted from PIC-49's single-file
 * AST template (engine-scoping-guard.test.ts).
 *
 * SATISFYING IDIOMS (per PD 6ec04bd8 Q3 + cad2d0cc Q2):
 *   1. assertProjectScope(record, expectedProjectId, ...)
 *   2. assertEntityScope(record, expectedEntityId, ...)
 *   3. assertOrgScope(record, expectedOrgId, ...)
 *   4. inline `if (record.projectId !== X) throw …` (or entityId/orgId)
 * The 5th category — DECORATIVE INLINE — must FAIL the guard:
 *   - `if (record.id !== X) throw …` (compares the wrong field — `id` is not
 *      a scope field; the F3 isolation property doesn't bind to it)
 *   - `if (record.someOtherField !== X) throw …`
 *
 * EXEMPTION TABLE — every by-id read that does NOT satisfy an idiom MUST be
 * in this table with a per-site `reason` (the honesty note). Six exempt
 * categories per the verify-first report + PD rulings:
 *   - SAFE: `id` IS the chokepoint-validated scope; assert would be tautology
 *   - ENGINE_PAYLOAD: convergence / workflow-engine internal, trusted payload
 *   - INTERNAL_DELEGATION: private helper called only by guarded callers
 *   - CREATE_FK_F4: create-path FK parent read, deferred to F4
 *   - F4_DEFERRED: posting/budget/recon/audit platform_admin platform surface
 *   - HOTFIX_EXEMPT: documents.supersede router-asserted / .upload vacated
 *
 * Run:  pnpm -F @fmksa/core test scope-binding-guard
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as ts from 'typescript';

// ---------------------------------------------------------------------------
// Tenant models — from /tmp/pic71_enum4.py (kept in sync; if a new tenant
// model is added to prisma/schema.prisma, add it here OR the guard misses
// reads on it). Lowercased prisma client names.
// ---------------------------------------------------------------------------
const TENANT_MODELS = new Set<string>([
  'ipa', 'ipc', 'variation', 'correspondence', 'costProposal', 'taxInvoice',
  'expense', 'purchaseOrder', 'rFQ', 'supplierInvoice', 'creditNote',
  'vendorContract', 'frameworkAgreement', 'engineerInstruction', 'importBatch',
  'intercompanyContract', 'projectParticipant', 'drawing', 'document', 'vendor',
  'procurementCategory', 'itemCatalog', 'projectBudget',
  'budgetAbsorptionException', 'postingEvent', 'auditLog', 'workflowInstance',
  'entity', 'project', 'department',
  // PIC-98 PR-2 (F4) — OverrideLog gained orgId (denormalized from
  // audit_logs parent) so tenant-admin reachability in PR-3c is
  // guard-visible at the service layer. Adding here brings every by-id
  // overrideLog read into the guard's enforcement scope. The current
  // getOverrideLog (audit/override-list.ts:53) is exempt as F4_DEFERRED
  // — adminProcedure-only today, same family as getAuditLog.
  'overrideLog',
]);

const BY_ID_METHODS = new Set(['findUnique', 'findUniqueOrThrow', 'findFirst']);
const SCOPE_ASSERT_FNS = new Set([
  'assertProjectScope', 'assertEntityScope', 'assertOrgScope',
]);
// inline scope-field idioms. Decorative `.id !==` deliberately EXCLUDED so
// the bite-proof rejects it.
const SCOPE_FIELDS = new Set(['projectId', 'entityId', 'orgId']);

// ---------------------------------------------------------------------------
// Exemption table — per-site documented reasons.  When a by-id read does
// not satisfy an idiom, the guard MUST find a matching entry here or the
// test fails. Per PD 6fec748d: "every by-id read either guarded or
// documented-why-not — nothing silent." See the PR honesty note for the
// full per-site reasoning.
// ---------------------------------------------------------------------------
type ExemptCategory =
  | 'SAFE' | 'ENGINE_PAYLOAD' | 'INTERNAL_DELEGATION'
  | 'CREATE_FK_F4' | 'F4_DEFERRED' | 'HOTFIX_EXEMPT' | 'ROUTER_ASSERTED';

interface Exemption {
  file: string;      // relative to packages/core/src
  fn: string;        // enclosing fn name, or '<module>' for top-level
  category: ExemptCategory;
  reason: string;    // one-line honesty note
}

const EXEMPTIONS: Exemption[] = [
  // -----------------------------------------------------------------------
  // SAFE: by-id read where the id IS the chokepoint-validated scope.
  // Assert would be a tautology (X === X) per PD ruling (rejected SAFE asserts
  // as "tautological theater" in the verify-first response).
  // -----------------------------------------------------------------------
  { file: 'commercial/dashboard/financial-kpis.ts', fn: 'getFinancialKpis',
    category: 'SAFE',
    reason: 'findUniqueOrThrow({where:{id: projectId}}) — id IS the projectProcedure-validated scope; assert would be tautology' },
  { file: 'commercial/dashboard/service.ts', fn: 'getCommercialDashboard',
    category: 'SAFE',
    reason: 'findUniqueOrThrow({where:{id: projectId}}) — id IS the projectProcedure-validated scope; assert would be tautology' },
  { file: 'commercial/variation/service.ts', fn: 'transitionVariation',
    category: 'SAFE',
    reason: 'post-tx re-fetch by id AFTER `existing` already loaded+asserted in same fn; id is sourced from the validated existing.id' },
  { file: 'entities/service.ts', fn: 'getEntity',
    category: 'SAFE',
    reason: 'findUnique({where:{id}}) where id is the entityProcedure-validated entityId; assert would be tautology' },
  { file: 'projects/service.ts', fn: 'getProject',
    category: 'SAFE',
    reason: 'findUnique({where:{id: projectId}}) where projectId is the projectProcedure-validated scope; assert would be tautology' },

  // -----------------------------------------------------------------------
  // ENGINE_PAYLOAD: convergence + workflow-engine internal reads on TRUSTED
  // payload (engine-emitted post-transition, scope validated upstream at the
  // transition boundary). PD 6fec748d Q3 ratified. Per-fn entries here cover
  // sites in files that mix engine + non-engine fns; whole-file engine-only
  // modules are listed in EXEMPT_FILES below.
  // -----------------------------------------------------------------------
  { file: 'workflow/instances.ts', fn: 'validateStartInstance',
    category: 'ENGINE_PAYLOAD',
    reason: 'workflow-engine internal validator; params constructed by the engine, scope validated at startInstance entry boundary' },
  { file: 'workflow/instances.ts', fn: 'getInstance',
    category: 'ENGINE_PAYLOAD',
    reason: 'workflow-engine internal getter for inspector; routes via workflow router which scope-checks' },

  // -----------------------------------------------------------------------
  // INTERNAL_DELEGATION: private helper called only by sibling-fn callers
  // that themselves do scope binding. PD 6ec04bd8 Q3 ratified 2nd exempt
  // category. Specific callers named below.
  // -----------------------------------------------------------------------
  { file: 'workflow/steps.ts', fn: 'getInstanceWithTemplate',
    category: 'INTERNAL_DELEGATION',
    reason: 'private helper (not exported) called only by approveStep/respondToStep/delegateStep/returnStep/bumpStep in same file; each public caller is invoked via workflow router that scope-checks via input.instanceId at the chokepoint' },

  // -----------------------------------------------------------------------
  // CREATE_FK_F4: create-path FK parent read (DEFER to F4 per PD 6ec04bd8).
  // Same family as createEntity/root-entity-org carry-forward from 00139619.
  // -----------------------------------------------------------------------
  { file: 'commercial/ipc/service.ts', fn: 'createIpc',
    category: 'CREATE_FK_F4',
    reason: 'create-path: reads IPA parent FK during IPC creation; F4 hardens create-path FK scope' },
  { file: 'commercial/tax-invoice/service.ts', fn: 'createTaxInvoice',
    category: 'CREATE_FK_F4',
    reason: 'create-path: reads IPC parent FK during TaxInvoice creation; F4 hardens create-path FK scope' },
  { file: 'documents/create.ts', fn: 'createDocument',
    category: 'CREATE_FK_F4',
    reason: 'create-path: reads Project parent FK; existing ScopeMismatchError throw already guards recordType+recordId combo' },
  { file: 'entities/service.ts', fn: 'createEntity',
    category: 'CREATE_FK_F4',
    reason: 'createEntity reads parentEntity FK; root-entity-org-derivation banked for F4 per PD ruling 00139619' },
  { file: 'layer1/entity-legal-details/service.ts', fn: 'upsertEntityLegalDetails',
    category: 'CREATE_FK_F4',
    reason: 'upsert-path reads entity FK parent; F4 hardens upsert-path FK scope' },
  { file: 'layer1/intercompany-contracts/service.ts', fn: 'createIntercompanyContract',
    category: 'CREATE_FK_F4',
    reason: 'create-path reads entity/project FK parents; F4 hardens' },
  { file: 'layer1/prime-contracts/service.ts', fn: 'createPrimeContract',
    category: 'CREATE_FK_F4',
    reason: 'create-path reads Project FK parent; F4 hardens' },
  { file: 'layer1/project-participants/service.ts', fn: 'createProjectParticipant',
    category: 'CREATE_FK_F4',
    reason: 'create-path reads entity FK parent; F4 hardens' },
  { file: 'projects/assignments.ts', fn: 'assign',
    category: 'CREATE_FK_F4',
    reason: 'create-path assignment read (projectAssignmentsService.assign FK parent validation); F4 hardens' },
  { file: 'projects/service.ts', fn: 'createProject',
    category: 'CREATE_FK_F4',
    reason: 'create-path entity FK lookup (Project.orgId = entity.orgId from 3fa67005); F4 hardens' },

  // -----------------------------------------------------------------------
  // F4_DEFERRED: platform_admin-only platform surfaces. Per PD ruling
  // c4e77f1c: "system.admin bypasses org-scoping; F4 splits this when
  // tenant-admin gains posting/budget/recon/audit access".
  // -----------------------------------------------------------------------
  { file: 'posting/reversal.ts', fn: 'reversePostingEvent',
    category: 'F4_DEFERRED',
    reason: 'platform_admin platform surface (PIC-92 c9ec11f6: posting.* exclusive); F4 splits + adds org-scope' },
  { file: 'reconciliation/service.ts', fn: 'reconcileProjectFinancials',
    category: 'F4_DEFERRED',
    reason: 'platform_admin platform surface (gates on posting.view per c4e77f1c); F4 splits + adds org-scope' },
  { file: 'audit/list.ts', fn: 'getAuditLog',
    category: 'F4_DEFERRED',
    reason: 'platform_admin platform surface (adminProcedure-only router; same family as posting/budget/recon); F4 splits + adds org-scope' },
  { file: 'audit/override-list.ts', fn: 'getOverrideLog',
    category: 'F4_DEFERRED',
    reason: 'platform_admin platform surface (adminProcedure-only router; audit.overrideDetail); PR-3c adds tenant-admin own-org reachability via OverrideLog.orgId (denormalized in PR-2). Until PR-3c lands, this stays admin-only and the F4_DEFERRED exemption matches getAuditLog' },

  // -----------------------------------------------------------------------
  // HOTFIX_EXEMPT: PIC-97 hotfix (#71) router-asserted at the actual entry
  // point. Documented carry-forward into PR-2's honesty note (per close-out
  // 2584c0fe).
  // -----------------------------------------------------------------------
  { file: 'documents/supersede.ts', fn: 'supersedeVersion',
    category: 'HOTFIX_EXEMPT',
    reason: 'PIC-97 hotfix: /api/upload supersede pre-checks doc.projectId at route.ts:310 BEFORE calling; documents.supersede tRPC router returns metadata only (no DB write). Router-asserted exemption.' },
  { file: 'documents/versions.ts', fn: 'uploadVersion',
    category: 'HOTFIX_EXEMPT',
    reason: 'PIC-97 hotfix vacate: /api/upload create uploads against a freshly-created doc (self-scoped via attacker projectId); /api/upload supersede pre-checks at route.ts:310; no tRPC upload endpoint. No unguarded exposed surface.' },

  // -----------------------------------------------------------------------
  // ROUTER_ASSERTED: F3 router-level scope check is the actual binding;
  // bringing the assert to the service layer requires either an org-scope
  // helper that doesn't yet exist OR a cascade through multiple callers.
  // Bounded PR-2 scope per PD 6ec04bd8 ("Sweep = β + the now-fixed γ
  // mutations, NOT 'harden all 45'"). Each call site routes through a
  // verified F3 org/entity-scope check at the router.
  // -----------------------------------------------------------------------
  { file: 'entities/hierarchy.ts', fn: 'getAncestors',
    category: 'ROUTER_ASSERTED',
    reason: 'router entities.ancestors pre-checks via assertEntityInOrg(ctx, input.entityId); walk via parentEntityId stays in same hierarchy (Entity.orgId invariant); per-iteration assertOrgScope cascade is F4-banked' },
  { file: 'entities/hierarchy.ts', fn: 'getSiblings',
    category: 'ROUTER_ASSERTED',
    reason: 'router entities.siblings pre-checks via assertEntityInOrg(ctx, input.entityId); same Entity.orgId hierarchy invariant; F4 hardening banked' },
  { file: 'import/service.ts', fn: 'getBatch',
    category: 'ROUTER_ASSERTED',
    reason: 'router import.get pre-checks batch.projectId !== input.projectId at handler; import.getAdmin uses assertRecordOrgOrNotFound. Both routes scope-bind; service-layer cascade with null-bypass deferred (split-scope refactor) — F4 cleanup banked' },
];

// ---------------------------------------------------------------------------
// File-level exemptions — whole files where every by-id read belongs to the
// same exempt category. PD-ratified blanket coverage (convergence + workflow
// engine internals + budget absorption handlers) — listing every handler
// per-fn is mechanical noise; the per-file reason captures the property.
// ---------------------------------------------------------------------------
const EXEMPT_FILES: Array<{ file: string; category: ExemptCategory; reason: string }> = [
  { file: 'workflow/convergence-handlers.ts',
    category: 'ENGINE_PAYLOAD',
    reason: 'every fn is a convergence handler dispatched by the workflow engine on trusted post-transition payloads; payload.recordId / projectId / entityId are engine-emitted, scope-validated at the transition boundary (the entry point that emits the payload is itself scope-guarded). PD 6fec748d Q3 ratified.' },
  { file: 'workflow/template-resolution.ts',
    category: 'ENGINE_PAYLOAD',
    reason: 'workflow-engine internal template lookup; called from workflow-engine init path with trusted recordType+projectId; not a tenant-data fetch.' },
  { file: 'budget/absorption.ts',
    category: 'ENGINE_PAYLOAD',
    reason: 'every fn is called only by convergence-handlers or its sibling absorb fns; record ids sourced from trusted engine payload. The whole file is convergence-internal.' },
];

// ---------------------------------------------------------------------------
// AST classifier
// ---------------------------------------------------------------------------

interface ByIdRead {
  file: string;      // relative to packages/core/src
  line: number;
  model: string;
  fn: string;        // enclosing fn name
}

function* walkSrcFiles(root: string): Generator<string> {
  for (const entry of readdirSync(root)) {
    const p = join(root, entry);
    const stat = statSync(p);
    if (stat.isDirectory()) {
      yield* walkSrcFiles(p);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      yield p;
    }
  }
}

/** Find the enclosing fn name for a given node. Returns '<module>' if not in a fn. */
function enclosingFnName(node: ts.Node): string {
  let cur: ts.Node | undefined = node;
  while (cur) {
    if (ts.isFunctionDeclaration(cur) && cur.name) return cur.name.text;
    if (ts.isMethodDeclaration(cur) && ts.isIdentifier(cur.name)) return cur.name.text;
    if (ts.isVariableDeclaration(cur) && ts.isIdentifier(cur.name) && cur.initializer
        && (ts.isArrowFunction(cur.initializer) || ts.isFunctionExpression(cur.initializer))) {
      return cur.name.text;
    }
    if (ts.isPropertyAssignment(cur) && ts.isIdentifier(cur.name)
        && (ts.isArrowFunction(cur.initializer) || ts.isFunctionExpression(cur.initializer))) {
      return cur.name.text;
    }
    cur = cur.parent;
  }
  return '<module>';
}

/** Walk node body to find prisma.<tenantModel>.<byIdMethod>({where:{id ...}}) calls. */
function findByIdReadsInFile(sf: ts.SourceFile, srcRoot: string): ByIdRead[] {
  const reads: ByIdRead[] = [];
  const relFile = relative(srcRoot, sf.fileName);

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      if (BY_ID_METHODS.has(method)) {
        // Walk back to find `prisma.<model>.<method>`
        const inner = node.expression.expression;
        if (ts.isPropertyAccessExpression(inner) && ts.isIdentifier(inner.expression)
            && inner.expression.text === 'prisma') {
          const model = inner.name.text;
          if (TENANT_MODELS.has(model)) {
            // Check the where clause has `id` (not just projectId/entityId)
            const firstArg = node.arguments[0];
            if (firstArg && ts.isObjectLiteralExpression(firstArg)) {
              const whereProp = firstArg.properties.find(
                (p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === 'where'
              );
              if (whereProp && ts.isPropertyAssignment(whereProp) && ts.isObjectLiteralExpression(whereProp.initializer)) {
                const hasId = whereProp.initializer.properties.some((p) => {
                  if (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) {
                    return ts.isIdentifier(p.name) && p.name.text === 'id';
                  }
                  return false;
                });
                if (hasId) {
                  const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
                  reads.push({
                    file: relFile,
                    line: line + 1,
                    model,
                    fn: enclosingFnName(node),
                  });
                }
              }
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return reads;
}

/** Get the enclosing fn body (the BlockStatement) for a given node. */
function enclosingFnBody(node: ts.Node): ts.Block | undefined {
  let cur: ts.Node | undefined = node;
  while (cur) {
    if (ts.isFunctionDeclaration(cur) || ts.isMethodDeclaration(cur)) {
      return cur.body as ts.Block | undefined;
    }
    if ((ts.isArrowFunction(cur) || ts.isFunctionExpression(cur)) && cur.body && ts.isBlock(cur.body)) {
      return cur.body;
    }
    cur = cur.parent;
  }
  return undefined;
}

/** Check if a fn body contains a satisfying scope idiom.
 *
 * Returns:
 *   - 'assert'        — assertProjectScope/assertEntityScope/assertOrgScope call
 *   - 'inline'        — `if (record.<scopeField> !== X) throw …` pattern
 *   - 'decorative'    — `if (record.<NON-scopeField> !== X) throw …` (bites!)
 *   - 'none'          — no scope-binding idiom found
 */
function classifyFnIdiom(body: ts.Block): 'assert' | 'inline' | 'decorative' | 'none' {
  let hasAssert = false;
  let hasInline = false;
  let hasDecorative = false;

  function visit(node: ts.Node) {
    // Idiom 1-3: assert call
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
        && SCOPE_ASSERT_FNS.has(node.expression.text)) {
      hasAssert = true;
    }
    // Idiom 4: inline if (record.<field> !== X) throw …
    if (ts.isIfStatement(node)) {
      const thenStmt = node.thenStatement;
      // Find throw in then branch
      let hasThrow = false;
      function findThrow(n: ts.Node) {
        if (ts.isThrowStatement(n)) { hasThrow = true; return; }
        ts.forEachChild(n, findThrow);
      }
      findThrow(thenStmt);
      if (hasThrow) {
        // Inspect the condition for `prop.X !==` pattern
        function findInequalityFields(cond: ts.Node) {
          if (ts.isBinaryExpression(cond)
              && cond.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken) {
            // Either side may be the property access
            const sides = [cond.left, cond.right];
            for (const side of sides) {
              if (ts.isPropertyAccessExpression(side) && ts.isIdentifier(side.name)) {
                const fieldName = side.name.text;
                if (SCOPE_FIELDS.has(fieldName)) {
                  hasInline = true;
                } else if (fieldName === 'id') {
                  // Decorative bite: comparing `.id` is NOT a scope binding
                  hasDecorative = true;
                }
                // Other fields (e.g. .name, .status) are not relevant; skip silently
              }
            }
          }
          ts.forEachChild(cond, findInequalityFields);
        }
        findInequalityFields(node.expression);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(body);

  if (hasAssert) return 'assert';
  if (hasInline) return 'inline';
  if (hasDecorative) return 'decorative';
  return 'none';
}

interface SiteVerdict {
  read: ByIdRead;
  idiom: 'assert' | 'inline' | 'decorative' | 'none';
  exemption?: Exemption;
}

function classifySite(read: ByIdRead, sf: ts.SourceFile, srcRoot: string): SiteVerdict {
  // Find the by-id read AST node and its enclosing fn body
  let foundNode: ts.Node | undefined;
  function visit(node: ts.Node) {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
    if (line + 1 === read.line && ts.isCallExpression(node)) {
      foundNode = node;
      return;
    }
    if (!foundNode) ts.forEachChild(node, visit);
  }
  visit(sf);
  const body = foundNode ? enclosingFnBody(foundNode) : undefined;
  const idiom = body ? classifyFnIdiom(body) : 'none';

  // Lookup file-level exemption first (whole-file engine-internal modules)
  const fileExemption = EXEMPT_FILES.find((e) => e.file === read.file);
  if (fileExemption) {
    return {
      read,
      idiom,
      exemption: {
        file: read.file,
        fn: read.fn,
        category: fileExemption.category,
        reason: fileExemption.reason,
      },
    };
  }

  // Then per-fn exemption
  const exemption = EXEMPTIONS.find(
    (e) => e.file === read.file && e.fn === read.fn,
  );
  return exemption !== undefined
    ? { read, idiom, exemption }
    : { read, idiom };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const SRC_ROOT = join(__dirname, '..', 'src');

describe('PIC-71 PR-2 — scope-binding guard (every by-id read on a tenant model is scope-bound or documented-exempt)', () => {
  // Pre-compute the full classification once across packages/core/src
  const allFiles = [...walkSrcFiles(SRC_ROOT)];
  const allVerdicts: SiteVerdict[] = [];
  for (const file of allFiles) {
    const content = readFileSync(file, 'utf-8');
    const sf = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
    const reads = findByIdReadsInFile(sf, SRC_ROOT);
    for (const read of reads) {
      allVerdicts.push(classifySite(read, sf, SRC_ROOT));
    }
  }

  it('PROPERTY: every by-id read on a tenant model is scope-bound (assert/inline) OR documented-exempt', () => {
    const failures: string[] = [];
    for (const v of allVerdicts) {
      const r = v.read;
      const bound = v.idiom === 'assert' || v.idiom === 'inline';
      if (!bound && !v.exemption) {
        failures.push(
          `RED: ${r.file}:${r.line} fn=${r.fn} model=${r.model} idiom=${v.idiom} — no scope-binding + no exemption entry`,
        );
      }
      if (v.idiom === 'decorative' && !v.exemption) {
        failures.push(
          `RED (DECORATIVE): ${r.file}:${r.line} fn=${r.fn} — inline check binds the wrong field (.id), not a scope field`,
        );
      }
    }
    if (failures.length > 0) {
      throw new Error(
        `${failures.length} unbound by-id read(s):\n  ${failures.join('\n  ')}`,
      );
    }
  });

  it('METRICS: bucket totals are sane (no silent unbound sites)', () => {
    const total = allVerdicts.length;
    const alpha = allVerdicts.filter((v) => v.idiom === 'assert' || v.idiom === 'inline').length;
    const engine = allVerdicts.filter(
      (v) => !(v.idiom === 'assert' || v.idiom === 'inline') && v.exemption?.category === 'ENGINE_PAYLOAD',
    ).length;
    const exemptCount = allVerdicts.filter(
      (v) => !(v.idiom === 'assert' || v.idiom === 'inline') && v.exemption !== undefined,
    ).length;
    // Sanity bounds: the source tree won't lose this scale of by-id reads
    // overnight; if it drops below ~80 something is wrong with the enumerator
    // (e.g. TENANT_MODELS missed a new prisma model name).
    expect(total, 'by-id reads on tenant models — too few suggests enumerator drift').toBeGreaterThan(80);
    expect(total, 'by-id reads — too many suggests classifier hit non-tenant model').toBeLessThan(300);
    // The property: nothing silent. Every site is either guarded (alpha) or
    // documented-exempt.
    expect(alpha + exemptCount, 'alpha + exempt MUST equal total (no orphan unbound sites)').toBe(total);
    // Engine-payload exemptions exist (sanity: convergence handlers still
    // discovered by the file-level exemption)
    expect(engine, 'engine-payload exemptions must exist (convergence handlers present)').toBeGreaterThan(0);
  });

  it('EXEMPTION TABLE HYGIENE: every per-fn exemption entry matches a real by-id read', () => {
    const orphanExemptions: string[] = [];
    for (const e of EXEMPTIONS) {
      // A per-fn entry can be shadowed by a file-level entry (file-level wins);
      // tolerate that case explicitly to avoid forcing maintainers to keep
      // both in sync if the file later turns whole-file-exempt.
      const fileShadowed = EXEMPT_FILES.some((f) => f.file === e.file);
      if (fileShadowed) continue;
      const matched = allVerdicts.some(
        (v) => v.exemption !== undefined
          && v.exemption.file === e.file
          && v.exemption.fn === e.fn
          && v.exemption.reason === e.reason,
      );
      if (!matched) {
        orphanExemptions.push(
          `${e.file} fn=${e.fn} (${e.category}) — exempt entry has no matching by-id read; remove or fix entry`,
        );
      }
    }
    if (orphanExemptions.length > 0) {
      throw new Error(
        `${orphanExemptions.length} orphan exemption entries:\n  ${orphanExemptions.join('\n  ')}`,
      );
    }
  });
});

describe('PIC-71 PR-2 — broken-fixture bite-proof (the guard distinguishes real scope binding from decorative)', () => {
  const FIXTURE_FILE = join(__dirname, 'fixtures', 'pic71-scope-binding.fixture.ts');
  const content = readFileSync(FIXTURE_FILE, 'utf-8');
  const sf = ts.createSourceFile(FIXTURE_FILE, content, ts.ScriptTarget.Latest, true);

  // Treat fixture as its own root for path-relative reporting
  const fixtureDir = join(__dirname, 'fixtures');
  const reads = findByIdReadsInFile(sf, fixtureDir);
  const verdicts = reads.map((r) => classifySite(r, sf, fixtureDir));

  function findVerdict(fnName: string): SiteVerdict | undefined {
    return verdicts.find((v) => v.read.fn === fnName);
  }

  it('GREEN: scopedById_assert reaches an assert call', () => {
    const v = findVerdict('scopedById_assert');
    expect(v, 'fixture must contain scopedById_assert').toBeDefined();
    expect(v!.idiom).toBe('assert');
  });

  it('GREEN: scopedById_inline reaches an inline scope-field !== throw', () => {
    const v = findVerdict('scopedById_inline');
    expect(v, 'fixture must contain scopedById_inline').toBeDefined();
    expect(v!.idiom).toBe('inline');
  });

  it('RED (BITE): unscopedById has no scope binding', () => {
    const v = findVerdict('unscopedById');
    expect(v, 'fixture must contain unscopedById').toBeDefined();
    expect(v!.idiom).toBe('none');
  });

  it('RED (BITE — decorative): decorativeInline_wrongField uses `.id !==` not `.projectId !==`', () => {
    const v = findVerdict('decorativeInline_wrongField');
    expect(v, 'fixture must contain decorativeInline_wrongField').toBeDefined();
    expect(v!.idiom).toBe('decorative');
  });

  it('EXEMPT: listScoped uses where:{projectId} — not a by-id read, not visited', () => {
    const v = findVerdict('listScoped');
    // listScoped does not do a by-id read; the classifier shouldn't enumerate it
    expect(v, 'listScoped must NOT appear in by-id read set (it uses where:{projectId})').toBeUndefined();
  });

  it('EXEMPT: createX uses prisma.X.create — not a by-id read, not visited', () => {
    const v = findVerdict('createX');
    expect(v, 'createX must NOT appear in by-id read set (it uses .create)').toBeUndefined();
  });
});
