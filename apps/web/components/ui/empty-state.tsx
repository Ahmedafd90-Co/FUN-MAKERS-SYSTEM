'use client';

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
};

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <Icon className="h-10 w-10 text-muted-foreground/40" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && (
        action.href ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={action.href}>{action.label}</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        )
      )}
    </div>
  );
}
