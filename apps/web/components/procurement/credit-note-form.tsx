'use client';

import { useState } from 'react';
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

type CreditNoteFormData = {
  vendorId: string;
  subtype: 'credit_note' | 'rebate' | 'recovery';
  creditNoteNumber: string;
  amount: string;
  currency: string;
  reason: string;
  receivedDate: string;
  supplierInvoiceId: string; // empty string = none
};

const SUBTYPE_LABELS: Record<CreditNoteFormData['subtype'], string> = {
  credit_note: 'Credit Note',
  rebate: 'Rebate',
  recovery: 'Recovery',
};

type Props = {
  projectId: string;
};

export function CreditNoteForm({ projectId }: Props) {
  const router = useRouter();

  const [formData, setFormData] = useState<CreditNoteFormData>({
    vendorId: '',
    subtype: 'credit_note',
    creditNoteNumber: '',
    amount: '',
    currency: 'SAR',
    reason: '',
    receivedDate: getTodayLocalDateString(),
    supplierInvoiceId: '',
  });

  const [submitError, setSubmitError] = useState<string | null>(null);

  const update = <K extends keyof CreditNoteFormData>(
    key: K,
    value: CreditNoteFormData[K],
  ) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  // Data sources
  const vendorsQuery = trpc.procurement.projectVendor.list.useQuery({ projectId });
  const invoicesQuery = trpc.procurement.supplierInvoice.list.useQuery({
    projectId,
  });

  // Filter SIs by selected vendor (ergonomic — scope the picker to the chosen vendor)
  const eligibleInvoices =
    (invoicesQuery.data ?? []).filter(
      (si: any) => !formData.vendorId || si.vendorId === formData.vendorId,
    ) ?? [];

  // Submit mutation
  const createMutation = trpc.procurement.creditNote.create.useMutation({
    onSuccess: (cn) => {
      router.push(`/projects/${projectId}/procurement/credit-notes/${cn.id}`);
    },
    onError: (err) => {
      setSubmitError(err.message);
    },
  });

  const isValid =
    formData.vendorId !== '' &&
    formData.creditNoteNumber.trim() !== '' &&
    formData.amount.trim() !== '' &&
    parseFloat(formData.amount) > 0 &&
    formData.currency.trim().length === 3 &&
    formData.reason.trim() !== '' &&
    formData.receivedDate !== '';

  const handleSubmit = () => {
    if (!isValid) {
      setSubmitError('Please fill in all required fields.');
      return;
    }
    setSubmitError(null);
    createMutation.mutate({
      projectId,
      vendorId: formData.vendorId,
      subtype: formData.subtype,
      creditNoteNumber: formData.creditNoteNumber.trim(),
      amount: formData.amount,
      currency: formData.currency,
      reason: formData.reason.trim(),
      receivedDate: formData.receivedDate,
      supplierInvoiceId: formData.supplierInvoiceId || undefined,
    });
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Credit Note Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Vendor */}
          <div className="space-y-2">
            <Label htmlFor="vendorId">
              Vendor <span className="text-destructive">*</span>
            </Label>
            <Select
              value={formData.vendorId}
              onValueChange={(v) => {
                update('vendorId', v);
                // If the selected SI no longer matches the new vendor, clear it
                if (formData.supplierInvoiceId) {
                  const stillMatches = (invoicesQuery.data ?? []).some(
                    (si: any) =>
                      si.id === formData.supplierInvoiceId &&
                      si.vendorId === v,
                  );
                  if (!stillMatches) update('supplierInvoiceId', '');
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

          {/* Subtype */}
          <div className="space-y-2">
            <Label htmlFor="subtype">
              Type <span className="text-destructive">*</span>
            </Label>
            <Select
              value={formData.subtype}
              onValueChange={(v) =>
                update('subtype', v as CreditNoteFormData['subtype'])
              }
            >
              <SelectTrigger id="subtype">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SUBTYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* CN number */}
          <div className="space-y-2">
            <Label htmlFor="creditNoteNumber">
              Credit Note Number <span className="text-destructive">*</span>
            </Label>
            <Input
              id="creditNoteNumber"
              value={formData.creditNoteNumber}
              onChange={(e) => update('creditNoteNumber', e.target.value)}
              placeholder="CN-2026-0001"
            />
          </div>

          {/* Amount + currency */}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="amount">
                Amount <span className="text-destructive">*</span>
              </Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                value={formData.amount}
                onChange={(e) => update('amount', e.target.value)}
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

          {/* Received date */}
          <div className="space-y-2">
            <Label htmlFor="receivedDate">
              Received Date <span className="text-destructive">*</span>
            </Label>
            <Input
              id="receivedDate"
              type="date"
              value={formData.receivedDate}
              onChange={(e) => update('receivedDate', e.target.value)}
            />
          </div>

          {/* Linked supplier invoice (optional) */}
          <div className="space-y-2">
            <Label htmlFor="supplierInvoiceId">
              Linked Supplier Invoice{' '}
              <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Select
              value={formData.supplierInvoiceId || 'none'}
              onValueChange={(v) =>
                update('supplierInvoiceId', v === 'none' ? '' : v)
              }
              disabled={!formData.vendorId}
            >
              <SelectTrigger id="supplierInvoiceId">
                <SelectValue
                  placeholder={
                    !formData.vendorId
                      ? 'Select vendor first'
                      : eligibleInvoices.length === 0
                        ? 'No invoices for this vendor'
                        : 'None'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {eligibleInvoices.map((si: any) => (
                  <SelectItem key={si.id} value={si.id}>
                    {si.invoiceNumber} — {si.currency} {si.totalAmount}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reason"
              value={formData.reason}
              onChange={(e) => update('reason', e.target.value)}
              placeholder="Explain why this credit note was issued."
              rows={4}
            />
          </div>
        </CardContent>
      </Card>

      {submitError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {submitError}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          onClick={() =>
            router.push(`/projects/${projectId}/procurement/credit-notes`)
          }
          disabled={createMutation.isPending}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!isValid || createMutation.isPending}
        >
          {createMutation.isPending ? 'Recording...' : 'Record Credit Note'}
        </Button>
      </div>
    </div>
  );
}
