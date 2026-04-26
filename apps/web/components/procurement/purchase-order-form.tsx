'use client';

import { useState, useMemo } from 'react';
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
import {
  QuotationLineItemEditor,
  type QuotationLineItem,
} from './line-item-editor';

type PurchaseOrderFormData = {
  vendorId: string;
  title: string;
  description: string;
  currency: string;
  items: QuotationLineItem[];
  deliveryDate: string;
  deliveryAddress: string;
  paymentTerms: string;
};

type Props = {
  projectId: string;
};

export function PurchaseOrderForm({ projectId }: Props) {
  const router = useRouter();

  const [formData, setFormData] = useState<PurchaseOrderFormData>({
    vendorId: '',
    title: '',
    description: '',
    currency: 'SAR',
    items: [],
    deliveryDate: '',
    deliveryAddress: '',
    paymentTerms: '',
  });

  const [submitError, setSubmitError] = useState<string | null>(null);

  const update = <K extends keyof PurchaseOrderFormData>(
    key: K,
    value: PurchaseOrderFormData[K],
  ) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  // Data sources
  const vendorsQuery = trpc.procurement.projectVendor.list.useQuery({
    projectId,
  });

  // Derived total from line items
  const computedTotal = useMemo(() => {
    return (
      Math.round(
        formData.items.reduce((sum, item) => sum + (item.totalPrice || 0), 0) *
          100,
      ) / 100
    );
  }, [formData.items]);

  // Submit mutation
  const createMutation = trpc.procurement.purchaseOrder.create.useMutation({
    onSuccess: (po) => {
      router.push(
        `/projects/${projectId}/procurement/purchase-orders/${po.id}`,
      );
    },
    onError: (err) => {
      setSubmitError(err.message);
    },
  });

  // Validation
  const hasValidItem = formData.items.some(
    (item) =>
      item.itemDescription.trim() !== '' &&
      item.unit.trim() !== '' &&
      item.quantity > 0 &&
      item.unitPrice > 0,
  );

  const isValid =
    formData.vendorId !== '' &&
    formData.title.trim() !== '' &&
    formData.items.length > 0 &&
    hasValidItem &&
    computedTotal > 0 &&
    formData.currency.trim().length === 3;

  const handleSubmit = () => {
    if (!isValid) {
      setSubmitError(
        'Please fill in all required fields and add at least one line item with quantity and price.',
      );
      return;
    }
    setSubmitError(null);

    // Strip empty/invalid line items before submitting
    const validItems = formData.items.filter(
      (item) =>
        item.itemDescription.trim() !== '' &&
        item.unit.trim() !== '' &&
        item.quantity > 0 &&
        item.unitPrice > 0,
    );

    createMutation.mutate({
      projectId,
      vendorId: formData.vendorId,
      title: formData.title.trim(),
      description: formData.description.trim() || undefined,
      totalAmount: computedTotal,
      currency: formData.currency,
      items: validItems.map((item) => ({
        itemDescription: item.itemDescription.trim(),
        unit: item.unit.trim(),
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
      })),
      deliveryDate: formData.deliveryDate
        ? new Date(formData.deliveryDate).toISOString()
        : undefined,
      deliveryAddress: formData.deliveryAddress.trim() || undefined,
      paymentTerms: formData.paymentTerms.trim() || undefined,
    });
  };

  return (
    <div className="space-y-4 max-w-4xl">
      {/* --- Basic info --- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="vendorId">
              Vendor <span className="text-destructive">*</span>
            </Label>
            <Select
              value={formData.vendorId}
              onValueChange={(v) => update('vendorId', v)}
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
            <Label htmlFor="title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => update('title', e.target.value)}
              placeholder="e.g. Site lighting equipment — Phase 2"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder="Optional context for this purchase order"
              rows={3}
            />
          </div>

          <div className="space-y-2 max-w-[160px]">
            <Label htmlFor="currency">Currency</Label>
            <Input
              id="currency"
              value={formData.currency}
              onChange={(e) => update('currency', e.target.value.toUpperCase())}
              maxLength={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* --- Line items --- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Line Items <span className="text-destructive">*</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <QuotationLineItemEditor
            items={formData.items}
            onChange={(items) => update('items', items)}
          />

          <div className="flex items-center justify-between border-t pt-3">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-base font-semibold tabular-nums">
              {computedTotal.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              {formData.currency}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* --- Delivery & payment --- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Delivery &amp; Payment{' '}
            <span className="text-muted-foreground text-xs font-normal">
              (optional)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="deliveryDate">Delivery Date</Label>
            <Input
              id="deliveryDate"
              type="date"
              value={formData.deliveryDate}
              onChange={(e) => update('deliveryDate', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="deliveryAddress">Delivery Address</Label>
            <Textarea
              id="deliveryAddress"
              value={formData.deliveryAddress}
              onChange={(e) => update('deliveryAddress', e.target.value)}
              placeholder="Site address or receiving location"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="paymentTerms">Payment Terms</Label>
            <Input
              id="paymentTerms"
              value={formData.paymentTerms}
              onChange={(e) => update('paymentTerms', e.target.value)}
              placeholder="e.g. Net 30, 50% advance + 50% on delivery"
            />
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
            router.push(`/projects/${projectId}/procurement/purchase-orders`)
          }
          disabled={createMutation.isPending}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!isValid || createMutation.isPending}
        >
          {createMutation.isPending ? 'Creating...' : 'Create Purchase Order'}
        </Button>
      </div>
    </div>
  );
}
