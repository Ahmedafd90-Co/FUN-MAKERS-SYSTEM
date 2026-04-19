'use client';

import { CornerFrameMotif } from '@fmksa/brand';
import { Button } from '@fmksa/ui/components/button';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  /**
   * When true, render small brand corner-frame brackets around the icon
   * to signal "this is intentionally empty" rather than "this is broken".
   * Opt-in because a lot of empty states should stay quiet.
   */
  framed?: boolean;
};

// Type-role mapping (consumes the brand scale via Tailwind `text-*` tokens):
//   title       -> text-heading-sub (15/20, weight-500)
//   description -> text-body-sm     (13/20, weight-400, muted tone)
//
// Deliberate restraint: empty states on operational pages should feel
// intentional and quiet. We do NOT use `display-section` here — that weight
// belongs on anchor surfaces (sign-in, 404 hero), not in the middle of a
// register when a filter returns no rows.
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  framed = false,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <div className="relative">
        {framed && (
          <>
            <CornerFrameMotif
              className="absolute -top-3 -left-6 h-5 w-9 text-muted-foreground/30"
              aria-hidden
            />
            <CornerFrameMotif
              className="absolute -bottom-3 -right-6 h-5 w-9 text-muted-foreground/30"
              aria-hidden
            />
          </>
        )}
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-brand-teal/15 bg-brand-teal-soft">
          <Icon className="h-6 w-6 text-brand-teal-ink/80" />
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-heading-sub text-foreground">{title}</p>
        {description && (
          <p className="text-body-sm text-muted-foreground max-w-sm">
            {description}
          </p>
        )}
      </div>
      {action &&
        (action.href ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={action.href}>{action.label}</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        ))}
    </div>
  );
}
