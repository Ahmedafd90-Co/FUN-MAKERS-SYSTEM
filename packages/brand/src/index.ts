/**
 * @fmksa/brand — brand-configuration layer for the platform.
 *
 * Public API:
 *   - `activeTheme`     — the currently active theme (swap to re-skin)
 *   - `brandCssVars`    — CSS variables string (inject in root layout)
 *   - Components: BrandLogo, BrandTagline, BrandedBackdrop, BrandMotif variants
 *   - Types: Theme, ColorTokens, TypographyTokens, ...
 *
 * What this package does NOT ship:
 *   - Business logic
 *   - UI primitives beyond brand assets (use @fmksa/ui for Card/Button/etc.)
 *   - Tenant-specific page content (lives in theme copy only)
 */
export { activeTheme } from './config';
export { brandCssVars } from './css-vars';

export {
  BrandLogo,
  type BrandLogoProps,
  BrandTagline,
  type BrandTaglineProps,
  BrandedBackdrop,
  type BrandedBackdropProps,
  CornerFrameMotif,
  TriangleMotif,
  DiagonalStripMotif,
} from './components';

export type { Theme, ThemeAssets, ThemeCopy } from './themes/types';
export type {
  ColorTokens,
  TypographyTokens,
  TypographyRole,
  TypographyWeight,
  TypographyCase,
  SpacingTokens,
  RadiusTokens,
  ShadowTokens,
  MotionTokens,
  HslTriplet,
} from './tokens';
