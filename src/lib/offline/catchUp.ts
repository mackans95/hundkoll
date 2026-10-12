// Coming back to the app, in one place.
//
// There are five ways in — a launch, the browser restoring the page, the app
// being brought to the front, the connection returning, and a navigation that
// may have been answered from the phone's copy — and they all raise
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
import { isCurrent, type Stamp } from './pageCache';
import { syncWithLockScreen } from './activeSession.svelte';
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
		// Before sending: a walk saved on the lock screen without signal joins the queue here.
		await syncWithLockScreen();

		// sendPending re-reads the page itself when something landed; noticing
		// that here leaves the check below a no-op rather than a second request.
		// Only then: a page shown from the phone's copy has a render stamp of its
		// own, which says nothing about the server having been asked.
		if (await sendPending()) {
			observe();
		}

		// Signed out, the check can only fail, and its retries would hold up the
		// catch-up that follows the login.
		if (!(page.data as { signedIn?: boolean }).signedIn || !isStale(readAt, Date.now())) {
			return;
		}

		// The first attempt immediately, then backing off. The version check
		// asks whether anything was written since the page on screen was read
		// (plan 31b); only then is it re-read. A re-read the service worker
		// answered from its cache looks exactly like a successful one, so the
		// only way to know is to check the render stamp and try again.
		for (const delay of [0, ...RETRY_DELAYS_MS]) {
			if (delay > 0) {
				await sleep(delay);
				// Gone to the background while we waited. It gets another call on
				// the way back, and a hidden page should not spend requests.
				if (document.visibilityState !== 'visible') {
					return;
				}
			}

			const server = await askVersion();
			if (server === 'unreached') {
				continue;
			}
			// Unanswered — the version's migration not pushed yet, say — the page
			// is simply re-read, as before there was a version to ask.
			if (server !== 'unknown') {
				// Before the re-read, so the worker already treats the copies as stale.
				await tellWorker(server);
				const shown = (page.data as { stamp?: Stamp | null }).stamp ?? null;
				if (shown && isCurrent(shown, server, page.url.pathname)) {
					readAt = Date.now();
					return;
				}
			}

			await invalidateAll();
			if (observe()) {
				// The page may have opened on an old copy; the next launch shouldn't.
				navigator.serviceWorker?.controller?.postMessage({ type: 'refresh', url: location.href });
				return;
			}
		}

		// Every attempt failed to reach the server, or came back with the same
		// render stamp. What is on screen stays, and the next way back in
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

/** What the server is at now, 'unknown' when it answered without saying, or
 * 'unreached' when the check never got there. */
async function askVersion(): Promise<Stamp | 'unknown' | 'unreached'> {
	try {
		const response = await fetch('/version', { cache: 'no-store' });
		return response.ok ? ((await response.json()) as Stamp) : 'unknown';
	} catch {
		return 'unreached';
	}
}

/** Hands the check to the service worker, and waits until it has it. */
async function tellWorker(stamp: Stamp): Promise<void> {
	const worker = navigator.serviceWorker?.controller;
	if (!worker) {
		return;
	}
	const channel = new MessageChannel();
	const heard = new Promise<void>((resolve) => {
		channel.port1.onmessage = () => resolve();
		// A worker that never answers must not hold the page's catch-up.
		setTimeout(resolve, 1_000);
	});
	worker.postMessage({ type: 'version', stamp }, [channel.port2]);
	await heard;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
