// Whether what is on screen is worth re-reading, and whether a re-read worked.
//
// The app can be showing data it never fetched: the service worker answers a
// launch from its cache when the network is slow or gone, and a phone can
// restore the page it had open hours ago without asking the server anything.
// Both hydrate normally and look completely fresh.
//
// Two rules, both learned from the first attempt at this not working:
//
//   - Age is measured on ONE clock. It used to be the server's `renderedAt`
//     against the phone's `Date.now()`, and a phone running slow shrank every
//     age it measured: twenty seconds slow turned a 45-second-old page into a
//     25-second-old one, under the threshold, so nothing was re-read. Five
//     minutes slow and no ordinary resume ever counted as stale. The client
//     stamps its own read times now, so drift cannot hide anything.
//   - A context that has read nothing yet is stale, full stop. A launch cannot
//     tell a page the server rendered a moment ago from one the worker cached
//     last night, so it does not try to: it re-reads. That costs one data
//     request per launch, which the old threshold already paid for any page
//     older than thirty seconds.

/** How old page data may be before a resume re-reads it. */
export const STALE_AFTER_MS = 30_000;

/**
 * How long to wait before trying a re-read again when the last one did not
 * reach the server. Bounded on purpose: after the last delay the page keeps
 * what it has, and the next way back in starts over.
 */
export const RETRY_DELAYS_MS = [2_000, 8_000, 30_000] as const;

/**
 * Whether data last read at `readAt` should be re-read now. Both timestamps
 * come from the same clock, which is the whole point.
 *
 * `null` means this context has read nothing yet — a launch — which is always
 * stale. A negative age means the phone's own clock moved backwards under us,
 * which is no evidence of freshness either, and costs one request to be wrong.
 */
export function isStale(readAt: number | null, now: number, after = STALE_AFTER_MS): boolean {
	if (readAt === null) {
		return true;
	}

	const age = now - readAt;
	return age < 0 || age >= after;
}

/**
 * Whether a re-read actually reached the server, judged by the server's own
 * render stamp having changed.
 *
 * This is the check that was missing. The service worker answers a data request
 * from its cache when the network throws, so `invalidateAll()` can resolve
 * perfectly successfully with exactly the data already on screen — no error to
 * catch, nothing to retry, and yesterday's events still up. The stamp is the
 * only evidence that anyone was actually asked.
 */
export function hasLanded(seen: number | null, current: number | null): boolean {
	return current !== null && current !== seen;
}
