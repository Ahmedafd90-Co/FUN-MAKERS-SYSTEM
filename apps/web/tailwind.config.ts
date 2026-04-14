import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import animate from 'tailwindcss-animate';

import type { Config } from 'tailwindcss';

import preset from '@fmksa/config/tailwind/preset';

// Use import.meta.dirname (Node 21+) with fallback for older runtimes.
const here =
  typeof __dirname !== 'undefined'
    ? __dirname
    : typeof import.meta.dirname !== 'undefined'
      ? import.meta.dirname
      : dirname(fileURLToPath(import.meta.url));

const config = {
  presets: [preset],
  darkMode: 'class',
  content: [
    resolve(here, './app/**/*.{ts,tsx}'),
    resolve(here, './components/**/*.{ts,tsx}'),
    resolve(here, '../../packages/ui/src/**/*.{ts,tsx}'),
  ],
  theme: {
    extend: {},
  },
  plugins: [animate],
} satisfies Config;

export default config;
