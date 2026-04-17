/**
 * Active theme selector — the only file to edit when re-skinning the
 * product for a new tenant.
 *
 * How to re-skin:
 *   1. Duplicate `src/themes/tenant-blank/` under a new folder name.
 *   2. Replace assets and copy, tune colors to match the new brand.
 *   3. Import and export the new theme below.
 *   4. Update CSS variables by re-running the app — `css-vars.ts` reads
 *      the active theme at module load time.
 *
 * No page component, primitive, or business-logic file needs to change
 * for a re-skin — they all consume `activeTheme` or `<BrandLogo>` /
 * `<BrandTagline>` etc. from `@fmksa/brand`.
 */
import { picoPlayTheme } from './themes/pico-play';
import type { Theme } from './themes/types';

/** Currently active theme. Swap this import to change the product brand. */
export const activeTheme: Theme = picoPlayTheme;
