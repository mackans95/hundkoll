import type { EventCategory, EventType, StatusRow, ViewRow } from '$lib/types/domain';
import type { Db } from './db';

/**
 * Lists the activity catalogue in display order — the rows that drive the log
 * grid, the status screen and the settings form alike.
 */
export async function listEventTypes(db: Db): Promise<EventType[]> {
	const { data } = await db
		.from('event_types')
		.select('id, label, category, icon, interval_days, sort_order')
		.order('sort_order');

	return (data ?? []).map((row) => ({ ...row, category: row.category as EventCategory }));
}

/**
 * Narrows one view row into a status row, or drops it. The view groups by dog
 * and type, so a row missing either is not a row worth showing.
 */
function toStatusRow(row: ViewRow<'dog_care_status'>): StatusRow | null {
	// The view is grouped by dog and type, so these are never null in
	// practice; dropping any row that lacks them keeps the promise honest.
	if (!row.dog_id || !row.type_id) {
		return null;
	}
	return {
		dog_id: row.dog_id,
		type_id: row.type_id,
		label: row.label ?? row.type_id,
		category: (row.category ?? 'routine') as EventCategory,
		icon: row.icon,
		interval_days: row.interval_days,
		last_at: row.last_at,
		due_at: row.due_at,
		sort_order: row.sort_order ?? 0
	};
}

/**
 * Last done and next due per activity, split for the Status screen: timer
 * cards for the types with an expected interval, a plain "last done" list
 * for the rest.
 */
export async function careStatus(db: Db): Promise<{ timed: StatusRow[]; untimed: StatusRow[] }> {
	const { data } = await db.from('dog_care_status').select('*').order('sort_order');

	const rows = (data ?? []).map(toStatusRow).filter((row): row is StatusRow => row !== null);

	return {
		timed: rows.filter((row) => row.interval_days !== null),
		untimed: rows.filter((row) => row.interval_days === null)
	};
}

/**
 * Saves whichever intervals the settings form changed, leaving the rest
 * untouched. Returns a Swedish error message, or null when all of them stuck.
 */
export async function saveIntervals(db: Db, form: FormData): Promise<string | null> {
	const { data: types } = await db.from('event_types').select('id, interval_days');

	for (const type of types ?? []) {
		const raw = String(form.get(`interval_${type.id}`) ?? '').trim();
		const value = raw === '' ? null : parseInt(raw, 10);
		if (value !== null && (!Number.isFinite(value) || value < 1)) {
			return 'Intervall måste vara ett antal dagar (minst 1).';
		}
		if (value === type.interval_days) {
			continue;
		}
		const { error } = await db
			.from('event_types')
			.update({ interval_days: value })
			.eq('id', type.id);
		if (error) {
			console.error('interval update failed:', error.code, error.message);
			return 'Kunde inte spara.';
		}
	}

	return null;
}
