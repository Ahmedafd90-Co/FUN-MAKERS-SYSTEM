'use client';

/**
 * Admin > Sheet Imports — cross-project list of ImportBatches.
 *
 * The review queue for a single batch lives under
 * `/admin/imports/[batchId]`. Upload is a dialog launched from this page.
 */

import { ImportBatchList } from '@/components/admin/import-batch-list';

export default function AdminImportsPage() {
  return <ImportBatchList />;
}
