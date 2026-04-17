'use client';

import { BrandLogo } from '@fmksa/brand';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Honest placeholder — self-service password reset is not yet wired.
// Visual treatment mirrors sign-in: same anchor backdrop, same hero logo,
// same glass-surface chrome via brand tokens.
// ---------------------------------------------------------------------------

export function ForgotPasswordForm() {
  return (
    <div className="w-full max-w-sm space-y-10">
      <div className="flex items-center justify-center">
        <BrandLogo variant="reversed" size="hero" priority />
      </div>

      <div className="rounded-xl border border-glass-surface-border bg-glass-surface p-6 backdrop-blur-sm shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)]">
        <h1 className="text-heading-section text-glass-input-fg">
          Password reset
        </h1>
        <p className="mt-3 text-body-sm text-glass-muted">
          Self-service password reset is not yet available. Please contact your
          system administrator to reset your password.
        </p>

        <div className="mt-6 border-t border-glass-surface-border pt-5">
          <Link
            href="/sign-in"
            className="inline-flex items-center gap-1.5 text-body-sm text-glass-muted hover:text-white/90 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
