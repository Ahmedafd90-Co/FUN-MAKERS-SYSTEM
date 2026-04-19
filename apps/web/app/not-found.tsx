import { BrandedBackdrop, BrandLogo } from '@fmksa/brand';
import Link from 'next/link';

/**
 * Root-level 404 — full cinematic anchor surface.
 *
 * Triggers when a user hits a URL that does not match any route at all
 * (including unauthenticated paths like `/random`). This is the only
 * 404 surface that runs outside the authenticated AppShell, so we give
 * it the full brand-hero treatment: charcoal anchor backdrop, reversed
 * hero logo, "We Create Fun" tagline, corner-frame brand marks.
 *
 * The in-shell 404 (apps/web/app/(app)/not-found.tsx) keeps a lighter
 * treatment so authenticated users retain their TopNav + context while
 * the page itself communicates "nothing here".
 */
export default function NotFound() {
  return (
    <>
      <BrandedBackdrop variant="anchor" withCornerFrames />
      <div className="relative flex min-h-screen items-center justify-center px-6 text-white/90">
        <div className="flex w-full max-w-xl flex-col items-center gap-7 text-center">
          {/* Reversed logo already carries the tagline — no second display
              tagline here, per brand rule. */}
          <BrandLogo variant="reversed" size="hero" priority />

          <div className="mt-1 flex flex-col items-center gap-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-white/40">
              404 — Page not found
            </p>
            <h1 className="text-[32px] leading-[40px] font-light tracking-[-0.015em] text-white sm:text-[40px] sm:leading-[48px]">
              This page doesn&apos;t exist.
            </h1>
            <p className="max-w-md text-[14px] leading-[22px] text-white/55">
              The link may be broken, or the page may have been moved. Head back
              to the dashboard and we&apos;ll pick up where you left off.
            </p>
          </div>

          {/* Single orange-accent CTA. Thin stripe, not a flood. */}
          <div className="mt-3 border-l-2 border-[hsl(var(--brand-orange))]">
            <Link
              href="/home"
              className="inline-flex h-10 items-center gap-2 rounded-r-md bg-[hsl(var(--brand-teal-ink))] px-5 text-[13px] font-medium tracking-[0.005em] text-white transition-colors hover:bg-[hsl(var(--brand-teal-ink)/0.9)]"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
