'use client';

/**
 * SignalRow — single row inside a SummaryModule's body for signal lists.
 *
 * Each row has:
 *   - An icon dot in brand teal (filled when count > 0, hollow when 0)
 *   - A label describing the signal
 *   - A right-aligned count (tabular-nums) + small CTA arrow on hover
 *
 * The whole row is a link target. Zero counts render quietly (muted) so
 * the eye is drawn to the rows that need attention.
 */
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@fmksa/ui/lib/utils';

type SignalRowProps = {
  label: string;
  count: number;
  href: string;
};

export function SignalRow({ label, count, href }: SignalRowProps) {
  const hasWork = count > 0;

  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-3 py-2.5 border-b border-border last:border-0 transition-colors hover:bg-brand-teal-soft/40 -mx-3 px-3 rounded-md"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden
          className={cn(
            'h-1.5 w-1.5 rounded-full shrink-0',
            hasWork ? 'bg-brand-teal-ink' : 'bg-border-strong',
          )}
        />
        <span
          className={cn(
            'text-body-sm truncate',
            hasWork ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {label}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span
          className={cn(
            'text-body-sm tabular-nums',
            hasWork
              ? 'font-medium text-foreground'
              : 'text-muted-foreground/60',
          )}
        >
          {count}
        </span>
        <ArrowUpRight
          aria-hidden
          className={cn(
            'h-3.5 w-3.5 text-muted-foreground/40 transition-opacity',
            'opacity-0 group-hover:opacity-100',
          )}
        />
      </div>
    </Link>
  );
}
