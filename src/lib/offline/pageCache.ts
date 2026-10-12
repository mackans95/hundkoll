// Which pages the phone shows from its own copy first, and when a copy is still
// current (plan 31b). Shared by the server, which stamps each page with the
// version it was read at, the service worker, which serves the copies, and
// catchUp, which asks the server whether anything moved.

export const VERSION_HEADER = 'x-hundkoll-version';
export const DAY_HEADER = 'x-hundkoll-day';

/** The household's data version, and the Stockholm day a page was read on. */
export type Stamp = { version: number; day: string };

const PAGES = new Set(['/', '/status', '/stats', '/trends', '/history']);
// Drawn for today, in SQL or from the server's date, so a new day re-reads them.
const BY_DAY = new Set(['/stats', '/trends', '/history']);
// A sheet's form carries a server-made id or time, which a copy would reuse.
const SHEETS = ['detail', 'event', 'add'];

/**
 * The page a request is for, a data request's suffix dropped.
 * "/stats/__data.json" → "/stats", "/__data.json" → "/"
 */
export function pagePath(pathname: string): string {
	const page = pathname.replace(/\/?__data\.json$/, '');
	return page === '' ? '/' : page;
}

/** Whether a page request may be answered from the phone's copy. */
export function cachedPage(url: URL): boolean {
	return PAGES.has(pagePath(url.pathname)) && !SHEETS.some((key) => url.searchParams.has(key));
}

// Writes no page shows: the walk marker (plan 30) and this phone's push token.
const QUIET_WRITES = new Set(['/live', '/push']);

/** Whether a request may change what the pages show, so copies must wait. */
export function writesData(method: string, url: URL): boolean {
	return method !== 'GET' && method !== 'HEAD' && !QUIET_WRITES.has(url.pathname);
}

/** Whether a copy read at `copy` shows what the server at `server` would. */
export function isCurrent(copy: Stamp, server: Stamp, pathname: string): boolean {
	return (
		copy.version === server.version && (!BY_DAY.has(pagePath(pathname)) || copy.day === server.day)
	);
}

/** A response's stamp; null when it has none, which only the server's pages carry. */
export function readStamp(headers: Headers): Stamp | null {
	const version = Number(headers.get(VERSION_HEADER) ?? NaN);
	const day = headers.get(DAY_HEADER);
	return Number.isFinite(version) && day ? { version, day } : null;
}

/**
 * What the worker believes the server is at. `wroteAt` is set while a write
 * from this phone may not be in any copy yet: the version it saw before it.
 */
export type Known = { stamp: Stamp | null; wroteAt: number | null };

export const UNKNOWN: Known = { stamp: null, wroteAt: null };

/** Whether the worker may answer with a copy, rather than ask the network. */
export function mayServe(copy: Stamp | null, known: Known, pathname: string): boolean {
	return (
		copy !== null &&
		known.stamp !== null &&
		known.wroteAt === null &&
		isCurrent(copy, known.stamp, pathname)
	);
}

/** A write passed by: copies wait until a response shows a later version. */
export function afterWrite(known: Known): Known {
	return { ...known, wroteAt: known.wroteAt ?? known.stamp?.version ?? -1 };
}

/**
 * A page came from the network. Versions and days only grow, so the later of
 * the two stands; two responses can land out of order.
 */
export function afterResponse(known: Known, stamp: Stamp): Known {
	const later =
		known.stamp === null
			? stamp
			: {
					version: Math.max(known.stamp.version, stamp.version),
					day: known.stamp.day > stamp.day ? known.stamp.day : stamp.day
				};
	const landed = known.wroteAt === null || later.version > known.wroteAt;
	return { stamp: later, wroteAt: landed ? null : known.wroteAt };
}

/** The server answered the version check itself: that is the truth. */
export function afterCheck(stamp: Stamp): Known {
	return { stamp, wroteAt: null };
}
