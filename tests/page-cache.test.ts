// When the phone may show its own copy of a page instead of asking (plan 31b).

import { describe, expect, it } from 'vitest';
import {
	DAY_HEADER,
	UNKNOWN,
	VERSION_HEADER,
	afterCheck,
	afterResponse,
	afterWrite,
	cachedPage,
	isCurrent,
	mayServe,
	pagePath,
	readStamp,
	writesData
} from '$lib/offline/pageCache';

const TUE = { version: 7, day: '2026-10-13' };
const WED = { version: 7, day: '2026-10-14' };
const LOGGED = { version: 8, day: '2026-10-13' };

describe('pagePath', () => {
	it('drops a data request suffix', () => {
		expect(pagePath('/stats/__data.json')).toBe('/stats');
		expect(pagePath('/__data.json')).toBe('/');
		expect(pagePath('/history')).toBe('/history');
	});
});

describe('cachedPage', () => {
	const at = (path: string) => new URL(path, 'https://hundkoll.test');

	it('takes the five pages and their data', () => {
		for (const path of [
			'/',
			'/status',
			'/stats?period=week',
			'/trends',
			'/history?month=2026-09'
		]) {
			expect(cachedPage(at(path))).toBe(true);
		}
		expect(cachedPage(at('/stats/__data.json?period=day&x-sveltekit-invalidated=01'))).toBe(true);
	});

	it('leaves settings and the rest to the network', () => {
		for (const path of ['/settings', '/settings/types/walk', '/login', '/version']) {
			expect(cachedPage(at(path))).toBe(false);
		}
	});

	// Their forms carry the server's event id and time, which a copy would reuse.
	it('leaves an open sheet to the network', () => {
		expect(cachedPage(at('/?detail=walk'))).toBe(false);
		expect(cachedPage(at('/?event=abc'))).toBe(false);
		expect(cachedPage(at('/history?month=2026-09&add'))).toBe(false);
	});
});

describe('isCurrent', () => {
	it('holds while nothing was written', () => {
		expect(isCurrent(TUE, TUE, '/')).toBe(true);
		expect(isCurrent(TUE, LOGGED, '/')).toBe(false);
	});

	// Tuesday's last walk is still the last walk on Wednesday morning.
	it('lets a new day pass for Logga and Status', () => {
		expect(isCurrent(TUE, WED, '/')).toBe(true);
		expect(isCurrent(TUE, WED, '/status')).toBe(true);
	});

	it('re-reads what is drawn for today', () => {
		expect(isCurrent(TUE, WED, '/stats')).toBe(false);
		expect(isCurrent(TUE, WED, '/trends/__data.json')).toBe(false);
		expect(isCurrent(TUE, WED, '/history')).toBe(false);
	});
});

describe('readStamp', () => {
	it('reads both headers, or nothing', () => {
		const headers = new Headers({ [VERSION_HEADER]: '7', [DAY_HEADER]: '2026-10-13' });
		expect(readStamp(headers)).toEqual(TUE);
		expect(readStamp(new Headers({ [VERSION_HEADER]: '7' }))).toBeNull();
		expect(readStamp(new Headers())).toBeNull();
	});
});

describe('the worker', () => {
	it('asks the network until it knows a version', () => {
		expect(mayServe(TUE, UNKNOWN, '/')).toBe(false);
		expect(mayServe(null, afterCheck(TUE), '/')).toBe(false);
	});

	it('serves a copy at the version it knows', () => {
		expect(mayServe(TUE, afterCheck(TUE), '/')).toBe(true);
		expect(mayServe(TUE, afterCheck(LOGGED), '/')).toBe(false);
	});

	// The page after a log must never be the copy from before it.
	it('stops serving copies after a write, until a later version arrives', () => {
		const wrote = afterWrite(afterCheck(TUE));
		expect(mayServe(TUE, wrote, '/')).toBe(false);

		// A response from before the write landed changes nothing.
		const early = afterResponse(wrote, TUE);
		expect(mayServe(TUE, early, '/')).toBe(false);

		const landed = afterResponse(early, LOGGED);
		expect(mayServe(LOGGED, landed, '/')).toBe(true);
		expect(mayServe(TUE, landed, '/')).toBe(false);
	});

	it('keeps the earliest version over two writes', () => {
		const twice = afterWrite(afterWrite(afterCheck(TUE)));
		expect(twice.wroteAt).toBe(7);
	});

	// A write that changed nothing on the server: the next check settles it.
	it('lets a check clear a write', () => {
		const wrote = afterWrite(afterCheck(TUE));
		expect(mayServe(TUE, wrote, '/')).toBe(false);
		expect(mayServe(TUE, afterCheck(TUE), '/')).toBe(true);
	});

	it('keeps the later stamp when responses land out of order', () => {
		const known = afterResponse(afterResponse(UNKNOWN, LOGGED), TUE);
		expect(known.stamp).toEqual(LOGGED);
		const days = afterResponse(afterResponse(UNKNOWN, WED), TUE);
		expect(days.stamp).toEqual(WED);
	});
});

describe('writesData', () => {
	const at = (path: string) => new URL(path, 'https://hundkoll.test');

	it('counts form posts and logout', () => {
		expect(writesData('POST', at('/?/log'))).toBe(true);
		expect(writesData('POST', at('/history?/update'))).toBe(true);
		expect(writesData('POST', at('/logout'))).toBe(true);
	});

	it('lets reads, the walk marker and the push token pass', () => {
		expect(writesData('GET', at('/'))).toBe(false);
		expect(writesData('POST', at('/live'))).toBe(false);
		expect(writesData('DELETE', at('/push'))).toBe(false);
	});
});
