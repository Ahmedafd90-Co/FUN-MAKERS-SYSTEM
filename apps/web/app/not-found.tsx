/**
 * Root-level not-found boundary.
 *
 * Re-exports the branded Pico Play 404 defined in the (app) route group
 * so unauthenticated / unknown root URLs land on the same design as
 * in-app 404s. Single source of truth for the 404 surface.
 */
export { default } from './(app)/not-found';
