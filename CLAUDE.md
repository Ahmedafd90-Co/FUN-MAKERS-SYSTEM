## gstack (recommended)

This project uses [gstack](https://github.com/garrytan/gstack) for AI-assisted workflows.
Install it for the best experience:

```bash
git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
cd ~/.claude/skills/gstack && ./setup --team
```

Skills like /qa, /ship, /review, /investigate, and /browse become available after install.
Use /browse for all web browsing. Use ~/.claude/skills/gstack/... for gstack file paths.

---

## Standing Rules

These rules survive across all Claude Code sessions on this codebase. They are
durable architectural and methodology constraints, not preferences.

### SR-1 — Doc-currency discipline (PIC-63, 2026-05-20)

**When a Phase A recon overturns a claim made in a roadmap / spec / decision doc, the source doc MUST be amended within the PR that surfaces the correction.** Correction-as-PR-body or correction-as-ticket-comment is not sufficient — a future reader of the original spec will not know to look elsewhere.

**Mechanics:**
1. The PR description includes a **"Source doc amendments"** section listing every doc touched by the recon correction.
2. The amendment is a header note at the top of the corrected section in the source doc, linking to the recon source (PR / Linear ticket / Decisions doc).
3. If the source doc is owned by a different team / system / Linear scope, the amendment may instead be a stub linking to the canonical correction venue, but the stub MUST be added — silent drift is the failure mode.

**Provenance:** PIC-63 (Pre-PR-5 Sweep Session 1, 2026-05-20). Lesson surfaced by the 2026-05-20 Functional Readiness Audit Phase 4 — 3 specs found stale, corrections living only in PR bodies / Layer 2.5 Decisions doc, never folded back into source. The Module Spec "RFQ Management is the missing module" claim (corrected by PIC-53 Phase A recon, 4 weeks unflagged in the source doc) is the RED-class example.

**Why it matters:** every recon-gated PR has surfaced findings the ticket didn't anticipate (PIC-50/51/52/53 Phase A pattern). Each finding's correction lives somewhere. Without this rule, the correction lives in the PR body — invisible to anyone who reads the source spec months later. The cumulative effect is the Phase 4 doc-currency cluster the audit surfaced.

**First application:** PIC-62 (Module Spec correction header for the RFQ-missing-premise drift), landed in the same Pre-PR-5 Sweep PR as this standing rule.

### SR-1 extension — Identifier-dependent presuppositions require body-vs-reality verification

When any rule, instruction, or ruling references a specific identifier (PR number,
ticket number, file path, function name, branch name), verify the identifier still
matches the rule's intent before acting on it. This applies to standing rules,
PD rulings, Claude Code prompts, and chat-side recommendations.

**Provenance — six layers of body-vs-reality drift surfaced 2026-05-22 during
PIC-72 Cluster 1.a + PIC-74 execution:**

1. The "PR #10 untouched" standing rule operated as session-memory lore for the
   engagement's duration without ever being canonicalized to a file.
2. The session-memory rule used the wrong identifier — the actual deferred-cleanup
   sentinel was PR #4, not PR #10.
3. The PIC-72 Phase B Categorise gate ruling instructed "correct CLAUDE.md PR #10
   → PR #4" while presupposing an on-disk artefact that did not exist.
4. Cluster 1.a's first PR (#47) presupposed default-base topology without
   verification — discovered mid-Phase-B, prompting integration topology migration
   (PIC-74) before cluster 1.a could land.
5. Cluster 1.a redo Phase A → Phase B gate (2026-05-22): chat-side made unilateral
   PD ruling on Q3 scope (5-rule consolidation) without explicit PD answer; the
   ruling was correct per pattern-extrapolation but procedurally inappropriate.
   Single filing authority lives with PD, not chat-side. Caught by post-PR-50
   state examination after PD's actual ruling resolved the question.
6. Cluster 1.a redo execution (2026-05-22): chat-side claimed canonical-source
   update without performing the tool call; PR #50 then executed against the
   still-3-rule canonical text. Claimed execution that isn't tool-called is the
   same body-vs-reality drift class as session-memory rules that aren't on disk.
   Caught when examining PR #50's contents against the claimed scope expansion.

The extension applies broadly to any identifier-dependent presupposition, not just
PR numbers in standing rules. Verify before acting. The rule keeps catching itself
in new ways — layers 5 + 6 extend its scope to chat-side rulings and execution
claims, not just standing-rule identifier verification.

**90-day verification cycle:** if a rule has been operating untouched for more than
90 days, the next session touching the adjacent surface must verify the rule still
has a live subject. The brand-chain abandonment finding (PIC-74 Pass 2) was the
canonical example — "PR #10 untouched" was guarding an abandoned PR for the
engagement's duration.

### SR-2 — PIC-50 atomic-add convention (extended 2026-05-20 with re-seed step)

**Adding a new workflow-managed entity requires an ATOMIC 4-step contract in a single PR:**

1. Add the model to `WORKFLOW_DRIVEN_MODELS` (in `packages/db/src/middleware/no-direct-status-write.ts`)
2. Add the entry to `WORKFLOW_TEMPLATE_REGISTRY` (in `packages/contracts/src/workflow.ts`)
3. If the entity attaches documents, add to `RECORD_TYPES_FOR_DOCUMENTS` (in `packages/contracts/src/documents.ts`)
4. Seed the `{prefix}_standard` template (in `packages/db/src/seed/*-workflow-templates.ts`)

**Plus, post-merge (added by PIC-64, 2026-05-20):**

5. **Re-seed every target environment** (dev DB minimum; staging + prod per deployment pipeline). The PIC-50 parity guard catches code-level drift, but NOT per-DB seed presence. PIC-64 surfaced this gap when both `drawing_revision_standard` (PIC-52) and `rfq.materialise` (PIC-53) were absent from dev DB despite the seed files being correct — the dev DB had not been re-seeded after merge.

**Failure mode if step 5 is skipped:** the entity ships code-clean (PIC-50 guard passes), but production runtime fails silently at workflow auto-start (`resolveTemplate` returns null because the template isn't in DB) or at permission-gate check (`ctx.user.permissions.includes('rfq.materialise')` returns false because the permission isn't in DB).

**Provenance:** PIC-50 (mechanism, 2026-05-19) extended by PIC-64 (Pre-PR-5 Sweep Session 1, 2026-05-20) to include step 5.

### SR-Sentinel — PR #4 untouched

PR #4 (`chore/brand-adaptation-ci-cleanup`, open 13+ months as of 2026-05) is the
project's deferred-cleanup sentinel. Do not touch, modify, push to, merge, or
close PR #4 without an explicit PD ruling. Read-only access via the local worktree
at `5efaf91` is permitted for investigation.

Disposition revisited as part of PIC-72 Cluster 8 (PR #4 + PR #10 investigation,
post-cluster-1.a).

**Canonicalized 2026-05-22 per PIC-72 Phase A Discovery (Linear comment c417797f).**
Prior to canonicalization, this rule operated as session-memory only and used the
wrong identifier (PR #10 instead of PR #4). See SR-1 extension above for the
six-layer drift history.

### SR-Multi-Tenancy — Per-tenant identity belongs in runtime configuration, not in `packages/`

ProjectLedger is being built as a multi-tenant licensed SaaS platform. Brand
identity, theme, assets, organisation-specific data, and any tenant-specific
construct belong as **runtime configuration scoped by `orgId`** (database tables,
environment variables, config files loaded at request time), NOT as compiled-in
code that ships with the platform binary.

The `packages/` tree contains tenant-agnostic platform code. If a feature requires
tenant-specific data or behavior, the platform code in `packages/` reads that data
from runtime configuration; it does not embed it.

**Canonical example — PR #9 closure (2026-05-22):** the brand-chain `packages/brand/*`
module + tenant-specific dashboard widgets were discarded during PIC-74 Stage 3
because they bundled Pico Play-specific brand foundation into the canonical code.
The correct architecture for multi-tenant theming is runtime configuration (theme
variables in DB scoped by orgId, asset URLs in config, brand metadata loaded per
request), not compiled-in code.

This rule extends beyond brand: tenant-specific reports, tenant-specific workflow
templates with brand language, tenant-specific email templates with company names,
or any other per-tenant artefact all belong in runtime configuration.

**Provenance:** PIC-74 Stage 3.a architectural ruling (Linear comment 82a89841,
2026-05-22).
