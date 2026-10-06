// The generic bar chart (plan 29b) against today's cards: each, from its
// default configuration, has to draw the same columns and tooltips, cell for
// cell. The snapshots were written by the hand-written builders it replaced,
// on these same fixtures, and checked equal before those were deleted.

import { describe, expect, it } from 'vitest';
import * as locale from '$lib/locale';
import { barBuckets, barColors, type BarChart } from '$lib/stats/bars';
import { defaultChart } from '$lib/stats/cardSpec';
import type { DetailRow } from '$lib/stats/detailDays';
import { accidentColors, chartColor } from '$lib/stats/palette';
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

describe('the generic chart draws today’s cards exactly', () => {
	it('Promenader: emoji counts, the gap and the length', () => {
		const buckets = [bucket('walk', '2026-10-05', 7, 140), bucket('walk', '2026-10-04', 1)];
		const details = [
			detail('walk', '2026-10-05', 'pee', { total: 5 }),
			detail('walk', '2026-10-05', 'poop', { total: 2 }),
			detail('walk', '2026-10-05', 'duration_min', { avg_number: 12.4 })
		];
		expect(
			generic('walk', locale.stats.symbols.walk, 'Promenad', 'day', buckets, details)
		).toMatchSnapshot();
	});

	it('Mat: finished or not, the share and the gap', () => {
		const buckets = [bucket('meal', '2026-10-05', 3, 300), bucket('meal', '2026-10-03', 2)];
		const details = [
			detail('meal', '2026-10-05', 'finished', { answered: 2, happened: 1 }),
			detail('meal', '2026-10-03', 'finished', { answered: 2, happened: 2 })
		];
		expect(generic('meal', null, 'Matning', 'day', buckets, details)).toMatchSnapshot();
	});

	for (const period of ['day', 'week', 'month'] as const) {
		it(`Olyckor by ${period}: kiss, bajs and the rest`, () => {
			const at = period === 'day' ? '2026-10-05' : period === 'week' ? '2026-09-28' : '2026-09-01';
			const buckets = [bucket('accident', at, 4)];
			const details = [
				detail('accident', at, 'pee', { total: 2 }),
				detail('accident', at, 'poop', { total: 1 })
			];
			expect(generic('accident', null, 'Olycka', period, buckets, details)).toMatchSnapshot();
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
		expect(
			generic('alone', locale.stats.symbols.alone, 'Ensamtid', 'day', [], [], events)
		).toMatchSnapshot();
	});

	it('Biltur: the count, the length, and each field that happened', () => {
		const buckets = [bucket('car_ride', '2026-10-05', 2)];
		const events = [
			event('2026-10-05', 8, { duration_min: 20, accident: true, threw_up: true }),
			event('2026-10-05', 14, { duration_min: 30 })
		];
		expect(generic('car_ride', '🚗', 'Biltur', 'day', buckets, [], events)).toMatchSnapshot();
	});

	it('Olyckor’s colours are kiss, bajs and the neutral', () => {
		expect(barColors('accident', defaultChart('accident') as BarChart, COLOR)).toEqual(
			accidentColors(COLOR)
		);
	});
});
