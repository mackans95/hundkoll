import { createServerClient } from '@supabase/ssr';
import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { PUBLIC_SUPABASE_PUBLISHABLE_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';

const supabase: Handle = async ({ event, resolve }) => {
	event.locals.supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
		cookies: {
			getAll: () => event.cookies.getAll(),
			setAll: (cookiesToSet) => {
				cookiesToSet.forEach(({ name, value, options }) => {
					// SvelteKit requires an explicit path on every cookie.
					event.cookies.set(name, value, { ...options, path: '/' });
				});
			}
		}
	});

	event.locals.safeGetSession = async () => {
		const {
			data: { session }
		} = await event.locals.supabase.auth.getSession();
		if (!session) {
			return { session: null, user: null };
		}

		// getSession() reads the cookie without verifying it; getUser()
		// authenticates against the Auth server before we trust anything.
		const {
			data: { user },
			error
		} = await event.locals.supabase.auth.getUser();
		if (error || !user) {
			return { session: null, user: null };
		}

		// Rebuild the session around the verified user. Reading session.user
		// from the getSession() result — even implicitly, when SvelteKit
		// serializes page data — is what triggers the "could be insecure"
		// console warning.
		const { access_token, refresh_token, expires_at, expires_in, token_type } = session;
		return {
			session: { access_token, refresh_token, expires_at, expires_in, token_type, user },
			user
		};
	};

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
	const isPublic = path === '/login' || path.startsWith('/auth');

	if (!session && !isPublic) {
		redirect(303, '/login');
	}
	if (session && path === '/login') {
		redirect(303, '/');
	}

	return resolve(event);
};

export const handle = sequence(supabase, authGuard);
