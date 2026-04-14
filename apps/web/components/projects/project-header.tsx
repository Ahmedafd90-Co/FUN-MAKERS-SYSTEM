'use client';

import { Badge } from '@fmksa/ui/components/badge';
import { Building2 } from 'lucide-react';

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function projectStatusBadge(status: string) {
  switch (status) {
    case 'active':
      return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Active</Badge>;
    case 'on_hold':
      return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">On Hold</Badge>;
    case 'completed':
      return <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Completed</Badge>;
    case 'archived':
      return <Badge variant="secondary" className="bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">Archived</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type ProjectHeaderProps = {
  code: string;
  name: string;
  status: string;
  entityName: string;
};

export function ProjectHeader({
  code,
  name,
  status,
  entityName,
}: ProjectHeaderProps) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{name}</h1>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs font-mono text-muted-foreground">{code}</span>
          <span className="text-muted-foreground/30">|</span>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" />
            <span>{entityName}</span>
          </div>
        </div>
      </div>
      <div>{projectStatusBadge(status)}</div>
    </div>
  );
}
