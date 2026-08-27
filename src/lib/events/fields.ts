// Per-type detail fields, shared by the dialog form (rendering), the form
// action (parsing) and the recent-events list (summarize) — declaring a field
// here is all it takes to collect it and show it back.
//
// 'count' is a −/+ stepper. 'reveal' is a checkbox that uncovers the fields
// naming it in revealedBy, and is not valid until one of them is answered:
// "olycka" with no cause is not something that happened.

import * as locale from '$lib/locale';

export type DetailField = {
	name: string;
	label: string;
	input: 'number' | 'checkbox' | 'count' | 'reveal';
	step?: string;
	required?: boolean;
	/**
	 * The reveal that has to be ticked before this field exists. Declare the
	 * reveal first: parsing reads the list in order, and a child is decided by
	 * its parent's value.
	 */
	revealedBy?: string;
	/** How the value reads in the events list; null hides it. */
	summarize?: (value: unknown) => string | null;
};

/**
 * Names a count of something, leaving the number off when there was only one.
 * Accepts the older rows that stored a plain boolean, reading true as one.
 * (3, "kiss") → "kiss ×3", (true, "kiss") → "kiss"
 */
function countText(value: unknown, word: string): string | null {
	if (value === true) {
		return word;
	}
	if (typeof value === 'number' && value > 0) {
		return value > 1 ? locale.activities.summary.repeated(word, value) : word;
	}
	return null;
}

export const DETAIL_FIELDS: Record<string, DetailField[]> = {
	// codegen:detail-fields — npm run new-event inserts new types here
	car_ride: [
		{
			name: 'duration_min',
			label: locale.activities.fields.durationMin,
			input: 'number',
			required: true,
			summarize: (value) =>
				typeof value === 'number' ? locale.units.minutes(String(value).replace('.', ',')) : null
		},
		{
			name: 'accident',
			label: locale.activities.fields.accident,
			input: 'reveal'
		},
		{
			name: 'pooped',
			label: locale.activities.fields.pooped,
			input: 'checkbox',
			revealedBy: 'accident',
			summarize: (value) => (value === true ? locale.activities.summary.pooped : null)
		},
		{
			name: 'threw_up',
			label: locale.activities.fields.threwUp,
			input: 'checkbox',
			revealedBy: 'accident',
			summarize: (value) => (value === true ? locale.activities.summary.threwUp : null)
		}
	],
	walk: [
		{
			name: 'duration_min',
			label: locale.activities.fields.durationMin,
			input: 'number',
			summarize: (value) => (typeof value === 'number' ? locale.units.minutes(String(value)) : null)
		},
		{
			name: 'pee',
			label: locale.activities.fields.pee,
			input: 'count',
			summarize: (value) => countText(value, locale.activities.summary.pee)
		},
		{
			name: 'poop',
			label: locale.activities.fields.poop,
			input: 'count',
			summarize: (value) => countText(value, locale.activities.summary.poop)
		}
	],
	accident: [
		{
			name: 'pee',
			label: locale.activities.fields.pee,
			input: 'count',
			summarize: (value) => countText(value, locale.activities.summary.pee)
		},
		{
			name: 'poop',
			label: locale.activities.fields.poop,
			input: 'count',
			summarize: (value) => countText(value, locale.activities.summary.poop)
		}
	],
	// Portion size is always the same, so meals only track whether she
	// finished; legacy portion_g rows still render via LEGACY_SUMMARIES.
	meal: [
		{
			name: 'finished',
			label: locale.activities.fields.finished,
			input: 'checkbox',
			summarize: (value) =>
				value === true
					? locale.activities.summary.finished
					: value === false
						? locale.activities.summary.notFinished
						: null
		}
	],
	weight: [
		{
			name: 'kg',
			label: locale.activities.fields.weightKg,
			input: 'number',
			step: '0.1',
			required: true,
			summarize: (value) =>
				typeof value === 'number' ? locale.units.kilograms(String(value).replace('.', ',')) : null
		}
	]
};

/**
 * Detail keys older rows carry that no current field declares — append-only
 * history, never collected again but still read. Summarized ahead of the
 * declared fields, matching how those rows have always rendered.
 */
export const LEGACY_SUMMARIES: Record<
	string,
	{ name: string; summarize: (value: unknown) => string | null }[]
> = {
	meal: [
		{
			name: 'portion_g',
			summarize: (value) => (typeof value === 'number' ? locale.units.grams(String(value)) : null)
		}
	]
};

/**
 * The types a tile tap logs live — start now, finish later — instead of
 * opening the backdating dialog. Declared here with the other per-type
 * facts, so a future timed activity is one id.
 */
export const LIVE_TYPE_IDS = new Set(['walk']);

/**
 * Lists the detail fields an activity collects, which is none for most of
 * them — a nail trim is just a timestamp.
 * "walk" → three fields, "bath" → []
 */
export function fieldsFor(typeId: string): DetailField[] {
	return DETAIL_FIELDS[typeId] ?? [];
}

/** The fields one reveal uncovers, in declaration order. */
export function fieldsRevealedBy(fields: DetailField[], name: string): DetailField[] {
	return fields.filter((field) => field.revealedBy === name);
}
