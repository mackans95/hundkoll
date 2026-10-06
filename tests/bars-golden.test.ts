// The generic bar chart (plan 29b) against the hand-written builders it
// replaces: each of today's cards, from its default configuration, has to draw
// the same columns and the same tooltips, cell for cell.

import { describe, expect, it } from 'vitest';
import * as locale from '$lib/locale';
import { fieldsFor, fieldsRevealedBy } from '$lib/events/fields';
import { barBuckets, barColors, type BarChart } from '$lib/stats/bars';
import {
	accidentBuckets,
	aloneBuckets,
	mealBuckets,
	simpleCountBuckets,
	walkBuckets
} from '$lib/stats/buckets';
import { defaultChart } from '$lib/stats/cardSpec';
import { countDetailDays, type DetailRow } from '$lib/stats/detailDays';
import { outcomeDays } from '$lib/stats/outcomes';
import { accidentColors, aloneColors, chartColor, mealColors } from '$lib/stats/palette';
import * as rows from '$lib/stats/rows';
import type { DetailBucketRow, Period, TypeBucketRow } from '$lib/types/domain';

const TODAY = '2026-10-06';
const COLOR = chartColor('green');

const bucket = (
	type_id: string,
	bucket: string,
	n: number,
	gap: number | null = null
): TypeBucketRow => ({
	type_id,
	bucket,
	n,
	avg_gap_min: gap
});
const detail = (
	type_id: string,
	bucket: string,
	field: string,
	part: Partial<DetailBucketRow>
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
const event = (day: string, hour: number, details: Record<string, unknown>): DetailRow => ({
	occurred_at: `${day}T${String(hour).padStart(2, '0')}:00:00Z`,
	details
});

const generic = (
	typeId: string,
	icon: string | null,
	label: string,
	period: Period,
	buckets: TypeBucketRow[],
	details: DetailBucketRow[],
	events: DetailRow[] = []
) => {
	const chart = defaultChart(typeId) as BarChart;
	return barBuckets({
		typeId,
		type: { label, icon },
		chart,
		period,
		today: TODAY,
		colors: barColors(typeId, chart, COLOR),
		buckets,
		details,
		events
	});
};

/**
 * The old builder's output is the snapshot; the generic one has to equal it.
 * Once the old builders are gone, only the snapshot remains to compare with.
 */
function golden(actual: unknown, expected: unknown) {
	expect(expected).toMatchSnapshot();
	expect(actual).toEqual(expected);
}

describe('the generic chart draws today’s cards exactly', () => {
	it('Promenader: emoji counts, the gap and the length', () => {
		const buckets = [bucket('walk', '2026-10-05', 7, 140), bucket('walk', '2026-10-04', 1)];
		const details = [
			detail('walk', '2026-10-05', 'pee', { total: 5 }),
			detail('walk', '2026-10-05', 'poop', { total: 2 }),
			detail('walk', '2026-10-05', 'duration_min', { avg_number: 12.4 })
		];
		golden(
			generic('walk', locale.stats.symbols.walk, 'Promenad', 'day', buckets, details),
			walkBuckets(rows.walkDays(buckets, details), TODAY, COLOR.main)
		);
	});

	it('Mat: finished or not, the share and the gap', () => {
		const buckets = [bucket('meal', '2026-10-05', 3, 300), bucket('meal', '2026-10-03', 2)];
		const details = [
			detail('meal', '2026-10-05', 'finished', { answered: 2, happened: 1 }),
			detail('meal', '2026-10-03', 'finished', { answered: 2, happened: 2 })
		];
		golden(
			generic('meal', null, 'Matning', 'day', buckets, details),
			mealBuckets(rows.mealDays(buckets, details), TODAY, mealColors(COLOR)[0])
		);
	});

	for (const period of ['day', 'week', 'month'] as const) {
		it(`Olyckor by ${period}: kiss, bajs and the rest`, () => {
			const at = period === 'day' ? '2026-10-05' : period === 'week' ? '2026-09-28' : '2026-09-01';
			const buckets = [bucket('accident', at, 4)];
			const details = [
				detail('accident', at, 'pee', { total: 2 }),
				detail('accident', at, 'poop', { total: 1 })
			];
			golden(
				generic('accident', null, 'Olycka', period, buckets, details),
				accidentBuckets(rows.accidentBins(buckets, details), period, TODAY)
			);
		});
	}

	it('Ensamtid: a row per outcome, Orolig’s signs boxed under it', () => {
		const events = [
			event('2026-10-05', 8, { duration_min: 40, calm: true }),
			event('2026-10-05', 12, {
				duration_min: 90,
				calm: false,
				anxious_after_min: 30,
				howled: true
			}),
			event('2026-10-04', 9, { duration_min: 20 })
		];
		const spec = {
			outcome: 'calm',
			measure: 'duration_min',
			revealed: fieldsRevealedBy(fieldsFor('alone'), 'calm')
		};
		golden(
			generic('alone', locale.stats.symbols.alone, 'Ensamtid', 'day', [], [], events),
			aloneBuckets(outcomeDays(events, spec), TODAY, aloneColors(COLOR))
		);
	});

	it('Biltur: the count, the length, and each field that happened', () => {
		const buckets = [bucket('car_ride', '2026-10-05', 2)];
		const events = [
			event('2026-10-05', 8, { duration_min: 20, accident: true, threw_up: true }),
			event('2026-10-05', 14, { duration_min: 30 })
		];
		golden(
			generic('car_ride', '🚗', 'Biltur', 'day', buckets, [], events),
			simpleCountBuckets(
				[{ day: '2026-10-05', n: 2 }],
				TODAY,
				locale.stats.carRide.tooltipLabel,
				COLOR.main,
				{ typeId: 'car_ride', counts: countDetailDays(events, fieldsFor('car_ride')) }
			)
		);
	});

	it('Olyckor’s colours are kiss, bajs and the neutral', () => {
		expect(barColors('accident', defaultChart('accident') as BarChart, COLOR)).toEqual(
			accidentColors(COLOR)
		);
	});
});
