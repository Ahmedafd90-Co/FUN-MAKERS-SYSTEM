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
