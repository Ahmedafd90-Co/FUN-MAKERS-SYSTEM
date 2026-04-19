/**
 * BrandMotif — subtle SVG marks used on anchor surfaces (sign-in, 404)
 * and as the canvas-background texture on normal pages.
 *
 * Each motif is `aria-hidden` and `pointer-events: none`. Motifs are
 * decorative only; never carry information.
 *
 * Three motifs are provided:
 *
 *   1. `corner-frame` — the white corner-bracket marks that appear in the
 *      brand "We Create Fun" application image. Used to frame content on
 *      anchor surfaces (sign-in card, 404 hero) and rarely as a small
 *      accent on empty-state cards.
 *
 *   2. `triangle` — the "\u0394" mark from the PicoPL\u0394Y logotype. Used as
 *      an extremely low-opacity background texture on the canvas backdrop.
 *      Readers never perceive it as a shape; it reads as premium texture.
 *
 *   3. `diagonal-strip` — the diagonal two-tone slash from the brand's
 *      newsletter composition. Reserved for FeatureBlock panels on the
 *      dashboard (one per page max).
 *
 * Component is render-agnostic. Callers size and position it via
 * wrapping elements; motifs scale to their container.
 */
import type { SVGProps } from 'react';

type MotifProps = Omit<SVGProps<SVGSVGElement>, 'children'>;

/** Corner-frame mark — four brackets surrounding a rectangle.
 *  Use around a hero block, empty-state illustration, or card of emphasis. */
export function CornerFrameMotif(props: MotifProps) {
  return (
    <svg
      viewBox="0 0 120 80"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
      {...props}
    >
      {/* Top-left */}
      <path d="M4 20 L4 4 L20 4" strokeLinecap="square" />
      {/* Top-right */}
      <path d="M100 4 L116 4 L116 20" strokeLinecap="square" />
      {/* Bottom-left */}
      <path d="M4 60 L4 76 L20 76" strokeLinecap="square" />
      {/* Bottom-right */}
      <path d="M100 76 L116 76 L116 60" strokeLinecap="square" />
    </svg>
  );
}

/** Triangle mark — the "\u0394" from the PicoPL\u0394Y logotype, as a standalone
 *  geometric device. Outline only; callers apply `opacity` for texture use. */
export function TriangleMotif(props: MotifProps) {
  return (
    <svg
      viewBox="0 0 40 36"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
      {...props}
    >
      <path d="M20 4 L36 32 L4 32 Z" strokeLinejoin="miter" />
    </svg>
  );
}

/** Diagonal strip — two overlapping parallelograms at ~20\u00B0.
 *  Use only inside a FeatureBlock; never on operational content. */
export function DiagonalStripMotif(props: MotifProps) {
  return (
    <svg
      viewBox="0 0 200 120"
      fill="currentColor"
      aria-hidden
      {...props}
    >
      <path d="M0 120 L60 0 L120 0 L60 120 Z" opacity="0.9" />
      <path d="M80 120 L140 0 L200 0 L140 120 Z" opacity="0.6" />
    </svg>
  );
}
