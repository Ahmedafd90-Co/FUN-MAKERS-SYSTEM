/**
 * Commercial detail-page primitives.
 *
 * This module is now a thin re-export shim. The canonical implementation
 * lives at `@/components/shared/detail-primitives` so procurement and other
 * modules can share the same primitives without reaching into a
 * domain-named module.
 *
 * Commercial pages can keep importing from here; a later lane will migrate
 * the imports directly and retire this shim.
 */

export {
  formatMoney,
  formatRate,
  Field,
  SummaryItem,
  SummaryStrip,
} from '@/components/shared/detail-primitives';
