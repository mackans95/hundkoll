// When the app decides that what is on screen predates the launch, and whether
// a re-read actually reached anyone. A page can arrive fully hydrated and hours
// out of date — from the service worker's cache, or from the browser restoring
// it — so neither question can be answered by the page looking normal.

import { describe, expect, it } from 'vitest';
import { RETRY_DELAYS_MS, STALE_AFTER_MS, hasLanded, isStale } from '$lib/offline/freshness';

const READ = 1_800_000_000_000;

describe('isStale', () => {
	it('leaves a fresh read alone', () => {
		expect(isStale(READ, READ)).toBe(false);
		expect(isStale(READ, READ + 1_000)).toBe(false);
		expect(isStale(READ, READ + STALE_AFTER_MS - 1)).toBe(false);
	});

	it('re-reads once the data is old enough', () => {
		expect(isStale(READ, READ + STALE_AFTER_MS)).toBe(true);
		// The case that prompted this: opened again the next morning.
		expect(isStale(READ, READ + 12 * 60 * 60 * 1000)).toBe(true);
	});

	// The bug this whole module was rewritten for. A launch's HTML may be a
	// moment old or a night old and nothing on the page can tell which, so a
	// context that has not read anything must not guess that it has.
	it('treats a context that has read nothing as stale', () => {
		expect(isStale(null, READ)).toBe(true);
		// Whatever the threshold, and whatever the clock says.
		expect(isStale(null, 0, 10 * 60 * 1000)).toBe(true);
	});

	// The phone's own clock moving backwards mid-session — a timezone change, or
	// NTP correcting it — is not evidence of freshness. One wasted request.
	it('treats its own clock going backwards as stale', () => {
		expect(isStale(READ, READ - 1)).toBe(true);
		expect(isStale(READ, READ - 10 * 60 * 1000)).toBe(true);
	});

	// Both arguments now come from the same clock. The old version compared the
	// server's render stamp to the phone's Date.now(), so a slow phone shrank
	// every age it measured. The arithmetic of that bug, and why this signature
	// cannot express it:
	it('cannot be fooled by a phone whose clock runs slow', () => {
		const SKEW = 20_000; // the phone is twenty seconds behind the server
		const REAL_AGE = 45_000;
		const serverRendered = READ + SKEW;

		// What the old comparison worked out: 25 s, comfortably fresh.
		expect(READ + REAL_AGE - serverRendered).toBe(REAL_AGE - SKEW);
		expect(REAL_AGE - SKEW).toBeLessThan(STALE_AFTER_MS);

		// The client's own stamp does not know about the skew and cannot be
		// shrunk by it: it read at READ, and 45 s later that is stale.
		expect(isStale(READ, READ + REAL_AGE)).toBe(true);
	});

	it("takes a caller's own threshold", () => {
		expect(isStale(READ, READ + 5_000, 10_000)).toBe(false);
		expect(isStale(READ, READ + 10_000, 10_000)).toBe(true);
	});
});

describe('hasLanded', () => {
	// A re-read the service worker answered from its cache resolves with the same
	// data and the same stamp. No error is thrown, so the stamp is the only way
	// to know nobody was asked.
	it('is false when the stamp did not move', () => {
		expect(hasLanded(READ, READ)).toBe(false);
	});

	it('is true when the server answered with a new render', () => {
		expect(hasLanded(READ, READ + 1)).toBe(true);
		// Also when the stamp went backwards: a different render either way, and
		// the server's clock is not ours to reason about.
		expect(hasLanded(READ, READ - 5_000)).toBe(true);
	});

	// The first check of a context, where nothing has been accounted for yet.
	it('counts a first stamp as an answer', () => {
		expect(hasLanded(null, READ)).toBe(true);
	});

	it('is false when there is no stamp to compare', () => {
		expect(hasLanded(READ, null)).toBe(false);
		expect(hasLanded(null, null)).toBe(false);
	});
});

describe('RETRY_DELAYS_MS', () => {
	// Bounded and increasing: an unbounded retry on a phone with no signal is a
	// battery bug, and the next way back in starts over anyway.
	it('backs off and stops', () => {
		expect(RETRY_DELAYS_MS.length).toBeGreaterThan(0);
		expect([...RETRY_DELAYS_MS]).toEqual([...RETRY_DELAYS_MS].sort((a, b) => a - b));
		expect(RETRY_DELAYS_MS.every((delay) => delay > 0)).toBe(true);
	});
});
