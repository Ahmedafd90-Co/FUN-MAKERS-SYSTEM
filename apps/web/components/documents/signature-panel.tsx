'use client';

/**
 * Signature Panel — Task 1.6.11
 *
 * Shows signing status for the current document version.
 * - Unsigned: "Sign this document" button (requires document.sign permission).
 * - Signed: Signer info, date, hash excerpt, signature type.
 */

import { Badge } from '@fmksa/ui/components/badge';
import { Button } from '@fmksa/ui/components/button';
import { FileSignature, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@/lib/trpc-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Signature = {
  id: string;
  signerUserId: string;
  signatureType: string;
  signedAt: Date | string;
  hashAtSign: string;
};

type CurrentVersion = {
  id: string;
  versionNo: number;
  isSigned: boolean;
  signedAt: Date | string | null;
  signedBy: string | null;
  signatures: Signature[];
};

type SignaturePanelProps = {
  projectId: string;
  currentVersion: CurrentVersion | null;
  onSignComplete: () => void;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SignaturePanel({
  projectId,
  currentVersion,
  onSignComplete,
}: SignaturePanelProps) {
  const [signing, setSigning] = useState(false);

  const signMutation = trpc.documents.sign.useMutation({
    onSuccess: () => {
      toast.success('Document signed successfully.');
      onSignComplete();
    },
    onError: (err) => {
      toast.error(`Signing failed: ${err.message}`);
    },
    onSettled: () => {
      setSigning(false);
    },
  });

  if (!currentVersion) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold tracking-tight">Signature</h3>
        <p className="text-sm text-muted-foreground">
          No version uploaded. Upload a file to enable signing.
        </p>
      </div>
    );
  }

  const isSigned = currentVersion.isSigned;

  const handleSign = () => {
    setSigning(true);
    signMutation.mutate({
      projectId,
      versionId: currentVersion.id,
    });
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold tracking-tight">Signature</h3>

      {isSigned ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950">
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
                >
                  Signed
                </Badge>
                <span className="text-xs text-muted-foreground">
                  v{currentVersion.versionNo}
                </span>
              </div>

              {currentVersion.signatures.map((sig) => (
                <div key={sig.id} className="text-sm space-y-1">
                  <p className="text-foreground">
                    Signed by{' '}
                    <span className="font-medium">
                      {sig.signerUserId.slice(0, 8)}...
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(sig.signedAt)}
                  </p>
                  <p className="text-xs font-mono text-muted-foreground">
                    Hash: {sig.hashAtSign.slice(0, 16)}...
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">
                    Type: {sig.signatureType.replace('_', ' ')}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-4">
          <div className="flex items-start gap-3">
            <FileSignature className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                This version has not been signed yet. Signing verifies the file
                integrity by re-hashing the stored file and comparing it with
                the original upload hash.
              </p>
              <Button
                size="sm"
                onClick={handleSign}
                disabled={signing}
              >
                {signing ? 'Signing...' : 'Sign this document'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
