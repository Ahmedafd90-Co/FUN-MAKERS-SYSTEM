'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@fmksa/ui/components/card';

type Props = {
  projectId: string;
};

/**
 * Prime Contract — project workspace tab (Stage 1 placeholder).
 *
 * Stage 3 will wire this to `trpc.layer1.primeContract.get({ projectId })`,
 * render the prime-contract details (counterparty, value, dates, status) plus
 * `<TransitionActions>` for sign / activate / complete / terminate / cancel,
 * gated by `prime_contract.view` and the per-action transition permissions.
 *
 * Marked as Client Component because Stage 3 will need state for the
 * transition modal and tRPC mutation feedback.
 */
export function PrimeContractTab({ projectId: _projectId }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Coming in Stage 3</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        The prime contract for this project will render here. Will use{' '}
        <code className="text-xs">trpc.layer1.primeContract.get</code> with
        permission gating on <code className="text-xs">prime_contract.view</code>{' '}
        and per-action transition permissions
        (<code className="text-xs">sign</code>, <code className="text-xs">activate</code>,
        <code className="text-xs">complete</code>, <code className="text-xs">terminate</code>,
        <code className="text-xs">cancel</code>).
      </CardContent>
    </Card>
  );
}
