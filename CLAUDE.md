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

## Standing rule — Doc-currency discipline (PIC-63)

**When a Phase A recon overturns a claim made in a roadmap / spec / decision doc, the source doc MUST be amended within the PR that surfaces the correction.** Correction-as-PR-body or correction-as-ticket-comment is not sufficient — a future reader of the original spec will not know to look elsewhere.

**Mechanics:**
1. The PR description includes a **"Source doc amendments"** section listing every doc touched by the recon correction.
2. The amendment is a header note at the top of the corrected section in the source doc, linking to the recon source (PR / Linear ticket / Decisions doc).
3. If the source doc is owned by a different team / system / Linear scope, the amendment may instead be a stub linking to the canonical correction venue, but the stub MUST be added — silent drift is the failure mode.

**Provenance:** PIC-63 (Pre-PR-5 Sweep Session 1, 2026-05-20). Lesson surfaced by the 2026-05-20 Functional Readiness Audit Phase 4 — 3 specs found stale, corrections living only in PR bodies / Layer 2.5 Decisions doc, never folded back into source. The Module Spec "RFQ Management is the missing module" claim (corrected by PIC-53 Phase A recon, 4 weeks unflagged in the source doc) is the RED-class example.

**Why it matters:** every recon-gated PR has surfaced findings the ticket didn't anticipate (PIC-50/51/52/53 Phase A pattern). Each finding's correction lives somewhere. Without this rule, the correction lives in the PR body — invisible to anyone who reads the source spec months later. The cumulative effect is the Phase 4 doc-currency cluster the audit surfaced.

**First application:** PIC-62 (Module Spec correction header for the RFQ-missing-premise drift), landed in the same Pre-PR-5 Sweep PR as this standing rule.

### SR-1 extension — Identifier verification (PIC-72, 2026-05-22)

**SR-1 extension (2026-05-22):** Standing rules referencing specific identifiers (PR numbers, ticket numbers, file paths, function names) need the same body-vs-reality verification as source documents. Before invoking a rule with a specific identifier in a new session, briefly verify the identifier still matches the rule's intent. This extension also applies to PD rulings: rulings that presuppose a textual artefact must verify the artefact exists before locking the ruling. The "PR #10 → PR #4" canonicalization (2026-05-22) is the canonical example of all three failure modes simultaneously.

---

## Standing rule — PR #4 untouched (PIC-72)

**PR #4 (`chore/brand-adaptation-ci-cleanup`) is the deferred-cleanup sentinel referenced in `.github/workflows/ci.yml:88, 189`.** Do not touch this PR — no edits, no rebases, no merges — until cluster 8 disposition (investigate-then-land-or-abandon) completes. The local worktree at `.claude/worktrees/jovial-heisenberg-8f4c9f` (HEAD `5efaf91`) is **read-only** reference for cluster 8 investigation: read its files freely, do not modify / push / merge. CI-monitor alerts on PR #4 are known false positives — the workflow's `continue-on-error: true` flags (lines 92, 194) explicitly route around the failure modes PR #4 was meant to address.

**Standing rule canonicalized 2026-05-22 per PIC-72 Phase A Discovery (Linear comment c417797f).** Prior to this, the rule operated as session-memory only — never on disk. The session-memory rule used the wrong identifier ("PR #10" instead of "PR #4") for the engagement's duration. The prior Phase B Categorise gate (Linear comment c8f9c68a) instructed "correct CLAUDE.md PR #10 → PR #4" while presupposing an on-disk artefact that did not exist. Three layers of body-vs-reality drift: rule never canonicalized, rule used wrong identifier, PD ruling presupposed textual reality without verification. SR-1 extension above exists specifically because this happened.
