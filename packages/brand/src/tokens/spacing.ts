/**
 * Spacing tokens — shape definition.
 *
 * The base 4-pt scale comes from Tailwind defaults and is untouched.
 * Brand-specific aliases are provided for layout primitives (gutters,
 * hero padding) to keep page composition consistent across tenants.
 */
export interface SpacingTokens {
  gutter: {
    xs: number; // 8 — tight rows (e.g. metadata chips)
    sm: number; // 12 — compact card padding
    md: number; // 16 — default card padding
    lg: number; // 24 — section padding
    xl: number; // 40 — page padding at md+
    hero: number; // 72 — dark hero vertical rhythm
  };
}
