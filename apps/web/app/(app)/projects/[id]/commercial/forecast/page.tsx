'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Plus, Pencil, Trash2, ShieldOff, CalendarRange } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@fmksa/ui/components/button';
import { Input } from '@fmksa/ui/components/input';
import { Label } from '@fmksa/ui/components/label';
import { Textarea } from '@fmksa/ui/components/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@fmksa/ui/components/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@fmksa/ui/components/dialog';
import { trpc } from '@/lib/trpc-client';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMoney(val: string | number | null | undefined): string {
  if (val == null) return '—';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '—';
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(val: string | null): string {
  if (val == null) return '—';
  const num = parseFloat(val);
  if (isNaN(num)) return '—';
  return `${num.toFixed(1)}%`;
}

function varianceClass(val: string): string {
  const n = parseFloat(val);
  if (isNaN(n) || n === 0) return 'text-muted-foreground';
  return n > 0 ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400';
}

function humanizeIpaStatus(s: string | null): string {
  if (!s) return '—';
  return s.replace(/_/g, ' ');
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type FormState = {
  mode: 'create' | 'edit';
  periodNumber: string;
  periodStart: string;
  forecastAmount: string;
  notes: string;
};

const emptyForm: FormState = {
  mode: 'create',
  periodNumber: '',
  periodStart: '',
  forecastAmount: '',
  notes: '',
};

export default function ForecastAdminPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const utils = trpc.useUtils();

  const list = trpc.commercial.forecast.list.useQuery({ projectId });
  const rollup = trpc.commercial.forecast.forecastVsActual.useQuery({ projectId });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const upsertMut = trpc.commercial.forecast.upsert.useMutation({
    onSuccess: () => {
      toast.success(form.mode === 'edit' ? 'Forecast updated' : 'Forecast added');
      utils.commercial.forecast.list.invalidate();
      utils.commercial.forecast.forecastVsActual.invalidate();
      utils.commercial.dashboard.financialKpis.invalidate();
      setDialogOpen(false);
      setError(null);
    },
    onError: (err) => setError(err.message),
  });

  const deleteMut = trpc.commercial.forecast.delete.useMutation({
    onSuccess: () => {
      toast.success('Forecast removed');
      utils.commercial.forecast.list.invalidate();
      utils.commercial.forecast.forecastVsActual.invalidate();
      utils.commercial.dashboard.financialKpis.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  function openCreate() {
    setForm(emptyForm);
    setError(null);
    setDialogOpen(true);
  }

  function openEdit(f: {
    periodNumber: number;
    periodStart: Date | string;
    forecastAmount: { toString(): string };
    notes: string | null;
  }) {
    const periodStartStr =
      typeof f.periodStart === 'string'
        ? f.periodStart.slice(0, 10)
        : new Date(f.periodStart).toISOString().slice(0, 10);
    setForm({
      mode: 'edit',
      periodNumber: String(f.periodNumber),
      periodStart: periodStartStr,
      forecastAmount: f.forecastAmount.toString(),
      notes: f.notes ?? '',
    });
    setError(null);
    setDialogOpen(true);
  }

  async function handleSubmit() {
    setError(null);
    const periodNumber = parseInt(form.periodNumber, 10);
    const amount = parseFloat(form.forecastAmount);
    if (isNaN(periodNumber) || periodNumber <= 0) {
      setError('Period number must be a positive integer.');
      return;
    }
    if (!form.periodStart) {
      setError('Period start date is required.');
      return;
    }
    if (isNaN(amount) || amount < 0) {
      setError('Forecast amount must be zero or positive.');
      return;
    }
    const currency = rollup.data?.currency ?? 'SAR';
    await upsertMut.mutateAsync({
      projectId,
      periodNumber,
      periodStart: new Date(`${form.periodStart}T00:00:00.000Z`).toISOString(),
      forecastAmount: amount,
      currency,
      notes: form.notes.trim() || null,
    });
  }

  async function handleDelete(periodNumber: number) {
    if (!confirm(`Remove forecast for period ${periodNumber}?`)) return;
    await deleteMut.mutateAsync({ projectId, periodNumber });
  }

  // Permission denied
  if (list.error?.data?.code === 'FORBIDDEN') {
    return (
      <div className="py-16 text-center space-y-2">
        <ShieldOff className="h-8 w-8 mx-auto text-muted-foreground/40" />
        <p className="text-sm font-medium">Access Denied</p>
        <p className="text-xs text-muted-foreground">
          You don&apos;t have permission to view forecasts in this project.
        </p>
      </div>
    );
  }

  const rows = rollup.data?.periods ?? [];
  const currency = rollup.data?.currency ?? '';

  return (
    <div className="space-y-6">
      <PageHeader
        title="IPA Forecast"
        description="Per-period plan of record. Actual amounts are sourced from approved+ IPAs."
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Add Forecast
          </Button>
        }
      />

      {/* Summary strip — compact truth numbers */}
      {rollup.data && (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-5">
          <SummaryStat label="Total Forecast" value={`${formatMoney(rollup.data.totalForecast)} ${currency}`} />
          <SummaryStat label="To-Date Forecast" value={`${formatMoney(rollup.data.toDateForecast)} ${currency}`} />
          <SummaryStat
            label="Actual IPA"
            value={`${formatMoney(rollup.data.totalActual)} ${currency}`}
            caption="Includes imported historical IPAs."
          />
          <SummaryStat
            label="Variance"
            value={`${formatMoney(rollup.data.toDateVariance)} ${currency}`}
            valueClass={varianceClass(rollup.data.toDateVariance)}
            caption="Variance compares actual IPA achieved to forecast to date. It can reflect timing delay as well as true underperformance."
          />
          <SummaryStat label="Attainment" value={formatPercent(rollup.data.toDateAttainmentPercent)} />
        </div>
      )}

      {/* Table */}
      {list.isLoading || rollup.isLoading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
      ) : !rows.length ? (
        <EmptyState
          icon={CalendarRange}
          title="No forecasts yet"
          description="Add a forecast to compare against actual IPAs."
          action={{ label: 'Add Forecast', onClick: openCreate }}
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period #</TableHead>
                <TableHead>Period Start</TableHead>
                <TableHead className="text-right">Forecast</TableHead>
                <TableHead className="text-right">Actual</TableHead>
                <TableHead className="text-right">Variance</TableHead>
                <TableHead>IPA Status</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.periodNumber}>
                  <TableCell className="font-medium">Period {r.periodNumber}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(r.periodStart).toLocaleDateString(undefined, {
                      year: 'numeric', month: 'short',
                    })}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(r.forecastAmount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(r.actualAmount)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${varianceClass(r.variance)}`}>
                    {formatMoney(r.variance)}
                  </TableCell>
                  <TableCell className="text-xs capitalize text-muted-foreground">
                    {humanizeIpaStatus(r.ipaStatus)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const row = list.data?.find((x) => x.periodNumber === r.periodNumber);
                        if (row) openEdit(row);
                      }}
                      aria-label={`Edit period ${r.periodNumber}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(r.periodNumber)}
                      disabled={deleteMut.isPending}
                      aria-label={`Delete period ${r.periodNumber}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {form.mode === 'edit' ? `Edit Period ${form.periodNumber}` : 'Add Forecast'}
            </DialogTitle>
            <DialogDescription>
              One forecast per period. Editing an existing period number replaces the planned amount.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="periodNumber">Period Number</Label>
              <Input
                id="periodNumber"
                type="number"
                min="1"
                step="1"
                value={form.periodNumber}
                onChange={(e) => setForm((f) => ({ ...f, periodNumber: e.target.value }))}
                disabled={form.mode === 'edit'}
                placeholder="e.g. 3"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="periodStart">Period Start (month)</Label>
              <Input
                id="periodStart"
                type="date"
                value={form.periodStart}
                onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="forecastAmount">Forecast Amount ({currency || 'project currency'})</Label>
              <Input
                id="forecastAmount"
                type="number"
                min="0"
                step="0.01"
                value={form.forecastAmount}
                onChange={(e) => setForm((f) => ({ ...f, forecastAmount: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={upsertMut.isPending}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={upsertMut.isPending}>
              {upsertMut.isPending ? 'Saving…' : form.mode === 'edit' ? 'Save' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small local components
// ---------------------------------------------------------------------------

function SummaryStat({
  label,
  value,
  valueClass,
  caption,
}: {
  label: string;
  value: string;
  valueClass?: string;
  /**
   * Short truth-caption under the value, e.g. "Includes imported historical
   * IPAs." Added 2026-04-21 so cross-origin aggregates explain what they
   * include, and variance explains what it signals.
   */
  caption?: string;
}) {
  return (
    <div className="rounded-md border bg-card p-3">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`mt-1 text-sm font-mono tabular-nums ${valueClass ?? ''}`}>{value}</p>
      {caption && (
        <p className="mt-1 text-[10px] leading-snug text-muted-foreground/70">
          {caption}
        </p>
      )}
    </div>
  );
}
