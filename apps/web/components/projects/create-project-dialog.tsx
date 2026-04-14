'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@fmksa/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { toast } from 'sonner';

import { trpc } from '@/lib/trpc-client';

// ---------------------------------------------------------------------------
// Create Project Dialog
// ---------------------------------------------------------------------------

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CreateProjectDialog({ open, onOpenChange }: Props) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [entityId, setEntityId] = useState('');
  const [currencyCode, setCurrencyCode] = useState('SAR');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const { data: entities } = trpc.entities.list.useQuery(
    { includeArchived: false },
    { enabled: open },
  );
  const { data: currencies } = trpc.referenceData.currencies.list.useQuery(
    undefined,
    { enabled: open },
  );

  const utils = trpc.useUtils();
  const createMut = trpc.projects.create.useMutation({
    onSuccess: (project) => {
      toast.success(`Project "${project.name}" created.`);
      utils.projects.list.invalidate();
      resetForm();
      onOpenChange(false);
      router.push(`/projects/${project.id}`);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  function resetForm() {
    setCode('');
    setName('');
    setEntityId('');
    setCurrencyCode('SAR');
    setStartDate('');
    setEndDate('');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!code.trim() || !name.trim() || !entityId || !currencyCode || !startDate) {
      toast.error('Code, name, entity, currency, and start date are required.');
      return;
    }

    createMut.mutate({
      code: code.trim(),
      name: name.trim(),
      entityId,
      currencyCode,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Project</DialogTitle>
          <DialogDescription>
            Create a new project under an entity. You can configure details and
            assign team members after creation.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="project-code">Code *</Label>
              <Input
                id="project-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. PRJ-001"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-name">Name *</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Al Riyadh Tower"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Entity *</Label>
            <Select value={entityId} onValueChange={setEntityId}>
              <SelectTrigger>
                <SelectValue placeholder="Select entity..." />
              </SelectTrigger>
              <SelectContent>
                {(entities ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}{' '}
                    <span className="text-muted-foreground text-xs">
                      ({e.code})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Currency *</Label>
            <Select value={currencyCode} onValueChange={setCurrencyCode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(currencies ?? []).map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </SelectItem>
                ))}
                {/* Fallback if currencies haven't loaded yet */}
                {!currencies?.length && (
                  <SelectItem value="SAR">SAR</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start-date">Start Date *</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date">End Date</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMut.isPending}>
              {createMut.isPending ? 'Creating...' : 'Create Project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
