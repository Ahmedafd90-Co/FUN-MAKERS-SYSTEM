# Blueprint Refactor Summary

**Date:** 2026-04-11
**Source:** "Integrated Project Approval & Commercial Control System" canvas document (142,033 characters, 4,946 paragraphs, 32 major sections)

---

## 1. Refactored Structure

### Blueprint (Authoritative — Stable)
`docs/blueprint/00-blueprint.md` — 16 sections

| # | Section | Source Sections | What Changed |
|---|---|---|---|
| 1 | Purpose | S1 (Document Control) | Condensed from BRD header to single paragraph |
| 2 | Executive Summary | S2 | Preserved core, added engines table |
| 3 | Business Objectives | S3 | Preserved verbatim (10 objectives) |
| 4 | Scope | S4, S5 | Merged in-scope and out-of-scope; tabularized by engine |
| 5 | Stakeholders | S6 | Condensed to role table + department ownership |
| 6 | User Roles & Authority | S7 | Preserved 14 roles, permissions, delegation, budget transfer rules |
| 7 | Business Rules | S17 | Preserved all 22 business rules |
| 8 | Engine Architecture | S24.1, S24.2, S24.3, S24.6 | Merged principles + engines map + layers into one section |
| 9 | Process Controls | S24.5 | Preserved dead-end prevention, posting controls, change controls |
| 10 | Multi-Entity Logic | S31.7, S31.8 | Preserved entity model + percentage allocation |
| 11 | AI & Agent Guardrails | S31.3-S31.6 | Condensed to may/may-not table + agent framework summary |
| 12 | Module Roadmap | S32.1, S32.2 | Preserved mandatory build order (M1-M7) |
| 13 | Non-Functional Requirements | S16 | Preserved all 6 categories |
| 14 | Governance References | — | New section linking to guardrails + architecture docs |
| 15 | Appendix References | — | New section linking to appendices A-F |
| 16 | Final Recommendation | S30, S31.15 | Preserved core recommendation + engineering principles |

### Appendices (Volatile — Expected to Evolve)

| Appendix | File | Source Sections | Content |
|---|---|---|---|
| A | `appendices/A-workflow-approval-matrices.md` | S10, S24.8, S26 | 7 workflow matrices, approval matrix, flexible template logic, material/procurement status model |
| B | `appendices/B-data-model-schema.md` | S11-S13, S24.9, S28, S32.5, S32.9 | Data model principles, entity groups, schema rules, representative DDL, constraint rules |
| C | `appendices/C-ui-screen-form-design.md` | S14-S15, S24.7, S24.15, S32.6 | UX principles, screen lists, design patterns, field-by-field forms, tracker screens |
| D | `appendices/D-event-posting-kpi-logic.md` | S22, S24.11, S27, S32.4 | Posting event catalog, payload standard, reversal logic, KPI formulas, health score, red flags |
| E | `appendices/E-ai-agent-extraction-logic.md` | S24.12, S31.3-S31.6 | Extraction pipeline, output fields, letter analysis, drafting guardrails, confidence rules, agent architecture |
| F | `appendices/F-test-delivery-build-guidance.md` | S19, S21, S24.13-24.14, S25, S29, S31.10-S31.15, S32.3, S32.7-S32.10 | Build order, delivery strategy, services, test plan, release gates, admin requirements, user stories |

---

## 2. Appendix Map

| Original Section | # | Title | Moved To |
|---|---|---|---|
| S10 | 10 | Workflow Matrix | Appendix A |
| S11 | 11 | Data Model Principles | Appendix B |
| S12 | 12 | Conceptual Database Schema | Appendix B |
| S13 | 13 | Key Relationships | Appendix B |
| S14 | 14 | Screen and Module List | Appendix C |
| S15 | 15 | Detailed Screen Components | Appendix C |
| S19 | 19 | Suggested Build Sequence | Appendix F (superseded by S32.2) |
| S21 | 21 | Final Deliverables from BRD | Appendix F |
| S22 | 22 | KPI Framework | Appendix D |
| S24.7 | 24.7 | Field-by-Field Forms | Appendix C |
| S24.8 | 24.8 | Approval Matrix | Appendix A |
| S24.9 | 24.9 | SQL Schema | Appendix B |
| S24.10 | 24.10 | API Endpoints List | Appendix F (not reproduced — implemented APIs are authoritative) |
| S24.11 | 24.11 | KPI Formulas | Appendix D |
| S24.12 | 24.12 | AI Extraction Logic | Appendix E |
| S24.13 | 24.13 | Build Sequence | Appendix F |
| S24.14 | 24.14 | Handoff Outputs | Appendix F |
| S24.15 | 24.15 | UX Requirements | Appendix C |
| S25 | 25 | Delivery Strategy | Appendix F |
| S26 | 26 | Flexible Workflow Architecture | Appendix A |
| S27 | 27 | Event / Posting Logic | Appendix D |
| S28 | 28 | Full PostgreSQL Schema | Appendix B |
| S29 | 29 | User Stories | Appendix F |
| S31.3 | 31.3 | AI Operating Model | Blueprint S11 + Appendix E |
| S31.4 | 31.4 | Agent Architecture | Blueprint S11 + Appendix E |
| S31.5 | 31.5 | Agent Guardrails | Blueprint S11 |
| S31.6 | 31.6 | Verification Marking | Blueprint S11 + Appendix E |
| S31.7 | 31.7 | Multi-Entity Logic | Blueprint S10 |
| S31.8 | 31.8 | Percentage Allocation | Blueprint S10 |
| S31.9 | 31.9 | Multi-Entity Tables | Appendix B |
| S31.10 | 31.10 | Admin Control Panel | Appendix F |
| S31.11 | 31.11 | Testing Strategy | Appendix F |
| S31.12 | 31.12 | Critical Test Scenarios | Appendix F |
| S31.13 | 31.13 | Safety Modes | Appendix F |
| S31.14 | 31.14 | Claude Access Model | Appendix E |
| S31.15 | 31.15 | Engineering Recommendation | Blueprint S16 |
| S32.1 | 32.1 | Build Decision | Blueprint S12 |
| S32.2 | 32.2 | Module Breakdown | Blueprint S12 |
| S32.3 | 32.3 | Service Breakdown | Appendix F |
| S32.4 | 32.4 | Event Ownership | Appendix D |
| S32.5 | 32.5 | Normalized Schema | Appendix B |
| S32.6 | 32.6 | Wireframe Notes | Appendix C |
| S32.7 | 32.7 | Test Plan | Appendix F |
| S32.8 | 32.8 | Build Prompt | Appendix F |
| S32.9 | 32.9 | Additional Schema | Appendix B |
| S32.10 | 32.10 | Start Instruction | Appendix F |

---

## 3. Duplication/Conflict Cleanup

### Duplicated Content Collapsed

| Content | Appeared In | Resolution |
|---|---|---|
| **Database schema** | S12, S24.9, S28, S32.5 | Collapsed into Appendix B with note that Prisma schema is live source of truth |
| **Build sequence / module list** | S19, S24.13, S25, S32.1, S32.2 | Canonical list is S32.2 (most complete), preserved in Blueprint S12 |
| **Module scope lists** | S9 (functional modules), S14 (screen lists), S32.2 (final breakdown) | Blueprint uses S32.2; screens in Appendix C; S9 redundant |
| **"Recommended next step"** | S23, S25 | Both superseded by S32 execution spec; S23 removed, S25 merged into Appendix F |
| **Approval matrix** | S10 (per-type matrices), S24.8 (unified matrix) | Both in Appendix A; S24.8 is the more complete form |
| **Posting events** | S27, S32.4 | Combined in Appendix D; authoritative classification in `guardrails/03-posting-semantics.md` |
| **Agent guardrails** | S31.5, Blueprint S11.3 | Blueprint has stable governance rules; Appendix E has implementation detail |

### Conflicts Resolved

| Conflict | Resolution |
|---|---|
| **S27 says `RFQ_AWARDED` → "update committed cost"** vs **Guardrail 3 classifies `RFQ_AWARDED` as informational** | Guardrail 3 is authoritative. RFQ award does NOT create a commitment; the PO does. Appendix D updated accordingly. Blueprint defers to guardrail. |
| **S19 build sequence** (3 phases) vs **S32.2 module breakdown** (7 modules) | S32.2 is authoritative (more granular, matches actual implementation). S19 is superseded. |
| **S20 "Recommended Technical Direction"** (generic) vs **actual implementation** (Next.js + tRPC + Prisma + PostgreSQL) | S20 is superseded by actual architecture decisions. Removed from refactored output. |

### Removed / Superseded Sections

| Section | Reason |
|---|---|
| S20 — Recommended Technical Direction | Superseded by locked architecture decisions (generic "modern web app" replaced by Next.js/tRPC/Prisma) |
| S23 — Recommended Next Step (first) | Superseded by S32 execution spec |
| S24.10 — API Endpoints List | REST-style endpoints superseded by tRPC router implementation; not reproduced |

---

## 4. Remaining Dangerous Ambiguities

These are real ambiguities in the source blueprint that could cause bugs or policy drift if not resolved before the relevant module ships.

| # | Ambiguity | Danger | Resolve Before |
|---|---|---|---|
| 1 | **Cost code scope: Entity or Project?** | Blueprint S31 future objects table says "Entity or Project" for cost codes. If Entity-scoped, cost codes are shared across projects (budget mapping breaks if projects need different structures). If Project-scoped, each project defines its own (standard for construction). | M4 (Budget module) |
| 2 | **RFQ_AWARDED posting effect** | Original S27 says "update committed cost", but Guardrail 3 correctly classifies as informational. Procurement code must NOT create a commitment on RFQ award — only `PURCHASE_ORDER_ISSUED` should. If M3 procurement service posts commitment on RFQ award, budget dashboards will overstate commitments. | M3 (before PO implementation) |
| 3 | **PROJECT_TRANSFER_POSTED dual-project effect** | Guardrail 3 marks this as "watch" for both commitment and actual cost. Does a cross-project transfer affect committed value, actual cost, or budget only? The answer determines which dashboard aggregates move. | M4 (Budget module) |
| 4 | **Dashboard data source transition** | Guardrail 3 Rule 5 says dashboards read from `posting_events`, but M2 commercial dashboard currently queries source tables directly. When does the transition happen? If M4+ dashboards query posting_events but M2 dashboards don't, financial totals may disagree. | M4 (before financial dashboards ship) |
| 5 | **Financial-critical master data change approval** | Guardrail 2 says "should eventually require approval workflow" for financial-critical master data changes but marks it "not yet implemented." Changing a vendor's tax number or a category hierarchy after posting events reference them could silently corrupt financial reports. | M4 (before budget relies on master data stability) |
| 6 | **Percentage allocation mandatory vs optional** | Blueprint S31.8 describes entity-level allocation but doesn't say whether it's mandatory for multi-entity projects or opt-in. If mandatory, M1 entity setup needs allocation rules before any project can start. If opt-in, simpler. | M4 or M7 (when allocation engine ships) |
| 7 | **Material workflow template scope** | Blueprint S26/S32.9 describes material workflow templates configurable by project/package/category. But S7.4 says each project is a "fully separate working environment." Are material workflow templates project-scoped or entity-scoped? Entity-scoped = shared templates; project-scoped = each project configures its own. | M3 (material tracking features) |

---

## 5. Recommendation: Fitness as Governing Document

### Verdict: The refactored blueprint is fit to govern Modules 1-7.

**Strengths:**
- Business objectives, scope, roles, and business rules are well-defined and stable
- Architecture principles are clear and already implemented in M1-M3 (project isolation, immutable signed docs, additive-only reversal, scope binding)
- Engine map provides correct separation of concerns with shared core
- Multi-entity logic is forward-looking and compatible with current entity model
- Agent guardrails prevent AI from exceeding its authority
- Module roadmap is frozen and has been followed through M1-M3

**Governance chain:**
- Blueprint (this document) -> stable business truth
- Guardrails (01-03) -> hard control enforcement mapping
- Module scope-lock documents -> per-module detailed decisions
- Prisma schema + code -> implementation source of truth

**What the blueprint should NOT be used for:**
- Schema reference (use Prisma schema)
- API reference (use tRPC router source)
- Permission code list (use `permissions.md`)
- Test coverage tracking (use module closeout reports)
- UI implementation (use actual screens)

The blueprint defines **what** and **why**. The code defines **how**. The guardrails define **never**.
