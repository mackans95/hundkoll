import { fail, redirect } from '@sveltejs/kit';
import { listEventTypes } from '$lib/server/care';
import { currentDog } from '$lib/server/dog';
import { insertEvent, parseEventForm, recentEvents } from '$lib/server/events';
import * as time from '$lib/time';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals: { supabase } }) => {
	const [dog, types, events] = await Promise.all([
		currentDog(supabase),
		listEventTypes(supabase),
		recentEvents(supabase)
	]);

	// ?detail=<type_id> renders the backdating dialog server-side, so it
	// opens (and closes, via a plain link to "/") without JavaScript.
	const detailParam = url.searchParams.get('detail');

	return {
		dog,
		types,
		events,
		detailType: types.find((type) => type.id === detailParam) ?? null,
		nowLocal: time.stockholmNowForInput(),
		// The row id travels with the form so a resubmit — a double tap, or a
		// retry after a response was lost — collides on the primary key
		// instead of inserting the same walk twice.
		eventId: crypto.randomUUID()
	};
};

export const actions: Actions = {
	log: async ({ request, locals: { supabase } }) => {
		const form = await request.formData();

		const dog = await currentDog(supabase);
		if (!dog) {
			return fail(400, { message: 'Ingen hund hittades. Har seed-SQL:en körts?' });
		}

		const parsed = parseEventForm(form, dog.id);
		if (!parsed.ok) {
			return fail(400, { message: parsed.message });
		}

		const message = await insertEvent(supabase, parsed.row);
		if (message) {
			return fail(500, { message });
		}

		// Also clears any ?detail= param, closing the dialog.
		redirect(303, '/');
	}
};
