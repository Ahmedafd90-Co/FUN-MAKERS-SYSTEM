import animate from 'tailwindcss-animate';

import type { Config } from 'tailwindcss';

import preset from '@fmksa/config/tailwind/preset';

// Content globs are deliberately RELATIVE to this file's directory.
// Tailwind resolves `content` paths against the location of the config
// file itself, so we do not need to compute `here` via `__dirname` /
// `import.meta.dirname` / `fileURLToPath(import.meta.url)` — all of
// which caused `SyntaxError: Cannot use 'import.meta' outside a module`
// during `next build` because Tailwind's internal config loader
// evaluates the transpiled file in a CJS vm context.
//
// Keeping the globs relative also makes the config portable if the app
// is ever moved inside the monorepo.
const config = {
  presets: [preset],
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [animate],
} satisfies Config;

export default config;
