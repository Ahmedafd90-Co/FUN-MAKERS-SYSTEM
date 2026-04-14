/**
 * Shared drilldown URL parameter parsers.
 *
 * All commercial register pages that receive drilldown links from the KPI
 * dashboard MUST use these parsers instead of inline splitting logic.
 * This prevents the comma-joined status bug from recurring.
 *
 * Handles both repeated params (?status=a&status=b) and comma-joined
 * params (?status=a,b) — the latter is how buildDrilldownHref in
 * dashboard-cards.tsx generates links.
 */

/**
 * Parse status filter values from drilldown URL parameters.
 *
 * Supports:
 *   ?status=issued&status=submitted  → ['issued', 'submitted']
 *   ?status=issued,submitted         → ['issued', 'submitted']
 *   ?status=issued,submitted&status=collected → ['issued', 'submitted', 'collected']
 *   (no status param)                → []
 */
export function parseDrilldownStatuses(searchParams: URLSearchParams): string[] {
  return searchParams.getAll('status').flatMap((s) => s.split(','));
}

/**
 * Parse the overdue drilldown flag from URL parameters.
 *
 * Used by the invoices register page when the Overdue Receivable KPI
 * card links with ?overdue=true.
 */
export function parseDrilldownOverdue(searchParams: URLSearchParams): boolean {
  return searchParams.get('overdue') === 'true';
}
