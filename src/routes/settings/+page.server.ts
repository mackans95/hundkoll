import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { listEventTypes, saveIntervals } from '$lib/server/care';
import { readsFailed } from '$lib/server/reads';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, setHeaders, locals: { supabase } }) => {
	const types = await listEventTypes(supabase);
	readsFailed(setHeaders, types);

	return {
		types: types ?? [],
		// An empty interval form would otherwise look like a catalogue with
		// nothing in it, and save nothing while looking willing.
		typesFailed: types === null,
		saved: url.searchParams.has('saved')
	};
};

export const actions: Actions = {
	save: async ({ request, locals: { supabase } }) => {
		const message = await saveIntervals(supabase, await request.formData());
		if (message) {
			return fail(400, { message });
		}
		redirect(303, resolve('/settings?saved'));
	},
	logout: async ({ locals: { supabase } }) => {
		await supabase.auth.signOut();
		redirect(303, resolve('/login'));
	}
};
