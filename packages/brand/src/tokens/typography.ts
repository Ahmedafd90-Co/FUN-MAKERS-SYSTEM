/**
 * Typography tokens — shape definition.
 *
 * Each theme provides a font-family name (resolved to a CSS variable at the
 * app boundary via `next/font`) and a strict scale with size, line-height,
 * weight, tracking, and case. Tokens are consumed by Tailwind preset +
 * component primitives — never hard-coded in pages.
 *
 * Weight rules (enforced by convention, not runtime):
 *   - 300 (Light): display / hero / KPI numbers only. Never under 20px.
 *   - 400 (Regular): all body, all table cells, field values.
 *   - 500 (Medium): labels, buttons, badges, table headers, section headings.
 *   - 600 (Semibold): inline emphasis only. Never ambient chrome.
 */
export type TypographyWeight = 300 | 400 | 500 | 600;
export type TypographyCase = 'regular' | 'uppercase';

export interface TypographyRole {
  /** CSS `font-size` value in px (converted to rem by Tailwind). */
  size: number;
  /** CSS `line-height` value in px (converted to ratio or rem). */
  lineHeight: number;
  /** Font weight. */
  weight: TypographyWeight;
  /** Letter-spacing in em. Negative values for display sizes only. */
  tracking: number;
  /** Text case. `uppercase` is reserved for labels and badges. */
  case: TypographyCase;
}

export interface TypographyTokens {
  /** Font-family name. Use together with a CSS variable bound by `next/font`. */
  family: {
    sans: string;
    mono: string;
  };
  /** CSS variable names exposed by `next/font` for each family. */
  cssVar: {
    sans: string;
    mono: string;
  };
  /** Strict type scale — every role has exactly one style. */
  scale: {
    displayHero: TypographyRole;
    displaySection: TypographyRole;
    headingPage: TypographyRole;
    headingSection: TypographyRole;
    headingSubsection: TypographyRole;
    body: TypographyRole;
    bodySmall: TypographyRole;
    label: TypographyRole;
    meta: TypographyRole;
    tableHeader: TypographyRole;
    tableCell: TypographyRole;
    kpiNumber: TypographyRole;
    kpiDelta: TypographyRole;
    button: TypographyRole;
    badge: TypographyRole;
  };
}
