import { fail, redirect } from '@sveltejs/kit';
import { isAbsence } from '$lib/events/absence';
import { summariseDays } from '$lib/history';
import * as locale from '$lib/locale';
import { listEventTypes } from '$lib/server/care';
import { currentDog } from '$lib/server/dog';
import {
	applyEventDelete,
	applyEventEdit,
	getEvent,
	insertEvents,
	monthEvents,
	parseBulkForm
} from '$lib/server/events';
import { readsFailed } from '$lib/server/reads';
import * as time from '$lib/time';
import type { Actions, PageServerLoad } from './$types';

/**
 * Reads a month out of the query string, falling back to the current
 * Stockholm month when it is missing or not a real month.
 * "2026-08" → "2026-08", "2026-13" → this month
 */
function toMonth(raw: string | null, today: string): string {
	return raw !== null && time.monthBoundsUtc(raw) !== null ? raw : today.slice(0, 7);
}

/**
 * Keeps the whole view in the URL, minus either sheet, for redirects back. A
 * form's `?/update` replaces the query string, so the sheets carry month and
 * day in their action; the action's own `/name` key is dropped here.
 */
function withoutSheets(url: URL): string {
	const next = new URL(url);
	for (const key of [...next.searchParams.keys()]) {
		if (key.startsWith('/') || key === 'event' || key === 'add') {
			next.searchParams.delete(key);
		}
	}
	return next.pathname + next.search;
}

/** How many rows the Logga flera sheet opens with; Ny rad adds the rest. */
const STARTING_ROWS = 1;

export const load: PageServerLoad = async ({ url, setHeaders, locals: { supabase } }) => {
	const today = time.stockholmDay(new Date());
	const month = toMonth(url.searchParams.get('month'), today);
	// Non-null: toMonth only returns a month these bounds exist for.
	const bounds = time.monthBoundsUtc(month)!;

	const dayParam = url.searchParams.get('day');
	// A day only counts as selected while it belongs to the month on screen.
	const selected = dayParam?.startsWith(`${month}-`) ? dayParam : null;

	const eventParam = url.searchParams.get('event');
	const [read, types, editEvent] = await Promise.all([
		monthEvents(supabase, bounds.from, bounds.to),
		listEventTypes(supabase),
		eventParam ? getEvent(supabase, eventParam) : null
	]);

	// As on the log page: an empty month and an unreadable one are different,
	// and only the first is worth caching.
	readsFailed(setHeaders, read, types);
	const events = read ?? [];

	return {
		month,
		today,
		selected,
		days: time.calendarDays(month),
		summaries: summariseDays(events),
		eventsFailed: read === null,
		// The selected day's rows, out of the month already in hand.
		dayEvents: selected
			? events
					.filter((event) => time.stockholmDay(new Date(event.occurred_at)) === selected)
					.reverse()
			: [],
		editEvent,
		// What a Logga flera row may be. The absence type has two times and its
		// own dialog, so it is not offered here.
		bulkTypes: (types ?? []).filter((type) => !isAbsence(type.category)),
		// ?add opens the sheet server-side, the way ?event= opens the other one.
		// Only on a selected day that is not in the future.
		adding: url.searchParams.has('add') && selected !== null && selected <= today,
		// Made here so the server render and the client agree on them; each is
		// its row's event_id, so a resubmit collides instead of duplicating.
		bulkIds: Array.from({ length: STARTING_ROWS }, () => crypto.randomUUID()),
		previousMonth: time.addMonths(`${month}-01`, -1).slice(0, 7),
		nextMonth: time.addMonths(`${month}-01`, 1).slice(0, 7)
	};
};

// The same two actions the log page offers, over the same shared logic, so an
// edit behaves identically wherever the sheet was opened.
export const actions: Actions = {
	update: async ({ request, url, locals: { supabase } }) => {
		const outcome = await applyEventEdit(supabase, await request.formData());
		if (!outcome.ok) {
			return fail(outcome.status, { message: outcome.message });
		}

		// Back to the same month and day, without the sheet.
		redirect(303, withoutSheets(url));
	},

	delete: async ({ request, url, locals: { supabase } }) => {
		const outcome = await applyEventDelete(supabase, await request.formData());
		if (!outcome.ok) {
			return fail(outcome.status, { message: outcome.message });
		}

		redirect(303, withoutSheets(url));
	},

	// Logga flera: every row of the sheet in one insert. Straight to the server
	// like the two above — copying from paper is couch work, and a batch should
	// land whole or not at all.
	bulk: async ({ request, url, locals: { supabase } }) => {
		const form = await request.formData();

		const dog = await currentDog(supabase);
		if (!dog) {
			return fail(400, { message: locale.errors.noDog });
		}

		const parsed = parseBulkForm(form, dog.id, new Date());
		if (!parsed.ok) {
			return fail(400, { message: parsed.message });
		}

		const message = await insertEvents(supabase, parsed.rows);
		if (message) {
			return fail(500, { message });
		}

		redirect(303, withoutSheets(url));
	}
};
