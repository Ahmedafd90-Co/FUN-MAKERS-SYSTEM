/**
 * Shadow tokens — shape definition.
 *
 * Premium feel comes from soft, low-offset shadows. Avoid heavy drop-shadows.
 * Each theme supplies concrete `box-shadow` CSS strings.
 */
export interface ShadowTokens {
  /** Default card — barely visible lift. */
  card: string;
  /** Hover state — marginal additional lift. */
  hover: string;
  /** Popovers, menus — stronger but not dramatic. */
  popover: string;
  /** Command palette, dialog — largest; only for modal-equivalent surfaces. */
  command: string;
  /** Focus ring — brand-teal glow. */
  focus: string;
}
