# Hardening Test Report

**Date:** 2026-04-11
**Branch:** `feature/module-3-procurement-engine`
**Scope:** Targeted hardening pass for 12 structural control issues identified by independent audit

---

## Test Suite Summary

| Suite | File | Tests | Status |
|---|---|---|---|
| Scope binding (H1) | `tests/hardening/scope-binding.test.ts` | 9 | PASS |
| Permission alignment (H3) | `tests/hardening/permission-alignment.test.ts` | 11 | PASS |
| Override atomicity (H2) | `tests/hardening/override-atomicity.test.ts` | 13 | PASS |
| **Total** | **3 files** | **33** | **ALL PASS** |

Execution time: 304ms (no database required — pure structural tests).

---

## Scope Binding Tests (9 tests)

Validates `assertProjectScope()` and `assertEntityScope()` from `@fmksa/core/scope-binding`.

| Test | Validates |
|---|---|
| `assertProjectScope` does not throw when projectId matches | Happy path — same scope |
| `assertProjectScope` throws ScopeMismatchError when projectId does not match | Cross-project access blocked |
| `assertProjectScope` error message includes record type and ID | Error diagnostics |
| `assertProjectScope` treats empty strings as valid (but mismatched) | Edge case — empty string scope |
| `assertEntityScope` does not throw when entityId matches | Happy path — same entity |
| `assertEntityScope` throws ScopeMismatchError when entityId does not match | Cross-entity access blocked |
| `assertEntityScope` error message includes record type and ID | Error diagnostics |
| `ScopeMismatchError` has the correct name property | Error identity |
| `ScopeMismatchError` is instanceof Error | Error hierarchy |

---

## Permission Alignment Tests (11 tests)

Validates procurement permission seed integrity and `getTransitionPermission()` mapping.

| Test | Validates |
|---|---|
| All codes follow resource.action pattern | Structural format (`/^[a-z_]+\.[a-z_]+$/`) |
| No duplicate codes in seed | Uniqueness across 77 codes |
| Seed contains at least 60 permission codes | Minimum coverage (actual: 77) |
| Every resource has a view action | Base access for all 13 resources |
| Maps every known transition for transitioned resources to a seeded code | 5 resources × all actions → all resolve to seeded permissions |
| Falls back to .edit for unknown actions | Graceful degradation |
| Maps reject/return/receive_responses to .review | Action grouping |
| Maps terminate/supersede/expire/cancel/close to .terminate | Action grouping |
| Maps direct lifecycle actions to their own suffix | submit/approve/sign/issue/evaluate/award |
| All transitioned resources have seeded view + create + edit + delete | CRUD baseline |
| Entity-scoped master data resources have manage permissions | procurement_category, item_catalog, project_vendor |

---

## Override Atomicity Tests (13 tests)

Validates error classes and pre-check rejection behavior for `withOverride()`.

| Test | Validates |
|---|---|
| `OverrideNotPermittedError` includes override type in message | Error content |
| `OverrideNotPermittedError` has correct name | Error identity |
| `OverrideNotPermittedError` is instanceof Error | Error hierarchy |
| `OverrideNotPermittedError` exposes overrideType property | Error data access |
| `SecondApproverRequiredError` includes override type in message | Error content |
| `SecondApproverRequiredError` has correct name | Error identity |
| `SecondApproverRequiredError` exposes overrideType property | Error data access |
| `SelfApprovalProhibitedError` includes override type in message | Error content |
| `SelfApprovalProhibitedError` has correct name | Error identity |
| `SelfApprovalProhibitedError` exposes overrideType property | Error data access |
| Never-overridable actions rejected before any DB work | Pre-check: `document.unsign` → `OverrideNotPermittedError` |
| Second-approver missing rejected before any DB work | Pre-check: no `approvedBy` → `SecondApproverRequiredError` |
| Self-approval rejected before any DB work | Pre-check: actor === approver → `SelfApprovalProhibitedError` |

---

## TypeScript Compilation

| Package | Status |
|---|---|
| `@fmksa/db` | PASS (0 errors) |
| `@fmksa/core` | PASS (0 errors) |
| `web` | PASS (0 errors) |

---

## What These Tests Do NOT Cover

These are pure structural tests. The following require a live database (integration tests):

- Actual `$transaction` rollback when override log write fails
- Prisma middleware enforcement (signed-immutability, no-delete-on-immutable)
- Status enum rejection of invalid values at the DB level
- FK constraint enforcement (Restrict on delete) at the DB level
- End-to-end router permission checks with real session context

These will be covered when integration test infrastructure is set up.
