/**
 * Color tokens — shape definition only.
 *
 * Each theme provides concrete HSL triplet values (e.g. "173 100% 39%")
 * without the `hsl()` wrapper, so Tailwind's `hsl(var(--name) / <alpha-value>)`
 * pattern can compose with opacity modifiers.
 *
 * Status tokens are preserved from the Module 1 design spec §8.3 and must
 * never be replaced by brand colors — they carry semantic meaning in the
 * product.
 */
export type HslTriplet = string;

export interface ColorTokens {
  /** Brand identity palette. Decorative + interactive variants separated
   *  so white-on-teal passes WCAG AA on operational surfaces. */
  brand: {
    /** Decorative brand teal — used for motif, soft washes, selected-row
     *  tints. Never layer white text directly on this value. */
    teal: HslTriplet;
    /** Operational interactive teal — darker, WCAG-AA safe for white
     *  foreground on buttons, focus rings, active nav. */
    tealInk: HslTriplet;
    /** Very soft teal wash — selected rows, hover tints, gradient bases. */
    tealSoft: HslTriplet;
    /** Selective feature-emphasis orange. One appearance per page maximum. */
    orange: HslTriplet;
    /** Feature-block tint. Never for full-page backgrounds. */
    orangeSoft: HslTriplet;
    /** Dark hero anchor — sign-in, 404, premium strips only. */
    charcoal: HslTriplet;
    /** Premium neutral silver — meta text, borders. */
    silver: HslTriplet;
  };

  /** Surface archetypes — page, card, section. */
  surface: {
    canvas: HslTriplet;
    elevated: HslTriplet;
    sunken: HslTriplet;
  };

  /** Foreground text scale. */
  text: {
    primary: HslTriplet;
    secondary: HslTriplet;
    muted: HslTriplet;
    inverse: HslTriplet;
  };

  /** Borders — subtle for default UI, strong for emphasis (table heads, etc.). */
  border: {
    subtle: HslTriplet;
    strong: HslTriplet;
  };

  /** Glass surface tokens — for cards and form controls rendered on dark
   *  anchor surfaces (sign-in, forgot-password, 404 cinematic hero).
   *  Values are stored as full CSS color strings (not HSL triplets)
   *  because glass surfaces are defined by alpha, not by hue. */
  glass: {
    /** Card / container surface — barely-there translucent fill. */
    surface: string;
    /** Border around the glass surface. */
    surfaceBorder: string;
    /** Input background — slightly stronger than the card surface so
     *  inputs remain distinguishable against the glass card. */
    inputBg: string;
    /** Input border. */
    inputBorder: string;
    /** Input text color — effectively white at full opacity. */
    inputFg: string;
    /** Placeholder text — visibly muted against dark anchor. */
    placeholder: string;
    /** Label text — UPPERCASE tracked labels on glass. */
    label: string;
    /** Meta / supporting text — timestamps, hints. */
    muted: string;
    /** Hover / link text default. */
    link: string;
  };

  /** Shadcn-compatible semantic tokens. These drive the existing design
   *  system and must resolve to values that work with the rest of the UI. */
  semantic: {
    primary: HslTriplet;
    primaryForeground: HslTriplet;
    secondary: HslTriplet;
    secondaryForeground: HslTriplet;
    muted: HslTriplet;
    mutedForeground: HslTriplet;
    accent: HslTriplet;
    accentForeground: HslTriplet;
    destructive: HslTriplet;
    destructiveForeground: HslTriplet;
    ring: HslTriplet;
    input: HslTriplet;
  };

  /** Status chips — semantic, preserved across all themes. */
  status: {
    draft: HslTriplet;
    inReview: HslTriplet;
    approved: HslTriplet;
    rejected: HslTriplet;
    signed: HslTriplet;
    superseded: HslTriplet;
    exception: HslTriplet;
  };
}
