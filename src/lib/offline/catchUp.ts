// Coming back to the app, in one place.
//
// There are four ways in — a launch, the browser restoring the page, the app
// being brought to the front, and the connection returning — and they all raise
// the same three questions: is the queue read off disk, is anything still
// waiting to be sent, and is what is on screen actually current? The handlers
// only say "we are back"; this decides what that implies.
//
// The pure half of the decision lives next door in freshness.ts, which has no
// SvelteKit imports and is therefore unit-testable; everything here needs a
// browser, and is verified by driving one.

import { invalidateAll } from '$app/navigation';
import { page } from '$app/state';
import { RETRY_DELAYS_MS, hasLanded, isStale } from './freshness';
import { loadQueue, sendPending } from './queue.svelte';

/** When this context last saw the server answer, on the phone's own clock. */
let readAt: number | null = null;

/** The server's render stamp we have already accounted for. */
let seenRenderedAt: number | null = null;

/** The queue is read off disk once per context, as part of coming back. */
let queueLoaded: Promise<void> | null = null;

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

	// Seeded rather than observed: the stamp the page hydrated with says when the
	// server rendered it, not when *we* read it — and on a launch we may never
	// have read anything at all. Recording it without touching readAt is what
	// lets the first re-read tell a new answer from the same old one.
	seenRenderedAt ??= pageRenderedAt();

	try {
		// Folded in rather than raced. This used to live in the layout as
		// `loadQueue().then(catchUp)`, and pageshow — which fires at window.load
		// — beat it: the first catch-up flushed an empty in-memory queue, and the
		// second was swallowed by the in-flight guard above. Logs made without
		// signal kept their hourglass until the app was backgrounded and reopened.
		queueLoaded ??= loadQueue();
		await queueLoaded;

		await sendPending();
		// sendPending re-reads the page itself when something landed; noticing
		// that here leaves the check below a no-op rather than a second request.
		observe();

		if (!isStale(readAt, Date.now())) {
			return;
		}

		// The first attempt immediately, then backing off. A re-read the service
		// worker answered from its cache changes nothing and looks exactly like a
		// successful one, so the only way to know is to check and try again.
		for (const delay of [0, ...RETRY_DELAYS_MS]) {
			if (delay > 0) {
				await sleep(delay);
				// Gone to the background while we waited. It gets another call on
				// the way back, and a hidden page should not spend requests.
				if (document.visibilityState !== 'visible') {
					return;
				}
			}

			await invalidateAll();
			if (observe()) {
				return;
			}
		}

		// Every attempt came back with the same render stamp: the requests never
		// reached the server. What is on screen stays, and the next way back in
		// starts over.
		console.warn('catching up: the re-read never reached the server');
	} catch (error) {
		// Whatever failed, what is on screen stays and the next way back in tries
		// again. Reported rather than swallowed: a silent read failure is how the
		// list came to show "nothing logged yet" for a dropped connection.
		console.warn('catching up failed:', error);
	}
}

/**
 * Notices whether the server has answered since we last looked, and records
 * when — on the phone's clock, so the next resume measures age against a
 * timestamp taken from the same place as the `Date.now()` it compares to.
 */
function observe(): boolean {
	const renderedAt = pageRenderedAt();

	// No stamp to compare. The layout always sends one, so this is a page in a
	// state we do not model; take the re-read at its word rather than retrying
	// against something unmeasurable.
	if (renderedAt === null) {
		readAt = Date.now();
		return true;
	}

	if (!hasLanded(seenRenderedAt, renderedAt)) {
		return false;
	}

	seenRenderedAt = renderedAt;
	readAt = Date.now();
	return true;
}

/** When the server rendered what is on screen; null if it did not say. */
function pageRenderedAt(): number | null {
	const renderedAt = (page.data as { renderedAt?: number }).renderedAt;
	return typeof renderedAt === 'number' ? renderedAt : null;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
