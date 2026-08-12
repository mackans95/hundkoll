import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

// Without generated database types, PostgREST embeds are typed as arrays;
// a to-one FK embed actually returns a single object.
type EventRow = {
	id: string;
	occurred_at: string;
	note: string | null;
	type: { label: string } | null;
};

export const load: PageServerLoad = async ({ locals: { supabase } }) => {
	const [dogResult, eventsResult] = await Promise.all([
		supabase.from('dogs').select('id, name').limit(1).maybeSingle(),
		supabase
			.from('events')
			.select('id, occurred_at, note, type:event_types(label)')
			.order('occurred_at', { ascending: false })
			.limit(10)
			.returns<EventRow[]>()
	]);

	return {
		dog: dogResult.data,
		events: eventsResult.data ?? []
	};
};

export const actions: Actions = {
	logWalk: async ({ locals: { supabase } }) => {
		const { data: dog } = await supabase.from('dogs').select('id').limit(1).maybeSingle();
		if (!dog) {
			return fail(400, { message: 'Ingen hund hittades. Har seed-SQL:en körts?' });
		}

		const { error } = await supabase.from('events').insert({ dog_id: dog.id, type_id: 'walk' });
		if (error) {
			return fail(500, { message: 'Kunde inte logga promenaden.' });
		}

		return { logged: true };
	},
	logout: async ({ locals: { supabase } }) => {
		await supabase.auth.signOut();
		redirect(303, '/login');
	}
};
