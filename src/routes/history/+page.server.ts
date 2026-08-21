import { fail, redirect } from '@sveltejs/kit';
import { summariseDays } from '$lib/history';
import { applyEventDelete, applyEventEdit, getEvent, monthEvents } from '$lib/server/events';
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

/** Keeps the whole view in the URL, minus the sheet, for redirects back. */
function withoutEvent(url: URL): string {
	const next = new URL(url);
	next.searchParams.delete('event');
	return next.pathname + next.search;
}

export const load: PageServerLoad = async ({ url, locals: { supabase } }) => {
	const today = time.stockholmDay(new Date());
	const month = toMonth(url.searchParams.get('month'), today);
	// Non-null: toMonth only returns a month these bounds exist for.
	const bounds = time.monthBoundsUtc(month)!;

	const dayParam = url.searchParams.get('day');
	// A day only counts as selected while it belongs to the month on screen.
	const selected = dayParam?.startsWith(`${month}-`) ? dayParam : null;

	const eventParam = url.searchParams.get('event');
	const [events, editEvent] = await Promise.all([
		monthEvents(supabase, bounds.from, bounds.to),
		eventParam ? getEvent(supabase, eventParam) : null
	]);

	return {
		month,
		today,
		selected,
		days: time.calendarDays(month),
		summaries: summariseDays(events),
		// The selected day's rows, out of the month already in hand.
		dayEvents: selected
			? events
					.filter((event) => time.stockholmDay(new Date(event.occurred_at)) === selected)
					.reverse()
			: [],
		editEvent,
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
		redirect(303, withoutEvent(url));
	},

	delete: async ({ request, url, locals: { supabase } }) => {
		const outcome = await applyEventDelete(supabase, await request.formData());
		if (!outcome.ok) {
			return fail(outcome.status, { message: outcome.message });
		}

		redirect(303, withoutEvent(url));
	}
};
