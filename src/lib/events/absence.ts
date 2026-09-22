// An absence — the dog with someone else — is the one event that has an end.
// The end is a column, not a detail key, so it is parsed here rather than in
// details.ts; shared rather than server-only for the same reason details.ts
// is: the queue must refuse what the server would refuse, before the dialog
// closes on it.

import * as format from '$lib/format';
import * as locale from '$lib/locale';
import * as time from '$lib/time';
import type { EventCategory, EventRow } from '$lib/types/domain';

/** Whether events of this category run from a start to an end. */
export function isAbsence(category: EventCategory | null | undefined): boolean {
	return category === 'absence';
}

export type ParsedEnd = { ok: true; ended: Date | null } | { ok: false; message: string };

/**
 * Reads the optional end out of a form, against the start it has to follow.
 * Empty is a real answer — still away — and comes back as null.
 * ({ ended_at: "2026-09-21T16:30" }, 08:15 that day) → 14:30Z
 */
export function parseEnd(form: FormData, start: Date): ParsedEnd {
	const raw = String(form.get('ended_at') ?? '').trim();
	if (!raw) {
		return { ok: true, ended: null };
	}

	const ended = time.stockholmInputToUtc(raw);
	if (!ended) {
		return { ok: false, message: locale.errors.invalidTime };
	}
	if (ended.getTime() <= start.getTime()) {
		return { ok: false, message: locale.errors.endBeforeStart };
	}
	return { ok: true, ended };
}

/**
 * The line under an absence in a list: how long, and when she was back — or
 * that she is not yet. No clock is needed for the open case on purpose, so the
 * server and the hydrating client cannot disagree about it.
 * (08:15 → 16:30) → "8 timmar · hemma sön 21 sep 16:30", (08:15 → null) → "pågår"
 */
export function absenceText(event: Pick<EventRow, 'occurred_at' | 'ended_at'>): string {
	if (!event.ended_at) {
		return locale.activities.summary.ongoing;
	}
	const start = new Date(event.occurred_at);
	const end = new Date(event.ended_at);
	return locale.activities.summary.until(
		format.swedishDuration(end.getTime() - start.getTime()),
		format.eventTime(end)
	);
}
