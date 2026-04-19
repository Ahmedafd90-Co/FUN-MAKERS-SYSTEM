/**
 * Border-radius tokens — shape definition.
 *
 * Kept explicit so themes can dial radius up or down to shift tone without
 * touching components. Pico Play reads as premium at small radii; a more
 * playful tenant could use larger.
 */
export interface RadiusTokens {
  xs: number; // 2 — chips, tight inputs
  sm: number; // 4
  md: number; // 8 — cards (matches existing --radius)
  lg: number; // 12 — hero cards, primary surfaces
  xl: number; // 16 — dialogs, sheets
  full: number; // 9999 — avatars, pills
}
