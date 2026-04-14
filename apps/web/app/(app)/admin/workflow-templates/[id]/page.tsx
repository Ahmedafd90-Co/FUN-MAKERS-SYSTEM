'use client';

/**
 * Admin > Workflow Templates > [id] — template detail + management page.
 *
 * Capabilities:
 * - View template info, config, and approval steps (read-only)
 * - Edit template name (inline)
 * - Deactivate / Reactivate template
 */

import { Badge } from '@fmksa/ui/components/badge';
import { Button } from '@fmksa/ui/components/button';
import { Input } from '@fmksa/ui/components/input';
import { Label } from '@fmksa/ui/components/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@fmksa/ui/components/dialog';
import { Separator } from '@fmksa/ui/components/separator';
import { ArrowLeft, Pencil, Check, X, Loader2, Copy, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@/lib/trpc-client';

// ---------------------------------------------------------------------------
// Tiny component to resolve a userId to a human name (avoids hooks-in-loop)
// ---------------------------------------------------------------------------

function UserName({ userId }: { userId: string }) {
  const { data } = trpc.adminUsers.getUser.useQuery(
    { id: userId },
    { enabled: !!userId, staleTime: Infinity },
  );
  const name = (data as { name?: string } | undefined)?.name;
  return <>{name ?? userId}</>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function WorkflowTemplateDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const templateId = params.id;

  const { data: template, isLoading } =
    trpc.workflow.templates.get.useQuery({ id: templateId });

  const utils = trpc.useUtils();

  // --- Name editing ---
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');

  const updateMutation = trpc.workflow.templates.update.useMutation({
    onSuccess: () => {
      toast.success('Template name updated.');
      setEditingName(false);
      utils.workflow.templates.get.invalidate({ id: templateId });
      utils.workflow.templates.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const startEditing = () => {
    if (template) {
      setNameValue(template.name);
      setEditingName(true);
    }
  };

  const saveName = () => {
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === template?.name) {
      setEditingName(false);
      return;
    }
    updateMutation.mutate({
      id: templateId,
      data: { name: trimmed },
    });
  };

  // --- Deactivate / Reactivate ---
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  const deactivateMutation = trpc.workflow.templates.deactivate.useMutation({
    onSuccess: () => {
      toast.success('Template deactivated.');
      setDeactivateOpen(false);
      utils.workflow.templates.get.invalidate({ id: templateId });
      utils.workflow.templates.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const reactivateMutation = trpc.workflow.templates.reactivate.useMutation({
    onSuccess: () => {
      toast.success('Template reactivated.');
      utils.workflow.templates.get.invalidate({ id: templateId });
      utils.workflow.templates.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // --- Activate (governance gate) ---
  const [activateOpen, setActivateOpen] = useState(false);

  const activateMutation = trpc.workflow.templates.activate.useMutation({
    onSuccess: () => {
      toast.success('Template activated. It is now resolvable for new submissions.');
      setActivateOpen(false);
      utils.workflow.templates.get.invalidate({ id: templateId });
      utils.workflow.templates.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // --- Clone ---
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneCode, setCloneCode] = useState('');

  const cloneMutation = trpc.workflow.templates.clone.useMutation({
    onSuccess: (data) => {
      toast.success('Template cloned as draft.');
      setCloneOpen(false);
      setCloneCode('');
      utils.workflow.templates.list.invalidate();
      if (data?.id) router.push(`/admin/workflow-templates/${data.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        Loading template...
      </p>
    );
  }

  if (!template) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">Template not found.</p>
        <Link
          href="/admin/workflow-templates"
          className="text-sm underline mt-2 inline-block"
        >
          Back to templates
        </Link>
      </div>
    );
  }

  const config = template.configJson as Record<string, boolean> | null;



  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/admin/workflow-templates">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            {editingName ? (
              <div className="flex items-center gap-2">
                <Input
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  className="h-8 text-lg font-semibold max-w-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveName();
                    if (e.key === 'Escape') setEditingName(false);
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={saveName}
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4 text-green-600" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setEditingName(false)}
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight">
                  {template.name}
                </h1>
                {template.isActive && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={startEditing}
                    title="Edit template name"
                  >
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                )}
              </div>
            )}
            <p className="text-sm text-muted-foreground font-mono">
              {template.code}
            </p>
          </div>
          {template.isActive ? (
            <Badge
              variant="secondary"
              className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
            >
              Active
            </Badge>
          ) : template.version === 1 ? (
            <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              Draft
            </Badge>
          ) : (
            <Badge variant="secondary">Inactive</Badge>
          )}
        </div>

        <Separator />

        {/* Info grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Record Type</p>
            <p className="font-medium">{template.recordType}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Version</p>
            <p className="font-medium">v{template.version}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Steps</p>
            <p className="font-medium">{template.steps?.length ?? 0}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Created By</p>
            <p className="font-medium text-xs">
              <UserName userId={template.createdBy} />
            </p>
          </div>
        </div>

        {/* Config */}
        {config && (
          <>
            <Separator />
            <div>
              <h2 className="text-sm font-semibold mb-3">Configuration</h2>
              <div className="flex flex-wrap gap-3">
                <ConfigBadge label="Comment" enabled={!!config.allowComment} />
                <ConfigBadge label="Return" enabled={!!config.allowReturn} />
                <ConfigBadge label="Override" enabled={!!config.allowOverride} />
              </div>
            </div>
          </>
        )}

        {/* Steps */}
        <Separator />
        <div>
          <h2 className="text-sm font-semibold mb-3">Approval Steps</h2>
          {template.steps && template.steps.length > 0 ? (
            <div className="space-y-2">
              {template.steps.map((step, idx: number) => {
                const rule = (step as { approverRuleJson: Record<string, unknown> }).approverRuleJson;
                return (
                  <div
                    key={step.id}
                    className="flex items-center gap-4 rounded-md border border-border px-4 py-3"
                  >
                    <span className="text-xs font-mono text-muted-foreground w-6">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{step.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Approver: {rule.type as string}
                        {rule.roleCode ? ` (${rule.roleCode})` : ''}
                        {rule.userId ? <>{' '}(<UserName userId={rule.userId as string} />)</> : ''}
                        {step.slaHours ? ` | SLA: ${step.slaHours}h` : ''}
                        {step.isOptional ? ' | Optional' : ''}
                        {(step as any).outcomeType ? ` | Outcome: ${(step as any).outcomeType}` : ''}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">
                      Order {step.orderIndex}
                    </Badge>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No steps defined.</p>
          )}
        </div>

        {/* Actions */}
        <Separator />
        <div className="flex flex-wrap gap-3">
          {template.isActive ? (
            <Button
              variant="outline"
              className="text-destructive"
              onClick={() => setDeactivateOpen(true)}
              disabled={deactivateMutation.isPending}
            >
              Deactivate Template
            </Button>
          ) : (
            <>
              {/* Primary action for draft/inactive templates: Activate */}
              <Button
                onClick={() => setActivateOpen(true)}
                disabled={activateMutation.isPending || !(template.steps && template.steps.length > 0)}
                title={
                  template.steps && template.steps.length > 0
                    ? 'Activate this template for use in submissions'
                    : 'Cannot activate — template has no steps'
                }
              >
                <ShieldCheck className="h-4 w-4 mr-1" />
                {activateMutation.isPending ? 'Activating...' : 'Activate Template'}
              </Button>
              <Button
                variant="outline"
                onClick={() => reactivateMutation.mutate({ id: templateId })}
                disabled={reactivateMutation.isPending}
                className="hidden" // Legacy reactivate hidden — activate replaces it
              >
                Reactivate
              </Button>
            </>
          )}

          {/* Clone — available for any template */}
          <Button
            variant="outline"
            onClick={() => setCloneOpen(true)}
          >
            <Copy className="h-4 w-4 mr-1" />
            Clone Template
          </Button>
        </div>
      </div>

      {/* Deactivate confirmation dialog */}
      <Dialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Deactivate Template</DialogTitle>
            <DialogDescription>
              Deactivating this template will prevent new workflow instances from
              using it. Existing in-progress workflows will not be affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deactivateMutation.mutate({ id: templateId })}
              disabled={deactivateMutation.isPending}
            >
              {deactivateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  Deactivating...
                </>
              ) : (
                'Deactivate'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Activate confirmation dialog */}
      <Dialog open={activateOpen} onOpenChange={setActivateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Activate Template</DialogTitle>
            <DialogDescription>
              Activating this template makes it available for new workflow
              instances. Records submitted after activation will use this
              template if it resolves as the matching template for their
              record type and project.
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-muted-foreground px-1">
            <p><strong>Template:</strong> {template?.name}</p>
            <p><strong>Code:</strong> <code className="font-mono text-xs">{template?.code}</code></p>
            <p><strong>Steps:</strong> {template?.steps?.length ?? 0}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActivateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => activateMutation.mutate({ id: templateId })}
              disabled={activateMutation.isPending}
            >
              {activateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  Activating...
                </>
              ) : (
                'Activate'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clone dialog */}
      <Dialog open={cloneOpen} onOpenChange={setCloneOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clone Template</DialogTitle>
            <DialogDescription>
              Creates a new draft template with all steps copied from this
              template. The clone must be activated separately after review.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-sm">New Template Code</Label>
            <Input
              value={cloneCode}
              onChange={(e) => setCloneCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholder="e.g. ipa_approval_v2"
              className="font-mono"
            />
            <p className="text-[11px] text-muted-foreground">
              Lowercase alphanumeric with underscores. Must be unique.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloneOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                cloneMutation.mutate({
                  sourceId: templateId,
                  newCode: cloneCode.trim(),
                })
              }
              disabled={cloneMutation.isPending || !cloneCode.trim()}
            >
              {cloneMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  Cloning...
                </>
              ) : (
                'Clone as Draft'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Config badge helper
// ---------------------------------------------------------------------------

function ConfigBadge({
  label,
  enabled,
}: {
  label: string;
  enabled: boolean;
}) {
  return (
    <Badge
      variant={enabled ? 'secondary' : 'outline'}
      className={
        enabled
          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
          : 'text-muted-foreground'
      }
    >
      {label}: {enabled ? 'Yes' : 'No'}
    </Badge>
  );
}
