import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals: { session, user } }) => {
	// renderedAt travels so the client can tell a fresh render from one the
	// service worker or the browser kept: see $lib/freshness.ts.
	return { session, user, renderedAt: Date.now() };
};
