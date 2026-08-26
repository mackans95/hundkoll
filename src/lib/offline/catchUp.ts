// Coming back to the app, in one place.
//
// There are four ways in — a launch, the browser restoring the page, the app
// being brought to the front, and the connection returning — and they all
// raise the same two questions: is anything still waiting to be sent, and is
// what is on screen actually current? Those answers used to sit in the layout
// beside the event handlers, which made the policy hard to see and easy to
// answer differently in two places. The handlers now only say "we are back".
//
// The pure half of the decision lives next door in freshness.ts, which has no
// SvelteKit imports and is therefore unit-testable; everything here needs a
// browser, and is verified by driving one.

import { invalidateAll } from '$app/navigation';
import { page } from '$app/state';
import { isStale } from './freshness';
import { sendPending } from './queue.svelte';

/**
 * Catches up with the server: sends whatever the queue is holding, then
 * re-reads the page if its data predates our return.
 *
 * Both halves are conditional and cheap when there is nothing to do — an
 * empty queue sends nothing, and `sendPending` re-reads the page itself when
 * it landed something, which refreshes `renderedAt` and leaves the check
 * below a no-op rather than a second request.
 *
 * Safe to call offline: the service worker answers the data request from its
 * cache, so the re-read resolves with what is already on screen instead of
 * failing.
 */
/**
 * The catch-up in progress. The ways back in can fire together — a launch is
 * also a pageshow — and they mean one catch-up between them. Locally the first
 * re-read lands before the next signal looks, which hides this; on a phone's
 * latency, three signals would be three requests.
 */
let inFlight: Promise<void> | null = null;

export function catchUp(): Promise<void> {
	inFlight ??= run().finally(() => {
		inFlight = null;
	});
	return inFlight;
}

async function run(): Promise<void> {
	// A hidden page is not back yet, and a backgrounded tab has no business
	// spending a request. It gets another call when it is shown.
	if (document.visibilityState !== 'visible') {
		return;
	}

	try {
		await sendPending();

		if (isStale(pageRenderedAt(), Date.now())) {
			await invalidateAll();
		}
	} catch (error) {
		// Whatever failed, what is on screen stays and the next way back in
		// tries again. Reported rather than swallowed: a silent read failure is
		// how the list came to show "nothing logged yet" for a dropped
		// connection.
		console.warn('catching up failed:', error);
	}
}

/**
 * When the server rendered what is on screen. The layout load supplies it, so
 * every page has one; a page that somehow lacks it is treated as stale, which
 * costs one request and never leaves old data up.
 */
function pageRenderedAt(): number {
	const renderedAt = (page.data as { renderedAt?: number }).renderedAt;
	return typeof renderedAt === 'number' ? renderedAt : 0;
}
