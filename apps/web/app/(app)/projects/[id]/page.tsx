'use client';

import { Separator } from '@fmksa/ui/components/separator';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { ProjectHeader } from '@/components/projects/project-header';
import { ProjectWorkspaceTabs } from '@/components/projects/project-workspace-tabs';
import { trpc } from '@/lib/trpc-client';

function toStringOrNull(val: unknown): string | number | null {
  if (val === null || val === undefined) return null;
  return String(val);
}

export default function ProjectWorkspacePage() {
  const params = useParams<{ id: string }>();

  const { data: me } = trpc.auth.me.useQuery();

  const { data: project, isLoading, error } = trpc.projects.get.useQuery({
    id: params.id,
    projectId: params.id,
  });

  if (isLoading) {
    return <p className="text-muted-foreground">Loading project...</p>;
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">{error.message}</p>
        <Link
          href="/projects"
          className="text-sm text-muted-foreground hover:text-foreground mt-2 inline-block"
        >
          Back to Projects
        </Link>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Project not found.</p>
        <Link
          href="/projects"
          className="text-sm text-muted-foreground hover:text-foreground mt-2 inline-block"
        >
          Back to Projects
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* Back link */}
      <Link
        href="/projects"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        All Projects
      </Link>

      <ProjectHeader
        code={project.code}
        name={project.name}
        status={project.status}
        entityName={project.entity?.name ?? '-'}
      />

      <Separator className="my-6" />

      <ProjectWorkspaceTabs
        canEditProject={me?.permissions?.includes('project.edit') ?? false}
        project={{
          id: project.id,
          code: project.code,
          name: project.name,
          status: project.status,
          currencyCode: project.currencyCode,
          startDate: project.startDate as unknown as string,
          endDate: project.endDate as unknown as string | null,
          entity: project.entity
            ? { id: project.entity.id, name: project.entity.name, code: project.entity.code }
            : null,
          currency: project.currency
            ? { code: project.currency.code, name: project.currency.name, symbol: project.currency.symbol }
            : null,
          contractValue: toStringOrNull((project as any).contractValue),
          revisedContractValue: toStringOrNull((project as any).revisedContractValue),
        }}
      />
    </>
  );
}
