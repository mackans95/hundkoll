import * as locale from '$lib/locale';
import { parseDetails } from '$lib/events/details';
import * as time from '$lib/time';
import type { Json } from '$lib/types/database';
import type { EventDetails, EventInsert, EventRow, WeightPoint } from '$lib/types/domain';
import type { Db } from './db';

/**
 * Reads the most recently logged events, newest first, with each one's
 * catalogue row attached so the list can show a label and an icon.
 */
export async function recentEvents(db: Db, limit = 10): Promise<EventRow[]> {
	const { data } = await db
		.from('events')
		.select('id, type_id, occurred_at, note, details, type:event_types(label, icon)')
		.order('occurred_at', { ascending: false })
		.limit(limit);

	// `details` is jsonb, so the generated type is the whole Json union; the
	// keys it actually holds are the ones DETAIL_FIELDS wrote.
	return (data ?? []).map((row) => ({ ...row, details: (row.details ?? {}) as EventDetails }));
}

/**
 * Reads every weighing, oldest first, lifting the kilos out of the details
 * column. Rows without a number are dropped rather than plotted as zero.
 */
export async function weightHistory(db: Db): Promise<WeightPoint[]> {
	const { data } = await db
		.from('events')
		.select('occurred_at, details')
		.eq('type_id', 'weight')
		.order('occurred_at');

	return (data ?? [])
		.map((row) => ({ occurred_at: row.occurred_at, kg: (row.details as EventDetails)?.kg }))
		.filter((point): point is WeightPoint => typeof point.kg === 'number');
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

	// The row id is generated when the dialog renders and travels with the
	// form, so a resubmit collides on the primary key instead of logging the
	// same walk twice.
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
