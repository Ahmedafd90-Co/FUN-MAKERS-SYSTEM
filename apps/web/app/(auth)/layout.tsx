import { BrandedBackdrop } from '@fmksa/brand';

/**
 * Auth layout — cinematic dark-hero surface.
 *
 * Used by /sign-in, /forgot-password, and future auth-related pages.
 * All children render above a fixed-position <BrandedBackdrop variant="anchor">
 * which paints the near-black charcoal base, the ambient teal + orange
 * radial glows, the low-opacity triangle motif, and the optional corner
 * frame brackets derived from the brand "We Create Fun" application.
 *
 * Text defaults to white/90 so form labels and copy remain readable
 * without every child having to override color.
 */
export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <BrandedBackdrop variant="anchor" withCornerFrames />
      <div className="relative flex min-h-screen items-center justify-center px-4 py-10 text-white/90">
        {children}
      </div>
    </>
  );
}
