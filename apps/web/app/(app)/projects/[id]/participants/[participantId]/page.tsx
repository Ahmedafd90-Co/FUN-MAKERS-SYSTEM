import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@fmksa/ui/components/card';

import { PageHeader } from '@/components/layout/page-header';

type Props = {
  params: Promise<{ id: string; participantId: string }>;
};

/**
 * Project Participant — edit page (Stage 1 placeholder).
 *
 * Inner dynamic segment is `[participantId]` (not `[id]`) to avoid shadowing
 * the project `[id]` from the parent route.
 *
 * Stage 2 will render `<ProjectParticipantForm projectId={id} existing={...} />`
 * calling `trpc.layer1.projectParticipants.{get,update}` with permission
 * gating on `project_participant.view` / `project_participant.edit`.
 */
export default async function EditProjectParticipantPage({ params }: Props) {
  const { id } = await params;

  return (
    <div className="space-y-4">
      <Link
        href={`/projects/${id}/participants`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Participants
      </Link>

      <PageHeader
        title="Edit Project Participant"
        description="Update participant role, allocation share, or active dates."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Coming in Stage 2</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          The participant edit form will render here. Will use{' '}
          <code className="text-xs">trpc.layer1.projectParticipants.get</code> and{' '}
          <code className="text-xs">trpc.layer1.projectParticipants.update</code>.
        </CardContent>
      </Card>
    </div>
  );
}
