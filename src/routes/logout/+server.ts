import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { RequestHandler } from './$types';

// A plain form post from the menu, on every page, so it can't be a page action.
export const POST: RequestHandler = async ({ locals: { supabase } }) => {
	await supabase.auth.signOut();
	redirect(303, resolve('/login'));
};
