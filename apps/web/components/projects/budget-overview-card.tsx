'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Wallet,
  Pencil,
  Plus,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@fmksa/ui/components/button';
import { Input } from '@fmksa/ui/components/input';
import { Label } from '@fmksa/ui/components/label';
import { Textarea } from '@fmksa/ui/components/textarea';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@fmksa/ui/components/table';

import { trpc } from '@/lib/trpc-client';
import { formatMoney } from '@/components/commercial/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BudgetOverviewCardProps = {
  projectId: string;
  currency: string;
  currencySymbol: string;
  canEdit: boolean;
};

type BudgetLine = {
  id: string;
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  budgetAmount: number;
  committedAmount: number;
  actualAmount: number;
  remainingAmount: number;
  varianceAmount: number;
  notes: string | null;
  // Import provenance — populated when the line was written by a committed
  // import batch. lastImportedAmount is the frozen "what the sheet said"
  // value and stays fixed even after subsequent manual edits so we can show
  // drift.
  importBatchId: string | null;
  importRowId: string | null;
  importedAt: Date | string | null;
  importedByUserId: string | null;
  lastImportedAmount: number | null;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BudgetOverviewCard({
  projectId,
  currency,
  currencySymbol,
  canEdit,
}: BudgetOverviewCardProps) {
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [editLineSheetOpen, setEditLineSheetOpen] = useState(false);
  const [editingLine, setEditingLine] = useState<BudgetLine | null>(null);
  const [linesExpanded, setLinesExpanded] = useState(false);

  const { data: summary, isLoading } = trpc.budget.summary.useQuery({ projectId });

  const hasBudget = !!summary?.budgetId;

  const internalBaseline = summary?.internalBaseline ?? null;
  const revisedBudget = summary?.internalRevised ?? null;
  const contingency = summary?.contingencyAmount ?? null;
  const eiReserve = summary?.eiReserveTotal ?? null;
  const totalBudgeted = summary?.totalBudgeted ?? null;
  const committed = summary?.totalCommitted ?? null;
  const actual = summary?.totalActual ?? null;
  const remaining = summary?.remainingBudget ?? null;
  const lines: BudgetLine[] = summary?.lines ?? [];

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted-foreground/60" />
            <CardTitle className="text-sm font-semibold">Internal Budget</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={!hasBudget ? 'border-dashed' : ''}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-muted-foreground/60" />
              <CardTitle className="text-sm font-semibold">Internal Budget</CardTitle>
            </div>
            {canEdit && hasBudget && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1 h-7 text-xs"
                onClick={() => setEditSheetOpen(true)}
              >
                <Pencil className="h-3 w-3" />
                Edit
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!hasBudget ? (
            <div>
              <p className="text-sm text-muted-foreground">
                No internal budget configured. Set up the internal delivery budget to enable cost control.
              </p>
              {canEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 mt-3"
                  onClick={() => setCreateSheetOpen(true)}
                >
                  <Plus className="h-3 w-3" />
                  Set Up Budget
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* ── Summary grid ── */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <SummaryRow label="Internal Baseline" value={internalBaseline} currency={currency} />
                <SummaryRow label="Internal Revised Budget" value={revisedBudget} currency={currency} />
                <SummaryRow label="Contingency" value={contingency} currency={currency} />
                <SummaryRow label="EI Reserve" value={eiReserve} currency={currency} />
                <SummaryRow label="Total Budgeted" value={totalBudgeted} currency={currency} bold />
                <SummaryRow label="Committed" value={committed} currency={currency} />
                <SummaryRow label="Actual" value={actual} currency={currency} />
                <SummaryRow
                  label="Remaining Budget"
                  value={remaining}
                  currency={currency}
                  bold
                  destructive={remaining !== null && remaining < 0}
                />
              </div>

              {/* ── Collapsible budget lines ── */}
              {lines.length > 0 && (
                <div>
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setLinesExpanded((prev) => !prev)}
                  >
                    {linesExpanded ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                    Budget Lines ({lines.length})
                  </button>

                  {linesExpanded && (
                    <div className="mt-2">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Category</TableHead>
                            <TableHead className="text-xs text-right">Budget</TableHead>
                            <TableHead className="text-xs text-right">Committed</TableHead>
                            <TableHead className="text-xs text-right">Actual</TableHead>
                            <TableHead className="text-xs text-right">Remaining</TableHead>
                            {canEdit && <TableHead className="w-8" />}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lines.map((line) => {
                            const lineRemaining = line.budgetAmount - line.committedAmount;
                            const isImported = line.importBatchId != null;
                            const hasDrift =
                              line.lastImportedAmount != null &&
                              line.lastImportedAmount !== line.budgetAmount;
                            const importedDateStr = line.importedAt
                              ? new Date(line.importedAt).toLocaleDateString()
                              : null;
                            return (
                              <TableRow key={line.id}>
                                <TableCell className="text-xs">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="truncate">{line.categoryName}</span>
                                    {isImported && (
                                      <Link
                                        href={`/admin/imports/${line.importBatchId}`}
                                        title={
                                          importedDateStr
                                            ? `Imported from sheet on ${importedDateStr}. Click to view source batch.`
                                            : 'Imported from sheet. Click to view source batch.'
                                        }
                                        className="inline-flex shrink-0 items-center gap-0.5 rounded-sm bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-800 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-200 dark:hover:bg-blue-900"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <FileSpreadsheet className="h-2.5 w-2.5" />
                                        Imported
                                      </Link>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-xs text-right font-mono tabular-nums">
                                  <div className="flex flex-col items-end leading-tight">
                                    <span>{formatMoney(line.budgetAmount)}</span>
                                    {hasDrift && line.lastImportedAmount != null && (
                                      <span
                                        className="text-[10px] text-amber-600 dark:text-amber-400"
                                        title={`Imported value: ${formatMoney(line.lastImportedAmount)} ${currency}. Adjusted manually since import.`}
                                      >
                                        was {formatMoney(line.lastImportedAmount)}
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-xs text-right font-mono tabular-nums">
                                  {formatMoney(line.committedAmount)}
                                </TableCell>
                                <TableCell className="text-xs text-right font-mono tabular-nums">
                                  {formatMoney(line.actualAmount)}
                                </TableCell>
                                <TableCell
                                  className={`text-xs text-right font-mono tabular-nums ${
                                    lineRemaining < 0 ? 'text-destructive' : ''
                                  }`}
                                >
                                  {formatMoney(lineRemaining)}
                                </TableCell>
                                {canEdit && (
                                  <TableCell className="text-right">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 w-6 p-0"
                                      onClick={() => {
                                        setEditingLine(line);
                                        setEditLineSheetOpen(true);
                                      }}
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                  </TableCell>
                                )}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Create Sheet ── */}
      <CreateBudgetSheet
        open={createSheetOpen}
        onOpenChange={setCreateSheetOpen}
        projectId={projectId}
        currency={currency}
        currencySymbol={currencySymbol}
      />

      {/* ── Edit Sheet ── */}
      <EditBudgetSheet
        open={editSheetOpen}
        onOpenChange={setEditSheetOpen}
        projectId={projectId}
        currency={currency}
        currencySymbol={currencySymbol}
        currentRevisedBudget={revisedBudget}
        currentContingency={contingency}
        currentNotes=''
      />

      {/* ── Edit Line Sheet ── */}
      {editingLine && (
        <EditLineSheet
          open={editLineSheetOpen}
          onOpenChange={(open) => {
            setEditLineSheetOpen(open);
            if (!open) setEditingLine(null);
          }}
          projectId={projectId}
          line={editingLine}
          currency={currency}
          currencySymbol={currencySymbol}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// SummaryRow
// ---------------------------------------------------------------------------

function SummaryRow({
  label,
  value,
  currency,
  bold,
  destructive,
}: {
  label: string;
  value: number | null;
  currency: string;
  bold?: boolean;
  destructive?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground uppercase tracking-wider leading-none mb-1.5">
        {label}
      </p>
      {value !== null ? (
        <p
          className={`text-sm font-mono tabular-nums leading-tight ${
            bold ? 'font-semibold' : ''
          } ${destructive ? 'text-destructive font-semibold' : ''}`}
        >
          {formatMoney(value)}
          <span className="text-[10px] text-muted-foreground font-normal ml-1">{currency}</span>
        </p>
      ) : (
        <p className="text-sm text-muted-foreground/50 italic">Not set</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create Budget Sheet
// ---------------------------------------------------------------------------

function CreateBudgetSheet({
  open,
  onOpenChange,
  projectId,
  currency,
  currencySymbol,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  currency: string;
  currencySymbol: string;
}) {
  const utils = trpc.useUtils();

  const [baseline, setBaseline] = useState('');
  const [contingency, setContingency] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setBaseline('');
      setContingency('');
      setNotes('');
      setErrors({});
    }
    onOpenChange(isOpen);
  };

  const mutation = trpc.budget.create.useMutation({
    onSuccess: () => {
      toast.success('Internal budget created.');
      utils.budget.summary.invalidate({ projectId });
      handleOpenChange(false);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  function validate(): boolean {
    const errs: Record<string, string> = {};

    if (!baseline.trim()) {
      errs.baseline = 'Baseline amount is required.';
    } else {
      const num = parseFloat(baseline);
      if (isNaN(num)) {
        errs.baseline = 'Must be a valid number.';
      } else if (num <= 0) {
        errs.baseline = 'Must be a positive value.';
      }
    }

    if (contingency.trim()) {
      const num = parseFloat(contingency);
      if (isNaN(num)) {
        errs.contingency = 'Must be a valid number.';
      } else if (num < 0) {
        errs.contingency = 'Cannot be negative.';
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;

    mutation.mutate({
      projectId,
      internalBaseline: parseFloat(baseline),
      contingencyAmount: contingency.trim() ? parseFloat(contingency) : 0,
      notes: notes.trim() || undefined,
    });
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Set Up Internal Budget</SheetTitle>
          <SheetDescription>
            Define the internal delivery budget baseline. This enables cost
            control tracking against committed and actual spend.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          {/* Baseline Amount */}
          <div className="space-y-1.5">
            <Label htmlFor="budget-baseline">
              Baseline Amount ({currency})
            </Label>
            <Input
              id="budget-baseline"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="e.g. 2000000"
              value={baseline}
              onChange={(e) => {
                setBaseline(e.target.value);
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.baseline;
                  return next;
                });
              }}
              className={`font-mono ${errors.baseline ? 'border-destructive' : ''}`}
            />
            {errors.baseline && (
              <p className="text-xs text-destructive font-medium">{errors.baseline}</p>
            )}
            <p className="text-[11px] text-muted-foreground">
              The original internal delivery budget before adjustments.
            </p>
          </div>

          {/* Contingency */}
          <div className="space-y-1.5">
            <Label htmlFor="budget-contingency">
              Contingency ({currency})
            </Label>
            <Input
              id="budget-contingency"
              type="number"
              step="0.01"
              min="0"
              placeholder="e.g. 200000"
              value={contingency}
              onChange={(e) => {
                setContingency(e.target.value);
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.contingency;
                  return next;
                });
              }}
              className={`font-mono ${errors.contingency ? 'border-destructive' : ''}`}
            />
            {errors.contingency && (
              <p className="text-xs text-destructive font-medium">{errors.contingency}</p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Optional contingency reserve for unforeseen costs.
            </p>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="budget-notes">Notes</Label>
            <Textarea
              id="budget-notes"
              placeholder="Optional notes about this budget..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
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
            {mutation.isPending ? 'Creating...' : 'Create Budget'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Edit Budget Sheet
// ---------------------------------------------------------------------------

function EditBudgetSheet({
  open,
  onOpenChange,
  projectId,
  currency,
  currencySymbol,
  currentRevisedBudget,
  currentContingency,
  currentNotes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  currency: string;
  currencySymbol: string;
  currentRevisedBudget: number | null;
  currentContingency: number | null;
  currentNotes: string;
}) {
  const utils = trpc.useUtils();

  const [revised, setRevised] = useState(currentRevisedBudget?.toString() ?? '');
  const [contingency, setContingency] = useState(currentContingency?.toString() ?? '');
  const [notes, setNotes] = useState(currentNotes);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setRevised(currentRevisedBudget?.toString() ?? '');
      setContingency(currentContingency?.toString() ?? '');
      setNotes(currentNotes);
      setErrors({});
    }
    onOpenChange(isOpen);
  };

  const mutation = trpc.budget.update.useMutation({
    onSuccess: () => {
      toast.success('Internal budget updated.');
      utils.budget.summary.invalidate({ projectId });
      handleOpenChange(false);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  function validate(): boolean {
    const errs: Record<string, string> = {};

    if (revised.trim()) {
      const num = parseFloat(revised);
      if (isNaN(num)) {
        errs.revised = 'Must be a valid number.';
      } else if (num <= 0) {
        errs.revised = 'Must be a positive value.';
      }
    }

    if (contingency.trim()) {
      const num = parseFloat(contingency);
      if (isNaN(num)) {
        errs.contingency = 'Must be a valid number.';
      } else if (num < 0) {
        errs.contingency = 'Cannot be negative.';
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;

    mutation.mutate({
      projectId,
      internalRevised: revised.trim() ? parseFloat(revised) : undefined,
      contingencyAmount: contingency.trim() ? parseFloat(contingency) : undefined,
      notes: notes.trim() || undefined,
    });
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Edit Internal Budget</SheetTitle>
          <SheetDescription>
            Update the revised budget, contingency reserve, and notes.
            The original baseline amount cannot be changed.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          {/* Revised Budget */}
          <div className="space-y-1.5">
            <Label htmlFor="budget-revised">
              Revised Budget ({currency})
            </Label>
            <Input
              id="budget-revised"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="e.g. 2500000"
              value={revised}
              onChange={(e) => {
                setRevised(e.target.value);
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.revised;
                  return next;
                });
              }}
              className={`font-mono ${errors.revised ? 'border-destructive' : ''}`}
            />
            {errors.revised && (
              <p className="text-xs text-destructive font-medium">{errors.revised}</p>
            )}
            <p className="text-[11px] text-muted-foreground">
              The current internal budget after approved adjustments.
            </p>
          </div>

          {/* Contingency */}
          <div className="space-y-1.5">
            <Label htmlFor="budget-edit-contingency">
              Contingency ({currency})
            </Label>
            <Input
              id="budget-edit-contingency"
              type="number"
              step="0.01"
              min="0"
              placeholder="e.g. 200000"
              value={contingency}
              onChange={(e) => {
                setContingency(e.target.value);
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.contingency;
                  return next;
                });
              }}
              className={`font-mono ${errors.contingency ? 'border-destructive' : ''}`}
            />
            {errors.contingency && (
              <p className="text-xs text-destructive font-medium">{errors.contingency}</p>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="budget-edit-notes">Notes</Label>
            <Textarea
              id="budget-edit-notes"
              placeholder="Optional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Clear hint */}
          <p className="text-xs text-muted-foreground border-l-2 border-muted pl-2">
            Leave the revised budget empty to keep the current value. Budget KPIs
            use the revised amount when set, otherwise the baseline.
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

// ---------------------------------------------------------------------------
// Edit Line Sheet
// ---------------------------------------------------------------------------

function EditLineSheet({
  open,
  onOpenChange,
  projectId,
  line,
  currency,
  currencySymbol,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  line: BudgetLine;
  currency: string;
  currencySymbol: string;
}) {
  const utils = trpc.useUtils();

  const [budgetAmount, setBudgetAmount] = useState(line.budgetAmount.toString());
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setBudgetAmount(line.budgetAmount.toString());
      setReason('');
      setErrors({});
    }
    onOpenChange(isOpen);
  };

  const mutation = trpc.budget.updateLine.useMutation({
    onSuccess: () => {
      toast.success(`Budget line "${line.categoryName}" updated.`);
      utils.budget.summary.invalidate({ projectId });
      handleOpenChange(false);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  function validate(): boolean {
    const errs: Record<string, string> = {};

    if (!budgetAmount.trim()) {
      errs.budgetAmount = 'Budget amount is required.';
    } else {
      const num = parseFloat(budgetAmount);
      if (isNaN(num)) {
        errs.budgetAmount = 'Must be a valid number.';
      } else if (num < 0) {
        errs.budgetAmount = 'Cannot be negative.';
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;

    const trimmedReason = reason.trim();
    mutation.mutate({
      projectId,
      budgetLineId: line.id,
      budgetAmount: parseFloat(budgetAmount),
      notes: undefined,
      reason: trimmedReason ? trimmedReason : undefined,
    });
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Edit Budget Line</SheetTitle>
          <SheetDescription>
            Update the budget amount for &ldquo;{line.categoryName}&rdquo;.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          {/* Imported-line banner — shown when line originated from a sheet import */}
          {line.importBatchId && (
            <div className="flex items-start gap-2 rounded-md border border-blue-300 bg-blue-50 p-2.5 text-blue-900 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-200">
              <FileSpreadsheet className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="flex-1 space-y-0.5 text-xs">
                <div className="font-medium">Imported budget line</div>
                <div>
                  This line was written by a committed import
                  {line.importedAt && (
                    <> on {new Date(line.importedAt).toLocaleDateString()}</>
                  )}
                  . Manual edits here are recorded as append-only budget adjustments
                  &mdash; the original imported value stays visible for reconciliation.
                </div>
                {line.lastImportedAmount != null && (
                  <div className="pt-1 font-mono tabular-nums">
                    Imported value: {formatMoney(line.lastImportedAmount)} {currency}
                  </div>
                )}
                <Link
                  href={`/admin/imports/${line.importBatchId}`}
                  className="inline-block pt-0.5 underline"
                >
                  View source batch &rarr;
                </Link>
              </div>
            </div>
          )}

          {/* Current figures */}
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <p className="text-muted-foreground uppercase tracking-wider mb-1">Committed</p>
              <p className="font-mono tabular-nums">{formatMoney(line.committedAmount)} {currency}</p>
            </div>
            <div>
              <p className="text-muted-foreground uppercase tracking-wider mb-1">Actual</p>
              <p className="font-mono tabular-nums">{formatMoney(line.actualAmount)} {currency}</p>
            </div>
          </div>

          {/* Budget Amount */}
          <div className="space-y-1.5">
            <Label htmlFor="line-budget-amount">
              Budget Amount ({currency})
            </Label>
            <Input
              id="line-budget-amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="e.g. 500000"
              value={budgetAmount}
              onChange={(e) => {
                setBudgetAmount(e.target.value);
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.budgetAmount;
                  return next;
                });
              }}
              className={`font-mono ${errors.budgetAmount ? 'border-destructive' : ''}`}
            />
            {errors.budgetAmount && (
              <p className="text-xs text-destructive font-medium">{errors.budgetAmount}</p>
            )}
          </div>

          {/* Optional reason — required-looking prompt on imported lines so the
              drift from the sheet is traceable. The service writes the reason
              into the BudgetAdjustment record either way; this field just
              gives the operator a first-class place to type it. */}
          <div className="space-y-1.5">
            <Label htmlFor="line-reason">
              Reason for change
              {line.importBatchId && (
                <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                  (recommended — drift from imported value)
                </span>
              )}
            </Label>
            <Textarea
              id="line-reason"
              placeholder={
                line.importBatchId
                  ? 'Why is the imported value being overridden?'
                  : 'Optional rationale recorded in the adjustment log.'
              }
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
            />
            <p className="text-[11px] text-muted-foreground">
              Saved as an append-only budget adjustment alongside the change.
            </p>
          </div>
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
