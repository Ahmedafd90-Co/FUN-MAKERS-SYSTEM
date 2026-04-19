'use client';

import { Button } from '@fmksa/ui/components/button';
import { AlertTriangle } from 'lucide-react';

type ErrorStateProps = {
  title?: string;
  description?: string;
  onRetry?: () => void;
};

// Type-role mapping mirrors EmptyState for visual consistency between
// "nothing here yet" and "something broke":
//   title       -> text-heading-sub
//   description -> text-body-sm
//
// Destructive color stays on the icon only — don't tint the heading red,
// which makes every failure feel catastrophic even when it is routine.
export function ErrorState({
  title = 'Something went wrong',
  description = 'An unexpected error occurred. Please try again.',
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-destructive/15 bg-destructive/5">
        <AlertTriangle className="h-6 w-6 text-destructive/80" />
      </div>
      <div className="space-y-1">
        <p className="text-heading-sub text-foreground">{title}</p>
        <p className="text-body-sm text-muted-foreground max-w-sm">
          {description}
        </p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
