const defaultTheme = require('tailwindcss/defaultTheme');

/**
 * Shared Tailwind preset for the Fun Makers KSA monorepo.
 *
 * Extends (never replaces) Tailwind defaults and exposes:
 *   - HSL color tokens compatible with shadcn/ui (consumed via CSS variables
 *     rendered from the active theme in @fmksa/brand and injected by the
 *     app's root layout as a <style> tag)
 *   - Source Sans 3 as the default sans-serif font and Geist Mono as the
 *     monospace family, both wired through CSS variables set by next/font
 *     in layout.tsx (--font-sans, --font-mono)
 *   - Status chip tokens from the Module 1 design spec §8.3
 *   - Brand tokens (teal, orange, charcoal, silver) exposed for decorative
 *     surfaces; operational teal comes through `primary` which resolves to
 *     the WCAG-safe darker variant
 *
 * Color values use the `hsl(var(--name) / <alpha-value>)` pattern so that
 * Tailwind opacity modifiers (e.g. `bg-primary/50`) work correctly.
 *
 * Consumers: `tailwind.config.ts` -> `presets: [require('@fmksa/config/tailwind/preset')]`.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: [],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', ...defaultTheme.fontFamily.sans],
        mono: ['var(--font-mono)', ...defaultTheme.fontFamily.mono],
      },
      // --------------------------------------------------------------
      // Typography scale tokens — mirrors the active theme scale in
      // @fmksa/brand/themes/pico-play (typography.scale). Named after
      // the role each size plays in the product (not the pixel size)
      // so tenant themes can re-tune values without renaming classes.
      //
      // Weight rules encoded in the defaults:
      //   - Light (300): display + KPI only
      //   - Regular (400): all body, all table cells
      //   - Medium (500): labels, buttons, badges, table headers,
      //                    section headings, button text
      //
      // Usage: `<h1 className="text-heading-page">...</h1>`
      //        `<p className="text-body">...</p>`
      //        `<th className="text-th">...</th>`
      //
      // IMPORTANT: if you change these here, also update the matching
      // values in packages/brand/src/themes/pico-play/index.ts so the
      // theme token source and the Tailwind classes stay in lockstep.
      // --------------------------------------------------------------
      fontSize: {
        'display-hero': ['3rem', { lineHeight: '3.5rem', letterSpacing: '-0.02em', fontWeight: '300' }],
        'display-section': ['2rem', { lineHeight: '2.5rem', letterSpacing: '-0.015em', fontWeight: '300' }],
        'heading-page': ['1.5rem', { lineHeight: '2rem', letterSpacing: '-0.005em', fontWeight: '400' }],
        'heading-section': ['1.125rem', { lineHeight: '1.5rem', letterSpacing: '0', fontWeight: '500' }],
        'heading-sub': ['0.9375rem', { lineHeight: '1.25rem', letterSpacing: '0', fontWeight: '500' }],
        body: ['0.875rem', { lineHeight: '1.375rem', letterSpacing: '0', fontWeight: '400' }],
        'body-sm': ['0.8125rem', { lineHeight: '1.25rem', letterSpacing: '0', fontWeight: '400' }],
        label: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.08em', fontWeight: '500' }],
        meta: ['0.75rem', { lineHeight: '1rem', letterSpacing: '0', fontWeight: '400' }],
        th: ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.04em', fontWeight: '500' }],
        td: ['0.8125rem', { lineHeight: '1.25rem', letterSpacing: '0', fontWeight: '400' }],
        kpi: ['2rem', { lineHeight: '2.25rem', letterSpacing: '-0.025em', fontWeight: '300' }],
        btn: ['0.8125rem', { lineHeight: '1.25rem', letterSpacing: '0.005em', fontWeight: '500' }],
        'badge-sm': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.04em', fontWeight: '500' }],
      },
      colors: {
        // Neutral + accent tokens (HSL CSS variables, shadcn/ui compatible).
        // Uses `hsl(var(--name) / <alpha-value>)` so Tailwind opacity modifiers work.
        border: 'hsl(var(--border) / <alpha-value>)',
        // Stronger border for table head underlines and emphasized card
        // edges. Opt-in via `border-border-strong`.
        'border-strong': 'hsl(var(--border-strong) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        // Shell surface tokens — lifted or sunken one shade from the page
        // background. Reserved for top-nav, sidebars, and auth backdrop.
        // Consumers opt in via `bg-surface-elevated` / `bg-surface-sunken`.
        // `surface` alone aliases to the page background for clarity.
        surface: {
          DEFAULT: 'hsl(var(--background) / <alpha-value>)',
          elevated: 'hsl(var(--surface-elevated) / <alpha-value>)',
          sunken: 'hsl(var(--surface-sunken) / <alpha-value>)',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
          foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
          foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
          foreground: 'hsl(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          foreground: 'hsl(var(--accent-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
          foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover) / <alpha-value>)',
          foreground: 'hsl(var(--popover-foreground) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'hsl(var(--card) / <alpha-value>)',
          foreground: 'hsl(var(--card-foreground) / <alpha-value>)',
        },
        // Status chip tokens (spec §8.3). Each token maps to a CSS variable the
        // consuming app exposes so we can tweak the palette in one place.
        status: {
          draft: 'hsl(var(--status-draft) / <alpha-value>)',
          'in-review': 'hsl(var(--status-in-review) / <alpha-value>)',
          approved: 'hsl(var(--status-approved) / <alpha-value>)',
          rejected: 'hsl(var(--status-rejected) / <alpha-value>)',
          signed: 'hsl(var(--status-signed) / <alpha-value>)',
          superseded: 'hsl(var(--status-superseded) / <alpha-value>)',
          exception: 'hsl(var(--status-exception) / <alpha-value>)',
        },
        // Pico Play brand tokens. `brand-teal` is the bright decorative teal;
        // `brand-orange` is a restrained interactive accent. Do not layer
        // white text on `brand-teal` — use `primary` for that (it resolves to
        // a darker operational teal that passes WCAG AA with white text).
        // `brand-teal-soft` and `brand-orange-soft` are very light washes
        // intended for selected-row tints, active-step glows, and other
        // decorative subtleties — never for text backgrounds.
        brand: {
          // Decorative brand teal (Pantone 3265C, #00C7B1). Never layer
          // white text directly — use `primary` for that.
          teal: 'hsl(var(--brand-teal) / <alpha-value>)',
          // Operational interactive teal — WCAG-AA white-on-teal.
          'teal-ink': 'hsl(var(--brand-teal-ink) / <alpha-value>)',
          'teal-soft': 'hsl(var(--brand-teal-soft) / <alpha-value>)',
          // Feature emphasis only — one appearance per page maximum.
          orange: 'hsl(var(--brand-orange) / <alpha-value>)',
          'orange-soft': 'hsl(var(--brand-orange-soft) / <alpha-value>)',
          // Dark hero anchor (sign-in, 404). Warmer than #000, reads premium.
          charcoal: 'hsl(var(--brand-charcoal) / <alpha-value>)',
          // Premium neutral — meta text, refined borders.
          silver: 'hsl(var(--brand-silver) / <alpha-value>)',
        },
        // Glass-surface tokens — translucent values used on dark anchor
        // surfaces (sign-in, forgot-password, 404 hero). Values live in
        // the active theme; we expose them as CSS variables that resolve
        // to full rgba() strings, so Tailwind opacity utilities DO NOT
        // compose on top of these (alpha is already baked in).
        glass: {
          surface: 'var(--glass-surface)',
          'surface-border': 'var(--glass-surface-border)',
          'input-bg': 'var(--glass-input-bg)',
          'input-border': 'var(--glass-input-border)',
          'input-fg': 'var(--glass-input-fg)',
          placeholder: 'var(--glass-placeholder)',
          label: 'var(--glass-label)',
          muted: 'var(--glass-muted)',
          link: 'var(--glass-link)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
};
