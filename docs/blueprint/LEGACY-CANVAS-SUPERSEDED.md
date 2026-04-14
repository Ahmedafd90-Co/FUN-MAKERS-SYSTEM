# SUPERSEDED — "Project Approval System Blueprint" Canvas

> **This document is superseded. It is not the governing source of truth.**
>
> The original canvas ("Integrated Project Approval & Commercial Control System," ~142,000 characters, 32 sections) has been refactored into a lean governing blueprint, six appendices, and three guardrail documents. All critical business content was migrated. The canvas must not be used for new design or build decisions.

---

## Status

| Field | Value |
|---|---|
| **Document** | "Integrated Project Approval & Commercial Control System" (also known as "Project Approval System Blueprint") |
| **Original format** | ChatGPT canvas / DOCX export |
| **Original size** | ~142,000 characters, 32 major sections |
| **Superseded on** | 2026-04-11 |
| **Superseded by** | `docs/blueprint/00-blueprint.md` + appendices + guardrails |
| **Governing status** | **None — historical reference only** |

---

## How to Use Documents Now

| Need | Go to | Path |
|---|---|---|
| **Business objectives, scope, roles, rules, architecture principles, module roadmap** | Governing Blueprint | `docs/blueprint/00-blueprint.md` |
| **Hard controls, override policy, AI action limits** | Guardrail 1 — Policy Ownership | `docs/guardrails/01-policy-ownership-map.md` |
| **Master data scope, ownership, financial criticality** | Guardrail 2 — Data Governance | `docs/guardrails/02-master-data-governance-map.md` |
| **Posting event classification, dashboard trust rules** | Guardrail 3 — Posting Semantics | `docs/guardrails/03-posting-semantics.md` |
| **Workflow matrices, approval matrix, templates** | Appendix A | `docs/blueprint/appendices/A-workflow-approval-matrices.md` |
| **Data model principles, schema, DDL** | Appendix B | `docs/blueprint/appendices/B-data-model-schema.md` |
| **Screen lists, forms, UX principles** | Appendix C | `docs/blueprint/appendices/C-ui-screen-form-design.md` |
| **Posting events, KPI formulas, health scores** | Appendix D | `docs/blueprint/appendices/D-event-posting-kpi-logic.md` |
| **AI extraction, agent architecture, guardrails** | Appendix E | `docs/blueprint/appendices/E-ai-agent-extraction-logic.md` |
| **Build order, test plan, delivery strategy** | Appendix F | `docs/blueprint/appendices/F-test-delivery-build-guidance.md` |
| **Per-module scope, decisions, closeout** | Module docs | `docs/module-*-scope-lock.md`, `module-*-closeout.md` |
| **How it actually works (schemas, APIs, tests)** | Live codebase | Prisma schema, tRPC routers, service code |

### Precedence order (highest first)

1. **Hardened codebase behavior** — what is actually enforced
2. **Guardrail documents** — what must be enforced
3. **Governing blueprint** (`00-blueprint.md`) — what the system should do and why
4. **Appendices** — detailed volatile reference
5. **Module documents** — per-module decisions
6. **This legacy canvas** — historical context only, not governing

---

## Rules for This Legacy Document

1. **Do not add new content** to the canvas
2. **Do not treat it as the live source of truth** for any design or build decision
3. **Do not quote from it** unless the specific content has been validated against the new blueprint set
4. **It may be consulted** as historical context if a question arises about original intent
5. **If important content is found** that exists only in the canvas and not in the new set, it must be migrated to the appropriate new document — not used directly from the canvas

---

## What Happened to the Canvas Content

The canvas contained 32 major sections mixing stable business intent with volatile implementation detail. Schema appeared 4 times. Build order appeared 3 times. Module lists appeared 3 times.

On 2026-04-11, all content was audited section by section:
- **21 sections** migrated to the governing blueprint
- **28 sub-sections** migrated to appendices A-F
- **5 topics** migrated to guardrails
- **4 sections** intentionally retired (redundant or superseded by implementation)
- **0 dangerous content gaps** identified

Conflicts resolved:
- `RFQ_AWARDED` posting effect: canvas said "update committed cost," Guardrail 3 correctly classifies as informational. Guardrail wins.
- Build sequence: canvas had 3 versions (S19, S24.13, S25). S32.2 is canonical. Others retired.
- Tech direction: canvas had generic "modern web app." Actual stack (Next.js + tRPC + Prisma + PostgreSQL) is authoritative.

Full traceability: `docs/blueprint/REFACTOR-SUMMARY.md`
Transition safety report: `docs/blueprint/SOURCE-OF-TRUTH-TRANSITION.md`

---

## Canvas Content Is Not Reproduced Here

The original 142,000-character canvas body is not repeated in this file. It exists as:
- A ChatGPT canvas (read-only, not to be edited further)
- A DOCX export at time of supersession

All governing content from the canvas now lives in the documents listed in the "How to Use Documents Now" table above. The canvas itself is a historical artifact.
