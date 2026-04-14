'use client';

import { Badge } from '@fmksa/ui/components/badge';
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
import { Separator } from '@fmksa/ui/components/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@fmksa/ui/components/sheet';
import { useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@/lib/trpc-client';
import { EntityWorkflowDefaults } from './entity-workflow-defaults';

// ---------------------------------------------------------------------------
// Entity types
// ---------------------------------------------------------------------------

const ENTITY_TYPES = [
  { value: 'parent', label: 'Parent' },
  { value: 'subsidiary', label: 'Subsidiary' },
  { value: 'sister_company', label: 'Sister Company' },
  { value: 'branch', label: 'Branch' },
  { value: 'operating_unit', label: 'Operating Unit' },
  { value: 'shared_service_entity', label: 'Shared Service Entity' },
];

// ---------------------------------------------------------------------------
// Create Entity Dialog
// ---------------------------------------------------------------------------

type CreateEntityFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entities: Array<{ id: string; code: string; name: string; type: string }>;
};

export function CreateEntityDialog({
  open,
  onOpenChange,
  entities,
}: CreateEntityFormProps) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [parentId, setParentId] = useState('');

  const utils = trpc.useUtils();
  const createMutation = trpc.entities.create.useMutation({
    onSuccess: () => {
      toast.success(`Entity "${name}" created.`);
      utils.entities.list.invalidate();
      setCode('');
      setName('');
      setType('');
      setParentId('');
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!code.trim() || !name.trim() || !type) {
      toast.error('Code, name, and type are required.');
      return;
    }

    // Validate: parent type cannot have a parent
    if (type === 'parent' && parentId) {
      toast.error('A parent-type entity cannot have a parent.');
      return;
    }
    if (type === 'subsidiary' && !parentId) {
      toast.error('A subsidiary must have a parent entity.');
      return;
    }

    createMutation.mutate({
      code,
      name,
      type: type as 'parent' | 'subsidiary' | 'sister_company' | 'branch' | 'operating_unit' | 'shared_service_entity',
      parentEntityId: parentId || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Entity</DialogTitle>
          <DialogDescription>
            Add a new entity to the organizational hierarchy.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="entity-code">Code</Label>
            <Input
              id="entity-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. FMKSA"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="entity-name">Name</Label>
            <Input
              id="entity-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Fun Makers KSA"
            />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue placeholder="Select type..." />
              </SelectTrigger>
              <SelectContent>
                {ENTITY_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Parent Entity (if applicable)</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger>
                <SelectValue placeholder="No parent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No parent</SelectItem>
                {entities.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name} <span className="text-muted-foreground">({e.code})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create Entity'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Entity Detail Sheet
// ---------------------------------------------------------------------------

type EntityBasic = { id: string; code: string; name: string };

type EntityDetailSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: {
    id: string;
    code: string;
    name: string;
    type: string;
    status: string;
    parentEntityId: string | null;
    parent: EntityBasic | null;
    children: EntityBasic[];
    metadataJson?: Record<string, unknown> | null;
  } | null;
};

export function EntityDetailSheet({
  open,
  onOpenChange,
  entity,
}: EntityDetailSheetProps) {
  const [archiveOpen, setArchiveOpen] = useState(false);

  if (!entity) return null;

  const typeLabel = ENTITY_TYPES.find((t) => t.value === entity.type)?.label ?? entity.type;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{entity.name}</SheetTitle>
            <SheetDescription>
              Entity details and hierarchy information.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {/* Basic info */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Code</span>
                <span className="text-sm font-mono">{entity.code}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Type</span>
                <Badge variant="outline">{typeLabel}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge
                  variant={entity.status === 'active' ? 'secondary' : 'outline'}
                  className={entity.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : ''}
                >
                  {entity.status}
                </Badge>
              </div>
            </div>

            <Separator />

            {/* Parent */}
            <div>
              <p className="text-sm font-medium mb-2">Parent</p>
              {entity.parent ? (
                <p className="text-sm text-muted-foreground">
                  {entity.parent.name} <span className="font-mono text-xs">({entity.parent.code})</span>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">No parent (root entity)</p>
              )}
            </div>

            {/* Children */}
            <div>
              <p className="text-sm font-medium mb-2">
                Children ({entity.children.length})
              </p>
              {entity.children.length === 0 ? (
                <p className="text-sm text-muted-foreground">No child entities.</p>
              ) : (
                <ul className="space-y-1">
                  {entity.children.map((child) => (
                    <li key={child.id} className="text-sm text-muted-foreground">
                      {child.name} <span className="font-mono text-xs">({child.code})</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Separator />

            {/* Workflow template defaults */}
            {entity.status === 'active' && (
              <EntityWorkflowDefaults
                entityId={entity.id}
                entityCode={entity.code}
                metadata={
                  (entity.metadataJson as Record<string, unknown>) ?? null
                }
              />
            )}

            <Separator />

            {/* Actions */}
            {entity.status !== 'archived' && (
              <SheetFooter>
                <Button
                  variant="outline"
                  className="text-destructive"
                  onClick={() => setArchiveOpen(true)}
                >
                  Archive Entity
                </Button>
              </SheetFooter>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Archive confirmation */}
      <ArchiveEntityDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        entityId={entity.id}
        entityName={entity.name}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Archive confirmation
// ---------------------------------------------------------------------------

function ArchiveEntityDialog({
  open,
  onOpenChange,
  entityId,
  entityName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string;
  entityName: string;
}) {
  const [reason, setReason] = useState('');
  const utils = trpc.useUtils();

  const archiveMutation = trpc.entities.archive.useMutation({
    onSuccess: () => {
      toast.success(`Entity "${entityName}" archived.`);
      utils.entities.list.invalidate();
      setReason('');
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Archive Entity</DialogTitle>
          <DialogDescription>
            Archiving &quot;{entityName}&quot; will hide it from active views.
            This action requires a reason.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="archive-reason">Reason</Label>
            <textarea
              id="archive-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this entity being archived?"
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!reason.trim()) {
                  toast.error('A reason is required.');
                  return;
                }
                archiveMutation.mutate({ id: entityId, reason });
              }}
              disabled={archiveMutation.isPending}
            >
              {archiveMutation.isPending ? 'Archiving...' : 'Archive'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
