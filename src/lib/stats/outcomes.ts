// What a type's outcome field says over a window: Ensamtid's Lugn / Orolig /
// Vet ej per day, and the longest stretch she stayed calm (plan 22). Read from
// the type's own events, like detailDays, since only the catalogue knows which
// field is the outcome and which number it qualifies.

import * as time from '$lib/time';
import type { DetailRow } from './detailDays';

export type OutcomeDay = { day: string; n: number; yes: number; no: number };

/**
 * Per Stockholm day: every event, the ones answered yes, the ones answered no.
 * What is left over is "Vet ej", which stores nothing.
 */
export function outcomeDays(rows: DetailRow[], field: string): OutcomeDay[] {
	const days = new Map<string, OutcomeDay>();
	for (const row of rows) {
		const day = time.stockholmDay(new Date(row.occurred_at));
		const entry = days.get(day) ?? { day, n: 0, yes: 0, no: 0 };
		entry.n += 1;
		if (row.details?.[field] === true) entry.yes += 1;
		if (row.details?.[field] === false) entry.no += 1;
		days.set(day, entry);
	}
	return [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * The share answered yes among the answered ones, or null with none answered.
 * "Vet ej" neither helps nor hurts, the way the meal finish rate skips meals
 * nobody recorded.
 */
export function answeredShare(days: OutcomeDay[]): number | null {
	const yes = days.reduce((sum, day) => sum + day.yes, 0);
	const answered = days.reduce((sum, day) => sum + day.yes + day.no, 0);
	return answered === 0 ? null : yes / answered;
}

/**
 * The largest `value` among the events whose `when` is true: the longest alone
 * time she was calm through. Null when none qualifies.
 */
export function longestWhen(rows: DetailRow[], value: string, when: string): number | null {
	let longest: number | null = null;
	for (const row of rows) {
		const n = row.details?.[value];
		if (
			row.details?.[when] === true &&
			typeof n === 'number' &&
			(longest === null || n > longest)
		) {
			longest = n;
		}
	}
	return longest;
}
