/**
 * Local cn() helper — duplicates the convention used by @fmksa/ui so
 * @fmksa/brand has no runtime dependency on @fmksa/ui. (Brand is a leaf
 * package consumed by ui + web; ui consuming brand is the intended
 * dependency direction, not the other way round.)
 *
 * Like the ui cn() we extend tailwind-merge with our custom `text-*`
 * font-size tokens so they don't collapse with `text-{color}` classes
 * from the brand palette (e.g. `text-label text-glass-label`).
 *
 * Keep the list in lockstep with `packages/config/tailwind/preset.cjs`
 * and `packages/ui/src/lib/utils.ts`.
 */
import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

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

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
