// Pairing the generic view rows back up into the shapes the cards read. The
// views are per type and per detail field, so every column a card wants is a
// lookup that can miss — and what a miss means differs per column.

import { describe, expect, it } from 'vitest';
import {
	accidentBins,
	mealDays,
	simpleDays,
	statSummary,
	trendBuckets,
	walkDays
} from '$lib/stats/rows';
import type {
	DetailBucketRow,
	DetailWindowRow,
	TypeBucketRow,
	TypeWindowRow
} from '$lib/types/domain';

const bucket = (
	type_id: string,
	bucket: string,
	n: number,
	avg_gap_min: number | null = null
): TypeBucketRow => ({ type_id, bucket, n, avg_gap_min });

const detail = (
	type_id: string,
	bucket: string,
	field: string,
	part: Partial<DetailBucketRow> = {}
): DetailBucketRow => ({
	type_id,
	bucket,
	field,
	answered: 0,
	happened: 0,
	total: 0,
	avg_number: null,
	share_answered: null,
	...part
});

describe('walkDays', () => {
	const buckets = [bucket('walk', '2026-08-20', 3, 210), bucket('meal', '2026-08-20', 2)];
	const details = [
		detail('walk', '2026-08-20', 'pee', { answered: 3, happened: 3, total: 5 }),
		detail('walk', '2026-08-20', 'duration_min', { answered: 3, avg_number: 22.5 }),
		detail('meal', '2026-08-20', 'finished', { answered: 2, happened: 2 })
	];

	it('takes its own type only, and its own fields', () => {
		expect(walkDays(buckets, details)).toEqual([
			{ day: '2026-08-20', n: 3, pee: 5, poop: 0, avg_gap_min: 210, avg_duration_min: 22.5 }
		]);
	});

	// A day nobody recorded a bajs on has no row for the field, and that is a
	// zero — the same reading the old summed column gave.
	it('reads a field with no row as zero, and a missing average as null', () => {
		expect(walkDays([bucket('walk', '2026-08-21', 1)], [])).toEqual([
			{ day: '2026-08-21', n: 1, pee: 0, poop: 0, avg_gap_min: null, avg_duration_min: null }
		]);
	});
});

describe('mealDays', () => {
	// The case a subtraction from n would get wrong: three meals, two of them
	// answered for, one finished. The unanswered meal is neither.
	it('counts unfinished from what was answered, not from the meal count', () => {
		expect(
			mealDays(
				[bucket('meal', '2026-08-20', 3)],
				[detail('meal', '2026-08-20', 'finished', { answered: 2, happened: 1 })]
			)
		).toEqual([
			{ day: '2026-08-20', n: 3, finished_true: 1, finished_false: 1, avg_gap_min: null }
		]);
	});

	it('leaves a day nobody answered for at neither', () => {
		expect(mealDays([bucket('meal', '2026-08-20', 2)], [])).toEqual([
			{ day: '2026-08-20', n: 2, finished_true: 0, finished_false: 0, avg_gap_min: null }
		]);
	});
});

describe('accidentBins and simpleDays', () => {
	it('splits a bin by kiss and bajs', () => {
		expect(
			accidentBins(
				[bucket('accident', '2026-08-17', 4)],
				[
					detail('accident', '2026-08-17', 'pee', { answered: 4, happened: 3, total: 3 }),
					detail('accident', '2026-08-17', 'poop', { answered: 4, happened: 1, total: 1 })
				]
			)
		).toEqual([{ bucket: '2026-08-17', n: 4, pee: 3, poop: 1 }]);
	});

	it('reduces one type to days and counts', () => {
		expect(
			simpleDays([bucket('car_ride', '2026-08-20', 2), bucket('walk', '2026-08-20', 3)], 'car_ride')
		).toEqual([{ day: '2026-08-20', n: 2 }]);
	});
});

describe('trendBuckets', () => {
	// A bucket exists if anything at all was logged in it, which is what the wide
	// view produced: a week of only car rides compares as zero walks rather than
	// going missing and reading as "not tracked yet".
	it('keeps a bucket that holds no walks and no meals', () => {
		expect(trendBuckets([bucket('car_ride', '2026-W34', 2)], [])).toEqual([
			{
				bucket: '2026-W34',
				walks: 0,
				walk_gap_min: null,
				walk_duration_min: null,
				meal_gap_min: null,
				meal_finish_rate: null,
				accidents: 0
			}
		]);
	});

	it('gathers the three types of one bucket into one row', () => {
		const rows = trendBuckets(
			[
				bucket('walk', '2026-W34', 14, 240),
				bucket('meal', '2026-W34', 14, 480),
				bucket('accident', '2026-W34', 2)
			],
			[
				detail('walk', '2026-W34', 'duration_min', { answered: 14, avg_number: 18 }),
				// The finish rate is the view's own share, so it is not divided twice.
				detail('meal', '2026-W34', 'finished', {
					answered: 14,
					happened: 13,
					share_answered: 0.9285714
				})
			]
		);

		expect(rows).toEqual([
			{
				bucket: '2026-W34',
				walks: 14,
				walk_gap_min: 240,
				walk_duration_min: 18,
				meal_gap_min: 480,
				meal_finish_rate: 0.9285714,
				accidents: 2
			}
		]);
	});
});

describe('statSummary', () => {
	const win = (
		type_id: string,
		window_days: number,
		part: Partial<TypeWindowRow> = {}
	): TypeWindowRow => ({
		dog_id: 'dog-1',
		type_id,
		window_days,
		events: 0,
		days_counted: window_days,
		per_day: 0,
		per_week: 0,
		per_month: 0,
		avg_gap_min: null,
		...part
	});

	const metric = (
		type_id: string,
		field: string,
		part: Partial<DetailWindowRow> = {}
	): DetailWindowRow => ({
		type_id,
		field,
		events: 0,
		answered: 0,
		avg_number: null,
		share_true: null,
		share_not_true: null,
		share_answered: null,
		...part
	});

	// Each accident rate reads a different window, because each divides by the
	// days tracked inside its own — mixing them up would silently rescale two.
	it('reads each rate from the window that measured it', () => {
		const summary = statSummary(
			[
				win('walk', 30, { per_day: 4.2, avg_gap_min: 205, days_counted: 27 }),
				win('meal', 30, { avg_gap_min: 470 }),
				win('accident', 30, { per_day: 0.3 }),
				win('accident', 84, { per_week: 1.9 }),
				win('accident', 180, { per_month: 7.4 })
			],
			[
				metric('walk', 'duration_min', { avg_number: 15.4 }),
				metric('meal', 'finished', { share_true: 0.9, share_answered: 0.97 })
			]
		);

		expect(summary).toEqual({
			dog_id: 'dog-1',
			walks_per_day: 4.2,
			avg_walk_gap_min: 205,
			avg_walk_duration_min: 15.4,
			avg_meal_gap_min: 470,
			// share_answered, not share_true: the rate is over the meals that were
			// answered for, which is what this number has always meant.
			meal_finish_rate: 0.97,
			accidents_per_day: 0.3,
			accidents_per_week: 1.9,
			accidents_per_month: 7.4,
			days_counted: 27
		});
	});

	// The view has a row per dog × type × window whether anything was logged or
	// not, so no walk row means the read failed rather than "no walks yet".
	it('is null when the read came back with nothing', () => {
		expect(statSummary([], [])).toBeNull();
	});

	it('reports a type with no events as zero rather than dashing it', () => {
		expect(statSummary([win('walk', 30, { days_counted: 3 })], [])).toEqual({
			dog_id: 'dog-1',
			walks_per_day: 0,
			avg_walk_gap_min: null,
			avg_walk_duration_min: null,
			avg_meal_gap_min: null,
			meal_finish_rate: null,
			accidents_per_day: 0,
			accidents_per_week: 0,
			accidents_per_month: 0,
			days_counted: 3
		});
	});
});
