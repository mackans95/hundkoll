// Pairing the generic view rows back up into the shapes the cards read. The
// views are per type and per detail field, so every column a card wants is a
// lookup that can miss — and what a miss means differs per column.

import { describe, expect, it } from 'vitest';
import { statSummary } from '$lib/stats/rows';
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
		away_days: 0,
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
				win('walk', 30, { per_day: 4.2, avg_gap_min: 205, days_counted: 27, away_days: 0.5 }),
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
			days_counted: 27,
			// Read off the same walk row as days_counted: one dog, one window.
			away_days: 0.5
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
			days_counted: 3,
			away_days: 0
		});
	});
});
