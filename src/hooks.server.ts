import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
// Aliased: `resolve` is already the name of the handle's own argument.
import { resolve as resolvePath } from '$app/paths';
import { verifiedUserId } from '$lib/server/auth';
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

	return resolve(event);
};

export const handle = sequence(supabase, authGuard);
