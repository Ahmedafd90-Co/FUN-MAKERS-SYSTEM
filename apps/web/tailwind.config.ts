import animate from 'tailwindcss-animate';

import type { Config } from 'tailwindcss';

import preset from '@fmksa/config/tailwind/preset';

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
