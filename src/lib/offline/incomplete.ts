// Shared by the server, which sets it, and the service worker, which reads it.

/**
 * Marks a response whose page has a failed read in it. Not `no-store`: SvelteKit
 * sends `private, no-store` on every data request, so the worker could not tell
 * a holed page from a good one by that, and refused to cache any of them.
 */
export const INCOMPLETE_HEADER = 'x-hundkoll-incomplete';
