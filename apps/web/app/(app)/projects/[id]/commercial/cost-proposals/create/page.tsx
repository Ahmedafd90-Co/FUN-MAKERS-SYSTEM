'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
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
  CardDescription,
  CardHeader,
  CardTitle,
} from '@fmksa/ui/components/card';
import { trpc } from '@/lib/trpc-client';

// ---------------------------------------------------------------------------
// Create Cost Proposal Page
// ---------------------------------------------------------------------------

export default function CreateCostProposalPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;

  // Form state — matches CreateCostProposalInputSchema
  const [variationId, setVariationId] = useState('');
  const [revisionNumber, setRevisionNumber] = useState('1');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [estimatedTimeDays, setEstimatedTimeDays] = useState('');
  const [methodology, setMethodology] = useState('');
  const [costBreakdown, setCostBreakdown] = useState('');
  const [currency, setCurrency] = useState('SAR');

  const [error, setError] = useState<string | null>(null);

  // Fetch variations for optional linking
  const { data: variations } = trpc.commercial.variation.list.useQuery({
    projectId,
    take: 100,
    sortField: 'createdAt',
    sortDirection: 'desc',
  } as any);

  const createMut = trpc.commercial.costProposal.create.useMutation({
    onSuccess: (data) => {
      if (data) {
        router.push(
          `/projects/${projectId}/commercial/cost-proposals/${data.id}`,
        );
      }
    },
    onError: (err) => setError(err.message),
  });

  const canSubmit = revisionNumber !== '' && estimatedCost !== '';

  const handleCreate = () => {
    if (!canSubmit) return;
    setError(null);

    const input: Record<string, unknown> = {
      projectId,
      revisionNumber: parseInt(revisionNumber, 10),
      estimatedCost: parseFloat(estimatedCost),
      currency,
    };

    if (variationId) input.variationId = variationId;
    if (estimatedTimeDays)
      input.estimatedTimeDays = parseInt(estimatedTimeDays, 10);
    if (methodology.trim()) input.methodology = methodology.trim();
    if (costBreakdown.trim()) input.costBreakdown = costBreakdown.trim();

    createMut.mutate(input as any);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <Link
        href={`/projects/${projectId}/commercial/cost-proposals`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Cost Proposals
      </Link>

      <div>
        <h1 className="text-xl font-semibold">Create Cost Proposal</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create a new cost proposal. Optionally link it to a variation.
        </p>
      </div>

      {/* Variation link (optional) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Linked Variation</CardTitle>
          <CardDescription>
            Optionally link this cost proposal to a variation order.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={variationId} onValueChange={setVariationId}>
            <SelectTrigger>
              <SelectValue placeholder="No linked variation" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">
                <span className="text-muted-foreground">None</span>
              </SelectItem>
              {(variations?.items ?? []).map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.referenceNumber ?? 'Draft'} — {v.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Cost details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Cost Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="revisionNumber">Revision # *</Label>
              <Input
                id="revisionNumber"
                type="number"
                step="1"
                min="1"
                value={revisionNumber}
                onChange={(e) => setRevisionNumber(e.target.value)}
                placeholder="1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="estimatedCost">Estimated Cost *</Label>
              <Input
                id="estimatedCost"
                type="number"
                step="0.01"
                value={estimatedCost}
                onChange={(e) => setEstimatedCost(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="estimatedTimeDays">Est. Time (days)</Label>
              <Input
                id="estimatedTimeDays"
                type="number"
                step="1"
                value={estimatedTimeDays}
                onChange={(e) => setEstimatedTimeDays(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
          <div className="space-y-2 max-w-[200px]">
            <Label>Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SAR">SAR</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
                <SelectItem value="GBP">GBP</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Methodology & breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Methodology & Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="methodology">Methodology</Label>
            <Textarea
              id="methodology"
              value={methodology}
              onChange={(e) => setMethodology(e.target.value)}
              placeholder="Describe the costing approach..."
              className="min-h-[80px]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="costBreakdown">Cost Breakdown</Label>
            <Textarea
              id="costBreakdown"
              value={costBreakdown}
              onChange={(e) => setCostBreakdown(e.target.value)}
              placeholder="Itemised cost breakdown..."
              className="min-h-[80px]"
            />
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <Button
          onClick={handleCreate}
          disabled={!canSubmit || createMut.isPending}
        >
          {createMut.isPending ? 'Creating...' : 'Create Draft'}
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            router.push(`/projects/${projectId}/commercial/cost-proposals`)
          }
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
