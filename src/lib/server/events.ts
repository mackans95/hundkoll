import * as locale from '$lib/locale';
import { parseDetails } from '$lib/events/details';
import * as time from '$lib/time';
import type { Json } from '$lib/types/database';
import type {
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
 */
export async function recentEvents(db: Db, limit = 10): Promise<EventRow[]> {
	const { data } = await db
		.from('events')
		.select(EVENT_COLUMNS)
		.order('occurred_at', { ascending: false })
		.limit(limit);

	// `details` is jsonb; the keys it holds are the ones DETAIL_FIELDS wrote.
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
			return { ok: false, message: locale.errors.invalidValue(parsed.field) };
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
 * edit instead of being destroyed by it.
 */
export function parseEventEdit(form: FormData, event: EventRow): ParsedEdit {
	const occurred = time.stockholmInputToUtc(String(form.get('occurred_at') ?? '').trim());
	if (!occurred) {
		return { ok: false, message: locale.errors.invalidTime };
	}

	const parsed = parseDetails(form, event.type_id);
	if (!parsed.ok) {
		return { ok: false, message: locale.errors.invalidValue(parsed.field) };
	}

	const note = String(form.get('note') ?? '').trim();

	return {
		ok: true,
		patch: {
			occurred_at: occurred.toISOString(),
			// Every value DETAIL_FIELDS produces is a number or a boolean.
			details: { ...event.details, ...parsed.details } as Json,
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
