// The request-scoped Supabase client. Everything under $lib/server is
// refused by the bundler if a browser module ever imports it, which is the
// point: queries live here, pages only format what comes back.

import { createServerClient } from '@supabase/ssr';
import { PUBLIC_SUPABASE_PUBLISHABLE_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Cookies } from '@sveltejs/kit';
import type { Database } from '$lib/types/database';

/** A client typed against the generated schema — every query is checked. */
export type Db = SupabaseClient<Database>;

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
