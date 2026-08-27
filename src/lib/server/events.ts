import * as locale from '$lib/locale';
import { detailsMessage, parseDetails } from '$lib/events/details';
import { fieldsFor } from '$lib/events/fields';
import { countDetailDays } from '$lib/stats/detailDays';
import * as time from '$lib/time';
import type { Json } from '$lib/types/database';
import type {
	DetailDayCount,
	EventDetails,
	EventInsert,
	EventRow,
	FieldPoint,
	WeightPoint
} from '$lib/types/domain';
import type { Db } from './db';

/** The columns every list and the edit sheet read, with the catalogue row. */
const EVENT_COLUMNS = 'id, type_id, occurred_at, note, details, type:event_types(label, icon)';

/**
 * Reads the most recently logged events, newest first, with each one's
 * catalogue row attached so the list can show a label and an icon.
 * **Null means the read failed**, which is not the same thing as an empty
 * list — a page that cannot tell them apart shows "nothing logged yet" for a
 * dropped connection, and the service worker then keeps that copy.
 */
export async function recentEvents(db: Db, limit = 10): Promise<EventRow[] | null> {
	const { data, error } = await db
		.from('events')
		.select(EVENT_COLUMNS)
		.order('occurred_at', { ascending: false })
		// Both the dialog and the live walk submit whole minutes, so two events
		// sharing one are ordinary. Without a second key their order is
		// unspecified, and an edit rewrites the row — so an unrelated edit could
		// swap the pair, which reads as a row changing on its own.
		.order('created_at', { ascending: false })
		.limit(limit);

	if (error) {
		console.error('recent events read failed:', error.code, error.message);
		return null;
	}

	// `details` is jsonb; the keys it holds are the ones DETAIL_FIELDS wrote.
	return (data ?? []).map((row) => ({ ...row, details: (row.details ?? {}) as EventDetails }));
}

/**
 * Reads one Stockholm month of events, oldest first — what the history
 * calendar groups into day cells. Bounds come from time.monthBoundsUtc.
 */
export async function monthEvents(db: Db, from: string, to: string): Promise<EventRow[] | null> {
	const { data, error } = await db
		.from('events')
		.select(EVENT_COLUMNS)
		.gte('occurred_at', from)
		// Exclusive: `to` is the next month's first midnight.
		.lt('occurred_at', to)
		.order('occurred_at')
		// Same tie-break as recentEvents: a day cell's icons should not shuffle.
		.order('created_at');

	// Null for a failed read, as in recentEvents: an empty month and an
	// unreachable database are different things to be told.
	if (error) {
		console.error('month events read failed:', error.code, error.message);
		return null;
	}

	return (data ?? []).map((row) => ({ ...row, details: (row.details ?? {}) as EventDetails }));
}

/**
 * Reads one event for the edit sheet, or null when there is no such row —
 * which also covers another household's event, since RLS scopes the select.
 */
export async function getEvent(db: Db, id: string): Promise<EventRow | null> {
	const { data } = await db.from('events').select(EVENT_COLUMNS).eq('id', id).maybeSingle();

	return data ? { ...data, details: (data.details ?? {}) as EventDetails } : null;
}

/**
 * Reads one numeric detail field of a type over time, oldest first — what a
 * trend-line card plots. Rows without a number are dropped rather than
 * plotted as zero.
 */
export async function fieldHistory(db: Db, typeId: string, field: string): Promise<FieldPoint[]> {
	const { data } = await db
		.from('events')
		.select('occurred_at, details')
		.eq('type_id', typeId)
		.order('occurred_at');

	return (data ?? [])
		.map((row) => ({ occurred_at: row.occurred_at, value: (row.details as EventDetails)?.[field] }))
		.filter((point): point is FieldPoint => typeof point.value === 'number');
}

/**
 * Per-day counts of a type's countable detail fields, for a generated card's
 * tooltip. Reads the events themselves because the detail keys are per type and
 * no view can name them — the same reason fieldHistory above does.
 *
 * `since` is a Stockholm day (`2026-08-01`); the window is generous by a few
 * hours at the edge rather than exact, since the day a row lands in is decided
 * by countDetailDays, not by this filter.
 */
export async function detailDayCounts(
	db: Db,
	typeId: string,
	since: string
): Promise<DetailDayCount[]> {
	const { data, error } = await db
		.from('events')
		.select('occurred_at, details')
		.eq('type_id', typeId)
		.gte('occurred_at', since);

	// A tooltip is not worth failing a page for; it just loses its breakdown.
	if (error) {
		console.error('detail day counts read failed:', error.code, error.message);
	}

	return countDetailDays(
		(data ?? []).map((row) => ({
			occurred_at: row.occurred_at,
			details: (row.details ?? {}) as EventDetails
		})),
		fieldsFor(typeId)
	);
}

/** Reads every weighing, oldest first, lifting the kilos out of the details. */
export async function weightHistory(db: Db): Promise<WeightPoint[]> {
	const points = await fieldHistory(db, 'weight', 'kg');
	return points.map((point) => ({ occurred_at: point.occurred_at, kg: point.value }));
}

export type ParsedEvent = { ok: true; row: EventInsert } | { ok: false; message: string };

/**
 * Turn a submitted log form into a row.
 *
 * Dialog submissions carry every field and say so with `detailed`; a bare
 * submission carries only the type. Checkboxes are only trustworthy as
 * true/false when we know the form actually rendered them.
 */
export function parseEventForm(form: FormData, dogId: string): ParsedEvent {
	const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

	const typeId = String(form.get('type_id') ?? '');
	const row: EventInsert = { dog_id: dogId, type_id: typeId };

	// Generated when the dialog rendered, so a resubmit collides on the
	// primary key instead of logging the same walk twice.
	const eventId = String(form.get('event_id') ?? '');
	if (UUID_RE.test(eventId)) {
		row.id = eventId;
	}

	const occurredRaw = String(form.get('occurred_at') ?? '').trim();
	if (occurredRaw) {
		const occurred = time.stockholmInputToUtc(occurredRaw);
		if (!occurred) {
			return { ok: false, message: locale.errors.invalidTime };
		}
		row.occurred_at = occurred.toISOString();
	}

	if (form.has('detailed')) {
		const parsed = parseDetails(form, typeId);
		if (!parsed.ok) {
			return { ok: false, message: detailsMessage(parsed) };
		}
		if (Object.keys(parsed.details).length > 0) {
			// Every value DETAIL_FIELDS produces is a number or a boolean.
			row.details = parsed.details as Json;
		}
		const note = String(form.get('note') ?? '').trim();
		if (note) {
			row.note = note;
		}
	}

	return { ok: true, row };
}

/**
 * Stores an event. Returns a Swedish error message, or null when it landed —
 * including when it had already landed, since a duplicate is not a failure.
 */
export async function insertEvent(db: Db, row: EventInsert): Promise<string | null> {
	const { error } = await db.from('events').insert(row);
	// 23505 = unique violation: this exact event is already stored, so the
	// submission was a duplicate rather than a failure.
	if (error && error.code !== '23505') {
		console.error('event insert failed:', error.code, error.message);
		return locale.errors.logFailed;
	}
	return null;
}

/** The three columns an edit may touch; the rest are immutable by grant. */
export type EventPatch = { occurred_at: string; details: Json; note: string | null };

export type ParsedEdit = { ok: true; patch: EventPatch } | { ok: false; message: string };

/**
 * Turns an edit submission into a patch. The type comes from the stored row
 * rather than the form — an edit may not change which activity a row is.
 *
 * Parsed values are merged *over* the stored details rather than replacing
 * them, so keys the form never showed (a legacy portion_g, say) survive an
 * edit instead of being destroyed by it. A reveal is the exception — see
 * below.
 */
export function parseEventEdit(form: FormData, event: EventRow): ParsedEdit {
	const submitted = time.stockholmInputToUtc(String(form.get('occurred_at') ?? '').trim());
	if (!submitted) {
		return { ok: false, message: locale.errors.invalidTime };
	}

	// The field carries minutes only, so an untouched minute must keep the
	// stored instant: editing a note is not permission to move the event.
	// A minute that did change lands on :00, which is what was asked for.
	const stored = new Date(event.occurred_at);
	const occurred = time.sameMinute(submitted, stored) ? stored : submitted;

	const parsed = parseDetails(form, event.type_id);
	if (!parsed.ok) {
		return { ok: false, message: detailsMessage(parsed) };
	}

	const note = String(form.get('note') ?? '').trim();

	// A reveal and its causes are dropped from the parse when the box is
	// unticked, so merging would keep an accident on the row forever — there
	// would be no way to correct one that was logged by mistake. Those keys are
	// replaced wholesale; every other key keeps the merge above.
	const revealed = new Set<string>();
	for (const field of fieldsFor(event.type_id)) {
		if (field.input === 'reveal' || field.revealedBy) {
			revealed.add(field.name);
		}
	}
	const kept = Object.fromEntries(
		Object.entries(event.details).filter(([key]) => !revealed.has(key))
	);

	return {
		ok: true,
		patch: {
			occurred_at: occurred.toISOString(),
			// Every value DETAIL_FIELDS produces is a number or a boolean.
			details: { ...kept, ...parsed.details } as Json,
			note: note || null
		}
	};
}

/**
 * Applies an edit. Reports the row having gone — deleted on the other phone
 * while the sheet was open — rather than silently doing nothing.
 */
export async function updateEvent(db: Db, id: string, patch: EventPatch): Promise<string | null> {
	const { error, count } = await db
		.from('events')
		.update(patch, { count: 'exact' })
		.eq('id', id)
		.select('id');

	if (error) {
		console.error('event update failed:', error.code, error.message);
		return locale.errors.saveFailed;
	}
	return count === 0 ? locale.errors.eventGone : null;
}

/** Removes an event, saying so if it was already gone. */
export async function deleteEvent(db: Db, id: string): Promise<string | null> {
	const { error, count } = await db
		.from('events')
		.delete({ count: 'exact' })
		.eq('id', id)
		.select('id');

	if (error) {
		console.error('event delete failed:', error.code, error.message);
		return locale.errors.deleteFailed;
	}
	return count === 0 ? locale.errors.eventGone : null;
}

/** What an edit or a delete came to, for the route to phrase as a response. */
export type EditOutcome = { ok: true } | { ok: false; status: number; message: string };

/**
 * The whole edit, from submitted form to stored row. Kept here rather than in
 * the routes because both the log page and the history page offer it, and the
 * sequence — read the row, parse against *its* type, patch — must not drift
 * between them.
 */
export async function applyEventEdit(db: Db, form: FormData): Promise<EditOutcome> {
	// The row decides which fields exist and which details an edit must
	// preserve, and the form is not to be trusted for either.
	const event = await getEvent(db, String(form.get('event_id') ?? ''));
	if (!event) {
		return { ok: false, status: 404, message: locale.errors.eventGone };
	}

	const parsed = parseEventEdit(form, event);
	if (!parsed.ok) {
		return { ok: false, status: 400, message: parsed.message };
	}

	const message = await updateEvent(db, event.id, parsed.patch);
	return message ? { ok: false, status: 500, message } : { ok: true };
}

/** The delete half of the same pair. */
export async function applyEventDelete(db: Db, form: FormData): Promise<EditOutcome> {
	const message = await deleteEvent(db, String(form.get('event_id') ?? ''));
	return message ? { ok: false, status: 500, message } : { ok: true };
}
