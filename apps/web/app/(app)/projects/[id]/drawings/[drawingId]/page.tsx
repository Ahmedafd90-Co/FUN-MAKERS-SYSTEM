'use client';

/**
 * Drawing Detail Page (PIC-52 Layer 2.5 PR-3).
 *
 * Shows the drawing header + revision list + "New Revision" inline form.
 * Each revision can be submitted (For Information → For Approval), which
 * auto-starts the `drawing_revision_standard` workflow via the service layer.
 *
 * File upload for the revision's drawing PDF/DWG uses the PIC-51
 * `FileUploadField` component; the parent form's submit handler creates the
 * DrawingRevision first (to get its id), then uses /api/upload to attach the
 * Document via recordType='drawing_revision' + recordId=<revision.id>.
 */

import { Button } from '@fmksa/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@fmksa/ui/components/dialog';
import { Input } from '@fmksa/ui/components/input';
import { Label } from '@fmksa/ui/components/label';
import { Textarea } from '@fmksa/ui/components/textarea';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

import { FileUploadField } from '@/components/forms/file-upload-field';
import { submitDocumentUpload } from '@/lib/document-upload';
import { trpc } from '@/lib/trpc-client';

export default function DrawingDetailPage() {
  const params = useParams<{ id: string; drawingId: string }>();
  const projectId = params.id;
  const drawingId = params.drawingId;
  const utils = trpc.useUtils();

  const [reviseOpen, setReviseOpen] = useState(false);
  const [revisionLabel, setRevisionLabel] = useState('');
  const [whatChanged, setWhatChanged] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const drawing = trpc.drawings.get.useQuery({ projectId, id: drawingId });

  const createRevisionMutation = trpc.drawings.createRevision.useMutation();
  const transitionMutation = trpc.drawings.transitionRevision.useMutation({
    onSuccess: () => {
      utils.drawings.get.invalidate({ projectId, id: drawingId });
    },
    onError: (err) => toast.error(err.message),
  });

  const resetReviseForm = () => {
    setRevisionLabel('');
    setWhatChanged('');
    setFile(null);
    setUploading(false);
  };

  const handleCreateRevision = async () => {
    if (!revisionLabel.trim() || !whatChanged.trim() || !file) {
      toast.error('Revision label, what-changed, and a file are required.');
      return;
    }
    setUploading(true);
    try {
      // Step 1: create the DrawingRevision record (returns id).
      const revision = await createRevisionMutation.mutateAsync({
        projectId,
        drawingId,
        revisionLabel: revisionLabel.trim(),
        whatChanged: whatChanged.trim(),
      });

      // Step 2: upload the file as a Document attached to the revision via
      // the PIC-51 polymorphic recordType registry.
      await submitDocumentUpload({
        mode: 'create',
        file,
        projectId,
        title: `${revision.revisionLabel}: ${drawing.data?.title ?? 'Drawing'}`,
        category: 'drawing',
        recordType: 'drawing_revision',
        recordId: revision.id,
      });

      toast.success(`Revision ${revision.revisionLabel} created.`);
      utils.drawings.get.invalidate({ projectId, id: drawingId });
      setReviseOpen(false);
      resetReviseForm();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create revision.';
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = (revisionId: string) => {
    transitionMutation.mutate({
      projectId,
      id: revisionId,
      action: 'submit',
    });
  };

  if (drawing.isLoading) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if (drawing.error)
    return (
      <p className="p-6 text-sm text-destructive">Error: {drawing.error.message}</p>
    );
  if (!drawing.data) return null;

  const d = drawing.data;
  return (
    <div className="space-y-6 p-6">
      <div>
        <Link
          href={`/projects/${projectId}/drawings`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Drawing Register
        </Link>
        <div className="mt-2 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">
              {d.drawingNumber} — {d.title}
            </h1>
            <p className="text-sm text-muted-foreground">
              Discipline: {d.discipline}
              {d.currentRevision && (
                <>
                  {' • '}
                  Current revision: <strong>{d.currentRevision.revisionLabel}</strong>{' '}
                  ({d.currentRevision.status})
                </>
              )}
            </p>
          </div>
          <Button onClick={() => setReviseOpen(true)}>New Revision</Button>
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-lg font-medium">Revisions</h2>
        {d.revisions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No revisions yet. Click &quot;New Revision&quot; to add the first one.
          </p>
        ) : (
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="p-3 font-medium">Revision</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium">What Changed</th>
                  <th className="p-3 font-medium">Issued</th>
                  <th className="p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {d.revisions.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-3 font-medium">{r.revisionLabel}</td>
                    <td className="p-3">{r.status}</td>
                    <td className="p-3 max-w-md truncate">{r.whatChanged}</td>
                    <td className="p-3 text-muted-foreground">
                      {r.issuedAt ? new Date(r.issuedAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="p-3">
                      {r.status === 'for_information' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSubmit(r.id)}
                          disabled={transitionMutation.isPending}
                        >
                          Submit for Approval
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={reviseOpen} onOpenChange={(o) => { setReviseOpen(o); if (!o) resetReviseForm(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Revision</DialogTitle>
            <DialogDescription>
              Upload a new revision. The file attaches as a Document; submit
              the revision to start the approval workflow.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="rev-label">Revision Label</Label>
              <Input
                id="rev-label"
                placeholder="e.g. Rev A, P01"
                value={revisionLabel}
                onChange={(e) => setRevisionLabel(e.target.value)}
                disabled={uploading}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="what-changed">What Changed</Label>
              <Textarea
                id="what-changed"
                placeholder="Describe what's different from the previous revision…"
                value={whatChanged}
                onChange={(e) => setWhatChanged(e.target.value)}
                disabled={uploading}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Drawing File</Label>
              <FileUploadField value={file} onChange={setFile} disabled={uploading} />
            </div>
            <Button className="w-full" onClick={handleCreateRevision} disabled={uploading}>
              {uploading ? 'Uploading…' : 'Create Revision'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
