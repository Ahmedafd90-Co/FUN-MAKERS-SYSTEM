'use client';

/**
 * Drawing Register — List Page (PIC-52 Layer 2.5 PR-3).
 *
 * Minimal UI per the PIC-52 ticket's "list / detail / create / revise" scope.
 * Lists drawings for a project; opens an inline create-drawing dialog on
 * "New Drawing" click; each row links to the per-drawing detail page where
 * revisions live.
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@fmksa/ui/components/select';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@/lib/trpc-client';

const DISCIPLINES = [
  { value: 'architectural', label: 'Architectural' },
  { value: 'structural', label: 'Structural' },
  { value: 'mep', label: 'MEP' },
  { value: 'theming', label: 'Theming' },
  { value: 'ff_and_e', label: 'FF&E' },
  { value: 'rockwork', label: 'Rockwork' },
  { value: 'ride_systems', label: 'Ride Systems' },
  { value: 'show_control', label: 'Show Control' },
  { value: 'scenic', label: 'Scenic' },
] as const;

export default function DrawingRegisterPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;
  const utils = trpc.useUtils();

  const [createOpen, setCreateOpen] = useState(false);
  const [drawingNumber, setDrawingNumber] = useState('');
  const [title, setTitle] = useState('');
  const [discipline, setDiscipline] = useState<string>('');

  const list = trpc.drawings.list.useQuery({ projectId });
  const createMutation = trpc.drawings.create.useMutation({
    onSuccess: (created) => {
      toast.success(`Drawing ${created.drawingNumber} created.`);
      utils.drawings.list.invalidate();
      setCreateOpen(false);
      setDrawingNumber('');
      setTitle('');
      setDiscipline('');
      router.push(`/projects/${projectId}/drawings/${created.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleCreate = () => {
    if (!drawingNumber.trim() || !title.trim() || !discipline) {
      toast.error('Drawing number, title, and discipline are required.');
      return;
    }
    createMutation.mutate({
      projectId,
      drawingNumber: drawingNumber.trim(),
      title: title.trim(),
      discipline: discipline as (typeof DISCIPLINES)[number]['value'],
    });
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Drawing Register</h1>
          <p className="text-sm text-muted-foreground">
            Design drawings with revision lifecycle and approval workflow.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>New Drawing</Button>
      </div>

      {list.isLoading && <p className="text-sm text-muted-foreground">Loading drawings…</p>}
      {list.error && (
        <p className="text-sm text-destructive">Error loading drawings: {list.error.message}</p>
      )}
      {list.data && list.data.length === 0 && (
        <p className="text-sm text-muted-foreground">No drawings yet. Click "New Drawing" to create one.</p>
      )}
      {list.data && list.data.length > 0 && (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="p-3 font-medium">Drawing #</th>
                <th className="p-3 font-medium">Title</th>
                <th className="p-3 font-medium">Discipline</th>
                <th className="p-3 font-medium">Current Revision</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((d) => (
                <tr key={d.id} className="border-t hover:bg-muted/30">
                  <td className="p-3">
                    <Link
                      href={`/projects/${projectId}/drawings/${d.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {d.drawingNumber}
                    </Link>
                  </td>
                  <td className="p-3">{d.title}</td>
                  <td className="p-3">{d.discipline}</td>
                  <td className="p-3 text-muted-foreground">
                    {d.currentRevision?.revisionLabel ?? '—'}
                    {d.currentRevision && (
                      <span className="ml-2 text-xs">({d.currentRevision.status})</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Drawing</DialogTitle>
            <DialogDescription>
              Create a drawing header. You can add the first revision after creating.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="drawing-number">Drawing Number</Label>
              <Input
                id="drawing-number"
                placeholder="e.g. A-101"
                value={drawingNumber}
                onChange={(e) => setDrawingNumber(e.target.value)}
                disabled={createMutation.isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="drawing-title">Title</Label>
              <Input
                id="drawing-title"
                placeholder="Ground Floor Plan"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={createMutation.isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="drawing-discipline">Discipline</Label>
              <Select value={discipline} onValueChange={setDiscipline} disabled={createMutation.isPending}>
                <SelectTrigger id="drawing-discipline">
                  <SelectValue placeholder="Select a discipline..." />
                </SelectTrigger>
                <SelectContent>
                  {DISCIPLINES.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating…' : 'Create Drawing'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
