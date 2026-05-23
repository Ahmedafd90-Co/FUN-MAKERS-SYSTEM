/**
 * PIC-50 — WORKFLOW_TEMPLATE_REGISTRY parity guard + recurrence proof.
 *
 * Three sources must stay in lockstep:
 *   1. `WORKFLOW_DRIVEN_MODELS` in `@fmksa/db` (Pascal-case Prisma model names;
 *      defines which entities are workflow-managed for the no-direct-status-write
 *      guardrail).
 *   2. `WORKFLOW_TEMPLATE_REGISTRY` in `@fmksa/contracts` (recordType → template-
 *      code prefix mapping; consumed by template-resolution.ts to construct
 *      `${prefix}_standard` / `${prefix}_high_value` lookups without string
 *      heuristics).
 *   3. Seeded `workflow_template` rows (the actual templates).
 *
 * Drift modes this guard catches:
 *
 *   a. Entity added to WORKFLOW_DRIVEN_MODELS but missing from
 *      WORKFLOW_TEMPLATE_REGISTRY → resolver falls into the legacy alphabetical
 *      fallback (the "honest-limits" escape hatch for non-workflow-managed
 *      recordTypes), losing the registry's correctness guarantee.
 *
 *   b. Registry entry added without a corresponding seeded `${prefix}_standard`
 *      template → resolveTemplate returns null at production runtime, silently
 *      failing the entity's workflow auto-start.
 *
 *   c. Subtype-driven recordType resolved without a subtype → previously
 *      would fall through to alphabetical `endsWith` heuristic returning the
 *      wrong tier (Correspondence's latent back_charge_standard mis-routing
 *      finding from PIC-50 Phase A recon). Resolver now returns null;
 *      this test proves it.
 *
 * Per the PIC-49 lesson — a mechanism guarding against a failure mode MUST
 * have a test that proves the failure case is caught, not just one that
 * proves the happy path. The deliberately-divergent fixture at the bottom
 * of this file synthesises drift mode (b) and asserts the parity check
 * identifies exactly that offender. Without it, the parity halves above
 * are happy-path assertions only.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma, WORKFLOW_DRIVEN_MODELS } from '@fmksa/db';
import {
  WORKFLOW_TEMPLATE_REGISTRY,
  type WorkflowTemplateRegistryEntry,
} from '@fmksa/contracts';
import { resolveTemplate } from '../../src/workflow/template-resolution';
import { assertTestDb } from '../helpers/assert-test-db';

// Narrow the registry to a uniform iterable shape (the discriminated union
// is preserved via WorkflowTemplateRegistryEntry — Half 2/3/4 narrow per case
// using `entry.mode`).
const REGISTRY: Record<string, WorkflowTemplateRegistryEntry> =
  WORKFLOW_TEMPLATE_REGISTRY;

// ---------------------------------------------------------------------------
// Pascal-case model → snake_case recordType mapping (test-local).
//
// Kept hardcoded here rather than computed by a converter because (a) RFQ is
// a 3-letter all-caps acronym that doesn't follow standard PascalCase rules,
// and (b) this mapping IS what the parity test verifies — using a converter
// would mean the test trusts the converter, which is itself a source of drift.
// The test is the third source of truth; if it ever disagrees with reality,
// either the test, the registry, or WORKFLOW_DRIVEN_MODELS is wrong.
// ---------------------------------------------------------------------------

const MODEL_TO_RECORD_TYPE: Record<(typeof WORKFLOW_DRIVEN_MODELS)[number], string> = {
  Ipa: 'ipa',
  Ipc: 'ipc',
  Variation: 'variation',
  Correspondence: 'correspondence',
  Expense: 'expense',
  PurchaseOrder: 'purchase_order',
  RFQ: 'rfq',
  SupplierInvoice: 'supplier_invoice',
  DrawingRevision: 'drawing_revision', // PIC-52
  CostProposal: 'cost_proposal',
  TaxInvoice: 'tax_invoice',
  VendorContract: 'vendor_contract',
  FrameworkAgreement: 'framework_agreement',
  CreditNote: 'credit_note',
};

// Snapshot of every recordType the registry knows about (typed string[] for iteration).
const REGISTRY_RECORD_TYPES = Object.keys(WORKFLOW_TEMPLATE_REGISTRY);

describe('PIC-50 — WORKFLOW_TEMPLATE_REGISTRY parity guard', () => {
  // Top-level fixture: activate every workflow-managed template in the test DB.
  // Prior test runs can leave templates `isActive: false`; the parity check
  // and behavioural assertions need them active. Mirrors the same setup
  // pattern used in `template-resolution-threshold.test.ts`.
  beforeAll(async () => {
    assertTestDb();
    process.env.SEED_CONTEXT = 'true';
    await prisma.workflowTemplate.updateMany({
      where: { recordType: { in: REGISTRY_RECORD_TYPES } },
      data: { isActive: true },
    });
    delete process.env.SEED_CONTEXT;
  }, 60_000);

  // -------------------------------------------------------------------------
  // Half 1 — WORKFLOW_DRIVEN_MODELS ↔ WORKFLOW_TEMPLATE_REGISTRY
  // -------------------------------------------------------------------------

  describe('Half 1 — model list parity', () => {
    it('every WORKFLOW_DRIVEN_MODELS entry has a registry entry', () => {
      const missing: string[] = [];
      for (const model of WORKFLOW_DRIVEN_MODELS) {
        const recordType = MODEL_TO_RECORD_TYPE[model];
        if (!(recordType in WORKFLOW_TEMPLATE_REGISTRY)) {
          missing.push(`${model} (${recordType})`);
        }
      }
      expect(missing).toEqual([]);
    });

    it('every WORKFLOW_TEMPLATE_REGISTRY entry corresponds to a known workflow-managed model', () => {
      const knownRecordTypes = new Set(Object.values(MODEL_TO_RECORD_TYPE));
      const orphans: string[] = [];
      for (const recordType of REGISTRY_RECORD_TYPES) {
        if (!knownRecordTypes.has(recordType)) {
          orphans.push(recordType);
        }
      }
      expect(orphans).toEqual([]);
    });

    it('counts match (14 == 14 == 14)', () => {
      // PIC-52 added DrawingRevision atomically (model + registry entry +
      // MODEL_TO_RECORD_TYPE entry + seed template), advancing the count
      // from 13 to 14. Future entity-adding PRs bump this in lockstep.
      expect(WORKFLOW_DRIVEN_MODELS.length).toBe(14);
      expect(Object.keys(MODEL_TO_RECORD_TYPE).length).toBe(14);
      expect(REGISTRY_RECORD_TYPES.length).toBe(14);
    });
  });

  // -------------------------------------------------------------------------
  // Half 2 — every standard-default registry entry has a `${prefix}_standard`
  // template seeded in the test DB.
  // -------------------------------------------------------------------------

  describe('Half 2 — standard-default seed parity', () => {
    beforeAll(() => {
      assertTestDb();
    });

    it.each(
      REGISTRY_RECORD_TYPES.flatMap((rt) => {
        const entry = REGISTRY[rt];
        if (!entry || entry.mode !== 'standard-default') return [];
        return [[rt, entry.prefix] as const];
      }),
    )(
      'recordType %s has %s_standard template seeded',
      async (recordType, prefix) => {
        const template = await prisma.workflowTemplate.findFirst({
          where: { code: `${prefix}_standard`, recordType, isActive: true },
          select: { code: true },
        });
        expect(template).toBeTruthy();
        expect(template?.code).toBe(`${prefix}_standard`);
      },
    );
  });

  // -------------------------------------------------------------------------
  // Half 3 — subtype-driven entries have at least one `_standard` template
  //          AND no-subtype resolveTemplate returns null (load-bearing
  //          behavioural assertion proving the Correspondence latent path
  //          is dead per PIC-50 Phase A finding).
  // -------------------------------------------------------------------------

  describe('Half 3 — subtype-driven entries: structural AND behavioural parity', () => {
    let testProjectId: string;
    let testEntityId: string;

    beforeAll(async () => {
      assertTestDb();
      const ts = Date.now();
      process.env.SEED_CONTEXT = 'true';

      const entity = await prisma.entity.create({
        data: {
          code: `PIC50-PARITY-ENT-${ts}`,
          name: `PIC-50 Parity Test Entity ${ts}`,
          type: 'parent',
          status: 'active',
        },
      });
      testEntityId = entity.id;

      await prisma.currency.upsert({
        where: { code: 'SAR' },
        update: {},
        create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
      });

      const project = await prisma.project.create({
        data: {
          entityId: entity.id,
          code: `PIC50-PARITY-${ts}`,
          name: `PIC-50 Parity Test Project ${ts}`,
          status: 'active',
          currencyCode: 'SAR',
          startDate: new Date(),
          createdBy: 'test',
        },
      });
      testProjectId = project.id;

      delete process.env.SEED_CONTEXT;
    }, 60_000);

    afterAll(async () => {
      process.env.SEED_CONTEXT = 'true';
      await prisma.project.delete({ where: { id: testProjectId } }).catch(() => {});
      await prisma.entity.delete({ where: { id: testEntityId } }).catch(() => {});
      delete process.env.SEED_CONTEXT;
    }, 60_000);

    const subtypeDrivenRecordTypes = REGISTRY_RECORD_TYPES.filter(
      (rt) => REGISTRY[rt]?.mode === 'subtype-driven',
    );

    it('there is at least one subtype-driven recordType (sanity)', () => {
      // If this fails, the registry has no subtype-driven entries and the
      // tests below have nothing to assert. Catch the silent-empty case.
      expect(subtypeDrivenRecordTypes.length).toBeGreaterThan(0);
    });

    it.each(subtypeDrivenRecordTypes)(
      'subtype-driven recordType %s has at least one *_standard template seeded',
      async (recordType) => {
        const template = await prisma.workflowTemplate.findFirst({
          where: { recordType, isActive: true, code: { endsWith: '_standard' } },
          select: { code: true },
        });
        // The `endsWith` here is in the TEST, not in production code — we're
        // verifying that AT LEAST ONE template exists for the subtype-driven
        // entity so subtype-with-subtype callers can find something.
        expect(template).toBeTruthy();
      },
    );

    it.each(subtypeDrivenRecordTypes)(
      'subtype-driven recordType %s resolves to NULL when called WITHOUT subtype (PIC-50 Correspondence governance fix)',
      async (recordType) => {
        // This is the load-bearing behavioural assertion. Pre-PIC-50, the
        // resolver's `endsWith: '_standard'` heuristic would have returned
        // an alphabetically-first match (e.g. `back_charge_standard` for
        // correspondence — wrong financial-approval tier).
        //
        // Post-PIC-50, subtype-driven recordTypes without subtype return null.
        // The caller is responsible for either providing the subtype or
        // accepting that no workflow is configured.
        const result = await resolveTemplate(recordType, testProjectId);
        expect(result).toBeNull();
      },
    );

    it('correspondence WITH subtype still resolves correctly (regression check)', async () => {
      // The fix above must not break the happy path. With subtype, the resolver
      // takes the `startsWith: '${subtype}_'` branch and returns `letter_standard`.
      const result = await resolveTemplate('correspondence', testProjectId, 'letter');
      expect(result).not.toBeNull();
      expect(result?.code).toBe('letter_standard');
    });
  });

  // -------------------------------------------------------------------------
  // Half 4 — end-to-end behavioural: resolveTemplate returns the expected
  // `${prefix}_standard` for every standard-default registry entry.
  // -------------------------------------------------------------------------

  describe('Half 4 — end-to-end behavioural resolution', () => {
    let testProjectId: string;
    let testEntityId: string;

    beforeAll(async () => {
      assertTestDb();
      const ts = Date.now();
      process.env.SEED_CONTEXT = 'true';

      const entity = await prisma.entity.create({
        data: {
          code: `PIC50-E2E-ENT-${ts}`,
          name: `PIC-50 E2E Test Entity ${ts}`,
          type: 'parent',
          status: 'active',
        },
      });
      testEntityId = entity.id;

      await prisma.currency.upsert({
        where: { code: 'SAR' },
        update: {},
        create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
      });

      const project = await prisma.project.create({
        data: {
          entityId: entity.id,
          code: `PIC50-E2E-${ts}`,
          name: `PIC-50 E2E Test Project ${ts}`,
          status: 'active',
          currencyCode: 'SAR',
          startDate: new Date(),
          createdBy: 'test',
        },
      });
      testProjectId = project.id;

      delete process.env.SEED_CONTEXT;
    }, 60_000);

    afterAll(async () => {
      process.env.SEED_CONTEXT = 'true';
      await prisma.project.delete({ where: { id: testProjectId } }).catch(() => {});
      await prisma.entity.delete({ where: { id: testEntityId } }).catch(() => {});
      delete process.env.SEED_CONTEXT;
    }, 60_000);

    const standardDefaultEntries = REGISTRY_RECORD_TYPES.flatMap((rt) => {
      const entry = REGISTRY[rt];
      if (!entry || entry.mode !== 'standard-default') return [];
      return [[rt, entry.prefix] as const];
    });

    it.each(standardDefaultEntries)(
      'resolveTemplate(%s) returns %s_standard (no project/entity overrides)',
      async (recordType, prefix) => {
        const result = await resolveTemplate(recordType, testProjectId);
        expect(result).not.toBeNull();
        expect(result?.code).toBe(`${prefix}_standard`);
        expect(result?.source).toBe('system_default');
      },
    );
  });

  // -------------------------------------------------------------------------
  // Deliberately-divergent fixture (PIC-49 load-bearing proof).
  //
  // Per the PIC-49 lesson — a parity check without a test proving it actually
  // catches drift is unproven. This synthesises drift mode (b): a registry
  // entry with no matching seed template. The parity logic from Half 2 is
  // re-run against the synthetic divergent registry and asserted to identify
  // exactly the fake offender.
  //
  // If this test ever fails, the parity-check logic itself is broken — the
  // Half 2 tests above would be happy-path-only and could pass even with
  // real drift hidden inside them.
  // -------------------------------------------------------------------------

  describe('deliberately-divergent fixture (PIC-49 load-bearing proof)', () => {
    it('parity check identifies a registry entry with no matching seed template', async () => {
      assertTestDb();

      // Synthesise drift: extend the real registry with a fake entry whose
      // `fake_entity_standard` template does not exist in seed.
      const SYNTHETIC_DIVERGENT = {
        ...WORKFLOW_TEMPLATE_REGISTRY,
        fake_entity: { mode: 'standard-default', prefix: 'fake_entity' } as const,
      };

      // Re-run the parity check from Half 2 against the synthetic registry
      // and collect every offender (registered standard-default entry with
      // no matching seed template).
      const offenders: string[] = [];
      for (const [recordType, entry] of Object.entries(SYNTHETIC_DIVERGENT)) {
        if (entry.mode !== 'standard-default') continue;
        const template = await prisma.workflowTemplate.findFirst({
          where: { code: `${entry.prefix}_standard`, isActive: true },
          select: { code: true },
        });
        if (!template) offenders.push(recordType);
      }

      // MUST be exactly ['fake_entity']. If a real registered entity appears,
      // either the Half 2 assertions above are wrong, or the seed has drifted,
      // or someone added a registry entry without seeding the template. All
      // three are valid failures this fixture is designed to expose.
      expect(offenders).toEqual(['fake_entity']);
    });
  });
});
