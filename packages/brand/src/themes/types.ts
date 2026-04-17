/**
 * Theme shape — the single contract every tenant theme must satisfy.
 *
 * A theme is a complete visual + copy identity. Re-skinning for a new
 * tenant is done by producing a new `Theme` object and swapping it in
 * `packages/brand/src/config.ts`. Page components never know which
 * theme is active.
 */
import type { StaticImageData } from 'next/image';
import type {
  ColorTokens,
  TypographyTokens,
  SpacingTokens,
  RadiusTokens,
  ShadowTokens,
  MotionTokens,
} from '../tokens';

/** Typed logo asset references. Themes supply `StaticImageData` (from
 *  `next/image` static imports) so Next.js can bundle, optimize, and
 *  compute intrinsic dimensions at build time. */
export interface ThemeAssets {
  logoStandard: StaticImageData;
  logoReversed: StaticImageData;
  logoGray: StaticImageData;
  /** Optional favicon — themes may omit to keep platform default. */
  favicon?: StaticImageData;
}

/** Brand copy — localized strings owned by the theme layer, not by
 *  product pages. Product pages ask the brand package for these strings. */
export interface ThemeCopy {
  /** Product name shown in <title>, top-nav, sign-in. */
  productName: string;
  /** Short product name — used where space is constrained. */
  productShortName: string;
  /** Tagline — e.g. "We Create Fun". */
  tagline: string;
  /** One-line platform description shown on sign-in + about. */
  platformDescription: string;
  /** Organization owner name — e.g. "Pico Play Group". */
  organizationName: string;
  /** Legal footer line — e.g. "© 2026 Pico Play Pte Ltd". */
  legalFooter: string;
}

export interface Theme {
  /** Machine id — lowercase, hyphenated. Used for analytics and CSS scopes. */
  id: string;
  /** Human-readable name — used in about/settings screens. */
  name: string;
  /** Light + dark mode color tokens. Dark-mode values apply under `.dark`. */
  colors: { light: ColorTokens; dark: ColorTokens };
  typography: TypographyTokens;
  spacing: SpacingTokens;
  radius: RadiusTokens;
  shadows: ShadowTokens;
  motion: MotionTokens;
  assets: ThemeAssets;
  copy: ThemeCopy;
}
