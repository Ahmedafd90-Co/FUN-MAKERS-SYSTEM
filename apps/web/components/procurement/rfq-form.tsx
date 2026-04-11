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
import { RfqLineItemEditor, type RfqLineItem } from './line-item-editor';
import { VendorMultiSelect } from './vendor-multi-select';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RfqFormData = {
  title: string;
  description: string;
  categoryId: string;
  currency: string;
  deadline: string;
  estimatedBudget: string;
  items: RfqLineItem[];
  invitedVendorIds: string[];
};

type Props = {
  projectId: string;
  /** When set, the form is in edit mode. */
  existingRfq?: {
    id: string;
    title: string;
    description?: string | null;
    categoryId?: string | null;
    currency: string;
    requiredByDate?: string | Date | null;
    estimatedBudget?: number | string | null;
    items?: Array<{
      itemDescription: string;
      unit: string;
      quantity: number | string;
      estimatedUnitPrice?: number | string | null;
    }>;
    rfqVendors?: Array<{ vendorId: string }>;
  };
};

function toDateInputValue(d: string | Date | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toISOString().slice(0, 16); // datetime-local format
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RfqForm({ projectId, existingRfq }: Props) {
  const router = useRouter();
  const isEdit = !!existingRfq;

  const [form, setForm] = useState<RfqFormData>({
    title: existingRfq?.title ?? '',
    description: existingRfq?.description ?? '',
    categoryId: existingRfq?.categoryId ?? '',
    currency: existingRfq?.currency ?? 'SAR',
    deadline: toDateInputValue(existingRfq?.requiredByDate),
    estimatedBudget: existingRfq?.estimatedBudget != null
      ? String(existingRfq.estimatedBudget)
      : '',
    items: (existingRfq?.items ?? []).map((i) => {
      const base: RfqLineItem = {
        itemDescription: i.itemDescription,
        unit: i.unit,
        quantity: Number(i.quantity),
      };
      if (i.estimatedUnitPrice != null) {
        base.estimatedUnitPrice = Number(i.estimatedUnitPrice);
      }
      return base;
    }),
    invitedVendorIds: (existingRfq?.rfqVendors ?? []).map((v) => v.vendorId),
  });

  const [error, setError] = useState<string | null>(null);

  // Data sources
  const { data: currencies } = trpc.referenceData.currencies.list.useQuery();
  const { data: categories } = trpc.procurement.category.tree.useQuery(
    { entityId: '' },
    { enabled: false }, // categories require entityId — disabled for now
  );
  const { data: projectVendors, isLoading: vendorsLoading } =
    trpc.procurement.projectVendor.list.useQuery({ projectId });

  // Mutations
  const createMut = trpc.procurement.rfq.create.useMutation({
    onSuccess: (data) => {
      router.push(`/projects/${projectId}/procurement/rfq/${data.id}`);
    },
    onError: (err) => setError(err.message),
  });

  const updateMut = trpc.procurement.rfq.update.useMutation({
    onSuccess: () => {
      router.push(`/projects/${projectId}/procurement/rfq/${existingRfq!.id}`);
    },
    onError: (err) => setError(err.message),
  });

  const isPending = createMut.isPending || updateMut.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Basic client validation
    if (!form.title.trim()) { setError('Title is required.'); return; }
    if (!form.currency) { setError('Currency is required.'); return; }
    if (!form.deadline) { setError('Required-by date is required.'); return; }

    const validItems = form.items.filter(
      (i) => i.itemDescription.trim() && i.unit.trim() && i.quantity > 0,
    );

    if (isEdit) {
      updateMut.mutate({
        projectId,
        id: existingRfq!.id,
        title: form.title.trim(),
        description: form.description.trim() || null,
        categoryId: form.categoryId || null,
        currency: form.currency,
        deadline: new Date(form.deadline).toISOString(),
        estimatedBudget: form.estimatedBudget ? Number(form.estimatedBudget) : null,
        items: validItems.length > 0 ? validItems : undefined,
        invitedVendorIds: form.invitedVendorIds.length > 0 ? form.invitedVendorIds : undefined,
      });
    } else {
      createMut.mutate({
        projectId,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        categoryId: form.categoryId || undefined,
        currency: form.currency,
        deadline: new Date(form.deadline).toISOString(),
        estimatedBudget: form.estimatedBudget ? Number(form.estimatedBudget) : undefined,
        items: validItems.length > 0 ? validItems : undefined,
        invitedVendorIds: form.invitedVendorIds.length > 0 ? form.invitedVendorIds : undefined,
      });
    }
  };

  const vendorOptions = (projectVendors ?? []).map((pv: any) => ({
    id: pv.id,
    vendorId: pv.vendorId ?? pv.vendor?.id ?? pv.id,
    name: pv.vendor?.name ?? pv.name ?? 'Unknown',
  }));

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Core Fields */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">RFQ Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Steel reinforcement for Building A"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional details about the request..."
                rows={3}
              />
            </div>

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
                  {(currencies ?? []).map((c: any) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name} ({c.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="deadline">Required By *</Label>
              <Input
                id="deadline"
                type="datetime-local"
                value={form.deadline}
                onChange={(e) => setForm({ ...form, deadline: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="estimatedBudget">Estimated Budget</Label>
              <Input
                id="estimatedBudget"
                type="number"
                min={0}
                step="any"
                value={form.estimatedBudget}
                onChange={(e) => setForm({ ...form, estimatedBudget: e.target.value })}
                placeholder="Optional"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invited Vendors */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Invited Vendors</CardTitle>
          <p className="text-xs text-muted-foreground">
            Select vendors from the project vendor list. You can add more later.
          </p>
        </CardHeader>
        <CardContent>
          <VendorMultiSelect
            vendors={vendorOptions}
            selected={form.invitedVendorIds}
            onChange={(ids) => setForm({ ...form, invitedVendorIds: ids })}
            isLoading={vendorsLoading}
          />
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Line Items</CardTitle>
          <p className="text-xs text-muted-foreground">
            Specify the items you need quotations for. Optional at creation.
          </p>
        </CardHeader>
        <CardContent>
          <RfqLineItemEditor
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
            : isEdit ? 'Save Changes' : 'Create RFQ'}
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
