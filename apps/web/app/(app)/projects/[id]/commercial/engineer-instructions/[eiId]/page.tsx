'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@fmksa/ui/components/button';
import { Input } from '@fmksa/ui/components/input';
import { Label } from '@fmksa/ui/components/label';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@fmksa/ui/components/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@fmksa/ui/components/dialog';
import { trpc } from '@/lib/trpc-client';
import { CommercialStatusBadge } from '@/components/commercial/status-badge';
import { WorkflowStatusCard } from '@/components/workflow/workflow-status-card';
import { WorkflowStatusHint } from '@/components/workflow/workflow-status-hint';
import {
  formatMoney,
  Field,
  SummaryItem,
  SummaryStrip,
} from '@/components/commercial/shared';

// ---------------------------------------------------------------------------
// EI status -> allowed transition actions
// ---------------------------------------------------------------------------

const EI_STATUS_ACTIONS: Record<
  string,
  Array<{
    action: string;
    label: string;
    variant?: 'default' | 'destructive' | 'outline' | 'secondary';
  }>
> = {
  received: [
    { action: 'evaluate', label: 'Start Evaluation', variant: 'default' },
    { action: 'reject', label: 'Reject', variant: 'destructive' },
  ],
  under_evaluation: [
    { action: 'approve_reserve', label: 'Approve Reserve', variant: 'default' },
    { action: 'reject', label: 'Reject', variant: 'destructive' },
    { action: 'expire', label: 'Expire', variant: 'outline' },
  ],
  approved_reserve: [
    { action: 'convert', label: 'Convert to Variation', variant: 'default' },
    { action: 'reject', label: 'Reject', variant: 'destructive' },
    { action: 'expire', label: 'Expire', variant: 'outline' },
  ],
  converted: [],
  rejected: [],
  expired: [],
};

const COMMENT_REQUIRED_ACTIONS = ['reject'];
const CONFIRM_ACTIONS = ['reject', 'expire', 'convert'];

export default function EngineerInstructionDetailPage() {
  const params = useParams<{ id: string; eiId: string }>();
  const utils = trpc.useUtils();

  const { data: me } = trpc.auth.me.useQuery();

  const { data, isLoading, error } =
    trpc.commercial.engineerInstruction.get.useQuery({
      projectId: params.id,
      id: params.eiId,
    });

  const transitionMut =
    trpc.commercial.engineerInstruction.transition.useMutation({
      onSuccess: () => {
        utils.commercial.engineerInstruction.get.invalidate();
        utils.workflow.instances.getByRecord.invalidate();
      },
      onError: (err) => {
        toast.error(err.message ?? 'Transition failed');
      },
    });

  // Workflow instance drives evaluation/approval transitions when present —
  // manual action buttons are hidden and handled by the workflow itself.
  const { data: workflowData } = trpc.workflow.instances.getByRecord.useQuery(
    { recordType: 'engineer_instruction', recordId: params.eiId },
    { refetchInterval: 30_000 },
  );
  const hasActiveWorkflow =
    workflowData != null &&
    ['in_progress', 'returned'].includes(workflowData.status);

  // ── Transition action state ──
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    action: string;
    label: string;
  } | null>(null);
  const [comment, setComment] = useState('');
  const [variationId, setVariationId] = useState('');

  if (isLoading) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-10 text-center text-sm text-destructive">
        {error?.message ?? 'Engineer Instruction not found.'}
      </div>
    );
  }

  const reserveAmount =
    data.estimatedValue != null && data.reserveRate != null
      ? (
          parseFloat(String(data.estimatedValue)) *
          parseFloat(String(data.reserveRate))
        )
      : null;

  const reserveRatePercent =
    data.reserveRate != null
      ? `${(parseFloat(String(data.reserveRate)) * 100).toFixed(0)}%`
      : '50%';

  // ── Action handling ──
  const actions = EI_STATUS_ACTIONS[data.status] ?? [];
  const hasTransitionPerm =
    me?.permissions?.includes('variation.transition') ||
    me?.permissions?.includes('variation.create');

  const handleClick = (action: string, label: string) => {
    if (CONFIRM_ACTIONS.includes(action)) {
      setConfirmAction({ action, label });
      setComment('');
      setVariationId('');
    } else {
      doTransition(action);
    }
  };

  const doTransition = async (
    action: string,
    transitionComment?: string,
    convertVariationId?: string,
  ) => {
    setLoadingAction(action);
    try {
      // EI transition schema is inline in the router (not in @fmksa/contracts).
      // Derive the input type from the mutation itself rather than extracting
      // the schema — extraction is architectural cleanup, out of CI-cleanup
      // scope per branch operating rule.
      type TransitionEiInput = Parameters<
        typeof transitionMut.mutateAsync
      >[0];
      const input: TransitionEiInput = {
        projectId: params.id,
        id: params.eiId,
        action,
      };
      if (transitionComment) input.comment = transitionComment;
      if (action === 'convert' && convertVariationId) {
        input.variationId = convertVariationId;
      }
      await transitionMut.mutateAsync(input);
    } finally {
      setLoadingAction(null);
      setConfirmAction(null);
      setComment('');
      setVariationId('');
    }
  };

  return (
    <div className="space-y-4">
      <Link
        href={`/projects/${params.id}/commercial/engineer-instructions`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Engineer Instructions
      </Link>

      {/* ── Record Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold tracking-tight">
              {(data as any).referenceNumber ?? 'Engineer Instruction'}
            </h1>
            <CommercialStatusBadge status={data.status} />
          </div>
          {data.title && (
            <p className="text-sm text-muted-foreground">{data.title}</p>
          )}
          <WorkflowStatusHint
            recordStatus={data.status}
            hasActiveWorkflow={hasActiveWorkflow}
            recordLabel="Engineer Instruction"
          />
        </div>

        {/* ── Transition Buttons (hidden while a workflow is active) ── */}
        {!hasActiveWorkflow && hasTransitionPerm && actions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {actions.map(({ action, label, variant }) => (
              <Button
                key={action}
                size="sm"
                variant={variant ?? 'outline'}
                disabled={transitionMut.isPending || loadingAction !== null}
                onClick={() => handleClick(action, label)}
              >
                {loadingAction === action ? 'Processing...' : label}
              </Button>
            ))}
          </div>
        )}
      </div>

      <WorkflowStatusCard
        recordType="engineer_instruction"
        recordId={params.eiId}
      />

      {/* ── Summary Strip ── */}
      <SummaryStrip>
        <SummaryItem
          label="Estimated Value"
          value={
            data.estimatedValue != null
              ? `${formatMoney(data.estimatedValue)} ${(data as any).currency ?? 'SAR'}`
              : 'Not set'
          }
          emphasis={data.estimatedValue != null}
        />
        <SummaryItem label="Reserve Rate" value={reserveRatePercent} />
        <SummaryItem
          label="Reserve Amount"
          value={
            reserveAmount != null
              ? `${formatMoney(reserveAmount)} ${(data as any).currency ?? 'SAR'}`
              : 'Not calculated'
          }
          emphasis={reserveAmount != null}
        />
        <SummaryItem
          label="Status"
          value={<CommercialStatusBadge status={data.status} />}
        />
      </SummaryStrip>

      {/* ── Details Card ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field label="Currency" value={(data as any).currency ?? 'SAR'} />
          <Field
            label="Created"
            value={new Date(data.createdAt).toLocaleDateString()}
          />
          {(data as any).referenceNumber && (
            <Field
              label="Reference #"
              value={(data as any).referenceNumber}
            />
          )}
        </CardContent>
      </Card>

      {/* ── Description & Notes ── */}
      {((data as any).description || (data as any).notes) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Description &amp; Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(data as any).description && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  Description
                </p>
                <p className="text-sm whitespace-pre-wrap">
                  {(data as any).description}
                </p>
              </div>
            )}
            {(data as any).notes && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  Notes
                </p>
                <p className="text-sm whitespace-pre-wrap">
                  {(data as any).notes}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Linked Variation ── */}
      {(data as any).variationId && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Linked Variation</CardTitle>
          </CardHeader>
          <CardContent>
            <Link
              href={`/projects/${params.id}/commercial/variations/${(data as any).variationId}`}
              className="text-sm font-medium text-primary hover:underline"
            >
              View Variation &rarr;
            </Link>
          </CardContent>
        </Card>
      )}

      {/* ── Confirm Dialog ── */}
      <Dialog
        open={!!confirmAction}
        onOpenChange={(open) => !open && setConfirmAction(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm: {confirmAction?.label}</DialogTitle>
            <DialogDescription>
              {COMMENT_REQUIRED_ACTIONS.includes(confirmAction?.action ?? '')
                ? 'A comment is required for this action.'
                : confirmAction?.action === 'convert'
                  ? 'Convert this engineer instruction to a variation. Enter the target variation ID to link.'
                  : 'Are you sure you want to proceed?'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {confirmAction?.action === 'convert' && (
              <div className="space-y-2">
                <Label htmlFor="convert-variation-id">
                  Variation ID (required)
                </Label>
                <Input
                  id="convert-variation-id"
                  value={variationId}
                  onChange={(e) => setVariationId(e.target.value)}
                  placeholder="Enter existing variation ID to link..."
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="ei-transition-comment">
                Comment{' '}
                {COMMENT_REQUIRED_ACTIONS.includes(confirmAction?.action ?? '')
                  ? '(required)'
                  : '(optional)'}
              </Label>
              <textarea
                id="ei-transition-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Enter your reason..."
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setConfirmAction(null)}
              >
                Cancel
              </Button>
              <Button
                variant={
                  confirmAction?.action === 'reject'
                    ? 'destructive'
                    : 'default'
                }
                disabled={
                  loadingAction !== null ||
                  (COMMENT_REQUIRED_ACTIONS.includes(
                    confirmAction?.action ?? '',
                  ) &&
                    !comment.trim()) ||
                  (confirmAction?.action === 'convert' &&
                    !variationId.trim())
                }
                onClick={() => {
                  if (confirmAction)
                    doTransition(
                      confirmAction.action,
                      comment,
                      variationId || undefined,
                    );
                }}
              >
                {loadingAction
                  ? 'Processing...'
                  : `Confirm ${confirmAction?.label ?? ''}`}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
