'use client';

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@fmksa/ui/components/card';
import { ArrowLeft } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Honest placeholder — email-based password reset is not yet wired.
// ---------------------------------------------------------------------------

export function ForgotPasswordForm() {
  return (
    <Card className="w-full max-w-md border-border bg-card">
      <CardHeader className="space-y-3 text-center">
        <Image
          src="/logo-colour.png"
          alt="Pico Play"
          width={160}
          height={42}
          priority
          className="mx-auto h-10 w-auto dark:hidden"
        />
        <Image
          src="/logo-colour-white.png"
          alt="Pico Play"
          width={160}
          height={42}
          priority
          className="mx-auto hidden h-10 w-auto dark:block"
        />
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
