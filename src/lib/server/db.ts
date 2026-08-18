// The request-scoped Supabase client. $lib/server is refused by the bundler
// in browser code: queries live here, pages only format what comes back.

import { createServerClient } from '@supabase/ssr';
import { PUBLIC_SUPABASE_PUBLISHABLE_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Cookies } from '@sveltejs/kit';
import type { Database } from '$lib/types/database';

/** A client typed against the generated schema — every query is checked. */
export type Db = SupabaseClient<Database>;

/**
 * Builds a Supabase client for one request. One per request rather than one
 * per process, so two users are never served from the same session.
 */
export function createRequestClient(cookies: Cookies): Db {
	return createServerClient<Database>(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
		cookies: {
			getAll: () => cookies.getAll(),
			setAll: (cookiesToSet) => {
				cookiesToSet.forEach(({ name, value, options }) => {
					// SvelteKit requires an explicit path on every cookie.
					cookies.set(name, value, { ...options, path: '/' });
				});
			}
		}
	});
}
