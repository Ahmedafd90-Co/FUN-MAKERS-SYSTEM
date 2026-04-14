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

// ---------------------------------------------------------------------------
// Subtype configuration
// ---------------------------------------------------------------------------

const SUBTYPES = [
  { value: 'letter', label: 'Letter', description: 'General correspondence, instructions, transmittals' },
  { value: 'notice', label: 'Notice', description: 'Contractual notices (delay, EOT, disputes)' },
  { value: 'claim', label: 'Claim', description: 'Time/cost claims against the contract' },
  { value: 'back_charge', label: 'Back Charge', description: 'Charges for defects, delays, or non-compliance' },
] as const;

type Subtype = (typeof SUBTYPES)[number]['value'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CreateCorrespondencePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;

  // Form state
  const [subtype, setSubtype] = useState<string>('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientOrg, setRecipientOrg] = useState('');
  const [currency, setCurrency] = useState('SAR');

  // Letter-specific
  const [letterType, setLetterType] = useState<string>('');

  // Notice-specific
  const [noticeType, setNoticeType] = useState<string>('');
  const [contractClause, setContractClause] = useState('');
  const [responseDeadline, setResponseDeadline] = useState('');

  // Claim-specific
  const [claimType, setClaimType] = useState<string>('');
  const [claimedAmount, setClaimedAmount] = useState('');
  const [claimedTimeDays, setClaimedTimeDays] = useState('');

  // Back charge-specific
  const [targetName, setTargetName] = useState('');
  const [bcCategory, setBcCategory] = useState<string>('');
  const [chargedAmount, setChargedAmount] = useState('');
  const [evidenceDescription, setEvidenceDescription] = useState('');

  const [error, setError] = useState<string | null>(null);

  const createMut = trpc.commercial.correspondence.create.useMutation({
    onSuccess: (data) => {
      if (data) {
        router.push(`/projects/${projectId}/commercial/correspondence/${data.id}`);
      }
    },
    onError: (err) => setError(err.message),
  });

  const canSubmit = subtype !== '' && subject.trim() && body.trim() && recipientName.trim();

  const handleCreate = () => {
    if (!canSubmit || subtype === '') return;
    setError(null);

    const input: Record<string, unknown> = {
      projectId,
      subtype,
      subject: subject.trim(),
      body: body.trim(),
      recipientName: recipientName.trim(),
    };

    if (recipientOrg.trim()) input.recipientOrg = recipientOrg.trim();
    if (currency) input.currency = currency;

    // Subtype-specific fields
    if (subtype === 'letter' && letterType) {
      input.letterType = letterType;
    }
    if (subtype === 'notice') {
      if (noticeType) input.noticeType = noticeType;
      if (contractClause.trim()) input.contractClause = contractClause.trim();
      if (responseDeadline) input.responseDeadline = new Date(responseDeadline).toISOString();
    }
    if (subtype === 'claim') {
      if (claimType) input.claimType = claimType;
      if (claimedAmount) input.claimedAmount = parseFloat(claimedAmount);
      if (claimedTimeDays) input.claimedTimeDays = parseInt(claimedTimeDays, 10);
    }
    if (subtype === 'back_charge') {
      if (targetName.trim()) input.targetName = targetName.trim();
      if (bcCategory) input.category = bcCategory;
      if (chargedAmount) input.chargedAmount = parseFloat(chargedAmount);
      if (evidenceDescription.trim()) input.evidenceDescription = evidenceDescription.trim();
    }

    createMut.mutate(input as any);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <Link
        href={`/projects/${projectId}/commercial/correspondence`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Correspondence
      </Link>

      <div>
        <h1 className="text-xl font-semibold">Create Correspondence</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Select a type, fill in the details, and save as draft.
        </p>
      </div>

      {/* Step 1: Subtype selection — mandatory */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Type *</CardTitle>
          <CardDescription>
            Choose the correspondence type. This determines the workflow template and lifecycle.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {SUBTYPES.map((st) => (
              <button
                key={st.value}
                type="button"
                onClick={() => setSubtype(st.value)}
                className={`text-left rounded-lg border p-3 transition-colors ${
                  subtype === st.value
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <p className="text-sm font-medium">{st.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{st.description}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Common fields — shown once subtype is selected */}
      {subtype && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="subject">Subject *</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Brief subject line"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="body">Body *</Label>
                <Textarea
                  id="body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Full correspondence text..."
                  className="min-h-[120px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="recipientName">Recipient Name *</Label>
                  <Input
                    id="recipientName"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="Name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recipientOrg">Organisation</Label>
                  <Input
                    id="recipientOrg"
                    value={recipientOrg}
                    onChange={(e) => setRecipientOrg(e.target.value)}
                    placeholder="Organisation (optional)"
                  />
                </div>
              </div>
              <div className="space-y-2 max-w-[200px]">
                <Label htmlFor="currency">Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger id="currency">
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

          {/* Subtype-specific fields */}
          {subtype === 'letter' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Letter Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-w-[250px]">
                  <Label>Letter Type</Label>
                  <Select value={letterType} onValueChange={setLetterType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="instruction">Instruction</SelectItem>
                      <SelectItem value="response">Response</SelectItem>
                      <SelectItem value="transmittal">Transmittal</SelectItem>
                      <SelectItem value="general">General</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}

          {subtype === 'notice' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Notice Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Notice Type</Label>
                    <Select value={noticeType} onValueChange={setNoticeType}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="delay">Delay</SelectItem>
                        <SelectItem value="claim_notice">Claim Notice</SelectItem>
                        <SelectItem value="extension_of_time">Extension of Time</SelectItem>
                        <SelectItem value="dispute">Dispute</SelectItem>
                        <SelectItem value="force_majeure">Force Majeure</SelectItem>
                        <SelectItem value="general">General</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contractClause">Contract Clause</Label>
                    <Input
                      id="contractClause"
                      value={contractClause}
                      onChange={(e) => setContractClause(e.target.value)}
                      placeholder="e.g. Clause 20.1"
                    />
                  </div>
                </div>
                <div className="space-y-2 max-w-[250px]">
                  <Label htmlFor="responseDeadline">Response Deadline</Label>
                  <Input
                    id="responseDeadline"
                    type="datetime-local"
                    value={responseDeadline}
                    onChange={(e) => setResponseDeadline(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {subtype === 'claim' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Claim Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 max-w-[250px]">
                  <Label>Claim Type</Label>
                  <Select value={claimType} onValueChange={setClaimType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="time_extension">Time Extension</SelectItem>
                      <SelectItem value="additional_cost">Additional Cost</SelectItem>
                      <SelectItem value="time_and_cost">Time and Cost</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="claimedAmount">Claimed Amount</Label>
                    <Input
                      id="claimedAmount"
                      type="number"
                      step="0.01"
                      value={claimedAmount}
                      onChange={(e) => setClaimedAmount(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="claimedTimeDays">Claimed Time (days)</Label>
                    <Input
                      id="claimedTimeDays"
                      type="number"
                      step="1"
                      value={claimedTimeDays}
                      onChange={(e) => setClaimedTimeDays(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {subtype === 'back_charge' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Back Charge Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="targetName">Target (party)</Label>
                    <Input
                      id="targetName"
                      value={targetName}
                      onChange={(e) => setTargetName(e.target.value)}
                      placeholder="Subcontractor name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={bcCategory} onValueChange={setBcCategory}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="defect">Defect</SelectItem>
                        <SelectItem value="delay">Delay</SelectItem>
                        <SelectItem value="non_compliance">Non-compliance</SelectItem>
                        <SelectItem value="damage">Damage</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="chargedAmount">Charged Amount</Label>
                    <Input
                      id="chargedAmount"
                      type="number"
                      step="0.01"
                      value={chargedAmount}
                      onChange={(e) => setChargedAmount(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="evidenceDescription">Evidence</Label>
                  <Textarea
                    id="evidenceDescription"
                    value={evidenceDescription}
                    onChange={(e) => setEvidenceDescription(e.target.value)}
                    placeholder="Describe supporting evidence..."
                    className="min-h-[80px]"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex gap-3">
            <Button
              onClick={handleCreate}
              disabled={!canSubmit || createMut.isPending}
            >
              {createMut.isPending ? 'Creating...' : 'Create Draft'}
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push(`/projects/${projectId}/commercial/correspondence`)}
            >
              Cancel
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
