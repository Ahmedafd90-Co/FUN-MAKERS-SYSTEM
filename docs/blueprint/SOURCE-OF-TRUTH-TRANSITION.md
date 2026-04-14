# Source of Truth Transition Report

**Date:** 2026-04-11
**Task:** Transition governing authority from legacy canvas to refactored blueprint set
**Scope:** Document governance only — no feature work, no architecture changes

---

## 1. What Was Marked Superseded

| Document | Action Taken |
|---|---|
| **"Integrated Project Approval & Commercial Control System" canvas** (142K chars, 32 sections) | Superseded as governing document. `LEGACY-CANVAS-SUPERSEDED.md` created with explicit rules: no new content, no quoting without validation, historical context only. |
| **S20 — Recommended Technical Direction** | Retired. Generic "modern web app" description replaced by locked architecture decisions (Next.js + tRPC + Prisma + PostgreSQL). |
| **S23 — Recommended Next Step (first)** | Retired. Superseded by S32 execution spec, which was carried into Blueprint S12 and Appendix F. |
| **S24.10 — API Endpoints List** | Retired. REST-style endpoints superseded by implemented tRPC routers. |
| **S19 — Suggested Build Sequence** (3 phases) | Superseded by S32.2 module breakdown (7 modules), which is the canonical build order in Blueprint S12. |

---

## 2. What Is Now Authoritative

### Tier 1: Governing Blueprint
| Document | Role |
|---|---|
| `docs/blueprint/00-blueprint.md` | Single top-level governing document. Business objectives, scope, roles, business rules, architecture principles, engine structure, module roadmap, NFRs. |

### Tier 2: Governance Guardrails (binding)
| Document | Role |
|---|---|
| `docs/guardrails/01-policy-ownership-map.md` | Hard controls vs configurable controls, override policy, dashboard trust, AI action limits |
| `docs/guardrails/02-master-data-governance-map.md` | Data object scope, ownership, financial criticality, governance rules |
| `docs/guardrails/03-posting-semantics.md` | Posting event classification, hard posting rules, dashboard trust matrix |

### Tier 3: Detailed Appendices (volatile reference)
| Document | Content |
|---|---|
| `appendices/A-workflow-approval-matrices.md` | 7 workflow matrices, approval matrix, flexible templates, material/procurement status models |
| `appendices/B-data-model-schema.md` | Data model principles, entity groups, schema rules, representative DDL |
| `appendices/C-ui-screen-form-design.md` | UX principles, screen lists, design patterns, field-by-field forms, tracker screens |
| `appendices/D-event-posting-kpi-logic.md` | Posting event catalog, payload standard, reversal logic, KPI formulas, health score, red flags |
| `appendices/E-ai-agent-extraction-logic.md` | Extraction pipeline, output fields, letter analysis, drafting guardrails, agent architecture |
| `appendices/F-test-delivery-build-guidance.md` | Build order, services, test plan, release gates, admin requirements, user stories, integration requirements |

### Tier 4: Module Documents (per-module truth)
Scope locks, implementation plans, closeout reports for each module.

### Tier 5: Live Codebase (implementation truth)
Prisma schema, tRPC routers, service code, tests.

---

## 3. Critical Content Gap Analysis

All 32 sections of the old canvas were traced against the new blueprint set. Disposition by section:

| Category | Count | Sections |
|---|---|---|
| **Migrated to blueprint** | 21 sections | S1, S2, S3, S4, S5, S6, S7, S16, S17, S24.1, S24.2, S24.3, S24.5, S24.6, S30, S31.3-S31.8, S31.15, S32.1, S32.2 |
| **Migrated to appendices** | 28 sub-sections | S10, S11, S12, S13, S14, S15, S18, S22, S24.7, S24.8, S24.9, S24.11, S24.12, S24.15, S25, S26, S27, S28, S29, S31.9-S31.14, S32.3-S32.10 |
| **Migrated to guardrails** | 5 topics | Posting semantics, immutability rules, scope isolation, override policy, data governance |
| **Intentionally retired** | 4 sections | S9 (redundant), S20, S23, S24.10 |

### Content found only in old canvas

| # | Content | Risk | Assessment |
|---|---|---|---|
| 1 | **S24.4 Data flow architecture narratives** (5 end-to-end flow descriptions: master data, commercial, procurement, contract intelligence, budget/transfer, KPI rollup) | **Low-to-Medium** | The flow information is reconstructable from engine map (Blueprint S8.2) + workflow matrices (Appendix A) + posting catalog (Appendix D). It's distributed, not lost. A developer on M4+ reads 3 docs instead of 1 for the full picture. No policy gap. |
| 2 | **S8 Business Requirements "shall" statements** (53 granular requirements across S8.1-S8.7) | **Low** | Every substantive "shall" is covered by business rules (Blueprint S7), process controls (Blueprint S9), guardrails, or appendix detail. The flat checklist format is lost; the rules live where they're enforced. |
| 3 | **S31.1 Functional Reliability declaration** ("must not be static document system") | **Low** | Intent is enforced throughout: guardrails, test requirements, module gates, NFRs. The cultural declaration isn't repeated verbatim, but the enforcement is stronger. |
| 4 | **S31.2 Development model** (Claude Code builds, ChatGPT reviews) | **None** | Operational process choice, not a blueprint requirement. Intentionally not carried forward. |
| 5 | **S29 User story acceptance criteria** (detailed bullet points) | **Low** | Summaries preserved in Appendix F. Module scope-lock documents provide more detailed criteria per module at build time. |

### Dangerous gaps: **None found.**

No content gap creates a policy risk, governance ambiguity, or missing enforcement requirement. The only medium-level item (data flow narratives) is a readability convenience, not a governance gap.

---

## 4. Transition Safety Assessment

### Is the source-of-truth transition safe and clean?

**Yes.**

| Check | Result |
|---|---|
| All 22 business rules migrated? | Yes — Blueprint S7, verified line-by-line |
| All 7 architecture principles migrated? | Yes — Blueprint S8.1 |
| All 9 hard controls in guardrails? | Yes — Guardrail 1, verified against codebase |
| All 18 posting events classified? | Yes — Guardrail 3 (8 live + 10 future) |
| All 7 workflow matrices migrated? | Yes — Appendix A |
| Module roadmap preserved? | Yes — Blueprint S12 (M1-M7 mandatory order) |
| Conflict resolution precedence defined? | Yes — Blueprint Source of Truth Declaration |
| Legacy canvas marked superseded? | Yes — `LEGACY-CANVAS-SUPERSEDED.md` |
| Blueprint declares itself as governing? | Yes — Source of Truth Declaration added to `00-blueprint.md` |
| Known ambiguities documented? | Yes — 7 ambiguities in `REFACTOR-SUMMARY.md` S4 |

### What was done in this transition task

1. Created `LEGACY-CANVAS-SUPERSEDED.md` with explicit supersession notice, active source-of-truth table, and 5 rules for handling the legacy document
2. Added **Source of Truth Declaration** section to `00-blueprint.md` with document layers, precedence order, what-belongs-here / what-does-not rules, and legacy canvas supersession reference
3. Completed section-by-section gap analysis of all 32 old canvas sections against the full new document set
4. Produced this transition report

### Files created or modified

| File | Action |
|---|---|
| `docs/blueprint/LEGACY-CANVAS-SUPERSEDED.md` | **Created** — supersession notice for old canvas |
| `docs/blueprint/00-blueprint.md` | **Modified** — added Source of Truth Declaration section |
| `docs/blueprint/SOURCE-OF-TRUTH-TRANSITION.md` | **Created** — this report |

---

## 5. Optional Future Improvement

One medium-risk gap could be closed with a single paragraph:

**Add a brief "Data Flow Summary" to the blueprint** (as a subsection of S8 Engine Architecture or as a standalone S8.4) describing the conceptual flow: record creation -> workflow approval -> posting event -> dashboard/KPI. This would close the readability gap from S24.4 without adding volatile content. This is not blocking and can be done at any time.

---

## 6. Conclusion

The source-of-truth transition is **complete and clean.** The old canvas is marked superseded. The new blueprint set is declared authoritative with explicit precedence rules. No critical content was lost. No dangerous ambiguity was created by the transition. Future module work should reference the new document set exclusively.
