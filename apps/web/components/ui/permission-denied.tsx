'use client';

import { Button } from '@fmksa/ui/components/button';
import { ShieldOff } from 'lucide-react';
import Link from 'next/link';

export function PermissionDenied() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <ShieldOff className="h-10 w-10 text-muted-foreground/40" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">Access denied</p>
        <p className="text-sm text-muted-foreground">
          You don&apos;t have permission to view this page.
        </p>
      </div>
      <Button variant="outline" size="sm" asChild>
        <Link href="/home">Go to Home</Link>
      </Button>
    </div>
  );
}
