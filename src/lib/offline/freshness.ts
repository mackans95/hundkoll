// Whether what is on screen is worth re-reading.
//
// The app can be showing data it never fetched: the service worker answers a
// launch from its cache when the network is slow or gone, and a phone can
// restore the page it had open hours ago without asking the server anything.
// Both hydrate normally and look completely fresh, so the only evidence is
// when the server rendered the data.

/** How old page data may be before a launch or a resume re-reads it. */
export const STALE_AFTER_MS = 30_000;

/**
 * Whether data rendered at `renderedAt` should be re-read now.
 * A negative age means the device clock disagrees with the server's, which is
 * no evidence of freshness — so that counts as stale too, and the cost of
 * being wrong is one data request.
 */
export function isStale(renderedAt: number, now: number, after = STALE_AFTER_MS): boolean {
	const age = now - renderedAt;
	return age < 0 || age >= after;
}
