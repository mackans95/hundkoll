// What a type's outcome field says over a window: Ensamtid's Lugn / Orolig /
// Vet ej per day, and the longest stretch she stayed calm (plan 22). Read from
// the type's own events, like detailDays, since only the catalogue knows which
// field is the outcome, which number it measures and what it reveals.

import type { DetailField } from '$lib/events/fields';
import * as time from '$lib/time';
import type { DetailRow } from './detailDays';

/** A mean still being summed: enough to write "~42 min", or "42 min" for one. */
export type Mean = { sum: number; n: number };

/** One outcome's events on one day, and what they said under it. */
export type OutcomeGroup = {
	count: number;
	/** The measured number (the length), over this group's events. */
	measure: Mean;
	/** The revealed number fields ("Orolig efter"), over the events that have them. */
	numbers: Record<string, Mean>;
	/** The revealed checkboxes (Ylade, Rastlös …): how many of this group's events ticked each. */
	counts: Record<string, number>;
};

export type OutcomeDay = {
	day: string;
	n: number;
	measure: Mean;
	yes: OutcomeGroup;
	no: OutcomeGroup;
	unknown: OutcomeGroup;
};

/** Which fields to read: the outcome, the number it qualifies, and what it reveals. */
export type OutcomeSpec = { outcome: string; measure: string; revealed: DetailField[] };

const emptyMean = (): Mean => ({ sum: 0, n: 0 });
const emptyGroup = (): OutcomeGroup => ({
	count: 0,
	measure: emptyMean(),
	numbers: {},
	counts: {}
});

function add(mean: Mean, value: unknown): void {
	if (typeof value === 'number') {
		mean.sum += value;
		mean.n += 1;
	}
}

/**
 * Per Stockholm day: every event, then each outcome's own events with their
 * mean length and the answers under them, so a tooltip can show Orolig's
 * signs inside Orolig rather than beside it as if they were more events.
 */
export function outcomeDays(rows: DetailRow[], spec: OutcomeSpec): OutcomeDay[] {
	const days = new Map<string, OutcomeDay>();
	for (const row of rows) {
		const day = time.stockholmDay(new Date(row.occurred_at));
		const entry = days.get(day) ?? {
			day,
			n: 0,
			measure: emptyMean(),
			yes: emptyGroup(),
			no: emptyGroup(),
			unknown: emptyGroup()
		};
		const details = row.details ?? {};
		const answer = details[spec.outcome];
		const group = answer === true ? entry.yes : answer === false ? entry.no : entry.unknown;

		entry.n += 1;
		add(entry.measure, details[spec.measure]);
		group.count += 1;
		add(group.measure, details[spec.measure]);
		for (const field of spec.revealed) {
			const value = details[field.name];
			if (field.input === 'number') {
				add((group.numbers[field.name] ??= emptyMean()), value);
			} else if (value === true) {
				group.counts[field.name] = (group.counts[field.name] ?? 0) + 1;
			}
		}
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
	const yes = days.reduce((sum, day) => sum + day.yes.count, 0);
	const answered = days.reduce((sum, day) => sum + day.yes.count + day.no.count, 0);
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
