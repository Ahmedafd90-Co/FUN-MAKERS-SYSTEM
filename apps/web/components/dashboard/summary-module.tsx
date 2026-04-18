'use client';

/**
 * SummaryModule — titled container for grouped signal rows on the dashboard.
 *
 * Renders a Card with:
 *   - Eyebrow + title + optional helper text
 *   - Body slot for SignalRow / project list / activity stream
 *   - Optional footer CTA link
 *
 * Used by the dashboard for: Commercial Signals, Procurement Signals,
 * Portfolio, Activity Stream. Keeps composition consistent across zones.
 */
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
} from '@fmksa/ui/components/card';

type SummaryModuleProps = {
  eyebrow: string;
  title: string;
  helper?: string | undefined;
  footerLink?: { label: string; href: string } | undefined;
  children: React.ReactNode;
};

export function SummaryModule({
  eyebrow,
  title,
  helper,
  footerLink,
  children,
}: SummaryModuleProps) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="space-y-1">
        <p className="text-label uppercase text-muted-foreground">{eyebrow}</p>
        <h2 className="text-heading-section text-foreground">{title}</h2>
        {helper && (
          <p className="text-body-sm text-muted-foreground">{helper}</p>
        )}
      </CardHeader>
      <CardContent className="flex-1">{children}</CardContent>
      {footerLink && (
        <div className="border-t border-border px-6 py-3">
          <Link
            href={footerLink.href}
            className="inline-flex items-center gap-1.5 text-body-sm font-medium text-brand-teal-ink hover:text-brand-teal-ink/80"
          >
            {footerLink.label}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      )}
    </Card>
  );
}
