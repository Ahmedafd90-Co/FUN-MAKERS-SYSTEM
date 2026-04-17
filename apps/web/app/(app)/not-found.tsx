import { BrandLogo } from '@fmksa/brand';
import { Button } from '@fmksa/ui/components/button';
import { FileQuestion } from 'lucide-react';
import Link from 'next/link';

/**
 * In-shell 404 — lighter branded treatment rendered inside the
 * authenticated AppShell. Users keep their TopNav + navigation context;
 * the page body communicates "nothing here" without hijacking the whole
 * viewport with the cinematic anchor surface.
 *
 * The fully cinematic 404 lives at apps/web/app/not-found.tsx and
 * handles unauthenticated / unrouted paths.
 */
export default function AppNotFound() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-20 lg:px-8">
      <div className="flex flex-col items-center gap-6 text-center">
        <BrandLogo variant="standard" size="sm" />

        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[hsl(var(--brand-teal))/0.2] bg-[hsl(var(--brand-teal-soft))]">
          <FileQuestion className="h-6 w-6 text-[hsl(var(--brand-teal-ink))]" />
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            404 — Page not found
          </p>
          <h1 className="text-[24px] leading-[32px] font-normal tracking-[-0.005em] text-foreground">
            This page doesn&apos;t exist.
          </h1>
          <p className="max-w-md text-[14px] leading-[22px] text-muted-foreground">
            The page you&apos;re looking for doesn&apos;t exist or has been
            moved. Check the URL, or head back to the dashboard.
          </p>
        </div>

        <Button size="sm" asChild>
          <Link href="/home">Back to Home</Link>
        </Button>
      </div>
    </div>
  );
}
