'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, Pencil, Check, X, Loader2, ShieldCheck } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@fmksa/ui/components/card';
import { Badge } from '@fmksa/ui/components/badge';
import { Button } from '@fmksa/ui/components/button';
import { Input } from '@fmksa/ui/components/input';
import { Label } from '@fmksa/ui/components/label';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc-client';
import { CommercialStatusBadge } from '@/components/commercial/status-badge';
import { TransitionActions } from '@/components/commercial/transition-actions';
import { WorkflowStatusCard } from '@/components/workflow/workflow-status-card';
import { WorkflowStatusHint } from '@/components/workflow/workflow-status-hint';
import { formatMoney, Field, SummaryItem, SummaryStrip } from '@/components/commercial/shared';
import { AttachmentsPanel } from '@/components/attachments/attachments-panel';
import { EvidenceDrawer } from '@/components/evidence/evidence-drawer';

const SUBTYPE_LABELS: Record<string, string> = {
  letter: 'Letter',
  notice: 'Notice',
  claim: 'Claim',
  back_charge: 'Back Charge',
};

const POST_ISSUANCE_SUBTYPES = ['notice', 'claim', 'back_charge'];

const CLAIM_SETTLEMENT_STATES = [
  'under_evaluation',
  'partially_accepted',
  'accepted',
  'disputed',
];

const BC_RECOVERY_STATES = [
  'acknowledged',
  'disputed',
  'partially_recovered',
  'recovered',
];

export default function CorrespondenceDetailPage() {
  const params = useParams<{ id: string; correspondenceId: string }>();
  const utils = trpc.useUtils();
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  const { data: me } = trpc.auth.me.useQuery();

  const { data, isLoading, error } =
    trpc.commercial.correspondence.get.useQuery({
      projectId: params.id,
      id: params.correspondenceId,
    });

  const transitionMut = trpc.commercial.correspondence.transition.useMutation({
    onSuccess: () => {
      utils.commercial.correspondence.get.invalidate();
      utils.workflow.instances.getByRecord.invalidate();
    },
    onError: (err) => {
      toast.error(err.message ?? 'Transition failed');
    },
  });

  const [editingSettlement, setEditingSettlement] = useState(false);
  const [settlementAmount, setSettlementAmount] = useState('');
  const [settlementDays, setSettlementDays] = useState('');

  const settlementMut =
    trpc.commercial.correspondence.updateSettlement.useMutation({
      onSuccess: () => {
        toast.success('Settlement values saved.');
        utils.commercial.correspondence.get.invalidate();
        setEditingSettlement(false);
      },
      onError: (err) => toast.error(err.message),
    });

  const { data: workflowData } = trpc.workflow.instances.getByRecord.useQuery(
    { recordType: 'correspondence', recordId: params.correspondenceId },
    { refetchInterval: 30_000 },
  );
  const hasActiveWorkflow =
    workflowData != null &&
    ['in_progress', 'returned'].includes(workflowData.status);

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
        {error?.message ?? 'Correspondence not found.'}
      </div>
    );
  }

  const isPostIssuance = POST_ISSUANCE_SUBTYPES.includes(data.subtype);

  const canEditSettlement =
    (data?.subtype === 'claim' &&
      CLAIM_SETTLEMENT_STATES.includes(data?.status ?? '')) ||
    (data?.subtype === 'back_charge' &&
      BC_RECOVERY_STATES.includes(data?.status ?? ''));

  function startEditingSettlement() {
    if (!data) return;
    setSettlementAmount(
      data.settledAmount != null ? String(data.settledAmount) : '',
    );
    setSettlementDays(
      data.settledTimeDays != null ? String(data.settledTimeDays) : '',
    );
    setEditingSettlement(true);
  }

  function saveSettlement() {
    if (!data) return;
    const amount = settlementAmount.trim()
      ? parseFloat(settlementAmount)
      : null;
    const days = settlementDays.trim()
      ? parseInt(settlementDays, 10)
      : null;

    if (amount !== null && (isNaN(amount) || amount < 0)) {
      toast.error('Amount must be a non-negative number.');
      return;
    }
    if (days !== null && (isNaN(days) || days < 0)) {
      toast.error('Days must be a non-negative integer.');
      return;
    }

    settlementMut.mutate({
      projectId: params.id,
      id: params.correspondenceId,
      settledAmount: amount,
      settledTimeDays: days,
    });
  }

  const workflowLabel = workflowData
    ? workflowData.status === 'approved'
      ? 'Approved'
      : workflowData.status === 'rejected'
        ? 'Rejected'
        : workflowData.status === 'returned'
          ? 'Returned'
          : 'In Progress'
    : data.status === 'draft'
      ? 'Not started'
      : '—';

  // Primary financial figure for the summary
  const primaryAmount =
    data.subtype === 'claim'
      ? data.claimedAmount
      : data.subtype === 'back_charge'
        ? data.chargedAmount
        : null;
  const primaryAmountLabel =
    data.subtype === 'claim'
      ? 'Claimed'
      : data.subtype === 'back_charge'
        ? 'Charged'
        : null;

  return (
    <>
      <div className="space-y-4">
        <Link
          href={`/projects/${params.id}/commercial/correspondence`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Correspondence
        </Link>

        {/* ── Record Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-semibold tracking-tight">
                {data.referenceNumber ??
                  (data.status === 'draft'
                    ? 'Draft Correspondence'
                    : 'Correspondence (no reference)')}
              </h1>
              <Badge
                variant={data.subtype === 'claim' || data.subtype === 'back_charge' ? 'default' : 'secondary'}
                className="text-xs"
              >
                {SUBTYPE_LABELS[data.subtype] ?? data.subtype}
              </Badge>
              <CommercialStatusBadge status={data.status} />
            </div>
            {data.subject && (
              <p className="text-sm text-muted-foreground">{data.subject}</p>
            )}
            <WorkflowStatusHint
              recordStatus={data.status}
              hasActiveWorkflow={hasActiveWorkflow}
              recordLabel="Correspondence"
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEvidenceOpen(true)}
            >
              <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
              Evidence
            </Button>
            <TransitionActions
              currentStatus={data.status}
              recordFamily="correspondence"
              permissions={me?.permissions ?? []}
              isLoading={transitionMut.isPending}
              hasActiveWorkflow={hasActiveWorkflow}
              onTransition={async (action, comment) => {
                await transitionMut.mutateAsync({
                  projectId: params.id,
                  id: params.correspondenceId,
                  action,
                  comment,
                });
              }}
            />
          </div>
        </div>

        {/* ── Summary Strip ── */}
        <SummaryStrip>
          <SummaryItem
            label="Type"
            value={SUBTYPE_LABELS[data.subtype] ?? data.subtype}
          />
          {primaryAmount != null && primaryAmountLabel && (
            <SummaryItem
              label={`${primaryAmountLabel} Amount`}
              value={`${formatMoney(primaryAmount)} ${data.currency ?? ''}`}
              emphasis
            />
          )}
          <SummaryItem
            label="Status"
            value={<CommercialStatusBadge status={data.status} />}
          />
          <SummaryItem label="Workflow" value={workflowLabel} />
          <SummaryItem label="Recipient" value={data.recipientName ?? '—'} />
          {data.settledAmount != null && (
            <SummaryItem
              label="Settled"
              value={`${formatMoney(data.settledAmount)} ${data.currency ?? ''}`}
            />
          )}
        </SummaryStrip>

        {/* ── Workflow ── */}
        <WorkflowStatusCard
          recordType="correspondence"
          recordId={params.correspondenceId}
        />

        {/* ── Attachments (WS1 Phase C) ── */}
        <AttachmentsPanel
          projectId={params.id}
          recordType="correspondence"
          recordId={params.correspondenceId}
        />

        {/* ── Correspondence Details ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Correspondence Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="Recipient" value={data.recipientName} />
            {data.recipientOrg && (
              <Field label="Organisation" value={data.recipientOrg} />
            )}
            <Field
              label="Created"
              value={new Date(data.createdAt).toLocaleDateString()}
            />
            {data.currency && (
              <Field label="Currency" value={data.currency} />
            )}
          </CardContent>
        </Card>

        {/* ── Notice-specific fields ── */}
        {data.subtype === 'notice' && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Notice Details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {data.noticeType && (
                <Field
                  label="Notice Type"
                  value={String(data.noticeType).replace(/_/g, ' ')}
                />
              )}
              {data.contractClause && (
                <Field label="Contract Clause" value={data.contractClause} />
              )}
              {data.responseDeadline && (
                <Field
                  label="Response Deadline"
                  value={new Date(data.responseDeadline).toLocaleDateString()}
                />
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Claim-specific fields ── */}
        {data.subtype === 'claim' && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Claim Details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {data.claimType && (
                <Field
                  label="Claim Type"
                  value={String(data.claimType).replace(/_/g, ' ')}
                />
              )}
              {data.claimedAmount != null && (
                <Field
                  label="Claimed Amount"
                  value={`${formatMoney(data.claimedAmount)} ${data.currency ?? ''}`}
                />
              )}
              {data.claimedTimeDays != null && (
                <Field
                  label="Claimed Time (days)"
                  value={String(data.claimedTimeDays)}
                />
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Claim settlement form (post-issuance) ── */}
        {data.subtype === 'claim' && canEditSettlement && (
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm">Settlement Evaluation</CardTitle>
              {!editingSettlement && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={startEditingSettlement}
                >
                  <Pencil className="h-3 w-3 mr-1" />
                  {data.settledAmount != null ? 'Edit' : 'Enter Values'}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {editingSettlement ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="settled-amount">
                        Settled Amount ({data.currency ?? 'SAR'})
                      </Label>
                      <Input
                        id="settled-amount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={settlementAmount}
                        onChange={(e) => setSettlementAmount(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="settled-days">Settled Time (days)</Label>
                      <Input
                        id="settled-days"
                        type="number"
                        min="0"
                        step="1"
                        value={settlementDays}
                        onChange={(e) => setSettlementDays(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={saveSettlement}
                      disabled={settlementMut.isPending}
                    >
                      {settlementMut.isPending ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Check className="h-3 w-3 mr-1" />
                          Save
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingSettlement(false)}
                    >
                      <X className="h-3 w-3 mr-1" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <Field
                    label="Settled Amount"
                    value={
                      data.settledAmount != null
                        ? `${formatMoney(data.settledAmount)} ${data.currency ?? ''}`
                        : 'Not yet entered'
                    }
                  />
                  <Field
                    label="Settled Time (days)"
                    value={
                      data.settledTimeDays != null
                        ? String(data.settledTimeDays)
                        : 'Not yet entered'
                    }
                  />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Claim settlement display (non-editable) ── */}
        {data.subtype === 'claim' &&
          !canEditSettlement &&
          (data.settledAmount != null || data.settledTimeDays != null) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Settlement</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {data.settledAmount != null && (
                  <Field
                    label="Settled Amount"
                    value={`${formatMoney(data.settledAmount)} ${data.currency ?? ''}`}
                  />
                )}
                {data.settledTimeDays != null && (
                  <Field
                    label="Settled Time (days)"
                    value={String(data.settledTimeDays)}
                  />
                )}
              </CardContent>
            </Card>
          )}

        {/* ── Back charge-specific fields ── */}
        {data.subtype === 'back_charge' && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Back Charge Details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {data.targetName && (
                <Field label="Target" value={data.targetName} />
              )}
              {data.category && (
                <Field
                  label="Category"
                  value={String(data.category).replace(/_/g, ' ')}
                />
              )}
              {data.chargedAmount != null && (
                <Field
                  label="Charged Amount"
                  value={`${formatMoney(data.chargedAmount)} ${data.currency ?? ''}`}
                />
              )}
              {data.evidenceDescription && (
                <Field label="Evidence" value={data.evidenceDescription} />
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Back charge recovery form (post-issuance) ── */}
        {data.subtype === 'back_charge' && canEditSettlement && (
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm">Recovery Tracking</CardTitle>
              {!editingSettlement && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={startEditingSettlement}
                >
                  <Pencil className="h-3 w-3 mr-1" />
                  {data.settledAmount != null ? 'Edit' : 'Enter Values'}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {editingSettlement ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="recovered-amount">
                        Recovered Amount ({data.currency ?? 'SAR'})
                      </Label>
                      <Input
                        id="recovered-amount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={settlementAmount}
                        onChange={(e) => setSettlementAmount(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="recovery-days">
                        Recovery Time (days)
                      </Label>
                      <Input
                        id="recovery-days"
                        type="number"
                        min="0"
                        step="1"
                        value={settlementDays}
                        onChange={(e) => setSettlementDays(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={saveSettlement}
                      disabled={settlementMut.isPending}
                    >
                      {settlementMut.isPending ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Check className="h-3 w-3 mr-1" />
                          Save
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingSettlement(false)}
                    >
                      <X className="h-3 w-3 mr-1" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <Field
                    label="Recovered Amount"
                    value={
                      data.settledAmount != null
                        ? `${formatMoney(data.settledAmount)} ${data.currency ?? ''}`
                        : 'Not yet entered'
                    }
                  />
                  <Field
                    label="Recovery Time (days)"
                    value={
                      data.settledTimeDays != null
                        ? String(data.settledTimeDays)
                        : 'Not yet entered'
                    }
                  />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Back charge recovery display (non-editable) ── */}
        {data.subtype === 'back_charge' &&
          !canEditSettlement &&
          (data.settledAmount != null || data.settledTimeDays != null) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Recovery</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {data.settledAmount != null && (
                  <Field
                    label="Recovered Amount"
                    value={`${formatMoney(data.settledAmount)} ${data.currency ?? ''}`}
                  />
                )}
                {data.settledTimeDays != null && (
                  <Field
                    label="Recovery Time (days)"
                    value={String(data.settledTimeDays)}
                  />
                )}
              </CardContent>
            </Card>
          )}

        {/* ── Body ── */}
        {data.body && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Body</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{data.body}</p>
            </CardContent>
          </Card>
        )}

        {/* ── Evidence drawer (WS1 Phase C) ── */}
        <EvidenceDrawer
          projectId={params.id}
          recordType="correspondence"
          recordId={params.correspondenceId}
          recordLabel={data.referenceNumber ?? 'Correspondence'}
          open={evidenceOpen}
          onOpenChange={setEvidenceOpen}
        />
      </div>
    </>
  );
}
