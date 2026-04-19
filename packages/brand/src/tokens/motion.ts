/**
 * Motion tokens — shape definition.
 *
 * Three speeds, restrained easings. Premium means restrained, never bouncy.
 */
export interface MotionTokens {
  /** 120ms — immediate feedback (hover, press). */
  fast: { duration: string; easing: string };
  /** 200ms — default (drawers, menus, tabs). */
  default: { duration: string; easing: string };
  /** 320ms — deliberate surfaces (dialog, sheet, page transitions). */
  deliberate: { duration: string; easing: string };
}
