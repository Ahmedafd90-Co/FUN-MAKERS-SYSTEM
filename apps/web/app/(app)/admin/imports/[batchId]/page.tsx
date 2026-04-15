'use client';

/**
 * Admin > Sheet Imports > Batch detail — the per-batch review queue,
 * action bar, and commit / reject / cancel confirmations.
 */

import { use } from 'react';

import { ImportBatchDetail } from '@/components/admin/import-batch-detail';

export default function ImportBatchPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = use(params);
  return <ImportBatchDetail batchId={batchId} />;
}
