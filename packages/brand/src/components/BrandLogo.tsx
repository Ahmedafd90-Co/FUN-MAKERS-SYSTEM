/**
 * BrandLogo — single source of truth for every logo placement in the product.
 *
 * Usage:
 *   <BrandLogo variant="standard" size="sm" />
 *   <BrandLogo variant="reversed" size="hero" />
 *   <BrandLogo variant="gray" size="md" />
 *
 * Rules enforced here so pages cannot accidentally break them:
 *   - No distortion: `width` and `height` come from the StaticImageData
 *     intrinsic ratio, and only the rendered size class varies.
 *   - No gradients, no filters, no opacity tricks.
 *   - Variant selection is typed — callers cannot invent variants.
 *   - The `alt` text always resolves to the active theme's product name,
 *     so tenant swaps automatically update screen-reader output.
 */
import Image from 'next/image';
import { cva, type VariantProps } from 'class-variance-authority';
import { activeTheme } from '../config';
import { cn } from '../lib/cn';

const logoStyles = cva('object-contain select-none', {
  variants: {
    size: {
      /** Top-nav, breadcrumbs, tight chrome. */
      xs: 'h-6 w-auto',
      /** Default top-nav size. */
      sm: 'h-8 w-auto',
      /** Sign-in card header, inline emphasis. */
      md: 'h-10 w-auto',
      /** Large anchor surfaces that still share the page. */
      lg: 'h-14 w-auto',
      /** Sign-in / 404 hero — the logo IS the page. */
      hero: 'h-16 w-auto sm:h-20',
    },
  },
  defaultVariants: { size: 'sm' },
});

type BrandLogoVariant = 'standard' | 'reversed' | 'gray';

export interface BrandLogoProps
  extends VariantProps<typeof logoStyles> {
  /** Which logo artwork to render.
   *   - `standard`: full-color, for light/neutral backgrounds.
   *   - `reversed`: white/silver, for dark backgrounds (sign-in, 404).
   *   - `gray`:     monochrome gray, for low-emphasis contexts. */
  variant: BrandLogoVariant;
  /** Override the alt text. Defaults to active theme product name. */
  alt?: string;
  /** Prioritize the image (above-the-fold). */
  priority?: boolean;
  /** Optional class-name merge for layout only — do not restyle the logo. */
  className?: string;
}

export function BrandLogo({
  variant,
  size,
  alt,
  priority = false,
  className,
}: BrandLogoProps) {
  const source =
    variant === 'standard'
      ? activeTheme.assets.logoStandard
      : variant === 'reversed'
        ? activeTheme.assets.logoReversed
        : activeTheme.assets.logoGray;

  return (
    <Image
      src={source}
      alt={alt ?? activeTheme.copy.productName}
      priority={priority}
      className={cn(logoStyles({ size }), className)}
      // Next.js uses the StaticImageData width/height to preserve ratio.
      // Rendered size comes from the className (height-only, auto width).
      sizes="(max-width: 640px) 160px, 240px"
      draggable={false}
    />
  );
}
