/**
 * CSS variable generator — renders the active theme as a CSS string
 * that the consuming app injects into a `<style>` tag at the top of the
 * document.
 *
 * Why this exists:
 *   - `globals.css` previously hard-coded Pico Play HSL values in `:root`
 *     and `.dark` blocks. That is not re-skinnable — a tenant swap would
 *     require editing globals.css.
 *   - Now `globals.css` carries only structural rules (imports, resets,
 *     shadcn layer directives). All brand-specific HSL values live in
 *     the theme object and are rendered to CSS at runtime via this file.
 *
 * The app's root layout imports `brandCssVars` and injects it inside a
 * single `<style>` tag. The string is static per build, so there is no
 * runtime cost beyond the initial parse.
 */
import { activeTheme } from './config';
import type { ColorTokens } from './tokens/colors';

function colorsToCss(colors: ColorTokens): string {
  return [
    `--background: ${colors.surface.canvas};`,
    `--foreground: ${colors.text.primary};`,
    `--card: ${colors.surface.canvas};`,
    `--card-foreground: ${colors.text.primary};`,
    `--popover: ${colors.surface.canvas};`,
    `--popover-foreground: ${colors.text.primary};`,
    `--primary: ${colors.semantic.primary};`,
    `--primary-foreground: ${colors.semantic.primaryForeground};`,
    `--secondary: ${colors.semantic.secondary};`,
    `--secondary-foreground: ${colors.semantic.secondaryForeground};`,
    `--muted: ${colors.semantic.muted};`,
    `--muted-foreground: ${colors.semantic.mutedForeground};`,
    `--accent: ${colors.semantic.accent};`,
    `--accent-foreground: ${colors.semantic.accentForeground};`,
    `--destructive: ${colors.semantic.destructive};`,
    `--destructive-foreground: ${colors.semantic.destructiveForeground};`,
    `--border: ${colors.border.subtle};`,
    `--input: ${colors.semantic.input};`,
    `--ring: ${colors.semantic.ring};`,
    // Status tokens — preserved semantic meaning across tenants.
    `--status-draft: ${colors.status.draft};`,
    `--status-in-review: ${colors.status.inReview};`,
    `--status-approved: ${colors.status.approved};`,
    `--status-rejected: ${colors.status.rejected};`,
    `--status-signed: ${colors.status.signed};`,
    `--status-superseded: ${colors.status.superseded};`,
    `--status-exception: ${colors.status.exception};`,
    // Brand tokens — decorative vs. operational variants.
    `--brand-teal: ${colors.brand.teal};`,
    `--brand-teal-ink: ${colors.brand.tealInk};`,
    `--brand-teal-soft: ${colors.brand.tealSoft};`,
    `--brand-orange: ${colors.brand.orange};`,
    `--brand-orange-soft: ${colors.brand.orangeSoft};`,
    `--brand-charcoal: ${colors.brand.charcoal};`,
    `--brand-silver: ${colors.brand.silver};`,
    // Surface variants.
    `--surface-elevated: ${colors.surface.elevated};`,
    `--surface-sunken: ${colors.surface.sunken};`,
    `--border-strong: ${colors.border.strong};`,
  ].join(' ');
}

function radiusToCss(): string {
  const r = activeTheme.radius;
  return [
    `--radius-xs: ${r.xs}px;`,
    `--radius-sm: ${r.sm}px;`,
    `--radius: ${r.md}px;`,
    `--radius-md: ${r.md}px;`,
    `--radius-lg: ${r.lg}px;`,
    `--radius-xl: ${r.xl}px;`,
    `--radius-full: ${r.full}px;`,
  ].join(' ');
}

function shadowsToCss(): string {
  const s = activeTheme.shadows;
  return [
    `--shadow-card: ${s.card};`,
    `--shadow-hover: ${s.hover};`,
    `--shadow-popover: ${s.popover};`,
    `--shadow-command: ${s.command};`,
    `--shadow-focus: ${s.focus};`,
  ].join(' ');
}

/**
 * The full CSS variable block for the active theme.
 * Consumers inject this string into a `<style>` tag in the root layout.
 */
export const brandCssVars: string = `
:root {
  ${colorsToCss(activeTheme.colors.light)}
  ${radiusToCss()}
  ${shadowsToCss()}
}
.dark {
  ${colorsToCss(activeTheme.colors.dark)}
}
`;
