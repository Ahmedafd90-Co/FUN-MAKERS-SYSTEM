'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Award } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@fmksa/ui/components/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@fmksa/ui/components/card';
import { trpc } from '@/lib/trpc-client';
import { PageHeader } from '@/components/layout/page-header';
import { QuotationComparisonTable } from '@/components/procurement/quotation-comparison-table';

export default function QuotationComparePage() {
  const params = useParams<{ id: string; rfqId: string }>();
  const utils = trpc.useUtils();
  const [awardingQuotationId, setAwardingQuotationId] = useState<string | null>(null);

  const { data: rfq } = trpc.procurement.rfq.get.useQuery({
    projectId: params.id,
    id: params.rfqId,
  });

  const { data: userPermissions } = trpc.procurement.myPermissions.useQuery();

  const { data: comparison, isLoading } =
    trpc.procurement.quotation.compare.useQuery({
      projectId: params.id,
      rfqId: params.rfqId,
    });

  const awardMut = trpc.procurement.rfq.transition.useMutation({
    onSuccess: () => {
      setAwardingQuotationId(null);
      utils.procurement.rfq.get.invalidate();
      utils.procurement.quotation.compare.invalidate();
    },
    onError: (err) => {
      setAwardingQuotationId(null);
      toast.error(err.message ?? 'Transition failed');
    },
  });

  // Award gated: RFQ must be in evaluation AND user needs rfq.award permission
  const hasAwardPerm = userPermissions?.includes('rfq.award') ?? false;
  const canAward = rfq?.status === 'evaluation' && hasAwardPerm;
  const vendors = comparison
    ? Array.from(
        new Map(
          comparison.flatMap((row) =>
            row.vendors
              .filter((v) => v.quotationId)
              .map((v) => [v.vendorId, { vendorId: v.vendorId, vendorName: v.vendorName, quotationId: v.quotationId }]),
          ),
        ).values(),
      )
    : [];

  return (
    <div className="space-y-4">
      <Link
        href={`/projects/${params.id}/procurement/rfq/${params.rfqId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to RFQ
      </Link>

      <PageHeader
        title="Quotation Comparison"
        description={
          rfq
            ? `${rfq.referenceNumber ?? rfq.rfqNumber ?? 'Draft RFQ'} — ${rfq.title ?? ''}`
            : 'Loading...'
        }
      />

      {isLoading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          Loading comparison...
        </div>
      ) : !comparison || comparison.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No quotations available to compare for this RFQ.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                Price Comparison by Item
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Lowest unit price per item highlighted in green.
                Only active quotations are shown — rejected, expired, and awarded quotations are excluded.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <QuotationComparisonTable comparison={comparison} />
            </CardContent>
          </Card>

          {/* Award buttons — shown only when RFQ is in evaluation */}
          {canAward && vendors.length > 0 && (
            <Card className="border-primary/30">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Award className="h-4 w-4" />
                  Award Decision
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Select a vendor to award. This will award their quotation,
                  reject all others, and mark the RFQ as awarded.
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {vendors.map((v) => (
                    <Button
                      key={v.vendorId}
                      size="sm"
                      variant="default"
                      disabled={awardMut.isPending}
                      onClick={() => {
                        setAwardingQuotationId(v.quotationId);
                        awardMut.mutate({
                          projectId: params.id,
                          id: params.rfqId,
                          action: 'award',
                          quotationId: v.quotationId,
                        });
                      }}
                    >
                      {awardingQuotationId === v.quotationId
                        ? 'Awarding...'
                        : `Award ${v.vendorName}`}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
