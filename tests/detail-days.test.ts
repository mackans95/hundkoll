// Counting a type's detail fields per Stockholm day, which is what a generated
// card's tooltip breaks its bar down by. Pure, because the day a UTC instant
// belongs to is exactly the kind of thing worth pinning.

import { describe, expect, it } from 'vitest';
import type { DetailField } from '$lib/events/fields';
import { countDetailDays, dayBreakdown, dayMeans } from '$lib/stats/detailDays';

const FIELDS: DetailField[] = [
	{ name: 'duration_min', label: 'Längd', input: 'number' },
	{ name: 'accident', label: 'Olycka', input: 'reveal' },
	{ name: 'threw_up', label: 'Spydde', input: 'checkbox', revealedBy: 'accident' },
	{ name: 'pee', label: 'Kiss', input: 'count' }
];

describe('countDetailDays', () => {
	it('counts a ticked box once per event and sums a count field', () => {
		const counts = countDetailDays(
			[
				{
					occurred_at: '2026-08-20T09:00:00Z',
					details: { duration_min: 30, accident: true, threw_up: true, pee: 2 }
				},
				{ occurred_at: '2026-08-20T15:00:00Z', details: { duration_min: 10, pee: 1 } }
			],
			FIELDS
		);

		expect(counts).toEqual(
			expect.arrayContaining([
				{ day: '2026-08-20', field: 'accident', n: 1 },
				{ day: '2026-08-20', field: 'threw_up', n: 1 },
				{ day: '2026-08-20', field: 'pee', n: 3 }
			])
		);
	});

	// A number under a bar reads as a count and is not one, so it is kept as a
	// sum over the events that had it: the tooltip shows the mean, the length.
	it('keeps a number field as a sum over the events that had it', () => {
		const counts = countDetailDays(
			[
				{ occurred_at: '2026-08-20T09:00:00Z', details: { duration_min: 45 } },
				{ occurred_at: '2026-08-20T12:00:00Z', details: { duration_min: 15 } },
				{ occurred_at: '2026-08-20T15:00:00Z', details: {} }
			],
			FIELDS
		);
		expect(counts).toEqual([{ day: '2026-08-20', field: 'duration_min', n: 2, sum: 60 }]);
	});

	// The reason this is not a SQL date_trunc: a late-evening event in summer is
	// already the next day in UTC, and the chart's columns are Stockholm days.
	it('puts a late-evening event in its Stockholm day, not its UTC one', () => {
		const counts = countDetailDays(
			[{ occurred_at: '2026-08-20T22:30:00Z', details: { accident: true } }],
			FIELDS
		);
		expect(counts).toEqual([{ day: '2026-08-21', field: 'accident', n: 1 }]);
	});

	it('says nothing about a day where nothing was answered', () => {
		expect(
			countDetailDays(
				[{ occurred_at: '2026-08-20T09:00:00Z', details: { accident: false, pee: 0 } }],
				FIELDS
			)
		).toEqual([]);
	});
});

describe('dayBreakdown', () => {
	const counts = [
		{ day: '2026-08-20', field: 'pee', n: 3 },
		{ day: '2026-08-20', field: 'accident', n: 1 },
		{ day: '2026-08-20', field: 'threw_up', n: 1 },
		{ day: '2026-08-19', field: 'accident', n: 2 },
		{ day: '2026-08-20', field: 'duration_min', n: 2, sum: 60 }
	];

	// Declaration order, which is dialog order, and a reveal's causes nested in
	// it: one ride that threw up is one group, not two counts side by side.
	it('groups each reveal with what it revealed, in declaration order', () => {
		expect(dayBreakdown(counts, FIELDS, '2026-08-20')).toEqual([
			{ label: 'Olycka', n: 1, children: [{ label: 'Spydde', n: 1 }] },
			{ label: 'Kiss', n: 3, children: [] }
		]);
	});

	it('leaves out what did not happen, and is empty for a quiet day', () => {
		expect(dayBreakdown(counts, FIELDS, '2026-08-19')).toEqual([
			{ label: 'Olycka', n: 2, children: [] }
		]);
		expect(dayBreakdown(counts, FIELDS, '2026-08-18')).toEqual([]);
	});

	it('gives a number field as its sum and count, for the mean', () => {
		expect(dayMeans(counts, FIELDS, '2026-08-20')).toEqual([{ field: FIELDS[0], sum: 60, n: 2 }]);
		expect(dayMeans(counts, FIELDS, '2026-08-19')).toEqual([]);
	});
});
