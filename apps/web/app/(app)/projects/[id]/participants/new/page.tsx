'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
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

type FormState = {
  entityId: string;
  role: RoleValue | '';
  isPrime: boolean;
  notes: string;
};

export default function NewProjectParticipantPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;
  const utils = trpc.useUtils();

  const { data: me } = trpc.auth.me.useQuery();
  const { data: userPermissions } = trpc.layer1.projectParticipants.myPermissions.useQuery();
  const { data: entities, isLoading: entitiesLoading } = trpc.entities.list.useQuery({
    includeArchived: false,
  });

  const canCreate = (userPermissions ?? []).includes('project_participant.create');

  const [form, setForm] = useState<FormState>({
    entityId: '',
    role: '',
    isPrime: false,
    notes: '',
  });
  const [error, setError] = useState<string | null>(null);

  const createMut = trpc.layer1.projectParticipants.create.useMutation({
    onSuccess: () => {
      utils.layer1.projectParticipants.list.invalidate({ projectId });
      router.push(`/projects/${projectId}/participants`);
    },
    onError: (err) => setError(err.message),
  });

  if (userPermissions !== undefined && !canCreate) {
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.entityId) {
      setError('Entity is required.');
      return;
    }
    if (!form.role) {
      setError('Role is required.');
      return;
    }
    if (!me?.id) {
      setError('Unable to identify current user. Please refresh.');
      return;
    }

    createMut.mutate({
      projectId,
      entityId: form.entityId,
      role: form.role,
      isPrime: form.isPrime,
      notes: form.notes.trim() || undefined,
      createdBy: me.id,
    });
  };

  const isPending = createMut.isPending;

  return (
    <div className="space-y-4">
      <Link
        href={`/projects/${projectId}/participants`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Participants
      </Link>

      <PageHeader
        title="Add Participant"
        description="Add an entity to this project."
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Participant Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="entityId">Entity *</Label>
              <Select
                value={form.entityId}
                onValueChange={(v) => setForm({ ...form, entityId: v })}
                disabled={entitiesLoading}
              >
                <SelectTrigger id="entityId">
                  <SelectValue
                    placeholder={entitiesLoading ? 'Loading entities...' : 'Select an entity'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {(entities ?? []).map((entity) => (
                    <SelectItem key={entity.id} value={entity.id}>
                      {entity.name} ({entity.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Entity assignment is set at creation and cannot be changed afterward.
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
              <Label htmlFor="isPrime">Prime Participant</Label>
              <Select
                value={form.isPrime ? 'true' : 'false'}
                onValueChange={(v) => setForm({ ...form, isPrime: v === 'true' })}
              >
                <SelectTrigger id="isPrime">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">No</SelectItem>
                  <SelectItem value="true">Yes</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Marks this entity as the prime participant for the project.
              </p>
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
          <Button type="submit" disabled={isPending || !me?.id}>
            {isPending ? 'Adding...' : 'Add Participant'}
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
      </form>
    </div>
  );
}
