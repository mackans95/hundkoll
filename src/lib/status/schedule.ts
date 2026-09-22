import type { StatusRow, EventType, IntervalType } from '$lib/types/domain';
import * as time from '$lib/time';
import * as locale from '$lib/locale';

/**
 * Whether the type has an expectation at all: a fixed number, or the average standing in for one.
 */
export function isScheduled(row: Pick<StatusRow, 'interval' | 'interval_type'>): boolean {
	return row.interval_type === 'average' || row.interval !== null;
}

/**
 * A type measured in hours or by the average - the ones on top of the Status page.
 */
export function isDaily(row: Pick<StatusRow, 'interval' | 'interval_type'>): boolean {
	return row.interval_type !== 'days';
}

/**
 * The instant the schedule counts from. Usually the last event; for a daily
 * type whose last event predates an absence, the return from it — the view
 * decides which, this only reads it back. Null when nothing was ever logged.
 */
export function countedFrom(row: Pick<StatusRow, 'last_at' | 'due_from'>): string | null {
	return row.due_from ?? row.last_at;
}

/**
 * The stockholm day has turned since last event, so a daily type is waiting for the new day rather than overdue.
 */
export function awaitingNewDay(row: StatusRow, now: Date): boolean {
	if (!isDaily(row)) {
		return false;
	}

	const from = countedFrom(row);
	if (!from) {
		return false;
	}

	return time.stockholmDay(now) > time.stockholmDay(new Date(from));
}

/** The two columns Settings may write - the same two the grant allows. */
type IntervalPatch = Partial<Pick<EventType, 'interval' | 'interval_type'>>;

/** What the settings form asks to change, or why it cannot. */
export type IntervalPlan = { error: string } | { changes: { id: string; patch: IntervalPatch }[] };

/**
 * Turns the settings form into the updates it implies, against what is stored.
 * Pure, so the rules are testable: only daily types may change mode, hours
 * needs a number, and a row the form did not change produces no write.
 */
export function planIntervalChanges(
	types: Pick<EventType, 'id' | 'interval' | 'interval_type'>[],
	form: FormData
): IntervalPlan {
	const changes: { id: string; patch: IntervalPatch }[] = [];

	for (const type of types) {
		// Only a daily row has a select; everyone else keeps theirs.
		const mode = isDaily(type)
			? ((form.get(`mode_${type.id}`) ?? type.interval_type) as IntervalType)
			: type.interval_type;

		const raw = String(form.get(`interval_${type.id}`) ?? '').trim();
		const value = raw === '' ? null : parseInt(raw, 10);

		if (value !== null && (!Number.isFinite(value) || value < 1)) {
			return { error: locale.errors.intervalRange };
		}

		// Hours without a number is not a schedule
		if (mode === 'hours' && value === null) {
			return { error: locale.errors.modeHoursNoNumber };
		}

		// Untouched: both columns already say this.
		if (value === type.interval && mode === type.interval_type) {
			continue;
		}

		// Only what differs
		const patch: IntervalPatch = {};
		if (value !== type.interval) patch.interval = value;
		if (mode !== type.interval_type) patch.interval_type = mode;

		changes.push({ id: type.id, patch });
	}

	return { changes };
}
