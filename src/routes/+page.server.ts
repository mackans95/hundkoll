import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import * as locale from '$lib/locale';
import { listEventTypes } from '$lib/server/care';
import { currentDog } from '$lib/server/dog';
import {
	applyEventDelete,
	applyEventEdit,
	applyEventReturn,
	currentAbsence,
	getEvent,
	insertEvent,
	parseEventForm,
	recentEvents
} from '$lib/server/events';
import { readsFailed } from '$lib/server/reads';
import * as time from '$lib/time';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, setHeaders, locals: { supabase } }) => {
	// ?event=<id> renders the edit sheet server-side, the same way ?detail=
	// renders the log dialog — so both open without JavaScript.
	const eventParam = url.searchParams.get('event');

	const [dog, types, events, away, editEvent] = await Promise.all([
		currentDog(supabase),
		listEventTypes(supabase),
		recentEvents(supabase),
		currentAbsence(supabase),
		eventParam ? getEvent(supabase, eventParam) : null
	]);

	// ?detail=<type_id> renders the backdating dialog server-side, so it
	// opens (and closes, via a plain link to "/") without JavaScript.
	const detailParam = url.searchParams.get('detail');

	// Every read, not just the events one. A failed catalogue read is the most
	// visible — it takes the log buttons with it — and a failed absence read
	// would cache a page that says she is home when she is not.
	readsFailed(setHeaders, types, events, away);

	return {
		dog,
		types: types ?? [],
		events: events ?? [],
		/** The open absence, if any; the card and the busy tile come from it. */
		away: away?.event ?? null,
		// The moment the page renders from, so the card's elapsed time agrees
		// between server render and hydration.
		now: new Date(),
		// Told apart from "nothing logged yet", which is what this used to
		// look like whenever the read failed.
		eventsFailed: events === null,
		// Same distinction for the grid: no activities and no answer are not
		// the same screen.
		typesFailed: types === null,
		editEvent,
		detailType: types?.find((type) => type.id === detailParam) ?? null,
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
	},

	// Hemma igen: closes the open absence at this moment. An update like the
	// two above, so it goes straight to the server rather than through the queue.
	return: async ({ request, locals: { supabase } }) => {
		const outcome = await applyEventReturn(supabase, await request.formData());
		if (!outcome.ok) {
			return fail(outcome.status, { message: outcome.message });
		}

		redirect(303, resolve('/'));
	}
};
