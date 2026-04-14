'use client';

import { useState } from 'react';
import { Banknote, Plus, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@fmksa/ui/components/button';
import { Badge } from '@fmksa/ui/components/badge';
import { Input } from '@fmksa/ui/components/input';
import { Label } from '@fmksa/ui/components/label';
import { Textarea } from '@fmksa/ui/components/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@fmksa/ui/components/select';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@fmksa/ui/components/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@fmksa/ui/components/table';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@fmksa/ui/components/sheet';

import { trpc } from '@/lib/trpc-client';
import { formatMoney } from '@/components/commercial/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type InvoiceCollectionsSectionProps = {
  projectId: string;
  invoiceId: string;
  invoiceStatus: string;
  invoiceTotalAmount: string | number;
  invoiceCurrency: string;
  invoiceDueDate: string | null;
  /** Whether the current user can record collections (tax_invoice.edit). */
  canRecord: boolean;
};

const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'cash', label: 'Cash' },
  { value: 'wire', label: 'Wire Transfer' },
  { value: 'other', label: 'Other' },
] as const;

const COLLECTABLE_STATUSES = new Set([
  'issued',
  'submitted',
  'overdue',
  'partially_collected',
]);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InvoiceCollectionsSection({
  projectId,
  invoiceId,
  invoiceStatus,
  invoiceTotalAmount,
  invoiceCurrency,
  invoiceDueDate,
  canRecord,
}: InvoiceCollectionsSectionProps) {
  const utils = trpc.useUtils();
  const [sheetOpen, setSheetOpen] = useState(false);

  const outstanding = trpc.commercial.invoiceCollection.outstanding.useQuery({
    taxInvoiceId: invoiceId,
    projectId,
  } as any);
  const collections = trpc.commercial.invoiceCollection.list.useQuery({
    taxInvoiceId: invoiceId,
    projectId,
  } as any);

  const totalAmount = parseFloat(String(invoiceTotalAmount)) || 0;
  const collectedAmount = parseFloat(outstanding.data?.collectedAmount ?? '0');
  const outstandingAmount = parseFloat(outstanding.data?.outstandingAmount ?? String(totalAmount));

  const isOverdue = invoiceDueDate
    ? new Date(invoiceDueDate) < new Date() && outstandingAmount > 0
    : false;

  const isCollectable = COLLECTABLE_STATUSES.has(invoiceStatus);
  const canShowRecordButton = canRecord && isCollectable && outstandingAmount > 0;
  const isFullyCollected = outstandingAmount === 0 && collectedAmount > 0;

  return (
    <>
      <Card className={isOverdue ? 'border-l-2 border-l-red-500' : isFullyCollected ? 'border-l-2 border-l-emerald-500' : ''}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Banknote className="h-4 w-4 text-muted-foreground/60" />
              <CardTitle className="text-sm font-semibold">Collections</CardTitle>
              {isOverdue && (
                <Badge variant="destructive" className="gap-1 text-[11px]">
                  <AlertTriangle className="h-3 w-3" />
                  Overdue
                </Badge>
              )}
              {isFullyCollected && (
                <Badge variant="default" className="text-[11px] bg-emerald-600 text-white">
                  Fully Collected
                </Badge>
              )}
            </div>
            {canShowRecordButton && (
              <Button size="sm" className="gap-1 h-7 text-xs" onClick={() => setSheetOpen(true)}>
                <Plus className="h-3 w-3" />
                Record Payment
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* ── Financial Summary ── */}
          <div className={`rounded-md border p-3 ${isOverdue ? 'bg-red-50/30 border-red-200 dark:bg-red-950/10 dark:border-red-900' : 'bg-muted/30'}`}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider leading-none mb-1">
                  Total
                </p>
                <p className="text-sm font-mono tabular-nums leading-tight">
                  {formatMoney(totalAmount)}
                  <span className="text-[10px] text-muted-foreground ml-1">{invoiceCurrency}</span>
                </p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider leading-none mb-1">
                  Collected
                </p>
                <p className={`text-sm font-mono tabular-nums leading-tight ${
                  isFullyCollected ? 'font-bold text-emerald-700 dark:text-emerald-400' : collectedAmount === 0 ? 'text-muted-foreground' : 'font-medium'
                }`}>
                  {formatMoney(collectedAmount)}
                  <span className="text-[10px] text-muted-foreground ml-1">{invoiceCurrency}</span>
                </p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider leading-none mb-1">
                  Outstanding
                </p>
                <p className={`font-mono tabular-nums leading-tight ${
                  isOverdue
                    ? 'text-base font-bold text-destructive'
                    : outstandingAmount > 0
                      ? 'text-base font-bold text-foreground'
                      : 'text-sm text-muted-foreground'
                }`}>
                  {formatMoney(outstandingAmount)}
                  <span className="text-[10px] text-muted-foreground ml-1">{invoiceCurrency}</span>
                </p>
              </div>
            </div>
          </div>

          {/* ── Collection History ── */}
          {collections.isLoading ? (
            <p className="text-xs text-muted-foreground py-2">Loading collections...</p>
          ) : !collections.data?.length ? (
            <div className="py-6 text-center">
              <Banknote className="h-5 w-5 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">
                No payments recorded yet.
              </p>
            </div>
          ) : (
            <>
            {/* Mobile: stacked cards */}
            <div className="sm:hidden space-y-2">
              {collections.data.map((c: any) => (
                <div key={c.id} className="rounded-md border p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-mono tabular-nums font-medium">
                      {formatMoney(c.amount)} {invoiceCurrency}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono tabular-nums">
                      {new Date(c.collectionDate).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {c.paymentMethod && (
                      <span className="capitalize">{c.paymentMethod.replace(/_/g, ' ')}</span>
                    )}
                    {c.reference && (
                      <span className="font-mono">{c.reference}</span>
                    )}
                  </div>
                  {c.notes && (
                    <p className="text-xs text-muted-foreground truncate">{c.notes}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground/60">
                    {c.recordedByName ?? 'System'}
                  </p>
                </div>
              ))}
            </div>
            {/* Desktop: table */}
            <div className="hidden sm:block overflow-x-auto -mx-1">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Date</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-right">Amount</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Method</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Reference</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Notes</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Entered By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {collections.data.map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-sm font-mono tabular-nums">
                        {new Date(c.collectionDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-mono font-medium text-sm">
                        {formatMoney(c.amount)} {invoiceCurrency}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground capitalize">
                        {c.paymentMethod?.replace(/_/g, ' ') ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground font-mono text-xs">
                        {c.reference ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate">
                        {c.notes ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.recordedByName ?? 'System'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Record Collection Sheet ── */}
      <RecordCollectionSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        projectId={projectId}
        invoiceId={invoiceId}
        outstandingAmount={outstandingAmount}
        currency={invoiceCurrency}
        onSuccess={() => {
          utils.commercial.invoiceCollection.outstanding.invalidate({ taxInvoiceId: invoiceId });
          utils.commercial.invoiceCollection.list.invalidate({ taxInvoiceId: invoiceId });
          utils.commercial.taxInvoice.get.invalidate({ projectId, id: invoiceId });
          utils.commercial.dashboard.financialKpis.invalidate({ projectId });
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Record Collection Sheet
// ---------------------------------------------------------------------------

function RecordCollectionSheet({
  open,
  onOpenChange,
  projectId,
  invoiceId,
  outstandingAmount,
  currency,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  invoiceId: string;
  outstandingAmount: number;
  currency: string;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [collectionDate, setCollectionDate] = useState(
    new Date().toISOString().split('T')[0]!,
  );
  const [paymentMethod, setPaymentMethod] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = trpc.commercial.invoiceCollection.record.useMutation({
    onSuccess: () => {
      const formatted = formatMoney(parseFloat(amount));
      toast.success(`Payment of ${formatted} ${currency} recorded.`);
      onSuccess();
      resetAndClose();
    },
    onError: (err) => {
      if (err.message.includes('Overcollection')) {
        setErrors((prev) => ({ ...prev, amount: err.message }));
      } else {
        toast.error(err.message);
      }
    },
  });

  function resetAndClose() {
    setAmount('');
    setCollectionDate(new Date().toISOString().split('T')[0]!);
    setPaymentMethod('');
    setReference('');
    setNotes('');
    setErrors({});
    onOpenChange(false);
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    const numAmount = parseFloat(amount);

    if (!amount || isNaN(numAmount)) {
      errs.amount = 'Amount is required.';
    } else if (numAmount <= 0) {
      errs.amount = 'Amount must be greater than zero.';
    } else if (numAmount > outstandingAmount) {
      errs.amount = `Cannot exceed outstanding balance of ${formatMoney(outstandingAmount)} ${currency}.`;
    }

    if (!collectionDate) {
      errs.collectionDate = 'Collection date is required.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;

    mutation.mutate({
      taxInvoiceId: invoiceId,
      projectId,
      amount: parseFloat(amount),
      collectionDate: new Date(collectionDate),
      ...(paymentMethod ? { paymentMethod } : {}),
      ...(reference.trim() ? { reference: reference.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    } as any);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Record Payment</SheetTitle>
          <SheetDescription className="sr-only">
            Record a payment against this invoice.
          </SheetDescription>
        </SheetHeader>

        {/* Outstanding amount — prominent display */}
        <div className="rounded-md border bg-muted/30 px-3 py-2.5 mt-2 mb-1">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider leading-none mb-1">
            Outstanding Receivable
          </p>
          <p className="text-lg font-mono font-bold tabular-nums text-foreground">
            {formatMoney(outstandingAmount)}
            <span className="text-xs font-normal text-muted-foreground ml-1.5">{currency}</span>
          </p>
        </div>

        <div className="space-y-4 py-4">
          {/* Amount */}
          <div className="space-y-1.5">
            <Label htmlFor="coll-amount">
              Amount <span className="text-destructive">*</span>
            </Label>
            <Input
              id="coll-amount"
              type="number"
              step="0.01"
              min="0.01"
              max={outstandingAmount}
              placeholder={`Max ${formatMoney(outstandingAmount)}`}
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.amount;
                  return next;
                });
              }}
              className={`font-mono ${errors.amount ? 'border-destructive' : ''}`}
            />
            {errors.amount && (
              <p className="text-xs text-destructive font-medium">{errors.amount}</p>
            )}
          </div>

          {/* Collection Date */}
          <div className="space-y-1.5">
            <Label htmlFor="coll-date">
              Collection Date <span className="text-destructive">*</span>
            </Label>
            <Input
              id="coll-date"
              type="date"
              value={collectionDate}
              onChange={(e) => {
                setCollectionDate(e.target.value);
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.collectionDate;
                  return next;
                });
              }}
              className={errors.collectionDate ? 'border-destructive' : ''}
            />
            {errors.collectionDate && (
              <p className="text-xs text-destructive font-medium">{errors.collectionDate}</p>
            )}
          </div>

          {/* Payment Method */}
          <div className="space-y-1.5">
            <Label htmlFor="coll-method">Payment Method</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger id="coll-method" className="h-9">
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reference */}
          <div className="space-y-1.5">
            <Label htmlFor="coll-ref">Reference</Label>
            <Input
              id="coll-ref"
              placeholder="Payment reference or receipt number"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="font-mono text-sm"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="coll-notes">Notes</Label>
            <Textarea
              id="coll-notes"
              placeholder="Optional notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={resetAndClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? 'Recording...' : 'Record Payment'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
