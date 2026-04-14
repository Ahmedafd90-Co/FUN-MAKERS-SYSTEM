'use client';

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@fmksa/ui/components/card';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Honest placeholder — email-based password reset is not yet wired.
// ---------------------------------------------------------------------------

export function ForgotPasswordForm() {
  return (
    <Card className="w-full max-w-md border-border bg-card">
      <CardHeader className="space-y-1 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <ShieldAlert className="h-6 w-6 text-muted-foreground" />
        </div>
        <CardTitle className="text-xl font-bold tracking-tight">
          Password Reset
        </CardTitle>
      </CardHeader>

      <CardContent>
        <p className="text-sm text-muted-foreground text-center leading-relaxed">
          Self-service password reset is not yet available. Please contact your
          system administrator to reset your password.
        </p>
      </CardContent>

      <CardFooter className="flex justify-center">
        <Link
          href="/sign-in"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to sign in
        </Link>
      </CardFooter>
    </Card>
  );
}
