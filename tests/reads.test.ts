// The guard that keeps a page with a hole in it out of the service worker's
// cache. Getting this wrong is not a cosmetic bug: the holed copy is what the
// next launch shows, and the launch after that, until someone reloads by hand.

import { describe, expect, it, vi } from 'vitest';
import { readsFailed } from '$lib/server/reads';

const NO_STORE = { 'cache-control': 'no-store' };

describe('readsFailed', () => {
	it('says nothing when every read landed', () => {
		const setHeaders = vi.fn();
		expect(readsFailed(setHeaders, [], [{ id: 'walk' }])).toBe(false);
		expect(setHeaders).not.toHaveBeenCalled();
	});

	// An empty list is an answer — nothing logged yet — and a page saying so is
	// worth keeping. Only null means nobody answered.
	it('does not confuse an empty list with a failed read', () => {
		const setHeaders = vi.fn();
		expect(readsFailed(setHeaders, [])).toBe(false);
		expect(setHeaders).not.toHaveBeenCalled();
	});

	it('seals the page when a read failed', () => {
		const setHeaders = vi.fn();
		expect(readsFailed(setHeaders, [], null)).toBe(true);
		expect(setHeaders).toHaveBeenCalledWith(NO_STORE);
	});

	// The failure this replaced: the guard asked about one read per page, so a
	// second read failing was cached with its hole. The log grid vanished that
	// way and stayed vanished.
	it('asks about every read it is given, not just the first', () => {
		const setHeaders = vi.fn();
		expect(readsFailed(setHeaders, null, [])).toBe(true);
		expect(readsFailed(setHeaders, [], [], null)).toBe(true);
		expect(setHeaders).toHaveBeenCalledTimes(2);
	});

	// A page with no reads to report has nothing to hide.
	it('is false with nothing to check', () => {
		const setHeaders = vi.fn();
		expect(readsFailed(setHeaders)).toBe(false);
		expect(setHeaders).not.toHaveBeenCalled();
	});

	// undefined is not how a read reports failure here — every one of them
	// returns null — and treating it as one would seal pages needlessly.
	it('treats only null as a failure', () => {
		const setHeaders = vi.fn();
		expect(readsFailed(setHeaders, undefined, 0, '', false)).toBe(false);
		expect(setHeaders).not.toHaveBeenCalled();
	});
});
