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

#### Class-structured extensions (catches 12–22, 2026-05-22 → 2026-05-27)

The six foundational layers above all caught variants of the same drift mechanism.
PIC-72 cluster 2 → cluster 5 → PIC-75 → PIC-76 surfaced eleven more catches across
five structural classes. Each class extends the rule with class-specific operating
discipline — knowing the headline rule isn't sufficient; the verification step
that operationalises the rule per class must execute.

##### Drift-class (catches 12–16)

12. **Cluster 2 prompt presupposed PIC-74 Stage 2's transient measurement as
    canonical baseline.** The "demo-project-integrity FAIL is the State B baseline"
    framing rested on one local measurement that didn't reproduce in CI.
13. **PD verbatim text referenced `pnpm -F @fmksa/db seed` but canonical script is
    `db:seed`** per `packages/db/package.json`. Verbatim prescription assumed a
    script name without verifying the source.
14. **Turbo stop-on-first-failure masks `@fmksa/core` convergence signal in CI.**
    Cluster 2 sequencing assumed `@fmksa/core` would run regardless of `@fmksa/db`;
    turbo's default halts the pipeline on first failure before `@fmksa/core` ever
    starts.
15. **Cluster 5 prompt presupposed adjacent failures share root cause.** The
    "f114b50 cherry-pick fixes idempotency + demo-project-integrity" framing
    collapsed two distinct failure mechanisms into one; post-cherry-pick state
    showed idempotency green but demo-project-integrity still failing.
16. **Session-restored worktree was on preservation-list branch.** A compacted
    session restored Claude to a forbidden worktree
    (`feature/commercial-monthly-cost-sheet`, HEAD `067e3ea`); caught before any
    write via verify-before-resume recon.

**Operating discipline (drift-class):** before prescribing a mechanism, verify
body-vs-reality. The pre-action verification step is what binds the rule —
having the rule documented is not enough; the recon step must execute.

##### Revision-class (catches 17 → 18)

17. **RETRACTED.** Original framing — that `f114b50` cherry-pick unmasked latent
    concurrent-execution test pollution — was a misdiagnosis. The diagnostic
    step skipped to "what could cause this" before reading "what is the contract."
18. **Catch 17 retraction.** Phase A reading of `vitest.config.ts` proved
    sequential execution is the contract (`pool: 'forks'`, `singleFork: true`).
    The retraction itself becomes a register entry — pattern register entries
    are not immune to revision by deeper recon.

**Operating discipline (revision-class):** a retraction creates a new register
entry, not a silent rollback. Document the revision relationship (17 → 18)
explicitly so future readers see both the original framing and the corrected
diagnosis. The arc continues at catch 22 (scope-overgeneralized retraction).

##### Recurrence-class (catch 19)

19. **Local State B stress test does NOT predict CI State A behavior — same
    class as catch 12.** PIC-75 PR #53 commit 3 documented β1 as "empirically
    resolved" based on local 42/42; CI showed row-counts failing, despite
    catch 12 being canonicalized in the register at the time.

**Operating discipline (recurrence-class):** documenting a rule doesn't
operationalize it. A register entry firing twice in the same class is a signal
that the rule needs a verifiable artifact (pre-action checklist, CI gate,
explicit recon step) — not just text in CLAUDE.md. Without operationalisation,
the rule is decorative.

##### Methodology-insufficiency class (catches 20–21)

20. **State A locally may not equal State A in CI; reproduce methodology hit a
    wall.** PIC-76 Phase A attempted local State-A reproduction of the CI
    catch-22 mechanism. Single-package vitest passed locally even with turbo
    concurrency simulated, because the local DB had no other package's writes
    racing. The prescribed verification step was necessary but not sufficient.
21. **PD's P4 step presupposed push triggers CI; reality requires PR.** Probe
    branch push didn't trigger CI workflows; `gh run list` empty. The
    push-as-CI-trigger presupposition didn't survive contact with repo CI
    configuration (workflows trigger on `pull_request` + push-to-main, not
    arbitrary branch pushes). Resolved by Option-A draft PR convention.

**Operating discipline (methodology-insufficiency class):** when a prescribed
verification step can't reach the actual failure state, escalate to probe at
the actual failure surface — don't iterate on a method that can't reach State A.
Mark unverified prescriptions in PD rulings as `ASSUMED — verify before
executing` so the gap is visible at execution time.

##### Scope-overgeneralized-retraction class (catch 22)

22. **vitest `fileParallelism: false` doesn't compose with turbo's inter-package
    parallelism; F3 fixes.** The β1 retraction in PIC-75 PR #53 claimed "vitest
    sequential execution proven via config" — true for a single package, but
    turbo runs `pnpm -F @fmksa/db test` and `pnpm -F @fmksa/core test` in
    parallel processes, each owning its own vitest runner with
    `fileParallelism: false`. Process-isolation guarantees do not compose
    across runners; the retraction's scope didn't match the original
    hypothesis's scope.

**Operating discipline (scope-overgeneralized-retraction class):** when
retracting a hypothesis, verify the retraction's scope matches the original
hypothesis's scope. F3 (per-package test DBs, see `docs/architecture.md` § β1)
is the canonical architectural fix for this class — see also SR-Canonical-Patterns
for codification.

**Canonicalized 2026-05-27 in PIC-72 cluster 6/7/1.c** (single PR umbrella with
SR-3 introduction, Canonical Patterns codification, PIC-19 closure, β4 hygiene).

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

**Structural enforcement (PIC-72 cluster 2, 2026-05-22):** CI pipeline now invokes
`pnpm -F @fmksa/db db:seed` after `prisma db push` and before `Run tests`. Seed step
exits CI on failure. SR-2 step 5 ("re-seed every target environment") is now
structurally guaranteed for CI; remains documented discipline for staging + prod
per deployment pipeline.

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

**Canonical worked example — PIC-75 (2026-05-27):** the `Organization` model
introduced as first-class tenant root with hardcoded singleton UUID
`00000000-0000-0000-0000-000000000001` + transitional `@default` pattern on
`orgId`. Compound `@@unique` keys applied to 9 project-scoped commercial /
procurement models (IPA, IPC, Variation, CostProposal, Correspondence, RFQ,
EngineerInstruction, VendorContract, PurchaseOrder) as `[orgId, projectId,
referenceNumber]`; TaxInvoice gets `[orgId, referenceNumber]` (no projectId)
for ZATCA Phase 2 — invoice numbers are per-tenant sequential, not per-project.

VendorContract + PurchaseOrder confirmed the dual-identifier pattern:
customer-facing globally-unique identifier (`contractNumber` / `poNumber`)
stays as global `@unique`; internal sequential `referenceNumber` becomes
per-tenant project-scoped via compound key. Use this pattern for any future
entity carrying both an external public reference and an internal sequential
reference.

Single-tenant `@default` is a deliberate transitional shortcut, intended to
be removed when multi-tenancy ships (service code will then be required to
supply `orgId` from the request context). See `docs/architecture.md` §
"Multi-Tenancy Schema Primitives" for the full design rationale per entity
class + the future-multi-tenant migration path.
