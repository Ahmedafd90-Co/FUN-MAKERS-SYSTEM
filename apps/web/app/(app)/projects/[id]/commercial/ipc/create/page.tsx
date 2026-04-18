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
  CardHeader,
  CardTitle,
  CardDescription,
} from '@fmksa/ui/components/card';
import { trpc } from '@/lib/trpc-client';
import type { CreateIpcInput } from '@fmksa/contracts';

// ---------------------------------------------------------------------------
// Create IPC Page
// ---------------------------------------------------------------------------

export default function CreateIpcPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;

  // Form state — matches CreateIpcInputSchema
  const [ipaId, setIpaId] = useState('');
  const [certifiedAmount, setCertifiedAmount] = useState('');
  const [retentionAmount, setRetentionAmount] = useState('');
  const [adjustments, setAdjustments] = useState('');
  const [netCertified, setNetCertified] = useState('');
  const [certificationDate, setCertificationDate] = useState('');
  const [currency, setCurrency] = useState('SAR');
  const [remarks, setRemarks] = useState('');

  const [error, setError] = useState<string | null>(null);

  // Fetch IPAs for this project so user can select which IPA to certify
  const { data: ipas } = trpc.commercial.ipa.list.useQuery({
    projectId,
    take: 100,
    sortField: 'createdAt',
    sortDirection: 'desc',
  } as any);

  const createMut = trpc.commercial.ipc.create.useMutation({
    onSuccess: (data) => {
      if (data) {
        router.push(`/projects/${projectId}/commercial/ipc/${data.id}`);
      }
    },
    onError: (err) => setError(err.message),
  });

  const canSubmit =
    ipaId !== '' &&
    certifiedAmount !== '' &&
    retentionAmount !== '' &&
    netCertified !== '' &&
    certificationDate !== '';

  const handleCreate = () => {
    if (!canSubmit) return;
    setError(null);

    const input: CreateIpcInput = {
      projectId,
      ipaId,
      certifiedAmount: parseFloat(certifiedAmount),
      retentionAmount: parseFloat(retentionAmount),
      netCertified: parseFloat(netCertified),
      certificationDate: new Date(certificationDate).toISOString(),
      currency,
    };

    if (adjustments) input.adjustments = parseFloat(adjustments);
    if (remarks.trim()) input.remarks = remarks.trim();

    createMut.mutate(input);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <Link
        href={`/projects/${projectId}/commercial/ipc`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to IPCs
      </Link>

      <div>
        <h1 className="text-xl font-semibold">Create IPC</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create a new Interim Payment Certificate against an existing IPA.
        </p>
      </div>

      {/* IPA selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Source IPA *</CardTitle>
          <CardDescription>
            Select the IPA this certificate is issued against.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={ipaId} onValueChange={setIpaId}>
            <SelectTrigger>
              <SelectValue placeholder="Select an IPA..." />
            </SelectTrigger>
            <SelectContent>
              {(ipas?.items ?? []).map((ipa) => (
                <SelectItem key={ipa.id} value={ipa.id}>
                  {ipa.referenceNumber ?? `Draft (Period ${ipa.periodNumber ?? '?'})`}
                  {' — '}
                  <span className="text-muted-foreground">{ipa.status}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Certification details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Certification Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="certifiedAmount">Certified Amount *</Label>
              <Input
                id="certifiedAmount"
                type="number"
                step="0.01"
                value={certifiedAmount}
                onChange={(e) => setCertifiedAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="retentionAmount">Retention Amount *</Label>
              <Input
                id="retentionAmount"
                type="number"
                step="0.01"
                value={retentionAmount}
                onChange={(e) => setRetentionAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="adjustments">Adjustments</Label>
              <Input
                id="adjustments"
                type="number"
                step="0.01"
                value={adjustments}
                onChange={(e) => setAdjustments(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="netCertified">Net Certified *</Label>
              <Input
                id="netCertified"
                type="number"
                step="0.01"
                value={netCertified}
                onChange={(e) => setNetCertified(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="certificationDate">Certification Date *</Label>
              <Input
                id="certificationDate"
                type="date"
                value={certificationDate}
                onChange={(e) => setCertificationDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
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
          </div>
        </CardContent>
      </Card>

      {/* Remarks */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Remarks</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Optional remarks..."
            className="min-h-[80px]"
          />
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
            router.push(`/projects/${projectId}/commercial/ipc`)
          }
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
