/**
 * Shared badge styling utilities for consistent status display across all pages.
 *
 * Phase 1.9 — visual consistency.
 */

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

type BadgeStyle = {
  variant: BadgeVariant;
  className?: string;
};

/**
 * Map a generic status string to a consistent badge style.
 *
 * Green:  active, approved, completed, resolved, sent, read
 * Amber:  pending, in_progress, returned, waiting, delayed
 * Red:    rejected, failed, locked, breached
 * Muted:  inactive, archived, draft
 * Outline: unknown / fallback
 */
export function statusBadgeStyle(status: string): BadgeStyle {
  const s = status.toLowerCase().replace(/[\s-]/g, '_');

  // Green states
  if (['active', 'approved', 'completed', 'resolved', 'sent', 'read'].includes(s)) {
    return {
      variant: 'secondary',
      className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    };
  }

  // Amber states
  if (['pending', 'in_progress', 'returned', 'waiting', 'delayed'].includes(s)) {
    return {
      variant: 'secondary',
      className: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    };
  }

  // Red states
  if (['rejected', 'failed', 'locked', 'breached', 'error'].includes(s)) {
    return { variant: 'destructive' };
  }

  // Muted states
  if (['inactive', 'archived', 'draft', 'disabled'].includes(s)) {
    return {
      variant: 'secondary',
      className: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
    };
  }

  // Fallback
  return { variant: 'outline' };
}

/**
 * Convenience: returns just the variant string for simple Badge usage.
 */
export function statusBadgeVariant(status: string): BadgeVariant {
  return statusBadgeStyle(status).variant;
}
