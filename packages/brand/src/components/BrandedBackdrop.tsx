/**
 * BrandedBackdrop — fixed-position, aria-hidden, pointer-events-none layer
 * that sits behind the AppShell and conveys brand identity WITHOUT
 * competing with content.
 *
 * Four modes:
 *
 *   - `canvas`: default operational pages. White base with ultra-soft
 *     teal radials in corners and the triangle motif at ~2.5% opacity.
 *     Dense content lands in the viewport center where the wash is
 *     nearly invisible, so tables and forms stay on near-pure-white.
 *
 *   - `anchor`: dark hero surfaces (sign-in, forgot-password, 404).
 *     Near-black base with ambient teal + orange radials at low opacity
 *     plus the triangle motif at ~3%. Corner-frame marks optional via
 *     `withCornerFrames`.
 *
 *   - `feature`: reserved for the ONE highlight zone on a dashboard.
 *     Solid brand-teal or brand-orange panel; no motif applied here
 *     because the FeatureBlock component controls its own internals.
 *
 *   - `media`: placeholder for future image-led surfaces. Applies a
 *     strong overlay gradient so foreground remains readable on top
 *     of a background image the caller supplies.
 *
 * This component never introduces image payloads. CSS gradients + inline
 * SVG only. `position: fixed` + `z-index: -10` + `pointer-events: none`
 * keep it out of the way of every interaction.
 */
import { cva, type VariantProps } from 'class-variance-authority';
import { TriangleMotif, CornerFrameMotif } from './BrandMotif';
import { cn } from '../lib/cn';

const backdropStyles = cva('fixed inset-0 -z-10 pointer-events-none overflow-hidden', {
  variants: {
    variant: {
      canvas: 'bg-background',
      anchor: 'bg-[hsl(var(--brand-charcoal))]',
      feature: 'bg-[hsl(var(--brand-orange))]',
      media: 'bg-neutral-900',
    },
  },
  defaultVariants: { variant: 'canvas' },
});

export interface BrandedBackdropProps
  extends VariantProps<typeof backdropStyles> {
  /** Render corner-frame brackets in the four outer corners. Anchor only. */
  withCornerFrames?: boolean;
  /** Optional className to override layer positioning (rare). */
  className?: string;
}

export function BrandedBackdrop({
  variant = 'canvas',
  withCornerFrames = false,
  className,
}: BrandedBackdropProps) {
  return (
    <div aria-hidden className={cn(backdropStyles({ variant }), className)}>
      {variant === 'canvas' && <CanvasBackdrop />}
      {variant === 'anchor' && (
        <AnchorBackdrop withCornerFrames={withCornerFrames} />
      )}
      {variant === 'media' && <MediaBackdrop />}
      {/* `feature` renders a solid panel only — no extra layers. */}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal mode implementations
// ---------------------------------------------------------------------------

function CanvasBackdrop() {
  return (
    <>
      {/* Corner wash — top-left, bottom-right. Both use brand-teal-soft.
          Very low alpha; kept off-center so cards stay on near-pure white. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 60% at 0% 0%, hsl(var(--brand-teal-soft) / 0.6) 0%, transparent 55%),' +
            'radial-gradient(50% 50% at 100% 100%, hsl(var(--brand-teal-soft) / 0.4) 0%, transparent 55%)',
        }}
      />
      {/* Triangle motif tile — extremely low opacity, reads as texture. */}
      <div
        className="absolute inset-0 text-[hsl(var(--brand-teal))]"
        style={{ opacity: 0.025 }}
      >
        <TriangleTile />
      </div>
    </>
  );
}

function AnchorBackdrop({ withCornerFrames }: { withCornerFrames: boolean }) {
  return (
    <>
      {/* Ambient teal glow bottom-left */}
      <div
        className="absolute -bottom-32 -left-32 h-[520px] w-[520px] rounded-full blur-3xl"
        style={{ background: 'hsl(var(--brand-teal) / 0.06)' }}
      />
      {/* Ambient orange glow top-right */}
      <div
        className="absolute -top-32 -right-32 h-[520px] w-[520px] rounded-full blur-3xl"
        style={{ background: 'hsl(var(--brand-orange) / 0.05)' }}
      />
      {/* Triangle motif at ~3% white */}
      <div className="absolute inset-0 text-white" style={{ opacity: 0.03 }}>
        <TriangleTile />
      </div>
      {withCornerFrames && (
        <>
          <CornerFrameMotif
            className="absolute top-8 left-8 h-10 w-16 text-white/30"
          />
          <CornerFrameMotif
            className="absolute bottom-8 right-8 h-10 w-16 text-white/30"
          />
        </>
      )}
    </>
  );
}

function MediaBackdrop() {
  return (
    <div
      className="absolute inset-0"
      style={{
        background:
          'linear-gradient(180deg, hsl(var(--brand-charcoal) / 0.2) 0%, hsl(var(--brand-charcoal) / 0.9) 100%)',
      }}
    />
  );
}

/**
 * Tile the triangle motif across the full backdrop. Uses CSS
 * background-image with an inline-encoded SVG so we do not ship a file.
 * Tile size is large (240px) so the motif reads as subtle texture, not
 * pattern. Caller controls color via `text-*` and opacity via wrapper.
 */
function TriangleTile() {
  // Use the same SVG geometry as TriangleMotif.
  const svg = encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 36" fill="none" stroke="currentColor" stroke-width="1.5">' +
      '<path d="M20 4 L36 32 L4 32 Z" stroke-linejoin="miter" />' +
      '</svg>',
  );
  return (
    <div
      className="absolute inset-0"
      style={{
        backgroundImage: `url("data:image/svg+xml;utf8,${svg}")`,
        backgroundSize: '240px 216px',
        backgroundRepeat: 'repeat',
      }}
    />
  );
}

/** Re-export motifs so consumers can place them outside of a backdrop
 *  (e.g. inside an EmptyState card). */
export { CornerFrameMotif, TriangleMotif } from './BrandMotif';
