import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Extended tailwind-merge — teaches it about the custom font-size tokens
 * we declare in the shared Tailwind preset (`display-hero`, `heading-page`,
 * `label`, `body`, `th`, etc.). Without this extension, tailwind-merge
 * treats unknown `text-*` classes as colors, which collapses them with
 * the actual color classes (e.g. `text-label` + `text-glass-label`
 * would end up keeping only one).
 *
 * Keep this list in lockstep with the `fontSize` tokens defined in
 * `packages/config/tailwind/preset.cjs` and the brand theme type scale
 * in `packages/brand/src/themes/pico-play/index.ts`.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            'display-hero',
            'display-section',
            'heading-page',
            'heading-section',
            'heading-sub',
            'body',
            'body-sm',
            'label',
            'meta',
            'th',
            'td',
            'kpi',
            'btn',
            'badge-sm',
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
