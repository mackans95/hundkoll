// When the app decides that what is on screen predates the launch. A page can
// arrive fully hydrated and hours out of date — from the service worker's
// cache, or from the browser restoring it — so the age of the data is the
// only evidence there is.

import { describe, expect, it } from 'vitest';
import { STALE_AFTER_MS, isStale } from '$lib/offline/freshness';

const RENDERED = 1_800_000_000_000;

describe('isStale', () => {
	it('leaves a fresh render alone', () => {
		expect(isStale(RENDERED, RENDERED)).toBe(false);
		expect(isStale(RENDERED, RENDERED + 1_000)).toBe(false);
		expect(isStale(RENDERED, RENDERED + STALE_AFTER_MS - 1)).toBe(false);
	});

	it('re-reads once the data is old enough', () => {
		expect(isStale(RENDERED, RENDERED + STALE_AFTER_MS)).toBe(true);
		// The case that prompted this: opened again the next morning.
		expect(isStale(RENDERED, RENDERED + 12 * 60 * 60 * 1000)).toBe(true);
	});

	// A device clock behind the server's would otherwise report every page as
	// fresh forever, which is the one failure worth not having.
	it('treats a clock disagreement as stale, not as fresh', () => {
		expect(isStale(RENDERED, RENDERED - 1)).toBe(true);
		expect(isStale(RENDERED, RENDERED - 10 * 60 * 1000)).toBe(true);
	});

	it("takes a caller's own threshold", () => {
		expect(isStale(RENDERED, RENDERED + 5_000, 10_000)).toBe(false);
		expect(isStale(RENDERED, RENDERED + 10_000, 10_000)).toBe(true);
	});
});
