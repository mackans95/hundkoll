// The generic bar chart's columns (plan 29b): the windows it zero-fills, how a
// split divides a column, and how the tabs' periods align. Its tooltips are
// held to today's cards by bars-golden.test.ts.

import { describe, expect, it } from 'vitest';
import * as format from '$lib/format';
import { barBuckets, barColors, type BarChart, type BarInput } from '$lib/stats/bars';
import { defaultChart } from '$lib/stats/cardSpec';
import { chartColor } from '$lib/stats/palette';
import type { DetailBucketRow, Period, TypeBucketRow } from '$lib/types/domain';

const TODAY = '2026-08-14';

const bucket = (type_id: string, at: string, n: number): TypeBucketRow => ({
	type_id,
	bucket: at,
	n,
	avg_gap_min: null
});
const detail = (
	type_id: string,
	at: string,
	field: string,
	part: Partial<DetailBucketRow>
): DetailBucketRow => ({
	type_id,
	bucket: at,
	field,
	answered: 0,
	happened: 0,
	total: 0,
	avg_number: null,
	share_answered: null,
	...part
});

const columns = (
	typeId: string,
	period: Period,
	part: Partial<Pick<BarInput, 'buckets' | 'details'>> = {}
) => {
	const chart = defaultChart(typeId) as BarChart;
	return barBuckets({
		typeId,
		type: { label: typeId, icon: null },
		chart,
		period,
		today: TODAY,
		colors: barColors(typeId, chart, chartColor('green')),
		buckets: [],
		details: [],
		events: [],
		...part
	});
};

describe('barBuckets', () => {
	it('zero-fills 30 days with a tick every 7th column', () => {
		const days = columns('walk', 'day');
		expect(days).toHaveLength(30);
		expect(days[0].label).toBe('16/7');
		expect(days[29].label).toBe('14/8');
		expect(days.every((day) => day.segments.length === 1 && day.segments[0] === 0)).toBe(true);
		expect(days.map((day) => day.tick).slice(0, 8)).toEqual([
			true,
			false,
			false,
			false,
			false,
			false,
			false,
			true
		]);
	});

	it('splits a meal day into finished, not finished and unknown', () => {
		const days = columns('meal', 'day', {
			buckets: [bucket('meal', TODAY, 3)],
			details: [detail('meal', TODAY, 'finished', { answered: 2, happened: 1 })]
		});
		expect(days[29].segments).toEqual([1, 1, 1]);
	});

	it('never lets a miscounted day produce a negative unknown segment', () => {
		const days = columns('meal', 'day', {
			buckets: [bucket('meal', TODAY, 1)],
			details: [detail('meal', TODAY, 'finished', { answered: 2, happened: 2 })]
		});
		expect(days[29].segments).toEqual([2, 0, 0]);
	});

	it('covers 12 Monday-aligned weeks, the current one last', () => {
		const weeks = columns('accident', 'week', {
			buckets: [bucket('accident', '2026-08-10', 3)],
			details: [
				detail('accident', '2026-08-10', 'pee', { total: 1 }),
				detail('accident', '2026-08-10', 'poop', { total: 1 })
			]
		});
		expect(weeks).toHaveLength(12);
		expect(weeks[11].label).toBe(format.weekLabel('2026-08-10'));
		// pee, poop, and the one logged without saying which
		expect(weeks[11].segments).toEqual([1, 1, 1]);
	});

	it('covers 12 months aligned to the 1st, the current one last', () => {
		const months = columns('accident', 'month', {
			buckets: [bucket('accident', '2026-08-01', 2)],
			details: [detail('accident', '2026-08-01', 'pee', { total: 2 })]
		});
		expect(months).toHaveLength(12);
		expect(months[11].label).toBe(format.monthLabel('2026-08-01'));
		expect(months[11].segments).toEqual([2, 0, 0]);
		expect(months[0].label).toBe(format.monthLabel('2025-09-01'));
	});

	it('counts a split by answer from the views by week, an outcome too', () => {
		const chart = { ...(defaultChart('alone') as BarChart), picker: true };
		const weeks = barBuckets({
			typeId: 'alone',
			type: { label: 'Ensamtid', icon: '🏠' },
			chart,
			period: 'week',
			today: TODAY,
			colors: barColors('alone', chart, chartColor('green')),
			buckets: [bucket('alone', '2026-08-10', 4)],
			details: [detail('alone', '2026-08-10', 'calm', { answered: 3, happened: 2 })],
			events: []
		});
		expect(weeks[11].segments).toEqual([2, 1, 1]);
	});
});
