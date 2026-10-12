import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals: { userId } }) => {
	// Whether, not the session: it carries the tokens, and page data is
	// rendered into HTML and kept by the service worker. renderedAt travels so
	// the client can tell a fresh render from one the service worker or the
	// browser kept: see $lib/offline/catchUp.ts.
	return { signedIn: userId !== null, renderedAt: Date.now() };
};
