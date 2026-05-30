'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
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
import { QuotationLineItemEditor, type QuotationLineItem } from './line-item-editor';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type QuotationFormData = {
  rfqId: string;
  vendorId: string;
  currency: string;
  totalAmount: string;
  validUntil: string;
  paymentTerms: string;
  deliveryTerms: string;
  items: QuotationLineItem[];
};

type Props = {
  projectId: string;
  /** Pre-selected RFQ (from query param or context). */
  preselectedRfqId?: string | undefined;
  /** When set, the form is in edit mode. */
  existingQuotation?: {
    id: string;
    rfqId: string;
    vendorId: string;
    currency: string;
    totalAmount: number | string;
    validUntil?: string | Date | null;
    paymentTerms?: string | null;
    deliveryTerms?: string | null;
    lineItems?: Array<{
      rfqItemId?: string | null;
      itemDescription: string;
      unit: string;
      quantity: number | string;
      unitPrice: number | string;
      totalPrice: number | string;
      notes?: string | null;
    }>;
    vendor?: { name: string };
    rfq?: { rfqNumber?: string; referenceNumber?: string | null };
  };
};

function toDateInputValue(d: string | Date | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toISOString().slice(0, 16);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QuotationForm({ projectId, preselectedRfqId, existingQuotation }: Props) {
  const router = useRouter();
  const isEdit = !!existingQuotation;

  const [form, setForm] = useState<QuotationFormData>({
    rfqId: existingQuotation?.rfqId ?? preselectedRfqId ?? '',
    vendorId: existingQuotation?.vendorId ?? '',
    currency: existingQuotation?.currency ?? 'SAR',
    totalAmount: existingQuotation?.totalAmount != null
      ? String(existingQuotation.totalAmount)
      : '',
    validUntil: toDateInputValue(existingQuotation?.validUntil),
    paymentTerms: existingQuotation?.paymentTerms ?? '',
    deliveryTerms: existingQuotation?.deliveryTerms ?? '',
    items: (existingQuotation?.lineItems ?? []).map((li) => {
      const base: QuotationLineItem = {
        itemDescription: li.itemDescription,
        unit: li.unit,
        quantity: Number(li.quantity),
        unitPrice: Number(li.unitPrice),
        totalPrice: Number(li.totalPrice),
      };
      if (li.rfqItemId != null) base.rfqItemId = li.rfqItemId;
      if (li.notes != null) base.notes = li.notes;
      return base;
    }),
  });

  const [error, setError] = useState<string | null>(null);

  // Data sources
  const { data: currencies } = trpc.referenceData.currencies.list.useQuery();

  // Fetch RFQs in quotation-accepting statuses for the create-mode RFQ selector.
  // Must match backend: issued, responses_received, evaluation.
  const { data: acceptingRfqs } = trpc.procurement.rfq.list.useQuery(
    {
      projectId,
      statusFilter: ['issued', 'responses_received', 'evaluation'],
      take: 100,
      skip: 0,
      sortDirection: 'desc',
    },
    { enabled: !isEdit },
  );

  // Fetch invited vendors + items for the selected RFQ
  const { data: selectedRfq } = trpc.procurement.rfq.get.useQuery(
    { projectId, id: form.rfqId },
    { enabled: !!form.rfqId },
  );

  const rfqVendors = (selectedRfq?.rfqVendors ?? []).map((rv) => ({
    vendorId: rv.vendorId ?? rv.vendor?.id,
    name: rv.vendor?.name ?? 'Unknown',
  }));

  // Pre-populate line items from RFQ items when RFQ changes (create mode only).
  // This enforces rfqItemId linkage so comparison logic works.
  const [lastPrepopRfqId, setLastPrepopRfqId] = useState<string>('');
  if (
    !isEdit &&
    selectedRfq &&
    form.rfqId &&
    form.rfqId !== lastPrepopRfqId &&
    selectedRfq.items &&
    selectedRfq.items.length > 0 &&
    form.items.length === 0
  ) {
    setLastPrepopRfqId(form.rfqId);
    const prepopulated: QuotationLineItem[] = selectedRfq.items.map((rfqItem) => ({
      itemDescription: rfqItem.itemDescription,
      unit: rfqItem.unit,
      quantity: Number(rfqItem.quantity),
      unitPrice: 0,
      totalPrice: 0,
      rfqItemId: rfqItem.id,
    }));
    setForm((prev) => ({ ...prev, items: prepopulated }));
  }

  // Mutations
  const createMut = trpc.procurement.quotation.create.useMutation({
    onSuccess: (data) => {
      router.push(`/projects/${projectId}/procurement/quotations/${data.id}`);
    },
    onError: (err) => setError(err.message),
  });

  const updateMut = trpc.procurement.quotation.update.useMutation({
    onSuccess: () => {
      router.push(`/projects/${projectId}/procurement/quotations/${existingQuotation!.id}`);
    },
    onError: (err) => setError(err.message),
  });

  const isPending = createMut.isPending || updateMut.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.rfqId) { setError('Select an RFQ.'); return; }
    if (!form.vendorId) { setError('Select a vendor.'); return; }
    if (!form.currency) { setError('Currency is required.'); return; }
    if (!form.totalAmount || Number(form.totalAmount) <= 0) {
      setError('Total amount must be greater than zero.');
      return;
    }

    const validItems = form.items.filter(
      (i) => i.itemDescription.trim() && i.unit.trim() && i.quantity > 0 && i.unitPrice > 0,
    );

    if (isEdit) {
      updateMut.mutate({
        projectId,
        id: existingQuotation!.id,
        currency: form.currency,
        totalAmount: Number(form.totalAmount),
        validUntil: form.validUntil ? new Date(form.validUntil).toISOString() : null,
        paymentTerms: form.paymentTerms.trim() || null,
        deliveryTerms: form.deliveryTerms.trim() || null,
        items: validItems.length > 0 ? validItems : undefined,
      });
    } else {
      createMut.mutate({
        projectId,
        rfqId: form.rfqId,
        vendorId: form.vendorId,
        currency: form.currency,
        totalAmount: Number(form.totalAmount),
        validUntil: form.validUntil ? new Date(form.validUntil).toISOString() : undefined,
        paymentTerms: form.paymentTerms.trim() || undefined,
        deliveryTerms: form.deliveryTerms.trim() || undefined,
        items: validItems.length > 0 ? validItems : undefined,
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* RFQ + Vendor Selection (create only) */}
      {!isEdit && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Link to RFQ</CardTitle>
            <p className="text-xs text-muted-foreground">
              Select the RFQ this quotation responds to, then the vendor.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="rfqId">RFQ *</Label>
                <Select
                  value={form.rfqId}
                  onValueChange={(v) => setForm({ ...form, rfqId: v, vendorId: '' })}
                >
                  <SelectTrigger id="rfqId">
                    <SelectValue placeholder="Select an issued RFQ" />
                  </SelectTrigger>
                  <SelectContent>
                    {(acceptingRfqs?.items ?? []).map((rfq) => (
                      <SelectItem key={rfq.id} value={rfq.id}>
                        {rfq.referenceNumber ?? rfq.rfqNumber} — {rfq.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="vendorId">Vendor *</Label>
                <Select
                  value={form.vendorId}
                  onValueChange={(v) => setForm({ ...form, vendorId: v })}
                  disabled={!form.rfqId}
                >
                  <SelectTrigger id="vendorId">
                    <SelectValue placeholder={form.rfqId ? 'Select vendor' : 'Select RFQ first'} />
                  </SelectTrigger>
                  <SelectContent>
                    {rfqVendors.map((v) => (
                      <SelectItem key={v.vendorId} value={v.vendorId}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit-mode header: show locked RFQ + vendor */}
      {isEdit && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Quotation For</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">RFQ</p>
              <p className="text-sm">
                {existingQuotation?.rfq?.referenceNumber ?? existingQuotation?.rfq?.rfqNumber ?? existingQuotation?.rfqId}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Vendor</p>
              <p className="text-sm">
                {existingQuotation?.vendor?.name ?? existingQuotation?.vendorId}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Core Fields */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Quotation Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="currency">Currency *</Label>
              <Select
                value={form.currency}
                onValueChange={(v) => setForm({ ...form, currency: v })}
              >
                <SelectTrigger id="currency">
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  {(currencies ?? []).map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name} ({c.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="totalAmount">Total Amount *</Label>
              <Input
                id="totalAmount"
                type="number"
                min={0}
                step="any"
                value={form.totalAmount}
                onChange={(e) => setForm({ ...form, totalAmount: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="validUntil">Valid Until</Label>
              <Input
                id="validUntil"
                type="datetime-local"
                value={form.validUntil}
                onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="paymentTerms">Payment Terms</Label>
              <Textarea
                id="paymentTerms"
                value={form.paymentTerms}
                onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })}
                placeholder="e.g. Net 30 days"
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deliveryTerms">Delivery Terms</Label>
              <Textarea
                id="deliveryTerms"
                value={form.deliveryTerms}
                onChange={(e) => setForm({ ...form, deliveryTerms: e.target.value })}
                placeholder="e.g. FOB site, 4 weeks"
                rows={2}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Line Items</CardTitle>
          <p className="text-xs text-muted-foreground">
            Break down the quotation by item. Auto-calculates total per row.
          </p>
        </CardHeader>
        <CardContent>
          <QuotationLineItemEditor
            items={form.items}
            onChange={(items) => setForm({ ...form, items })}
          />
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending
            ? isEdit ? 'Saving...' : 'Creating...'
            : isEdit ? 'Save Changes' : 'Create Quotation'}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => router.back()}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
