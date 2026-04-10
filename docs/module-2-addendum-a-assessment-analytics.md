# Module 2 — Addendum A: Assessment Structure & Analytics Hooks

**Date:** 2026-04-10
**Status:** APPROVED — applied to M2 spec and plan
**Parent spec:** `docs/superpowers/specs/2026-04-10-module-2-commercial-engine-design.md`
**Scope lock:** This addendum extends M2 where items directly affect the commercial data model, forms, filters, and dashboard. It does NOT reopen M2 scope.

---

## 1. Items Applied to Module 2

### A1. Consultant Assessment Structure — Variation / Change Order

**Impact:** 4 new nullable fields on the `Variation` model.

| Field | Type | Notes |
|-------|------|-------|
| `assessedCostImpact` | Decimal(18,2)? | Consultant's recommended cost — populated during `review` |
| `assessedTimeImpactDays` | Int? | Consultant's recommended time impact |
| `approvedCostImpact` | Decimal(18,2)? | Final approved cost — populated at `approve` |
| `approvedTimeImpactDays` | Int? | Final approved time |

**Rationale:** The existing `costImpact` and `timeImpactDays` represent the contractor's **submitted** values. Assessment fields capture the consultant's recommendation before final approval. This gives three-stage value tracking: submitted → assessed → approved.

**Service behavior:** The `review` transition action populates `assessed*` fields from the transition input. The `approve_internal` transition populates `approved*` fields. Fields are nullable because not every transition path requires consultant assessment (e.g., small VOs may skip straight to approval).

### A2. Consultant Assessment Structure — Cost Proposal

**Impact:** 4 new nullable fields on the `CostProposal` model.

| Field | Type | Notes |
|-------|------|-------|
| `assessedCost` | Decimal(18,2)? | Consultant's assessed cost |
| `assessedTimeDays` | Int? | Assessed time impact |
| `approvedCost` | Decimal(18,2)? | Final approved cost |
| `approvedTimeDays` | Int? | Final approved time |

**Rationale:** Same three-stage pattern as Variation. The existing `estimatedCost` and `estimatedTimeDays` are the contractor's submitted values.

### A3. Advanced Register Filters, Sorting, Saved Views, and Drilldown

**Impact:** Enhanced list procedure inputs + one shared UI component + localStorage persistence.

**Backend (all 6 list procedures):**
- `sortField` (string, optional) — column to sort by, defaults to `createdAt`
- `sortDirection` (`asc` | `desc`, optional) — defaults to `desc`
- `statusFilter` (string[], optional) — multi-select status filter (replaces single status)
- `dateFrom` / `dateTo` (DateTime?, optional) — creation date range
- `amountMin` / `amountMax` (Decimal?, optional) — applicable to financial record types
- `createdByFilter` (string?, optional) — filter by creator user ID

**Frontend:**
- `<RegisterFilterBar>` shared component: renders filter dropdowns, sort selector, and saved view management
- Saved views: localStorage-only (key: `fmksa:savedViews:{recordType}:{userId}`). No new Prisma model. Each view stores a named set of filter/sort params as JSON.
- Drilldown: Dashboard status counts link to list view pre-filtered by clicked status (via URL query params)

**No new database models.** This is purely router input params + UI.

### A4. Document-Type Filters for Commercial Records

**Impact:** UI-only filter on the document attachment panel within detail views.

The document panel on each commercial record detail page gets a filter dropdown that filters attached documents by file type category (derived from MIME type or file extension):
- All
- Documents (PDF, Word, Excel)
- Images (PNG, JPG, SVG)
- Spreadsheets (XLS, XLSX, CSV)

**No schema changes.** Filtering is done client-side on the document list already fetched for the record.

### A5. Submitted vs Assessed vs Approved Value Tracking

**Impact:** Directly served by A1 and A2 fields, plus existing IPA→IPC relationship.

Three-stage tracking per record family:
- **IPA → IPC:** Submitted = `IPA.netClaimed`, Certified = `IPC.netCertified` (already in spec — no changes needed)
- **Variation:** Submitted = `costImpact`, Assessed = `assessedCostImpact`, Approved = `approvedCostImpact` (from A1)
- **Cost Proposal:** Submitted = `estimatedCost`, Assessed = `assessedCost`, Approved = `approvedCost` (from A2)
- **Claim:** Submitted = `claimedAmount`, Settled = `settledAmount` (already in spec)

Detail views display all three stages where available. Dashboard financial summary expanded (see A6).

### A6. Commercial Variance and Reduction Analytics Hooks

**Impact:** New `varianceAnalytics` section in the dashboard summary + extension hooks for M4/M5.

```typescript
varianceAnalytics: {
  ipaVariance: {
    totalSubmitted: Decimal,    // Sum IPA.netClaimed (approved+ status)
    totalCertified: Decimal,    // Sum IPC.netCertified (signed+ status)
    reductionAmount: Decimal,   // submitted - certified
    reductionPercent: number,   // percentage reduction
  },
  variationVariance: {
    totalSubmitted: Decimal,    // Sum Variation.costImpact (approved+ status)
    totalApproved: Decimal,     // Sum Variation.approvedCostImpact
    reductionAmount: Decimal,
    reductionPercent: number,
  },
  costProposalVariance: {
    totalEstimated: Decimal,    // Sum CostProposal.estimatedCost (approved+ status)
    totalApproved: Decimal,     // Sum CostProposal.approvedCost
    reductionAmount: Decimal,
    reductionPercent: number,
  },
}
```

**Dashboard UI:** A "Variance Summary" card showing per-family submitted vs approved totals and reduction percentages. This is a read-only analytics section — M2 computes it from existing data. M4/M5 will extend this into full cost analytics dashboards.

**Extension point:** The variance computation functions are exported from the dashboard service so M4/M5 can import them directly.

---

## 2. What This Addendum Does NOT Change

- No new Prisma models (still 6 models)
- No new posting events (still 7)
- No new workflow templates (still 15)
- No changes to the role-permission matrix
- No procurement/cost-control features
- No new screens (still 13)
- No conditional workflow branching
- Linear-first workflow is unchanged
