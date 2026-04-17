/**
 * Local cn() helper — duplicates the convention used elsewhere in the
 * monorepo so @fmksa/brand has no runtime dependency on @fmksa/ui.
 * (Dependency would invert the graph: ui wants to consume brand tokens.)
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
