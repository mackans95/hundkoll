import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import * as locale from '$lib/locale';
import { listEventTypes } from '$lib/server/care';
import { currentDog } from '$lib/server/dog';
import {
	applyEventDelete,
	applyEventEdit,
	getEvent,
	insertEvent,
	parseEventForm,
	recentEvents
} from '$lib/server/events';
import * as time from '$lib/time';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, setHeaders, locals: { supabase } }) => {
	// ?event=<id> renders the edit sheet server-side, the same way ?detail=
	// renders the log dialog — so both open without JavaScript.
	const eventParam = url.searchParams.get('event');

	const [dog, types, events, editEvent] = await Promise.all([
		currentDog(supabase),
		listEventTypes(supabase),
		recentEvents(supabase),
		eventParam ? getEvent(supabase, eventParam) : null
	]);

	// ?detail=<type_id> renders the backdating dialog server-side, so it
	// opens (and closes, via a plain link to "/") without JavaScript.
	const detailParam = url.searchParams.get('detail');

	// A page with a hole in it must not become the copy the service worker
	// serves on the next launch, which would keep showing the hole.
	if (events === null) {
		setHeaders({ 'cache-control': 'no-store' });
	}

	return {
		dog,
		types,
		events: events ?? [],
		// Told apart from "nothing logged yet", which is what this used to
		// look like whenever the read failed.
		eventsFailed: events === null,
		editEvent,
		detailType: types.find((type) => type.id === detailParam) ?? null,
		nowLocal: time.stockholmNowForInput(),
		// Travels with the form so a resubmit collides on the primary key
		// instead of inserting the same walk twice.
		eventId: crypto.randomUUID()
	};
};

export const actions: Actions = {
	log: async ({ request, locals: { supabase } }) => {
		const form = await request.formData();

		const dog = await currentDog(supabase);
		if (!dog) {
			return fail(400, { message: locale.errors.noDog });
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
		redirect(303, resolve('/'));
	},

	// Edits go straight to the server rather than through the offline queue:
	// logging happens on walks, correcting happens on the couch.
	update: async ({ request, locals: { supabase } }) => {
		const outcome = await applyEventEdit(supabase, await request.formData());
		if (!outcome.ok) {
			return fail(outcome.status, { message: outcome.message });
		}

		// Clears ?event=, closing the sheet, and reloads the lists — every
		// stat is a SQL view, so the charts follow with no work here.
		redirect(303, resolve('/'));
	},

	delete: async ({ request, locals: { supabase } }) => {
		const outcome = await applyEventDelete(supabase, await request.formData());
		if (!outcome.ok) {
			return fail(outcome.status, { message: outcome.message });
		}

		redirect(303, resolve('/'));
	}
};
