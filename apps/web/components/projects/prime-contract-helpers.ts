/**
 * Pure helpers extracted from prime-contract-tab.tsx so they can be unit-tested
 * without rendering React. Imported by both the tab component and the test file.
 *
 * Stays in /components/projects/ for co-location with the tab component.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PrimeContractStatus =
  | 'draft'
  | 'signed'
  | 'active'
  | 'completed'
  | 'terminated'
  | 'cancelled';

export type PrimeContractAction =
  | 'sign'
  | 'activate'
  | 'complete'
  | 'terminate'
  | 'cancel';

export type PrimeContractActionDef = {
  action: PrimeContractAction;
  label: string;
  variant: 'default' | 'destructive' | 'outline';
};

// ---------------------------------------------------------------------------
// State machine — must match packages/core/src/layer1/prime-contracts/service.ts
// ALLOWED_TRANSITIONS map. The layer1-ui-logic test asserts equivalence.
// ---------------------------------------------------------------------------

export const PRIME_CONTRACT_STATUS_ACTIONS: Record<PrimeContractStatus, PrimeContractActionDef[]> = {
  draft: [
    { action: 'sign', label: 'Sign Contract', variant: 'default' },
    { action: 'cancel', label: 'Cancel', variant: 'outline' },
  ],
  signed: [
    { action: 'activate', label: 'Activate', variant: 'default' },
    { action: 'cancel', label: 'Cancel', variant: 'outline' },
  ],
  active: [
    { action: 'complete', label: 'Mark Complete', variant: 'default' },
    { action: 'terminate', label: 'Terminate', variant: 'destructive' },
    { action: 'cancel', label: 'Cancel', variant: 'outline' },
  ],
  completed: [],
  terminated: [],
  cancelled: [],
};

export const COMMENT_REQUIRED_ACTIONS: PrimeContractAction[] = []; // optional everywhere
export const CONFIRM_ACTIONS: PrimeContractAction[] = ['terminate', 'cancel'];

// ---------------------------------------------------------------------------
// Display labels
// ---------------------------------------------------------------------------

// Past-tense action labels for success toast messages. Naive string concatenation
// (`Contract ${action}d.`) produces ungrammatical results for "sign" → "signd"
// and inconsistent ones for double-l verbs ("cancelled" vs "canceld").
export const ACTION_PAST_TENSE: Record<PrimeContractAction, string> = {
  sign: 'signed',
  activate: 'activated',
  complete: 'completed',
  terminate: 'terminated',
  cancel: 'cancelled',
};

export const STATUS_LABELS: Record<PrimeContractStatus, string> = {
  draft: 'Draft',
  signed: 'Signed',
  active: 'Active',
  completed: 'Completed',
  terminated: 'Terminated',
  cancelled: 'Cancelled',
};

export function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status as PrimeContractStatus) {
    case 'active':
    case 'completed':
      return 'default';
    case 'signed':
      return 'secondary';
    case 'terminated':
      return 'destructive';
    case 'draft':
    case 'cancelled':
    default:
      return 'outline';
  }
}

// ---------------------------------------------------------------------------
// Date display — formats an ISO timestamp as a calendar date in UTC, NOT in
// the viewer's local timezone. Contract dates are stored at `T00:00:00.000Z`
// (see dateInputToISO in prime-contract-tab.tsx). Rendering them via
// toLocaleDateString() interprets the timestamp in the runtime's local
// timezone, so any viewer west of UTC sees the date shifted back by one day
// — the calendar day the user picked is silently wrong.
//
// Intl.DateTimeFormat with timeZone: 'UTC' produces the same calendar day
// regardless of viewer location, matching the contract's intent.
// ---------------------------------------------------------------------------

export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(iso));
}

// ---------------------------------------------------------------------------
// Date ordering validation — mirrors the .refine() check in
// packages/contracts/src/layer1/prime-contract.ts datesOrderedNonDecreasing.
// Client-side guard so we surface a helpful message before the round-trip.
// ---------------------------------------------------------------------------

export function checkDateOrdering(
  signedDate: string,
  effectiveDate: string,
  expectedCompletionDate: string,
): string | null {
  const sd = signedDate ? new Date(signedDate) : null;
  const ed = effectiveDate ? new Date(effectiveDate) : null;
  const cd = expectedCompletionDate ? new Date(expectedCompletionDate) : null;
  if (sd && ed && sd > ed) {
    return 'Signed date must be on or before the effective date.';
  }
  if (ed && cd && ed > cd) {
    return 'Effective date must be on or before the expected completion date.';
  }
  if (sd && cd && !ed && sd > cd) {
    return 'Signed date must be on or before the expected completion date.';
  }
  return null;
}
