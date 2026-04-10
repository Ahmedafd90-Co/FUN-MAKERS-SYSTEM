'use client';

import { trpc } from '@/lib/trpc-client';

import { ProjectCard } from './project-card';

export function ProjectList() {
  const { data: projects, isLoading } = trpc.projects.list.useQuery({
    includeArchived: false,
  });

  if (isLoading) {
    return <p className="text-muted-foreground">Loading projects...</p>;
  }

  if (!projects || projects.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          You are not assigned to any projects yet.
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Contact your administrator to be added to a project.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <ProjectCard
          key={project.id}
          id={project.id}
          code={project.code}
          name={project.name}
          status={project.status}
          entityName={project.entity?.name ?? '-'}
          currencyCode={project.currencyCode}
        />
      ))}
    </div>
  );
}
