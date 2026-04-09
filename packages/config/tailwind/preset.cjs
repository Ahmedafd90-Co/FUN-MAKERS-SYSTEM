/**
 * Shared Tailwind preset for the Fun Makers KSA monorepo.
 *
 * Extends (never replaces) Tailwind defaults and exposes:
 *   - HSL color tokens compatible with shadcn/ui (consumed via CSS variables
 *     that the application layer defines in globals.css)
 *   - Inter as the default sans-serif font
 *   - Status chip tokens from the Module 1 design spec §8.3
 *
 * Status chip CSS variables the consuming app must expose in its global
 * stylesheet (HSL triplets so Tailwind can compose them with opacity):
 *
 *   :root {
 *     --status-draft:       220 9% 46%;   // gray
 *     --status-in-review:   217 91% 60%;  // blue
 *     --status-approved:    142 71% 45%;  // green
 *     --status-rejected:    0 84% 60%;    // red
 *     --status-signed:      150 80% 30%;  // dark green
 *     --status-superseded:  38 92% 50%;   // amber
 *     --status-exception:   271 91% 65%;  // purple
 *   }
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
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      colors: {
        // Neutral + accent tokens (HSL CSS variables, shadcn/ui compatible).
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Status chip tokens (spec §8.3). Each token maps to a CSS variable the
        // consuming app exposes so we can tweak the palette in one place.
        status: {
          draft: 'hsl(var(--status-draft))',
          'in-review': 'hsl(var(--status-in-review))',
          approved: 'hsl(var(--status-approved))',
          rejected: 'hsl(var(--status-rejected))',
          signed: 'hsl(var(--status-signed))',
          superseded: 'hsl(var(--status-superseded))',
          exception: 'hsl(var(--status-exception))',
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
