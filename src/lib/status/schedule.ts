import type { StatusRow } from '$lib/types/domain';
import * as time from '$lib/time';

/**
 * Whether the type has an expectation at all: a fixed number, or the average standing in for one.
 */
export function isScheduled(row: StatusRow): boolean {
	return row.interval_type === 'average' || row.interval !== null;
}

/**
 * A type measured in hours or by the average - the ones on top of the Status page.
 */
export function isDaily(row: StatusRow): boolean {
	return row.interval_type !== 'days';
}

/**
 * The stockholm day has turned since last event, so a daily type is waiting for the new day rather than overdue.
 */
export function awaitingNewDay(row: StatusRow, now: Date): boolean {
	if (!isDaily(row)) {
		return false;
	}

	if (!row.last_at) {
		return false;
	}

	return time.stockholmDay(now) > time.stockholmDay(new Date(row.last_at));
}
