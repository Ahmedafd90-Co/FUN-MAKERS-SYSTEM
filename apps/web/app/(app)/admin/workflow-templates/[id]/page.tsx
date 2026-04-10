'use client';

/**
 * Admin > Workflow Templates > [id] — template detail page.
 *
 * Shows full step list, version history, config, and deactivate action.
 * Task 1.5.10
 */

import { Badge } from '@fmksa/ui/components/badge';
import { Button } from '@fmksa/ui/components/button';
import { Separator } from '@fmksa/ui/components/separator';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Toaster, toast } from 'sonner';

import { trpc } from '@/lib/trpc-client';

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function WorkflowTemplateDetailPage() {
  const params = useParams<{ id: string }>();
  const templateId = params.id;

  const { data: template, isLoading } =
    trpc.workflow.templates.get.useQuery({ id: templateId });

  const utils = trpc.useUtils();
  const deactivateMutation =
    trpc.workflow.templates.deactivate.useMutation({
      onSuccess: () => {
        toast.success('Template deactivated.');
        utils.workflow.templates.get.invalidate({ id: templateId });
        utils.workflow.templates.list.invalidate();
      },
      onError: (err) => {
        toast.error(err.message);
      },
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
      <Toaster position="top-right" />
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/admin/workflow-templates">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-semibold tracking-tight">
              {template.name}
            </h1>
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
            <p className="font-medium font-mono text-xs">
              {template.createdBy}
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
                        {rule.userId ? ` (${rule.userId})` : ''}
                        {step.slaHours ? ` | SLA: ${step.slaHours}h` : ''}
                        {step.isOptional ? ' | Optional' : ''}
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
        {template.isActive && (
          <>
            <Separator />
            <div>
              <Button
                variant="outline"
                className="text-destructive"
                onClick={() => {
                  if (
                    confirm(
                      'Deactivate this template? Existing workflow instances will not be affected.',
                    )
                  ) {
                    deactivateMutation.mutate({ id: templateId });
                  }
                }}
                disabled={deactivateMutation.isPending}
              >
                {deactivateMutation.isPending
                  ? 'Deactivating...'
                  : 'Deactivate Template'}
              </Button>
            </div>
          </>
        )}
      </div>
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
