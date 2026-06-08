/**
 * PIC-108-A (Phase MT) — WRITE-side static-AST scope-binding guard (CI ISOLATION GATE).
 *
 * The THIRD isolation theorem. F3 proved tenant READS reach a scope assert
 * (scope-binding-guard.test.ts). F4/PR-4a proved ROUTER supply threads the
 * right orgId. THIS proves tenant WRITES supply orgId — so the @default
 * singleton becomes UNREACHABLE once 108-G removes it.
 *
 * Runs in the @fmksa/core Test job (CI executes it — same placement as the
 * read-mode guard; the disclosure-A lesson: a guard in apps/web/tests would be
 * local-only and useless as a regression-lock).
 *
 * THE PROPERTY proven: every `create`/`createMany`/`upsert` on an orgId-bearing
 * tenant model in @fmksa/core supplies `orgId` from a DYNAMIC, UNCONDITIONAL
 * source (parent.orgId / ctx.orgId / a variable) — OR is in the
 * KNOWN_DEFAULT_RELIANT table (the PIC-108 cutover scope).
 *
 * BITES (RED):
 *   - data omits orgId            → relies on the @default singleton
 *   - orgId: '<string literal>'   → dead-default literal / theater (F4 literal-null analogue)
 *   - `...(cond ? {orgId} : {})`   → conditional spread can omit (detected as no-direct-orgId)
 *   The detector is CLIENT-AGNOSTIC: `prisma.X.create`, `tx.X.create`,
 *   `(tx as any).X.create` all match (read-mode's hard ===prisma would miss tx).
 *
 * EXEMPTION TABLE = the progress tracker AND completion gate: 108-A lists all
 * 33 default-reliant core sites here (green at merge); 108-B…F each supply a
 * module batch + REMOVE its entries; the table shrinking to ZERO at end-of-F is
 * the machine-checked proof every tenant write supplies orgId → safe for 108-G
 * to drop the @default (a create omitting orgId then fails loud, NOT NULL).
 *
 * NOTE: apps/web router/REST writes (admin.ts createUser, notifications.ts
 * auditLog, platform-admin.ts) are NOT scanned here — 108-A ranges over
 * packages/core/src only. They are folded into 108-H (apps/web coverage).
 *
 * Run:  pnpm -F @fmksa/core test write-scope-guard
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as ts from 'typescript';

// ---------------------------------------------------------------------------
// WRITE_TENANT_MODELS — the 34 orgId-bearing prisma accessors. INCLUDES `user`
// (createUser must attribute org) + `referenceCounter`/`orgSequenceCounter`
// (per-tenant counters). EXCLUDES `Organization` (the tenant root, has no
// orgId) + dormant `department` (no orgId). Deliberately DIFFERENT from the
// read-mode TENANT_MODELS set (which excludes user so auth spans orgs).
// Kept in sync with prisma/schema.prisma (every model declaring `orgId`).
// ---------------------------------------------------------------------------
const WRITE_TENANT_MODELS = new Set<string>([
  'user', 'entity', 'project', 'workflowInstance', 'document', 'postingEvent',
  'budgetAbsorptionException', 'auditLog', 'overrideLog', 'ipa', 'ipaForecast',
  'ipc', 'variation', 'costProposal', 'taxInvoice', 'correspondence',
  'referenceCounter', 'orgSequenceCounter', 'vendor', 'procurementCategory',
  'itemCatalog', 'vendorContract', 'frameworkAgreement', 'rFQ', 'purchaseOrder',
  'supplierInvoice', 'expense', 'creditNote', 'projectBudget',
  'engineerInstruction', 'importBatch', 'projectParticipant',
  'intercompanyContract', 'drawing',
]);

const WRITE_METHODS = new Set(['create', 'createMany', 'upsert']);

// ---------------------------------------------------------------------------
// KNOWN_DEFAULT_RELIANT — the PIC-108 cutover scope (core/src sites that omit
// orgId TODAY). Populated from this guard's own enumeration. Shrinks per
// 108-B…F batch; EMPTY at end-of-F is the completion gate.
// ---------------------------------------------------------------------------
interface Exemption {
  file: string; // relative to packages/core/src
  fn: string; // enclosing fn name
  reason: string;
}
const KNOWN_DEFAULT_RELIANT: Exemption[] = [
  // Harvested from this guard's own enumeration (108-A first run); shrinks per
  // batch. 108-B (commercial, 8 sites) landed → 24 entries now cover 25 sites
  // (posting/service.ts `post` has 2 creates). Each remaining is a PIC-108
  // cutover-scope site that omits orgId today → fix = derive orgId from the
  // parent (project.orgId / entity.orgId); remove the entry then.

  // --- 108-B (commercial) — ✅ SUPPLIED (PIC-108-B): all 8 (ipa/ipc/variation/
  //     cost-proposal/tax-invoice/correspondence/forecast/engineer-instruction) now
  //     derive orgId from project.orgId via resolveProjectOrgId; removed from this
  //     table (the table shrinks per batch — empty at end-of-F is the completion gate). ---

  // --- 108-C (procurement) — derive from project.orgId (catalog/category/vendor: entity.orgId) ---
  { file: 'procurement/purchase-order/service.ts', fn: 'createPurchaseOrder', reason: 'PIC-108 cutover (108-C) — relies on orgId @default; derive from project.orgId' },
  { file: 'procurement/rfq/materialisation.ts', fn: 'materialiseAward', reason: 'PIC-108 cutover (108-C) — CANARY: sibling vendorContract.create supplies project.orgId, this PO does not; derive from project.orgId' },
  { file: 'procurement/supplier-invoice/service.ts', fn: 'createSupplierInvoice', reason: 'PIC-108 cutover (108-C) — relies on orgId @default; derive from project.orgId' },
  { file: 'procurement/credit-note/service.ts', fn: 'createCreditNote', reason: 'PIC-108 cutover (108-C) — relies on orgId @default; derive from project.orgId' },
  { file: 'procurement/expense/service.ts', fn: 'createExpense', reason: 'PIC-108 cutover (108-C) — relies on orgId @default; derive from project.orgId' },
  { file: 'procurement/vendor/service.ts', fn: 'createVendor', reason: 'PIC-108 cutover (108-C) — relies on orgId @default; derive from entity.orgId' },
  { file: 'procurement/catalog/service.ts', fn: 'createCatalogItem', reason: 'PIC-108 cutover (108-C) — relies on orgId @default; derive from entity.orgId' },
  { file: 'procurement/category/service.ts', fn: 'createCategory', reason: 'PIC-108 cutover (108-C) — relies on orgId @default; derive from entity.orgId' },

  // --- 108-D (budget + docs + drawings) — derive from project.orgId ---
  { file: 'budget/service.ts', fn: 'createBudget', reason: 'PIC-108 cutover (108-D) — relies on orgId @default; derive from project.orgId' },
  { file: 'budget/absorption.ts', fn: 'recordAbsorptionException', reason: 'PIC-108 cutover (108-D) — relies on orgId @default; derive from project.orgId' },
  { file: 'documents/create.ts', fn: 'createDocument', reason: 'PIC-108 cutover (108-D) — relies on orgId @default; derive from project.orgId (or record parent)' },
  { file: 'documents/drawings/service.ts', fn: 'createDrawing', reason: 'PIC-108 cutover (108-D) — relies on orgId @default; derive from project.orgId' },

  // --- 108-E (posting + audit + import) — derive from the record's project.orgId ---
  { file: 'posting/service.ts', fn: 'post', reason: 'PIC-108 cutover (108-E) — relies on orgId @default (2 creates in this fn); derive from project.orgId' },
  { file: 'posting/reversal.ts', fn: 'reversePostingEvent', reason: 'PIC-108 cutover (108-E) — relies on orgId @default; derive from the original event/project.orgId' },
  { file: 'audit/service.ts', fn: 'log', reason: 'PIC-108 cutover (108-E) — relies on orgId @default; derive from the audited record/project.orgId' },
  { file: 'audit/override.ts', fn: 'withOverride', reason: 'PIC-108 cutover (108-E) — relies on orgId @default; derive from the audit_log parent orgId' },
  { file: 'import/committers/budget-baseline.ts', fn: 'commitBudgetBaselineRow', reason: 'PIC-108 cutover (108-E) — relies on orgId @default; derive from project.orgId' },
  { file: 'import/committers/ipa-forecast.ts', fn: 'commitIpaForecastRow', reason: 'PIC-108 cutover (108-E) — relies on orgId @default; derive from project.orgId' },
  { file: 'import/committers/ipa-history.ts', fn: 'commitIpaHistoryRow', reason: 'PIC-108 cutover (108-E) — relies on orgId @default; derive from project.orgId' },
  { file: 'import/service.ts', fn: 'stageBatch', reason: 'PIC-108 cutover (108-E) — relies on orgId @default; derive from project.orgId' },

  // --- 108-F (layer1 + workflow) — derive from project.orgId ---
  { file: 'layer1/intercompany-contracts/service.ts', fn: 'createIntercompanyContract', reason: 'PIC-108 cutover (108-F) — relies on orgId @default; derive from project.orgId' },
  { file: 'layer1/prime-contracts/service.ts', fn: 'createPrimeContract', reason: 'PIC-108 cutover (108-F) — relies on orgId @default; projectParticipant derive from project.orgId' },
  { file: 'layer1/project-participants/service.ts', fn: 'createProjectParticipant', reason: 'PIC-108 cutover (108-F) — relies on orgId @default; derive from project.orgId' },
  { file: 'workflow/instances.ts', fn: 'writeStartInstanceRows', reason: 'PIC-108 cutover (108-F) — relies on orgId @default; derive from the instance record/project.orgId' },
];

type Verdict = 'supplied' | 'omit' | 'literal';
interface CreateSite {
  file: string;
  line: number;
  model: string;
  fn: string;
  method: string;
  verdict: Verdict;
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

/** Enclosing fn name for a node, or '<module>' if top-level. */
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

/**
 * Classify the orgId supply in an insert object literal (`data` for
 * create/createMany, `create` for upsert). The orgId value must be a DYNAMIC,
 * UNCONDITIONAL direct property.
 */
function classifyOrgId(obj: ts.ObjectLiteralExpression): Verdict {
  for (const prop of obj.properties) {
    // `{ orgId }` shorthand → a variable reference → dynamic supply.
    if (ts.isShorthandPropertyAssignment(prop) && prop.name.text === 'orgId') {
      return 'supplied';
    }
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === 'orgId') {
      const init = prop.initializer;
      // Static dead value: string/number literal, null, or `undefined`.
      if (ts.isStringLiteralLike(init)
          || ts.isNumericLiteral(init)
          || init.kind === ts.SyntaxKind.NullKeyword
          || (ts.isIdentifier(init) && init.text === 'undefined')) {
        return 'literal';
      }
      // Any non-literal expression (Identifier, PropertyAccess, Call, ??, etc.)
      // is a dynamic supply. The conditional-SPREAD trap never reaches here —
      // it is a SpreadAssignment, not a direct `orgId` property → falls to 'omit'.
      return 'supplied';
    }
  }
  return 'omit';
}

/** Worst-case verdict across createMany array elements (omit > literal > supplied). */
function worst(verdicts: Verdict[]): Verdict {
  if (verdicts.includes('omit')) return 'omit';
  if (verdicts.includes('literal')) return 'literal';
  return 'supplied';
}

/** Walk a file's AST for tenant-model create/createMany/upsert calls. */
function findTenantWritesInFile(sf: ts.SourceFile, srcRoot: string): CreateSite[] {
  const sites: CreateSite[] = [];
  const relFile = relative(srcRoot, sf.fileName);

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const inner = node.expression.expression;
      // client-AGNOSTIC: inner is `<anything>.<model>` — we only check `.model`,
      // never the client identifier (prisma / tx / (tx as any) / this.prisma).
      if (WRITE_METHODS.has(method)
          && ts.isPropertyAccessExpression(inner)
          && WRITE_TENANT_MODELS.has(inner.name.text)) {
        const model = inner.name.text;
        const firstArg = node.arguments[0];
        let verdict: Verdict = 'omit';
        if (firstArg && ts.isObjectLiteralExpression(firstArg)) {
          const key = method === 'upsert' ? 'create' : 'data';
          const insertProp = firstArg.properties.find(
            (p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === key,
          );
          if (insertProp && ts.isPropertyAssignment(insertProp)) {
            const init = insertProp.initializer;
            if (ts.isObjectLiteralExpression(init)) {
              verdict = classifyOrgId(init);
            } else if (ts.isArrayLiteralExpression(init)) {
              verdict = worst(
                init.elements
                  .filter(ts.isObjectLiteralExpression)
                  .map(classifyOrgId),
              );
            } else {
              verdict = 'omit'; // spread-only / dynamic insert object — can't prove supply
            }
          }
        }
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
        sites.push({ file: relFile, line: line + 1, model, fn: enclosingFnName(node), method, verdict });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return sites;
}

function isExempt(site: CreateSite): boolean {
  return KNOWN_DEFAULT_RELIANT.some((e) => e.file === site.file && e.fn === site.fn);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
const SRC_ROOT = join(__dirname, '..', 'src');

describe('PIC-108-A — write-side scope guard (every tenant-model write supplies orgId or is documented-default-reliant)', () => {
  const allSites: CreateSite[] = [];
  for (const file of [...walkSrcFiles(SRC_ROOT)]) {
    const content = readFileSync(file, 'utf-8');
    const sf = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
    allSites.push(...findTenantWritesInFile(sf, SRC_ROOT));
  }

  it('PROPERTY: every tenant-model write supplies orgId (dynamic, unconditional) OR is in KNOWN_DEFAULT_RELIANT', () => {
    const failures: string[] = [];
    for (const s of allSites) {
      if (s.verdict !== 'supplied' && !isExempt(s)) {
        failures.push(`RED: ${s.file}:${s.line} fn=${s.fn} ${s.model}.${s.method} — verdict=${s.verdict} (no orgId supply + no exemption)`);
      }
    }
    if (failures.length > 0) {
      throw new Error(`${failures.length} tenant write(s) not supplying orgId:\n  ${failures.join('\n  ')}`);
    }
  });

  it('METRICS: bucket totals sane (no silent unscoped writes)', () => {
    const total = allSites.length;
    const supplied = allSites.filter((s) => s.verdict === 'supplied').length;
    const exemptViolations = allSites.filter((s) => s.verdict !== 'supplied' && isExempt(s)).length;
    // Enumerator sanity: we know there are ~43 tenant-model writes in core/src.
    expect(total, 'tenant-model writes — too few suggests WRITE_TENANT_MODELS drift').toBeGreaterThan(35);
    expect(total, 'tenant-model writes — too many suggests a non-tenant accessor leaked in').toBeLessThan(200);
    // Nothing silent: every site is either supplied or documented-default-reliant.
    expect(supplied + exemptViolations, 'supplied + exempt MUST equal total (no orphan unscoped writes)').toBe(total);
  });

  it('EXEMPTION TABLE HYGIENE: every KNOWN_DEFAULT_RELIANT entry matches a real omitting write', () => {
    const orphans: string[] = [];
    for (const e of KNOWN_DEFAULT_RELIANT) {
      const matched = allSites.some((s) => s.file === e.file && s.fn === e.fn && s.verdict !== 'supplied');
      if (!matched) {
        orphans.push(`${e.file} fn=${e.fn} — exempt entry has no matching default-reliant write; remove or fix (a 108-B…F batch fixed it → drop the entry)`);
      }
    }
    if (orphans.length > 0) {
      throw new Error(`${orphans.length} orphan exemption entries:\n  ${orphans.join('\n  ')}`);
    }
  });
});

describe('PIC-108-A — broken-fixture bite-proof (the write guard distinguishes real orgId supply from omit/literal/conditional)', () => {
  const FIXTURE_FILE = join(__dirname, 'fixtures', 'pic108-write-scope.fixture.ts');
  const content = readFileSync(FIXTURE_FILE, 'utf-8');
  const sf = ts.createSourceFile(FIXTURE_FILE, content, ts.ScriptTarget.Latest, true);
  const fixtureDir = join(__dirname, 'fixtures');
  const sites = findTenantWritesInFile(sf, fixtureDir);

  function verdictOf(fnName: string): Verdict | undefined {
    return sites.find((s) => s.fn === fnName)?.verdict;
  }

  it('GREEN: createSuppliesOrgId — orgId from a dynamic value', () => {
    expect(verdictOf('createSuppliesOrgId')).toBe('supplied');
  });

  it('GREEN: upsertSuppliesOrgId — orgId in the upsert create: branch', () => {
    expect(verdictOf('upsertSuppliesOrgId')).toBe('supplied');
  });

  it('RED (BITE): createOmitsOrgId — data omits orgId', () => {
    expect(verdictOf('createOmitsOrgId')).toBe('omit');
  });

  it('RED (BITE — literal/theater): createLiteralSingleton — orgId is the singleton string literal', () => {
    expect(verdictOf('createLiteralSingleton')).toBe('literal');
  });

  it('RED (BITE — conditional spread): createConditionalSpread — `...(cond?{orgId}:{})` has no direct orgId', () => {
    expect(verdictOf('createConditionalSpread')).toBe('omit');
  });

  it('RED (BITE — client-agnostic): txOmitsOrgId — `(tx as any).ipa.create` omit bites, not just prisma.', () => {
    expect(verdictOf('txOmitsOrgId')).toBe('omit');
  });

  it('SKIP: notATenantModel — workflowAction ∉ WRITE_TENANT_MODELS, not enumerated', () => {
    expect(verdictOf('notATenantModel')).toBeUndefined();
  });
});
