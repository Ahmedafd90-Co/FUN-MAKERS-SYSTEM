'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@fmksa/ui/components/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@fmksa/ui/components/card';
import { Separator } from '@fmksa/ui/components/separator';
import { trpc } from '@/lib/trpc-client';
import { ProcurementStatusBadge } from '@/components/procurement/procurement-status-badge';
import { ProcurementTransitionActions } from '@/components/procurement/procurement-transition-actions';
import { AbsorptionExceptionAlert } from '@/components/procurement/absorption-exception-alert';
import { BudgetImpactCard } from '@/components/procurement/budget-impact-card';
import { WorkflowStatusCard } from '@/components/workflow/workflow-status-card';
import { WorkflowStatusHint } from '@/components/workflow/workflow-status-hint';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      <div className="text-sm mt-0.5">{value ?? '-'}</div>
    </div>
  );
}

function formatMoney(val: unknown): string {
  const num =
    typeof val === 'string'
      ? parseFloat(val)
      : typeof val === 'number'
        ? val
        : 0;
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const SUBTYPE_LABELS: Record<string, string> = {
  ticket: 'Ticket',
  accommodation: 'Accommodation',
  transportation: 'Transportation',
  equipment: 'Equipment',
};

export default function ExpenseDetailPage() {
  const params = useParams<{ id: string; expenseId: string }>();
  const utils = trpc.useUtils();

  const { data: userPermissions } = trpc.procurement.myPermissions.useQuery();

  const { data, isLoading, error } = trpc.procurement.expense.get.useQuery({
    projectId: params.id,
    id: params.expenseId,
  });

  const transitionMut = trpc.procurement.expense.transition.useMutation({
    onSuccess: () => {
      utils.procurement.expense.get.invalidate();
      utils.workflow.instances.getByRecord.invalidate();
    },
    onError: (err) => {
      toast.error(err.message ?? 'Transition failed');
    },
  });

  // Workflow instance drives approve/return/reject when present — these
  // actions are hidden from the transition bar and handled by the workflow.
  const { data: workflowData } = trpc.workflow.instances.getByRecord.useQuery(
    { recordType: 'expense', recordId: params.expenseId },
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

  if (error) {
    if (error.data?.code === 'FORBIDDEN') {
      return (
        <div className="py-16 text-center space-y-2">
          <ShieldOff className="h-8 w-8 mx-auto text-muted-foreground/40" />
          <p className="text-sm font-medium">Access Denied</p>
          <p className="text-xs text-muted-foreground">
            You don&apos;t have permission to view this expense.
          </p>
        </div>
      );
    }
    return (
      <div className="py-10 text-center text-sm text-destructive">
        {error.message ?? 'Expense not found.'}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-10 text-center text-sm text-destructive">
        Expense not found.
      </div>
    );
  }

  const d = data;
  const subtype = d.subtype as string;

  return (
    <div className="space-y-6">
      <Link
        href={`/projects/${params.id}/procurement/expenses`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Expenses
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <h1 className="text-xl font-semibold">{d.title}</h1>
          <div className="flex items-center gap-2">
            <ProcurementStatusBadge status={d.status} />
            <Badge variant="outline" className="capitalize">
              {SUBTYPE_LABELS[subtype] ?? subtype}
            </Badge>
          </div>
          <WorkflowStatusHint
            recordStatus={d.status}
            hasActiveWorkflow={hasActiveWorkflow}
            recordLabel="Expense"
          />
        </div>
        <ProcurementTransitionActions
          currentStatus={d.status}
          recordFamily="expense"
          userPermissions={userPermissions ?? []}
          isLoading={transitionMut.isPending}
          hasActiveWorkflow={hasActiveWorkflow}
          onTransition={async (action, comment) => {
            await transitionMut.mutateAsync({
              projectId: params.id,
              id: params.expenseId,
              action,
              comment,
            });
          }}
        />
      </div>

      <WorkflowStatusCard recordType="expense" recordId={params.expenseId} />

      <Separator />

      <AbsorptionExceptionAlert
        projectId={params.id}
        sourceRecordType="expense"
        sourceRecordId={params.expenseId}
      />

      {/* General Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Expense Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field label="Amount" value={`${formatMoney(d.amount)} ${d.currency}`} />
          <Field label="Currency" value={d.currency} />
          <Field
            label="Expense Date"
            value={
              d.expenseDate
                ? new Date(d.expenseDate).toLocaleDateString()
                : '-'
            }
          />
          <Field label="Receipt Reference" value={d.receiptReference ?? '-'} />
          <Field
            label="Budget Category"
            value={d.category?.name ?? (d.categoryId ? 'Mapped' : 'Not mapped')}
          />
          <Field
            label="Created"
            value={new Date(d.createdAt).toLocaleDateString()}
          />
        </CardContent>
      </Card>

      {/* Description */}
      {d.description && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{d.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Subtype-Specific Details */}
      {subtype === 'ticket' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Ticket Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="Ticket Type" value={d.ticketType ?? '-'} />
            <Field label="Traveler" value={d.travelerName ?? '-'} />
            <Field label="Origin" value={d.origin ?? '-'} />
            <Field label="Destination" value={d.destination ?? '-'} />
            <Field
              label="Travel Date"
              value={
                d.travelDate
                  ? new Date(d.travelDate).toLocaleDateString()
                  : '-'
              }
            />
            <Field
              label="Return Date"
              value={
                d.returnDate
                  ? new Date(d.returnDate).toLocaleDateString()
                  : '-'
              }
            />
          </CardContent>
        </Card>
      )}

      {subtype === 'accommodation' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Accommodation Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="Guest" value={d.guestName ?? '-'} />
            <Field label="Hotel" value={d.hotelName ?? '-'} />
            <Field label="City" value={d.expenseCity ?? '-'} />
            <Field
              label="Check-In"
              value={d.checkIn ? new Date(d.checkIn).toLocaleDateString() : '-'}
            />
            <Field
              label="Check-Out"
              value={d.checkOut ? new Date(d.checkOut).toLocaleDateString() : '-'}
            />
            <Field
              label="Nightly Rate"
              value={d.nightlyRate ? formatMoney(d.nightlyRate) : '-'}
            />
            <Field label="Nights" value={d.nights ?? '-'} />
          </CardContent>
        </Card>
      )}

      {subtype === 'transportation' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Transportation Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="Vehicle Type" value={d.vehicleType ?? '-'} />
            <Field label="Origin" value={d.transportOrigin ?? '-'} />
            <Field label="Destination" value={d.transportDestination ?? '-'} />
            {/* `distance` is `string | Decimal` on the schema — coerce for
                React. Previously hidden by the umbrella `d = data as any`. */}
            <Field label="Distance" value={d.distance != null ? String(d.distance) : '-'} />
            <Field label="Rate Type" value={d.rateType ?? '-'} />
          </CardContent>
        </Card>
      )}

      {subtype === 'equipment' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Equipment Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="Equipment Name" value={d.equipmentName ?? '-'} />
            <Field label="Equipment Type" value={d.equipmentType ?? '-'} />
            <Field
              label="Rental From"
              value={
                d.rentalPeriodFrom
                  ? new Date(d.rentalPeriodFrom).toLocaleDateString()
                  : '-'
              }
            />
            <Field
              label="Rental To"
              value={
                d.rentalPeriodTo
                  ? new Date(d.rentalPeriodTo).toLocaleDateString()
                  : '-'
              }
            />
            <Field
              label="Daily Rate"
              value={d.dailyRate ? formatMoney(d.dailyRate) : '-'}
            />
            <Field label="Days" value={d.days ?? '-'} />
          </CardContent>
        </Card>
      )}

      {/* Budget Impact — renders only if absorption succeeded (no open exception) */}
      {d.status === 'approved' ||
      d.status === 'paid' ||
      d.status === 'closed' ? (
        <BudgetImpactCard
          projectId={params.id}
          sourceRecordType="expense"
          sourceRecordId={params.expenseId}
          amount={d.amount}
          currency={d.currency}
          recordLabel="expense"
          variant="actual"
        />
      ) : null}

      {/* Linked PO */}
      {d.purchaseOrder && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Linked Purchase Order</CardTitle>
          </CardHeader>
          <CardContent>
            <Link
              href={`/projects/${params.id}/procurement/purchase-orders/${d.purchaseOrderId}`}
              className="text-primary hover:underline text-sm"
            >
              {d.purchaseOrder.poNumber ?? 'View PO'}
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
