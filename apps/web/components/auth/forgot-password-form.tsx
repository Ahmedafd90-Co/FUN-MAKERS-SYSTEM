'use client';

import { BrandLogo } from '@fmksa/brand';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Honest placeholder — self-service password reset is not yet wired.
// Visual treatment mirrors sign-in so the auth surface reads as one
// continuous cinematic space when users move between the two pages.
// The reversed logo already carries the brand tagline — no standalone
// display tagline is added here.
// ---------------------------------------------------------------------------

export function ForgotPasswordForm() {
  return (
    <div className="w-full max-w-sm space-y-10">
      <div className="flex items-center justify-center">
        <BrandLogo variant="reversed" size="hero" priority />
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)]">
        <h1 className="text-[18px] leading-6 font-medium tracking-[0] text-white">
          Password reset
        </h1>
        <p className="mt-3 text-[13px] leading-5 text-white/60">
          Self-service password reset is not yet available. Please contact your
          system administrator to reset your password.
        </p>

        <div className="mt-6 border-t border-white/10 pt-5">
          <Link
            href="/sign-in"
            className="inline-flex items-center gap-1.5 text-[13px] text-white/60 hover:text-white/90 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
