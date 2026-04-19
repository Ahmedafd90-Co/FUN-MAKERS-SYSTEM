'use client';

/**
 * KpiCard — single-metric priority card for the dashboard priority zone.
 *
 * Three visual states:
 *   - `count === 0`   : quiet success state ("All clear") with a subtle check
 *   - `count > 0`     : the number takes the stage; label + sub-label muted
 *   - `tone="urgent"` : adds a brand-teal-ink left accent when attention is
 *                       required. Never red — we reserve destructive for
 *                       actual errors.
 *
 * Entire card is a link target so the whole surface is clickable.
 */
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '@fmksa/ui/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@fmksa/ui/components/card';

type KpiCardProps = {
  label: string;
  count: number;
  subLabel: string;
  icon: LucideIcon;
  href: string;
  tone?: 'default' | 'urgent';
  zeroLabel?: string;
};

export function KpiCard({
  label,
  count,
  subLabel,
  icon: Icon,
  href,
  tone = 'default',
  zeroLabel = 'All clear',
}: KpiCardProps) {
  const isUrgent = tone === 'urgent' && count > 0;

  return (
    <Link href={href} className="group block">
      <Card
        className={cn(
          'transition-all group-hover:shadow-md',
          isUrgent && 'border-l-[3px] border-l-brand-teal-ink',
        )}
      >
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-label uppercase text-muted-foreground">
            {label}
          </CardTitle>
          <Icon className="h-4 w-4 text-muted-foreground/40" aria-hidden />
        </CardHeader>
        <CardContent>
          {count === 0 ? (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
              <span className="text-body-sm text-muted-foreground">
                {zeroLabel}
              </span>
            </div>
          ) : (
            <div>
              <p className="text-kpi tabular-nums text-foreground">{count}</p>
              <p className="text-meta text-muted-foreground">{subLabel}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
