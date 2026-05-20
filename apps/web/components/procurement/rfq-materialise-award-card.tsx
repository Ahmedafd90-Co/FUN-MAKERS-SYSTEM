'use client';

/**
 * MaterialiseAwardCard (PIC-53).
 *
 * Surfaced ONLY when RFQ.status === 'awarded'. Highlights the explicit-action
 * design: the award is decided, but the downstream PO or Subcontract is NOT
 * created automatically — the user picks the path here.
 *
 * Discoverability matters: this card lives at the TOP of the awarded-RFQ view
 * (above details) with a `border-primary/30` accent and an unambiguous
 * "Materialise Award" header so a reviewer cannot miss it. Tracked as a
 * permanent governance callout in the PIC-53 PR body — the design is
 * explicit-action by intent (no auto-materialisation; the user chooses).
 */

import { Button } from '@fmksa/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@fmksa/ui/components/card';
import { ArrowRight, FileText, Handshake } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@/lib/trpc-client';

type Props = {
  projectId: string;
  rfqId: string;
  rfqStatus: string;
  /** When set, materialisation already happened — render the link to the downstream record. */
  existingPoId?: string | null;
  existingVendorContractId?: string | null;
};

export function RfqMaterialiseAwardCard({
  projectId,
  rfqId,
  rfqStatus,
  existingPoId,
  existingVendorContractId,
}: Props) {
  const router = useRouter();
  const [materialisingAs, setMaterialisingAs] = useState<'po' | 'subcontract' | null>(null);

  const utils = trpc.useUtils();
  const mut = trpc.procurement.rfq.materialiseAward.useMutation({
    onSuccess: (result) => {
      if (!result) return;
      toast.success(
        result.materialiseAs === 'po'
          ? 'Award materialised as Purchase Order (draft)'
          : 'Award materialised as Subcontract (draft) — edit dates before submitting',
      );
      utils.procurement.rfq.get.invalidate({ projectId, id: rfqId });
      utils.procurement.rfq.getMaterialisationLink.invalidate({ projectId, rfqId });
      // Route to the new record's detail page
      const target =
        result.recordType === 'purchase_order'
          ? `/projects/${projectId}/procurement/purchase-orders/${result.recordId}`
          : `/projects/${projectId}/procurement/vendor-contracts/${result.recordId}`;
      router.push(target);
    },
    onError: (err) => {
      toast.error(err.message);
      setMaterialisingAs(null);
    },
  });

  // Only show on awarded RFQs.
  if (rfqStatus !== 'awarded') return null;

  // If already materialised, render a permanent "go to" link instead of the action.
  if (existingPoId) {
    return (
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Award materialised as Purchase Order
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              router.push(`/projects/${projectId}/procurement/purchase-orders/${existingPoId}`)
            }
          >
            Open Purchase Order
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (existingVendorContractId) {
    return (
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Handshake className="h-4 w-4" />
            Award materialised as Subcontract
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              router.push(
                `/projects/${projectId}/procurement/vendor-contracts/${existingVendorContractId}`,
              )
            }
          >
            Open Subcontract
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Awarded but not yet materialised — show the explicit-action affordance.
  return (
    <Card className="border-primary/40 shadow-sm">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <ArrowRight className="h-4 w-4" />
          Materialise Award
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          The RFQ is awarded. Choose the downstream record type to create — this
          is the user-explicit step (no auto-materialisation by design). The
          downstream record starts in draft for editing before submission.
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="default"
            size="sm"
            disabled={mut.isPending}
            onClick={() => {
              setMaterialisingAs('po');
              mut.mutate({ projectId, rfqId, materialiseAs: 'po' });
            }}
          >
            <FileText className="mr-2 h-4 w-4" />
            {materialisingAs === 'po' && mut.isPending
              ? 'Creating Purchase Order…'
              : 'Materialise as Purchase Order'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={mut.isPending}
            onClick={() => {
              setMaterialisingAs('subcontract');
              mut.mutate({ projectId, rfqId, materialiseAs: 'subcontract' });
            }}
          >
            <Handshake className="mr-2 h-4 w-4" />
            {materialisingAs === 'subcontract' && mut.isPending
              ? 'Creating Subcontract…'
              : 'Materialise as Subcontract'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
