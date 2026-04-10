# Module 2 — Addendum B: Future-Scope Freeze

**Date:** 2026-04-10
**Status:** FROZEN — not in Module 2 scope
**Requested by:** Ahmed Al-Dossary
**Purpose:** Formal capture of scope items explicitly excluded from Module 2. These items belong in Modules 3 (Procurement), 4 (Budget/Cost/Cashflow), or 5 (KPI Dashboards) and should be referenced during those modules' brainstorming and design phases.

---

## Frozen Items

### B1. Procurement Category / Subcategory / Spend-Type Framework

**Description:** A hierarchical classification system for procurement items: category → subcategory → spend type. Enables structured spend analysis across projects.

**Target module:** Module 3 (Procurement)
**Why not M2:** M2 is the Commercial/Contracts Engine. Procurement categories are a supply-chain concept — they belong with RFQ, PO, and supplier invoice workflows in M3.

---

### B2. Spend Intelligence Dashboard

**Description:** Cross-project dashboard showing spend patterns, trends, and anomalies across procurement categories and vendors. Includes historical comparison and forecasting.

**Target module:** Module 5 (KPI Dashboards) — depends on M3 procurement data + M4 budget data
**Why not M2:** Requires procurement transaction data (M3) and budget allocations (M4). M2 provides commercial variance hooks that feed into this, but the dashboard itself needs data from later modules.

---

### B3. Cost Reduction / Cut-Down Dashboard

**Description:** Dashboard showing cost savings achieved through negotiation, value engineering, and scope optimization. Tracks reduction at category and project level.

**Target module:** Module 4 (Budget/Cost/Cashflow) or Module 5 (KPI Dashboards)
**Why not M2:** Full cost reduction analysis requires budget baselines (M4) and procurement benchmarks (M3). M2's variance analytics hooks (Addendum A, item A6) provide the commercial-side reduction data that feeds into this.

---

### B4. Accommodation / Manpower / Materials / Transport / Equipment Spend Analysis

**Description:** Breakdown of project spend by cost category: accommodation, manpower, materials, transport, and equipment. Per-project and cross-project views.

**Target module:** Module 4 (Budget/Cost/Cashflow) — depends on M3 procurement categories
**Why not M2:** These are cost-accounting categories, not commercial record types. They require cost code structures and budget allocations from M4, populated by procurement data from M3.

---

### B5. Procurement Vendor Concentration and Abnormal Spend Analytics

**Description:** Analytics identifying over-reliance on single vendors, abnormal spend patterns, and procurement risk indicators.

**Target module:** Module 5 (KPI Dashboards) — depends on M3 vendor/supplier data
**Why not M2:** Requires a vendor registry and procurement transaction history (M3). M2 has no vendor or supplier concepts.

---

### B6. Temporary Cost Dashboard

**Description:** Dashboard for tracking temporary/provisional cost items that haven't been finalized or allocated to permanent cost codes.

**Target module:** Module 4 (Budget/Cost/Cashflow)
**Why not M2:** "Temporary cost" is a budget management concept. M2 tracks commercial records (IPAs, variations, etc.), not cost allocations.

---

### B7. Custom Procurement Categorization Framework

**Description:** User-configurable categorization system allowing each entity/project to define custom procurement categories beyond the standard hierarchy.

**Target module:** Module 3 (Procurement) — configuration layer
**Why not M2:** Procurement categorization is M3 scope. The configuration layer for custom categories is part of M3's design decisions.

---

## Cross-References

When designing Modules 3–5, reference this document for pre-identified scope items. The M2 extension points that support these future items:

| M2 Extension Point | Future Items It Supports |
|---|---|
| Posting events with amount/currency/exposure type | B2, B3 (cost reduction from commercial events) |
| Variance analytics hooks (Addendum A, A6) | B2, B3, B4 (commercial-side variance feeds into full cost analytics) |
| Variation model | B1 (procurement may reference VOs for scope-change-driven purchases) |
| Commercial permission codes | All (RBAC grows additively) |
| ReferenceCounter service | B1, B7 (procurement numbering can reuse the same service) |
