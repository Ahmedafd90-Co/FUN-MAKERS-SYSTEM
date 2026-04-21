'use client';

import { useState } from 'react';
import { Banknote, Pencil } from 'lucide-react';
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@fmksa/ui/components/sheet';

import type { UpdateProjectInput } from '@fmksa/contracts';
import { trpc } from '@/lib/trpc-client';
import { formatMoney } from '@/components/commercial/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FinancialBaselineCardProps = {
  projectId: string;
  contractValue: string | number | null;
  currency: string;
  currencySymbol: string;
  /** Whether the current user can edit (project.edit). */
  canEdit: boolean;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FinancialBaselineCard({
  projectId,
  contractValue,
  currency,
  currencySymbol,
  canEdit,
}: FinancialBaselineCardProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  // Revised Contract Value is system-derived from getFinancialKpis
  // (contractValue + Σ approved variation deltas). The stored
  // project.revisedContractValue column is intentionally not read here —
  // see revised-budget-field-independence.test.ts for the guard.
  const { data: financialKpis } = trpc.commercial.dashboard.financialKpis.useQuery(
    { projectId },
  );

  const cvNum = contractValue !== null ? parseFloat(String(contractValue)) : null;
  const revisedKpiValue = financialKpis?.kpis.revised_budget?.value ?? null;
  const rcvNum = revisedKpiValue !== null ? parseFloat(revisedKpiValue) : null;

  const hasBaseline = cvNum !== null;

  return (
    <>
      <Card className={!hasBaseline ? 'border-dashed' : ''}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Banknote className="h-4 w-4 text-muted-foreground/60" />
              <CardTitle className="text-sm font-semibold">Financial Baseline</CardTitle>
            </div>
            {canEdit && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1 h-7 text-xs"
                onClick={() => setSheetOpen(true)}
              >
                <Pencil className="h-3 w-3" />
                {hasBaseline ? 'Edit' : 'Set Values'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider leading-none mb-1.5">
                Contract Value
              </p>
              {cvNum !== null ? (
                <p className="text-sm font-mono tabular-nums font-semibold leading-tight">
                  {formatMoney(cvNum)}
                  <span className="text-[10px] text-muted-foreground font-normal ml-1">{currency}</span>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground/50 italic">Not set</p>
              )}
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider leading-none mb-1.5">
                Revised Contract Value (derived)
              </p>
              {rcvNum !== null ? (
                <p className="text-sm font-mono tabular-nums font-semibold leading-tight">
                  {formatMoney(rcvNum)}
                  <span className="text-[10px] text-muted-foreground font-normal ml-1">{currency}</span>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground/50 italic">Not set</p>
              )}
              <p className="text-[10px] text-muted-foreground mt-1">
                Automatically derived from approved variation deltas. Not manually editable.
              </p>
            </div>
          </div>

          {!hasBaseline && canEdit && (
            <p className="text-xs text-muted-foreground mt-3 border-l-2 border-muted pl-2">
              Set the contract value to enable budget KPIs on the commercial dashboard.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Edit Sheet ── */}
      <EditBaselineSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        projectId={projectId}
        currentContractValue={cvNum}
        currency={currency}
        currencySymbol={currencySymbol}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Edit Sheet
// ---------------------------------------------------------------------------

function EditBaselineSheet({
  open,
  onOpenChange,
  projectId,
  currentContractValue,
  currency,
  currencySymbol,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  currentContractValue: number | null;
  currency: string;
  currencySymbol: string;
}) {
  const utils = trpc.useUtils();

  const [cv, setCv] = useState(currentContractValue?.toString() ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setCv(currentContractValue?.toString() ?? '');
      setErrors({});
    }
    onOpenChange(isOpen);
  };

  const mutation = trpc.projects.update.useMutation({
    onSuccess: () => {
      toast.success('Financial baseline updated.');
      utils.projects.get.invalidate({ id: projectId, projectId });
      utils.commercial.dashboard.financialKpis.invalidate({ projectId });
      handleOpenChange(false);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  function validate(): boolean {
    const errs: Record<string, string> = {};

    if (cv.trim()) {
      const num = parseFloat(cv);
      if (isNaN(num)) {
        errs.cv = 'Must be a valid number.';
      } else if (num <= 0) {
        errs.cv = 'Must be a positive value.';
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;

    const cvVal = cv.trim() ? parseFloat(cv) : null;

    // `UpdateProjectSchema` doesn't declare `projectId` but `projectProcedure`
    // middleware extracts it from raw input — same pattern as the invoice-
    // collection schemas. Intersection-type cast keeps the contract honest
    // instead of using a blanket `as any`. The deferred fix (adding
    // `projectId` to the schema across projectProcedure inputs) is part of
    // the contracts-consistency follow-up lane.
    mutation.mutate({
      id: projectId,
      projectId,
      contractValue: cvVal,
    } as UpdateProjectInput & { projectId: string });
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Financial Baseline</SheetTitle>
          <SheetDescription>
            Set or update the original contract value. This drives the budget
            KPIs on the commercial dashboard. The revised contract value is
            automatically derived from approved variation deltas.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          {/* Contract Value */}
          <div className="space-y-1.5">
            <Label htmlFor="baseline-cv">
              Contract Value ({currency})
            </Label>
            <Input
              id="baseline-cv"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="e.g. 5000000"
              value={cv}
              onChange={(e) => {
                setCv(e.target.value);
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.cv;
                  return next;
                });
              }}
              className={`font-mono ${errors.cv ? 'border-destructive' : ''}`}
            />
            {errors.cv && (
              <p className="text-xs text-destructive font-medium">{errors.cv}</p>
            )}
            <p className="text-[11px] text-muted-foreground">
              The original contract value as agreed with the client.
            </p>
          </div>

          {/* Clear hint */}
          <p className="text-xs text-muted-foreground border-l-2 border-muted pl-2">
            Leave a field empty to clear it. Budget KPIs will show &quot;Not set&quot; when
            the contract value is not defined.
          </p>
        </div>

        <SheetFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
