'use client';

/**
 * PortfolioList — compact project list rendered inside a SummaryModule.
 *
 * One row per project: status pill + project code + project name.
 * Click navigates to the project workspace. Zero state ("No projects
 * assigned yet") rendered when the list is empty.
 */
import Link from 'next/link';
import { Badge } from '@fmksa/ui/components/badge';
import { statusBadgeStyle } from '@/lib/badge-variants';

type PortfolioProject = {
  id: string;
  code: string;
  name: string;
  status: string;
};

export function PortfolioList({ projects }: { projects: PortfolioProject[] }) {
  if (projects.length === 0) {
    return (
      <p className="py-6 text-body-sm text-muted-foreground">
        No projects assigned yet. Once a project director adds you, it will
        appear here.
      </p>
    );
  }

  return (
    <ul className="-mx-3">
      {projects.map((p) => {
        const style = statusBadgeStyle(p.status);
        return (
          <li key={p.id} className="border-b border-border last:border-0">
            <Link
              href={`/projects/${p.id}`}
              className="flex items-center gap-3 px-3 py-2.5 hover:bg-brand-teal-soft/40 rounded-md transition-colors"
            >
              <Badge
                variant={style.variant}
                className={`${style.className ?? ''} h-4 px-1.5`.trim()}
              >
                {p.status}
              </Badge>
              <span className="text-body-sm font-mono text-muted-foreground tabular-nums shrink-0">
                {p.code}
              </span>
              <span className="text-body-sm text-foreground truncate">
                {p.name}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
