import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
// Aliased: `resolve` is already the name of the handle's own argument.
import { resolve as resolvePath } from '$app/paths';
import { DAY_HEADER, VERSION_HEADER, cachedPage } from '$lib/offline/pageCache';
import { verifiedUserId } from '$lib/server/auth';
import { currentStamp } from '$lib/server/dataVersion';
import { createRequestClient } from '$lib/server/db';

const supabase: Handle = async ({ event, resolve }) => {
	event.locals.supabase = createRequestClient(event.cookies);

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};

const authGuard: Handle = async ({ event, resolve }) => {
	const userId = await verifiedUserId(event.locals.supabase);
	event.locals.userId = userId;

	const path = event.url.pathname;

	if (!userId && path !== '/login') {
		redirect(303, resolvePath('/login'));
	}
	if (userId && path === '/login') {
		redirect(303, resolvePath('/'));
	}

	// Read before the page's own reads, so a copy is never stamped with a
	// version its data doesn't have yet. Unstamped, the worker won't serve it.
	event.locals.stamp = null;
	if (userId && event.request.method === 'GET' && cachedPage(event.url)) {
		event.locals.stamp = await currentStamp(event.locals.supabase);
		if (event.locals.stamp) {
			event.setHeaders({
				[VERSION_HEADER]: String(event.locals.stamp.version),
				[DAY_HEADER]: event.locals.stamp.day
			});
		}
	}

	return resolve(event);
};

export const handle = sequence(supabase, authGuard);
