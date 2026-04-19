/**
 * BrandTagline — renders the active theme's tagline.
 *
 * Three variants matching the role the tagline plays on a given surface:
 *   - `hero`:   large display weight, for sign-in + 404 dark anchor screens.
 *   - `inline`: body size, for occasional supporting placements.
 *   - `eyebrow`: tiny tracked uppercase, above a page title or in a footer.
 *
 * Rules:
 *   - Tagline text always comes from `activeTheme.copy.tagline`. Never
 *     hard-code "We Create Fun" in page components.
 *   - Tagline is a supporting line. Never the primary app title.
 */
import { cva, type VariantProps } from 'class-variance-authority';
import { activeTheme } from '../config';
import { cn } from '../lib/cn';

const taglineStyles = cva('select-none', {
  variants: {
    variant: {
      hero:
        'font-light text-[32px] leading-[40px] tracking-[-0.015em] sm:text-[40px] sm:leading-[48px]',
      inline: 'text-[14px] leading-[22px] font-normal',
      eyebrow: 'text-[11px] leading-[16px] font-medium uppercase tracking-[0.3em]',
    },
    tone: {
      /** Default — inherits current color. */
      inherit: '',
      /** For dark anchor surfaces — white at 80% opacity. */
      onDark: 'text-white/80',
      /** For light surfaces — muted foreground. */
      muted: 'text-muted-foreground',
    },
  },
  defaultVariants: { variant: 'inline', tone: 'inherit' },
});

export interface BrandTaglineProps
  extends VariantProps<typeof taglineStyles> {
  className?: string;
  as?: 'p' | 'span' | 'div';
}

export function BrandTagline({
  variant,
  tone,
  className,
  as: Component = 'p',
}: BrandTaglineProps) {
  return (
    <Component className={cn(taglineStyles({ variant, tone }), className)}>
      {activeTheme.copy.tagline}
    </Component>
  );
}
