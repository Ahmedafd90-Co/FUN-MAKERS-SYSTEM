/**
 * Returns today's date as a YYYY-MM-DD string in the runtime's local timezone.
 *
 * Why this exists: the common shortcut `new Date().toISOString().split('T')[0]`
 * returns the date in UTC, not local time. For users in timezones ahead of UTC
 * (e.g. Asia/Riyadh = UTC+3), opening a form between ~21:00 and 23:59 local
 * time produces tomorrow's UTC date. The user accepts the prefilled value and
 * the record is saved with the wrong date — silent data correctness bug.
 *
 * This helper formats from local Date components, which are inherently in the
 * runtime's timezone. No dependencies, no Intl overhead.
 *
 * Use this anywhere a `<input type="date">` needs a "today" default.
 */
export function getTodayLocalDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
