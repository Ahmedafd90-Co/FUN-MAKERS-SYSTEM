'use client';

/**
 * FeatureBlock — the single orange brand moment on the dashboard.
 *
 * The brand rule is: at most one orange feature per page, used for
 * emphasis, never as background flood. This block is context-aware:
 *
 *   - When the user has pending priority work, it surfaces the single
 *     most urgent call to action ("4 approvals need you", etc.).
 *   - When the queue is clear, it quietly celebrates with the brand
 *     tagline in a restrained composition — the logo lockup already
 *     carries "We Create Fun" so we don't repeat it in display weight.
 *
 * Visual treatment:
 *   - Soft orange surface (brand-orange-soft) with brand-orange edge
 *     stripe on the left. NOT a full orange flood.
 *   - Title in heading-section, body in body-sm.
 *   - Optional action CTA as a ghost link with arrow.
 */
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@fmksa/ui/lib/utils';

type FeatureBlockProps = {
  eyebrow: string;
  title: string;
  description: string;
  action?: { label: string; href: string } | undefined;
  tone?: 'orange' | 'quiet' | undefined;
};

export function FeatureBlock({
  eyebrow,
  title,
  description,
  action,
  tone = 'orange',
}: FeatureBlockProps) {
  const isOrange = tone === 'orange';

  return (
    <div
      className={cn(
        'relative h-full rounded-xl border shadow-sm overflow-hidden',
        isOrange
          ? 'bg-brand-orange-soft border-brand-orange/20'
          : 'bg-surface-sunken/50 border-border',
      )}
    >
      {/* Left edge stripe — the single orange accent. */}
      <span
        aria-hidden
        className={cn(
          'absolute left-0 top-0 bottom-0 w-[3px]',
          isOrange ? 'bg-brand-orange' : 'bg-brand-teal-ink/30',
        )}
      />
      <div className="p-5">
        <p className="text-label uppercase text-muted-foreground">{eyebrow}</p>
        <h2 className="mt-2 text-heading-section text-foreground">{title}</h2>
        <p className="mt-2 text-body-sm text-muted-foreground leading-snug">
          {description}
        </p>
        {action && (
          <Link
            href={action.href}
            className={cn(
              'mt-4 inline-flex items-center gap-1.5 text-body-sm font-medium',
              isOrange
                ? 'text-brand-orange hover:text-brand-orange/80'
                : 'text-brand-teal-ink hover:text-brand-teal-ink/80',
            )}
          >
            {action.label}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        )}
      </div>
    </div>
  );
}
