'use client';

import { Badge } from '@fmksa/ui/components/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@fmksa/ui/components/card';
import { Building2 } from 'lucide-react';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function projectStatusBadge(status: string) {
  switch (status) {
    case 'active':
      return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs">Active</Badge>;
    case 'on_hold':
      return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 text-xs">On Hold</Badge>;
    case 'completed':
      return <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-xs">Completed</Badge>;
    case 'archived':
      return <Badge variant="secondary" className="bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 text-xs">Archived</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">{status}</Badge>;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type ProjectCardProps = {
  id: string;
  code: string;
  name: string;
  status: string;
  entityName: string;
  currencyCode: string;
};

export function ProjectCard({
  id,
  code,
  name,
  status,
  entityName,
  currencyCode,
}: ProjectCardProps) {
  return (
    <Link href={`/projects/${id}`}>
      <Card className="hover:border-foreground/20 transition-colors cursor-pointer h-full">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-mono text-muted-foreground">{code}</p>
              <CardTitle className="text-base mt-1">{name}</CardTitle>
            </div>
            {projectStatusBadge(status)}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              <span>{entityName}</span>
            </div>
            <span className="font-mono text-xs">{currencyCode}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
