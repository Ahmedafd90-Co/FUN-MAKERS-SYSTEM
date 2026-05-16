'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ShieldOff } from 'lucide-react';
import { Badge } from '@fmksa/ui/components/badge';
import { Button } from '@fmksa/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@fmksa/ui/components/card';
import { Label } from '@fmksa/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@fmksa/ui/components/select';
import { Textarea } from '@fmksa/ui/components/textarea';

import { trpc } from '@/lib/trpc-client';
import { PageHeader } from '@/components/layout/page-header';
import { PermissionDenied } from '@/components/ui/permission-denied';
import {
  ROLES,
  type ParticipantRole as RoleValue,
} from '@/components/projects/participant-helpers';
import type { ProjectParticipantWithEntity } from '@fmksa/contracts';

type FormState = {
  role: RoleValue | '';
  notes: string;
};

export default function EditProjectParticipantPage() {
  const params = useParams<{ id: string; participantId: string }>();
  const router = useRouter();
  const projectId = params.id;
  const participantId = params.participantId;
  const utils = trpc.useUtils();

  const { data: userPermissions } = trpc.layer1.projectParticipants.myPermissions.useQuery();
  const canEdit = (userPermissions ?? []).includes('project_participant.edit');

  const { data, isLoading, error } = trpc.layer1.projectParticipants.get.useQuery({
    projectId,
    id: participantId,
  });

  const [form, setForm] = useState<FormState>({ role: '', notes: '' });
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Seed form state when (a) data first loads for a given participant, OR
  // (b) the user navigates from one participant's edit page to another. In
  // Next.js App Router, navigating between two `[participantId]` URLs
  // preserves the component instance — `useParams()` returns updated values
  // but `useRef` state persists. A boolean "seeded once, never reset" guard
  // would keep participant A's form values when the URL flips to participant B,
  // and submit() would then write A's values to B's row.
  //
  // Tracking the seeded participantId by value (not a boolean) re-seeds on
  // cross-navigation while still skipping re-seeds on background refetch
  // (tab focus, query invalidation) for the SAME participant.
  const seededParticipantRef = useRef<string | null>(null);
  useEffect(() => {
    if (data && seededParticipantRef.current !== participantId) {
      setForm({
        role: data.role as RoleValue,
        notes: data.notes ?? '',
      });
      seededParticipantRef.current = participantId;
    }
  }, [data, participantId]);

  const updateMut = trpc.layer1.projectParticipants.update.useMutation({
    onSuccess: () => {
      utils.layer1.projectParticipants.get.invalidate({ projectId, id: participantId });
      utils.layer1.projectParticipants.list.invalidate({ projectId });
      router.push(`/projects/${projectId}/participants`);
    },
    onError: (err) => setSubmitError(err.message),
  });

  if (isLoading) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">Loading...</div>
    );
  }

  if (error?.data?.code === 'FORBIDDEN') {
    return (
      <div className="space-y-4">
        <Link
          href={`/projects/${projectId}/participants`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Participants
        </Link>
        <div className="py-16 text-center space-y-2">
          <ShieldOff className="h-8 w-8 mx-auto text-muted-foreground/40" />
          <p className="text-sm font-medium">Access Denied</p>
          <p className="text-xs text-muted-foreground">
            You don&apos;t have permission to view this participant.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Link
          href={`/projects/${projectId}/participants`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Participants
        </Link>
        <div className="py-10 text-center text-sm text-destructive">{error.message}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Link
          href={`/projects/${projectId}/participants`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Participants
        </Link>
        <div className="py-10 text-center text-sm text-muted-foreground">
          Participant not found.
        </div>
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div className="space-y-4">
        <Link
          href={`/projects/${projectId}/participants`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Participants
        </Link>
        <PermissionDenied />
      </div>
    );
  }

  const entity = (data as ProjectParticipantWithEntity).entity;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!form.role) {
      setSubmitError('Role is required.');
      return;
    }

    updateMut.mutate({
      id: participantId,
      projectId,
      role: form.role,
      notes: form.notes.trim() || null,
    });
  };

  const isPending = updateMut.isPending;

  return (
    <div className="space-y-4">
      <Link
        href={`/projects/${projectId}/participants`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Participants
      </Link>

      <PageHeader title="Edit Participant" />

      <form onSubmit={handleSubmit} className="space-y-4">
        {submitError && (
          <div className="rounded-md border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {submitError}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Participant Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>Entity</Label>
              <p className="text-sm font-medium">
                {entity?.name ?? '(unknown entity)'}
                {entity?.code && (
                  <span className="ml-2 text-xs text-muted-foreground font-mono">
                    ({entity.code})
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                Entity assignment is immutable. To change the entity, remove this
                participant and add a new one.
              </p>
            </div>

            <div className="space-y-1">
              <Label>Prime Participant</Label>
              <div>
                <Badge variant={data.isPrime ? 'default' : 'outline'} className="text-xs">
                  {data.isPrime ? 'Yes' : 'No'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Prime designation is set at creation and cannot be changed afterward.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="role">Role *</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm({ ...form, role: v as RoleValue })}
              >
                <SelectTrigger id="role">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional context about this participant's role"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Saving...' : 'Save Changes'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => router.back()}
          >
            Cancel
          </Button>
        </div>

        <p className="text-xs text-muted-foreground mt-4">
          To remove a participant from this project, contact a project administrator.
          Participant removal will be available in a future update.
        </p>
      </form>
    </div>
  );
}
