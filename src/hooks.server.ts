import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
// Aliased: `resolve` is already the name of the handle's own argument.
import { resolve as resolvePath } from '$app/paths';
import { safeGetSession } from '$lib/server/auth';
import { createRequestClient } from '$lib/server/db';

const supabase: Handle = async ({ event, resolve }) => {
	event.locals.supabase = createRequestClient(event.cookies);
	event.locals.safeGetSession = () => safeGetSession(event.locals.supabase);

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};

const authGuard: Handle = async ({ event, resolve }) => {
	const { session, user } = await event.locals.safeGetSession();
	event.locals.session = session;
	event.locals.user = user;

	const path = event.url.pathname;

	if (!session && path !== '/login') {
		redirect(303, resolvePath('/login'));
	}
	if (session && path === '/login') {
		redirect(303, resolvePath('/'));
	}

	return resolve(event);
};

export const handle = sequence(supabase, authGuard);
