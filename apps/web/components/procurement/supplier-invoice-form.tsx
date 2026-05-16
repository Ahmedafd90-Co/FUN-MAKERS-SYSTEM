'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@fmksa/ui/components/button';
import { Input } from '@fmksa/ui/components/input';
import { Textarea } from '@fmksa/ui/components/textarea';
import { Label } from '@fmksa/ui/components/label';
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
import { trpc } from '@/lib/trpc-client';
import { getTodayLocalDateString } from '@/lib/date';

// Saudi Arabia default VAT rate
const DEFAULT_VAT_RATE = '0.15';

type SupplierInvoiceFormData = {
  vendorId: string;
  purchaseOrderId: string; // empty string = none
  invoiceDate: string;
  dueDate: string;
  currency: string;
  grossAmount: string;
  vatRate: string;
  vatAmount: string;
  totalAmount: string;
  noPOReason: string;
};

type Props = {
  projectId: string;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function SupplierInvoiceForm({ projectId }: Props) {
  const router = useRouter();

  const [formData, setFormData] = useState<SupplierInvoiceFormData>({
    vendorId: '',
    purchaseOrderId: '',
    invoiceDate: getTodayLocalDateString(),
    dueDate: '',
    currency: 'SAR',
    grossAmount: '',
    vatRate: DEFAULT_VAT_RATE,
    vatAmount: '',
    totalAmount: '',
    noPOReason: '',
  });

  const [submitError, setSubmitError] = useState<string | null>(null);

  const update = <K extends keyof SupplierInvoiceFormData>(
    key: K,
    value: SupplierInvoiceFormData[K],
  ) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  // Data sources
  const vendorsQuery = trpc.procurement.projectVendor.list.useQuery({
    projectId,
  });
  const posQuery = trpc.procurement.purchaseOrder.list.useQuery({ projectId });

  // Filter POs by selected vendor
  const eligiblePOs =
    (posQuery.data ?? []).filter(
      (po: any) => !formData.vendorId || po.vendorId === formData.vendorId,
    ) ?? [];

  // Auto-compute VAT amount + total when gross amount or rate changes.
  // Effect fires only when the user edits gross or rate directly, not when
  // they manually edit VAT amount / total (which they might do for
  // special tax rulings).
  useEffect(() => {
    const gross = parseFloat(formData.grossAmount);
    const rate = parseFloat(formData.vatRate);
    if (!isNaN(gross) && !isNaN(rate) && gross >= 0 && rate >= 0) {
      const vatAmt = round2(gross * rate);
      const total = round2(gross + vatAmt);
      setFormData((prev) => ({
        ...prev,
        vatAmount: vatAmt.toFixed(2),
        totalAmount: total.toFixed(2),
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.grossAmount, formData.vatRate]);

  // Submit mutation
  const createMutation = trpc.procurement.supplierInvoice.create.useMutation({
    onSuccess: (si) => {
      router.push(
        `/projects/${projectId}/procurement/supplier-invoices/${si.id}`,
      );
    },
    onError: (err) => {
      setSubmitError(err.message);
    },
  });

  // Validation
  const grossNum = parseFloat(formData.grossAmount);
  const vatNum = parseFloat(formData.vatAmount);
  const totalNum = parseFloat(formData.totalAmount);

  // Operational data correctness: gross + vatAmount must equal totalAmount
  // within 0.01 (the smallest unit for any 2-decimal currency including SAR
  // halala). Without this check, clearing vatRate skips the auto-compute and
  // leaves stale vatAmount/totalAmount, producing internally-inconsistent
  // invoice rows that fail ZATCA VAT-period reconciliation later.
  // The intentional manual-override path (tax rulings) still works as long as
  // the user keeps the math consistent.
  const amountsAreConsistent =
    !isNaN(grossNum) &&
    !isNaN(vatNum) &&
    !isNaN(totalNum) &&
    Math.abs(grossNum + vatNum - totalNum) <= 0.01;

  const hasValidAmounts =
    !isNaN(grossNum) && grossNum > 0 &&
    !isNaN(vatNum) && vatNum >= 0 &&
    !isNaN(totalNum) && totalNum > 0 &&
    amountsAreConsistent;

  const hasPOOrReason =
    formData.purchaseOrderId !== '' || formData.noPOReason.trim() !== '';

  const isValid =
    formData.vendorId !== '' &&
    formData.invoiceDate !== '' &&
    hasValidAmounts &&
    formData.currency.trim().length === 3 &&
    hasPOOrReason;

  const handleSubmit = () => {
    if (!isValid) {
      if (
        !isNaN(grossNum) && grossNum > 0 &&
        !isNaN(totalNum) && totalNum > 0 &&
        !amountsAreConsistent
      ) {
        setSubmitError(
          'Amounts do not add up: gross + VAT must equal total. Please review the VAT rate and amount.',
        );
      } else {
        setSubmitError(
          'Please complete all required fields. If this invoice is not linked to a PO, explain why.',
        );
      }
      return;
    }
    setSubmitError(null);
    createMutation.mutate({
      projectId,
      vendorId: formData.vendorId,
      purchaseOrderId: formData.purchaseOrderId || undefined,
      invoiceDate: formData.invoiceDate,
      dueDate: formData.dueDate || undefined,
      currency: formData.currency,
      grossAmount: formData.grossAmount,
      vatRate: formData.vatRate,
      vatAmount: formData.vatAmount,
      totalAmount: formData.totalAmount,
      noPOReason: formData.purchaseOrderId
        ? undefined
        : formData.noPOReason.trim() || undefined,
    });
  };

  return (
    <div className="space-y-4 max-w-3xl">
      {/* --- Vendor + PO linkage --- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vendor &amp; Purchase Order</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="vendorId">
              Vendor <span className="text-destructive">*</span>
            </Label>
            <Select
              value={formData.vendorId}
              onValueChange={(v) => {
                update('vendorId', v);
                // Clear PO if it no longer matches new vendor
                if (formData.purchaseOrderId) {
                  const stillMatches = (posQuery.data ?? []).some(
                    (po: any) =>
                      po.id === formData.purchaseOrderId &&
                      po.vendorId === v,
                  );
                  if (!stillMatches) update('purchaseOrderId', '');
                }
              }}
            >
              <SelectTrigger id="vendorId">
                <SelectValue placeholder="Select vendor" />
              </SelectTrigger>
              <SelectContent>
                {(vendorsQuery.data ?? []).map((v: any) => (
                  <SelectItem key={v.vendorId} value={v.vendorId}>
                    {v.vendor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="purchaseOrderId">
              Linked Purchase Order{' '}
              <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Select
              value={formData.purchaseOrderId || 'none'}
              onValueChange={(v) =>
                update('purchaseOrderId', v === 'none' ? '' : v)
              }
              disabled={!formData.vendorId}
            >
              <SelectTrigger id="purchaseOrderId">
                <SelectValue
                  placeholder={
                    !formData.vendorId
                      ? 'Select vendor first'
                      : eligiblePOs.length === 0
                        ? 'No POs for this vendor'
                        : 'None'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {eligiblePOs.map((po: any) => (
                  <SelectItem key={po.id} value={po.id}>
                    {po.poNumber ?? po.referenceNumber ?? po.id} — {po.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Conditional: noPOReason is required only when no PO is linked */}
          {!formData.purchaseOrderId && (
            <div className="space-y-2">
              <Label htmlFor="noPOReason">
                Reason for no PO{' '}
                <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="noPOReason"
                value={formData.noPOReason}
                onChange={(e) => update('noPOReason', e.target.value)}
                placeholder="e.g. Emergency repair; framework agreement not yet in system; vendor submitted invoice prior to PO issuance."
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Invoices without a linked PO require a written justification.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* --- Dates --- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="invoiceDate">
                Invoice Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="invoiceDate"
                type="date"
                value={formData.invoiceDate}
                onChange={(e) => update('invoiceDate', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDate">
                Due Date{' '}
                <span className="text-muted-foreground text-xs">
                  (optional)
                </span>
              </Label>
              <Input
                id="dueDate"
                type="date"
                value={formData.dueDate}
                onChange={(e) => update('dueDate', e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* --- Amounts --- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Amounts <span className="text-destructive">*</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="grossAmount">Gross Amount</Label>
              <Input
                id="grossAmount"
                type="number"
                step="0.01"
                min="0"
                value={formData.grossAmount}
                onChange={(e) => update('grossAmount', e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Input
                id="currency"
                value={formData.currency}
                onChange={(e) =>
                  update('currency', e.target.value.toUpperCase())
                }
                maxLength={3}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="vatRate">VAT Rate</Label>
              <Input
                id="vatRate"
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={formData.vatRate}
                onChange={(e) => update('vatRate', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Enter as decimal (e.g. 0.15 for 15%).
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="vatAmount">VAT Amount</Label>
              <Input
                id="vatAmount"
                type="number"
                step="0.01"
                min="0"
                value={formData.vatAmount}
                onChange={(e) => update('vatAmount', e.target.value)}
                placeholder="0.00"
              />
              <p className="text-xs text-muted-foreground">
                Auto-computed. Override for special tax rulings.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="totalAmount">Total Amount</Label>
            <Input
              id="totalAmount"
              type="number"
              step="0.01"
              min="0"
              value={formData.totalAmount}
              onChange={(e) => update('totalAmount', e.target.value)}
              placeholder="0.00"
            />
            <p className="text-xs text-muted-foreground">
              Auto-computed as gross + VAT. Override if needed.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* --- Error + actions --- */}
      {submitError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {submitError}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          onClick={() =>
            router.push(`/projects/${projectId}/procurement/supplier-invoices`)
          }
          disabled={createMutation.isPending}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!isValid || createMutation.isPending}
        >
          {createMutation.isPending ? 'Recording...' : 'Record Invoice'}
        </Button>
      </div>
    </div>
  );
}
