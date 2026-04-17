/**
 * Tenant-blank — theme scaffold.
 *
 * Use this file as the starting point for a new tenant. Duplicate the
 * folder, rename it, replace copy + assets, tune colors and radius to
 * match the new brand, then switch the active theme in
 * `packages/brand/src/config.ts`.
 *
 * Values below are intentionally neutral. They match the platform defaults
 * so a rename without customization still produces a working product.
 */
import type { Theme } from '../types';
import logoStandard from './assets/logo-standard.png';
import logoReversed from './assets/logo-reversed.png';
import logoGray from './assets/logo-gray.png';
import { tenantBlankCopyEn } from './copy-en';

export const tenantBlankTheme: Theme = {
  id: 'tenant-blank',
  name: 'Tenant (Blank)',

  colors: {
    light: {
      brand: {
        teal: '200 50% 45%',
        tealInk: '200 60% 30%',
        tealSoft: '200 100% 95%',
        orange: '25 90% 55%',
        orangeSoft: '25 100% 95%',
        charcoal: '0 0% 10%',
        silver: '220 5% 65%',
      },
      surface: { canvas: '0 0% 100%', elevated: '0 0% 99%', sunken: '0 0% 97%' },
      text: {
        primary: '0 0% 3.9%',
        secondary: '0 0% 30%',
        muted: '0 0% 45.1%',
        inverse: '0 0% 100%',
      },
      border: { subtle: '0 0% 89.8%', strong: '0 0% 82%' },
      semantic: {
        primary: '200 60% 30%',
        primaryForeground: '0 0% 100%',
        secondary: '0 0% 96.1%',
        secondaryForeground: '0 0% 9%',
        muted: '0 0% 96.1%',
        mutedForeground: '0 0% 45.1%',
        accent: '0 0% 96.1%',
        accentForeground: '0 0% 9%',
        destructive: '0 84.2% 60.2%',
        destructiveForeground: '0 0% 98%',
        ring: '200 60% 30%',
        input: '0 0% 89.8%',
      },
      status: {
        draft: '220 9% 46%',
        inReview: '217 91% 60%',
        approved: '142 71% 45%',
        rejected: '0 84% 60%',
        signed: '150 80% 30%',
        superseded: '38 92% 50%',
        exception: '271 91% 65%',
      },
    },
    dark: {
      brand: {
        teal: '200 50% 50%',
        tealInk: '200 60% 35%',
        tealSoft: '200 40% 15%',
        orange: '25 90% 60%',
        orangeSoft: '25 40% 15%',
        charcoal: '0 0% 6%',
        silver: '220 5% 60%',
      },
      surface: { canvas: '0 0% 3.9%', elevated: '0 0% 6%', sunken: '0 0% 7%' },
      text: {
        primary: '0 0% 98%',
        secondary: '0 0% 80%',
        muted: '0 0% 63.9%',
        inverse: '0 0% 9%',
      },
      border: { subtle: '0 0% 14.9%', strong: '0 0% 22%' },
      semantic: {
        primary: '200 60% 35%',
        primaryForeground: '0 0% 100%',
        secondary: '0 0% 14.9%',
        secondaryForeground: '0 0% 98%',
        muted: '0 0% 14.9%',
        mutedForeground: '0 0% 63.9%',
        accent: '0 0% 14.9%',
        accentForeground: '0 0% 98%',
        destructive: '0 62.8% 30.6%',
        destructiveForeground: '0 0% 98%',
        ring: '200 60% 35%',
        input: '0 0% 14.9%',
      },
      status: {
        draft: '220 9% 64%',
        inReview: '217 91% 70%',
        approved: '142 71% 55%',
        rejected: '0 84% 70%',
        signed: '150 60% 50%',
        superseded: '38 92% 60%',
        exception: '271 91% 75%',
      },
    },
  },

  typography: {
    family: { sans: 'Inter', mono: 'ui-monospace' },
    cssVar: { sans: '--font-sans', mono: '--font-mono' },
    scale: {
      displayHero: { size: 48, lineHeight: 56, weight: 300, tracking: -0.02, case: 'regular' },
      displaySection: { size: 32, lineHeight: 40, weight: 300, tracking: -0.015, case: 'regular' },
      headingPage: { size: 24, lineHeight: 32, weight: 400, tracking: -0.005, case: 'regular' },
      headingSection: { size: 18, lineHeight: 24, weight: 500, tracking: 0, case: 'regular' },
      headingSubsection: { size: 15, lineHeight: 20, weight: 500, tracking: 0, case: 'regular' },
      body: { size: 14, lineHeight: 22, weight: 400, tracking: 0, case: 'regular' },
      bodySmall: { size: 13, lineHeight: 20, weight: 400, tracking: 0, case: 'regular' },
      label: { size: 11, lineHeight: 16, weight: 500, tracking: 0.08, case: 'uppercase' },
      meta: { size: 12, lineHeight: 16, weight: 400, tracking: 0, case: 'regular' },
      tableHeader: { size: 12, lineHeight: 16, weight: 500, tracking: 0.04, case: 'uppercase' },
      tableCell: { size: 13, lineHeight: 20, weight: 400, tracking: 0, case: 'regular' },
      kpiNumber: { size: 32, lineHeight: 36, weight: 300, tracking: -0.025, case: 'regular' },
      kpiDelta: { size: 12, lineHeight: 16, weight: 500, tracking: 0, case: 'regular' },
      button: { size: 13, lineHeight: 20, weight: 500, tracking: 0.005, case: 'regular' },
      badge: { size: 11, lineHeight: 16, weight: 500, tracking: 0.04, case: 'uppercase' },
    },
  },

  spacing: { gutter: { xs: 8, sm: 12, md: 16, lg: 24, xl: 40, hero: 72 } },

  radius: { xs: 2, sm: 4, md: 8, lg: 12, xl: 16, full: 9999 },

  shadows: {
    card: '0 1px 2px 0 rgb(0 0 0 / 0.03), 0 1px 3px 0 rgb(0 0 0 / 0.04)',
    hover: '0 2px 4px 0 rgb(0 0 0 / 0.04), 0 4px 8px 0 rgb(0 0 0 / 0.05)',
    popover: '0 4px 12px 0 rgb(0 0 0 / 0.08), 0 2px 4px 0 rgb(0 0 0 / 0.04)',
    command: '0 16px 48px 0 rgb(0 0 0 / 0.18), 0 4px 16px 0 rgb(0 0 0 / 0.08)',
    focus: '0 0 0 3px hsl(200 50% 45% / 0.25)',
  },

  motion: {
    fast: { duration: '120ms', easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    default: { duration: '200ms', easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    deliberate: { duration: '320ms', easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
  },

  assets: { logoStandard, logoReversed, logoGray },

  copy: tenantBlankCopyEn,
};
