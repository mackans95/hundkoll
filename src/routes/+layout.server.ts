import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ url, locals: { userId, stamp } }) => {
	// Whether, not the session: it carries the tokens, and page data is
	// rendered into HTML and kept by the service worker. renderedAt travels so
	// the client can tell a fresh render from one the service worker or the
	// browser kept: see $lib/offline/catchUp.ts.
	// Read so this runs with every page: the stamp must be the one the page
	// on screen was read at, and catchUp compares against it.
	void url.pathname;
	void url.search;
	return { signedIn: userId !== null, renderedAt: Date.now(), stamp };
};
