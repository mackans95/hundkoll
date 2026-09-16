import * as locale from '$lib/locale';
import type { EventCategory, EventType, StatusRow, ViewRow, IntervalType } from '$lib/types/domain';
import type { Db } from './db';
import { isDaily, isScheduled } from '$lib/status/schedule';

/**
 * Lists the activity catalogue in display order — the rows that drive the log
 * grid, the status screen and the settings form alike.
 *
 * **Null means the read failed**, which is not the same thing as a catalogue
 * with nothing in it. This used to return an empty list on failure, on the
 * theory that an empty log grid was loud enough on its own. It was not: the grid
 * is `{#each types}`, so the buttons simply were not there, and nothing marked
 * the page as not worth caching — so the service worker kept serving the
 * tile-less copy until someone reloaded by hand.
 */
export async function listEventTypes(db: Db): Promise<EventType[] | null> {
	const { data, error } = await db
		.from('event_types')
		.select('id, label, category, icon, interval, interval_type, sort_order')
		.order('sort_order');

	if (error) {
		console.error('event types read failed:', error.code, error.message);
		return null;
	}

	return (data ?? []).map((row) => ({
		...row,
		category: row.category as EventCategory,
		interval_type: row.interval_type as IntervalType
	}));
}

/**
 * Narrows one view row into a status row, or drops it. The view groups by dog
 * and type, so a row missing either is not a row worth showing.
 */
function toStatusRow(row: ViewRow<'dog_care_status'>): StatusRow | null {
	if (!row.dog_id || !row.type_id) {
		return null;
	}
	return {
		dog_id: row.dog_id,
		type_id: row.type_id,
		label: row.label ?? row.type_id,
		category: (row.category ?? 'routine') as EventCategory,
		icon: row.icon,
		interval: row.interval,
		interval_type: (row.interval_type ?? 'days') as IntervalType,
		last_at: row.last_at,
		due_at: row.due_at,
		sort_order: row.sort_order ?? 0
	};
}

/**
 * Last done and next due per activity, split for the Status screen:
 * daily cards on top, timer cards for the types with an expected interval,
 * a plain "last done" list for the rest.
 */
export async function careStatus(
	db: Db
): Promise<{ daily: StatusRow[]; timed: StatusRow[]; untimed: StatusRow[] } | null> {
	const { data, error } = await db.from('dog_care_status').select('*').order('sort_order');

	// Null for a failed read, as everywhere else: a dog with nothing tracked and
	// an unreachable database are different things to be shown.
	if (error) {
		console.error('care status read failed:', error.code, error.message);
		return null;
	}

	const rows = (data ?? []).map(toStatusRow).filter((row): row is StatusRow => row !== null);

	return {
		daily: rows.filter((row) => isScheduled(row) && isDaily(row)),
		timed: rows.filter((row) => isScheduled(row) && !isDaily(row)),
		untimed: rows.filter((row) => !isScheduled(row))
	};
}

/**
 * Saves whichever intervals the settings form changed, leaving the rest
 * untouched. Returns a Swedish error message, or null when all of them stuck.
 */
export async function saveIntervals(db: Db, form: FormData): Promise<string | null> {
	const { data: types } = await db.from('event_types').select('id, interval');

	for (const type of types ?? []) {
		const raw = String(form.get(`interval_${type.id}`) ?? '').trim();
		const value = raw === '' ? null : parseInt(raw, 10);
		if (value !== null && (!Number.isFinite(value) || value < 1)) {
			return locale.errors.intervalRange;
		}
		if (value === type.interval) {
			continue;
		}
		const { error } = await db.from('event_types').update({ interval: value }).eq('id', type.id);
		if (error) {
			console.error('interval update failed:', error.code, error.message);
			return locale.errors.saveFailed;
		}
	}

	return null;
}
