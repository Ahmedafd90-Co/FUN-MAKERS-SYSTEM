/**
 * I5 — KPI Dictionary Freeze Check
 *
 * Guards the KPI dictionary against silent drift. If any of these tests
 * fail, it means someone modified the dictionary or the dashboard rendering
 * contract without updating both sides.
 *
 * These are pure structural tests — no database required.
 */
import { describe, it, expect } from 'vitest';
import {
  KPI_DEFINITIONS,
  getKpiDefinition,
  getSupportedKpis,
  getBlockedKpis,
  DASHBOARD_DISPLAY_IDS,
  PERCENTAGE_KPI_IDS,
  IPA_APPROVED_PLUS,
  IPC_SIGNED_PLUS,
  TI_ISSUED_PLUS,
  TI_OPEN_STATUSES,
  VAR_SUBMITTED_PLUS,
  VAR_APPROVED_PLUS,
  type KpiDrilldown,
} from '../../src/commercial/dashboard/kpi-definitions';

// ---------------------------------------------------------------------------
// I5.1 — Supported KPIs have drilldown metadata
// ---------------------------------------------------------------------------

describe('KPI Dictionary Freeze', () => {
  describe('drilldown metadata completeness', () => {
    it('every supported KPI has non-null drilldown metadata', () => {
      for (const def of getSupportedKpis()) {
        expect(
          def.drilldown,
          `Supported KPI "${def.id}" must have drilldown metadata`,
        ).not.toBeNull();
      }
    });

    it('every blocked/partially_supported KPI has null drilldown', () => {
      for (const def of getBlockedKpis()) {
        expect(
          def.drilldown,
          `Blocked KPI "${def.id}" must NOT have drilldown metadata`,
        ).toBeNull();
      }
    });

    it('every blocked/partially_supported KPI has a blockedReason', () => {
      for (const def of getBlockedKpis()) {
        expect(
          def.blockedReason,
          `Blocked KPI "${def.id}" must have a blockedReason`,
        ).toBeTruthy();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // I5.2 — Dashboard display IDs are all valid and supported
  // ---------------------------------------------------------------------------

  describe('dashboard display IDs', () => {
    it('every ID in DASHBOARD_DISPLAY_IDS exists in KPI_DEFINITIONS', () => {
      for (const id of DASHBOARD_DISPLAY_IDS) {
        const def = getKpiDefinition(id);
        expect(def, `Dashboard ID "${id}" not found in KPI_DEFINITIONS`).toBeDefined();
      }
    });

    it('every ID in DASHBOARD_DISPLAY_IDS is "supported"', () => {
      for (const id of DASHBOARD_DISPLAY_IDS) {
        const def = getKpiDefinition(id)!;
        expect(
          def.supportStatus,
          `Dashboard ID "${id}" is "${def.supportStatus}", expected "supported"`,
        ).toBe('supported');
      }
    });

    it('no KPI rendered by the dashboard is absent from the dictionary', () => {
      // This is the inverse — every dashboard ID must resolve
      const dictionaryIds = new Set(KPI_DEFINITIONS.map((k) => k.id));
      for (const id of DASHBOARD_DISPLAY_IDS) {
        expect(
          dictionaryIds.has(id),
          `Dashboard renders "${id}" but it does not exist in KPI_DEFINITIONS`,
        ).toBe(true);
      }
    });

    it('DASHBOARD_DISPLAY_IDS contains no duplicates', () => {
      const unique = new Set(DASHBOARD_DISPLAY_IDS);
      expect(unique.size).toBe(DASHBOARD_DISPLAY_IDS.length);
    });
  });

  // ---------------------------------------------------------------------------
  // I5.3 — Percentage KPI IDs are valid
  // ---------------------------------------------------------------------------

  describe('percentage KPI IDs', () => {
    it('every ID in PERCENTAGE_KPI_IDS exists in KPI_DEFINITIONS and is supported', () => {
      for (const id of PERCENTAGE_KPI_IDS) {
        const def = getKpiDefinition(id);
        expect(def, `Percentage KPI "${id}" not found in KPI_DEFINITIONS`).toBeDefined();
        expect(def!.supportStatus).toBe('supported');
      }
    });

    it('collection_rate is the only percentage KPI', () => {
      expect(PERCENTAGE_KPI_IDS.has('collection_rate')).toBe(true);
      expect(PERCENTAGE_KPI_IDS.size).toBe(1);
    });

    it('no currency KPI is marked as percentage', () => {
      const currencyKpiIds = DASHBOARD_DISPLAY_IDS.filter(
        (id) => !PERCENTAGE_KPI_IDS.has(id),
      );
      // All non-percentage dashboard KPIs should NOT be in the percentage set
      for (const id of currencyKpiIds) {
        expect(
          PERCENTAGE_KPI_IDS.has(id),
          `Currency KPI "${id}" is incorrectly in PERCENTAGE_KPI_IDS`,
        ).toBe(false);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // I5.4 — Status filters in drilldown metadata align with KPI definition
  // ---------------------------------------------------------------------------

  describe('status filter alignment', () => {
    /**
     * For most KPIs, the drilldown statusFilter should match the KPI's
     * own statusFilter (the filter used in the query). Exceptions:
     * - total_collected: drilldown shows collected+partially_collected invoices
     * - collection_rate: drilldown shows all issued+ invoices
     * - claimed_vs_certified_gap: derived, no own statusFilter
     * - budget / revised_budget: project-level, no status filter
     */

    const EXACT_MATCH_KPIS = [
      'total_claimed',
      'total_certified',
      'total_invoiced',
      'open_receivable',
      'overdue_receivable',
      'submitted_variation_impact',
      'approved_variation_impact',
    ];

    for (const kpiId of EXACT_MATCH_KPIS) {
      it(`${kpiId}: drilldown statusFilter matches KPI statusFilter`, () => {
        const def = getKpiDefinition(kpiId)!;
        expect(def.supportStatus).toBe('supported');
        expect(def.drilldown).not.toBeNull();

        // Single drilldown — compare directly
        if (!Array.isArray(def.drilldown)) {
          const dd = def.drilldown as KpiDrilldown;
          expect(
            [...dd.statusFilter].sort(),
            `${kpiId}: drilldown statusFilter diverges from KPI statusFilter`,
          ).toEqual([...def.statusFilter].sort());
        }
      });
    }

    it('total_collected drilldown targets collected + partially_collected', () => {
      const def = getKpiDefinition('total_collected')!;
      const dd = def.drilldown as KpiDrilldown;
      expect([...dd.statusFilter].sort()).toEqual(['collected', 'partially_collected']);
    });

    it('collection_rate drilldown shows all issued+ invoices', () => {
      const def = getKpiDefinition('collection_rate')!;
      const dd = def.drilldown as KpiDrilldown;
      expect([...dd.statusFilter].sort()).toEqual([...TI_ISSUED_PLUS].sort());
    });

    it('claimed_vs_certified_gap has dual drilldown (IPA + IPC)', () => {
      const def = getKpiDefinition('claimed_vs_certified_gap')!;
      expect(Array.isArray(def.drilldown)).toBe(true);
      const dds = def.drilldown as KpiDrilldown[];
      expect(dds).toHaveLength(2);
      expect(dds[0]!.page).toContain('/ipa');
      expect(dds[1]!.page).toContain('/ipc');
      expect([...dds[0]!.statusFilter].sort()).toEqual([...IPA_APPROVED_PLUS].sort());
      expect([...dds[1]!.statusFilter].sort()).toEqual([...IPC_SIGNED_PLUS].sort());
    });

    it('overdue_receivable drilldown includes overdue=true in additionalFilters', () => {
      const def = getKpiDefinition('overdue_receivable')!;
      const dd = def.drilldown as KpiDrilldown;
      expect(dd.additionalFilters).toBeDefined();
      expect(dd.additionalFilters!.overdue).toBe('true');
    });
  });

  // ---------------------------------------------------------------------------
  // I5.5 — Dictionary structural invariants
  // ---------------------------------------------------------------------------

  describe('structural invariants', () => {
    it('every KPI has a unique id', () => {
      const ids = KPI_DEFINITIONS.map((k) => k.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('every KPI has a non-empty name', () => {
      for (const def of KPI_DEFINITIONS) {
        expect(def.name.length, `KPI "${def.id}" has empty name`).toBeGreaterThan(0);
      }
    });

    it('every KPI has at least one sourceRecord', () => {
      for (const def of KPI_DEFINITIONS) {
        expect(
          def.sourceRecords.length,
          `KPI "${def.id}" has no sourceRecords`,
        ).toBeGreaterThan(0);
      }
    });

    it('dictionary contains exactly 15 KPIs (all supported)', () => {
      expect(KPI_DEFINITIONS).toHaveLength(15);
      expect(getSupportedKpis()).toHaveLength(15);
      expect(getBlockedKpis()).toHaveLength(0);
    });

    it('status filter constants are non-empty arrays', () => {
      expect(IPA_APPROVED_PLUS.length).toBeGreaterThan(0);
      expect(IPC_SIGNED_PLUS.length).toBeGreaterThan(0);
      expect(TI_ISSUED_PLUS.length).toBeGreaterThan(0);
      expect(TI_OPEN_STATUSES.length).toBeGreaterThan(0);
      expect(VAR_SUBMITTED_PLUS.length).toBeGreaterThan(0);
      expect(VAR_APPROVED_PLUS.length).toBeGreaterThan(0);
    });
  });
});
