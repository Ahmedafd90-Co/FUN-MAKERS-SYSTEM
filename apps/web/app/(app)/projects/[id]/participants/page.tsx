'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Plus, ShieldOff, Users } from 'lucide-react';
import { Badge } from '@fmksa/ui/components/badge';
import { Button } from '@fmksa/ui/components/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@fmksa/ui/components/table';

import { trpc } from '@/lib/trpc-client';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';

const ROLE_LABELS: Record<string, string> = {
  prime_contractor: 'Prime Contractor',
  sub_contractor: 'Subcontractor',
  factory: 'Factory',
  design: 'Design',
  management: 'Management',
  other: 'Other',
};

function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

function truncate(text: string | null | undefined, max = 60): string {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export default function ProjectParticipantsListPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const { data: userPermissions } = trpc.layer1.projectParticipants.myPermissions.useQuery();
  const canCreate = (userPermissions ?? []).includes('project_participant.create');

  const { data, isLoading, error } = trpc.layer1.projectParticipants.list.useQuery({
    projectId,
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Project Participants"
        description="Entities (companies / branches) participating in this project."
        actions={
          canCreate ? (
            <Button size="sm" asChild>
              <Link href={`/projects/${projectId}/participants/new`}>
                <Plus className="h-4 w-4 mr-1" />
                New Participant
              </Link>
            </Button>
          ) : undefined
        }
      />

      {error?.data?.code === 'FORBIDDEN' ? (
        <div className="py-16 text-center space-y-2">
          <ShieldOff className="h-8 w-8 mx-auto text-muted-foreground/40" />
          <p className="text-sm font-medium">Access Denied</p>
          <p className="text-xs text-muted-foreground">
            You don&apos;t have permission to view participants in this project.
          </p>
        </div>
      ) : error ? (
        <div className="py-10 text-center text-sm text-destructive">
          {error.message}
        </div>
      ) : isLoading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          Loading...
        </div>
      ) : !data?.length ? (
        <EmptyState
          icon={Users}
          title="No participants yet"
          description="No participants have been assigned to this project. Add the first participant to get started."
          {...(canCreate
            ? {
                action: {
                  label: 'New Participant',
                  href: `/projects/${projectId}/participants/new`,
                },
              }
            : {})}
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Entity</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Prime</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((p) => {
                const entity = (p as { entity?: { name: string; code: string } }).entity;
                return (
                  <TableRow key={p.id} className="hover:bg-muted/50">
                    <TableCell>
                      <Link
                        href={`/projects/${projectId}/participants/${p.id}`}
                        className="font-medium hover:underline"
                      >
                        {entity?.name ?? '(unknown entity)'}
                      </Link>
                      {entity?.code && (
                        <span className="ml-2 text-xs text-muted-foreground font-mono">
                          ({entity.code})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{roleLabel(p.role)}</TableCell>
                    <TableCell>
                      <Badge variant={p.isPrime ? 'default' : 'outline'} className="text-xs">
                        {p.isPrime ? 'Yes' : 'No'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[260px]">
                      {truncate(p.notes)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/projects/${projectId}/participants/${p.id}`}
                        className="text-sm text-primary hover:underline"
                      >
                        Edit
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
