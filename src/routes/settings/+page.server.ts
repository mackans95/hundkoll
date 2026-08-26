import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { listEventTypes, saveIntervals } from '$lib/server/care';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals: { supabase } }) => {
	return {
		types: await listEventTypes(supabase),
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
