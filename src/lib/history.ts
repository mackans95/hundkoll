// Pure row → calendar-cell logic, the way stats/ turns rows into columns:
// a month of events becomes one summary per Stockholm day, which is what a
// grid cell can show at a glance.

import * as time from '$lib/time';
import type { EventRow } from '$lib/types/domain';

/** What one day cell shows: how much happened, and roughly what. */
export type DaySummary = {
	count: number;
	/** In the order they were logged, capped by the caller's ICON_LIMIT. */
	icons: string[];
};

/** How many icons fit in a cell before the rest become "+n". */
export const ICON_LIMIT = 3;

/**
 * Summarises a month of events per Stockholm day, keyed by day so a cell can
 * look itself up. Days with nothing logged are simply absent.
 * [walk 08-14 07:00, meal 08-14 08:00] → { "2026-08-14": { count: 2, icons: […] } }
 */
export function summariseDays(events: EventRow[]): Record<string, DaySummary> {
	const days: Record<string, DaySummary> = {};

	for (const event of events) {
		const day = time.stockholmDay(new Date(event.occurred_at));
		const summary = (days[day] ??= { count: 0, icons: [] });
		summary.count += 1;
		if (summary.icons.length < ICON_LIMIT && event.type?.icon) {
			summary.icons.push(event.type.icon);
		}
	}

	return days;
}
