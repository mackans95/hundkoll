// Trender (plan 27): the two buckets compared, each configured row's value
// read out of the generic views, and the badge saying whether it improved.

import { describe, expect, it } from 'vitest';
import {
	awayMinutes,
	bucketSpan,
	buildTrendRows,
	trendBucketKeys,
	trendValue,
	type TrendPeriod
} from '$lib/stats/trends';
import { DEFAULT_TRENDS, type TrendConfigRow } from '$lib/stats/trendConfig';
import * as locale from '$lib/locale';
import type { DetailBucketRow, TypeBucketRow } from '$lib/types/domain';

const TODAY = '2026-08-14';

const type = (type_id: string, n: number, avg_gap_min: number | null = null): TypeBucketRow => ({
	type_id,
	bucket: '2026-W33',
	n,
	avg_gap_min
});

const detail = (
	type_id: string,
	field: string,
	values: Partial<DetailBucketRow>
): DetailBucketRow => ({
	type_id,
	bucket: '2026-W33',
	field,
	answered: 0,
	happened: 0,
	total: 0,
	avg_number: null,
	share_answered: null,
	...values
});

const period = (
	types: TypeBucketRow[],
	details: DetailBucketRow[] = [],
	homeShare = 1
): TrendPeriod => ({ types, details, homeShare });

const TYPES = [
	{ id: 'walk', label: 'Promenad', icon: '🚶', interval: null, interval_type: 'average' as const },
	{ id: 'accident', label: 'Olycka', icon: '⚠️', interval: null, interval_type: 'days' as const },
	{ id: 'car_ride', label: 'Biltur', icon: '🚗', interval: null, interval_type: 'days' as const }
];

describe('trendBucketKeys', () => {
	it('names the last two complete buckets, never today', () => {
		expect(trendBucketKeys(TODAY, 'day')).toEqual({ prev: '2026-08-12', latest: '2026-08-13' });
		expect(trendBucketKeys(TODAY, 'week')).toEqual({ prev: '2026-07-27', latest: '2026-08-03' });
		expect(trendBucketKeys(TODAY, 'month')).toEqual({ prev: '2026-06-01', latest: '2026-07-01' });
	});
});

describe('trendValue', () => {
	const row = (part: Partial<TrendConfigRow>): TrendConfigRow => ({
		type: 'walk',
		kind: 'count',
		better: null,
		...part
	});

	it('counts zero for a type with no row, and knows no gap for it', () => {
		const empty = period([type('car_ride', 2)]);
		expect(trendValue(row({}), empty)).toBe(0);
		expect(trendValue(row({ kind: 'gap' }), empty)).toBeNull();
	});

	it('reads a number field’s average', () => {
		const week = period([type('walk', 14)], [detail('walk', 'duration_min', { avg_number: 18 })]);
		expect(trendValue(row({ kind: 'avg', field: 'duration_min' }), week)).toBe(18);
	});

	it('takes a checkbox asked every time over the events that answered', () => {
		const week = period(
			[type('meal', 14)],
			[detail('meal', 'finished', { answered: 10, happened: 9, share_answered: 0.9 })]
		);
		expect(trendValue(row({ type: 'meal', kind: 'share', field: 'finished' }), week)).toBe(0.9);
	});

	it('takes a reveal over every event, since it stores nothing when nothing happened', () => {
		// share_answered is 1 for a reveal by construction; 1 of 4 rides had one.
		const week = period(
			[type('car_ride', 4)],
			[detail('car_ride', 'accident', { answered: 1, happened: 1, share_answered: 1 })]
		);
		expect(trendValue(row({ type: 'car_ride', kind: 'share', field: 'accident' }), week)).toBe(
			0.25
		);
	});
});

describe('buildTrendRows', () => {
	it('builds today’s six rows, with today’s names, until the list is edited', () => {
		const rows = buildTrendRows(DEFAULT_TRENDS, TYPES, null, null);
		expect(rows.map((row) => row.label)).toEqual(Object.values(locale.stats.trends.metrics));
	});

	it('keeps a row with no data on either side, so the list keeps its height', () => {
		const [walks] = buildTrendRows(DEFAULT_TRENDS, TYPES, null, null);
		expect(walks).toMatchObject({ from: '–', to: '–', badge: '–', tone: 'neutral' });
	});

	it('writes the change as a rounded percentage, neutral unless the row says otherwise', () => {
		const counts: TrendConfigRow = { type: 'walk', kind: 'count', better: null };
		const [neutral] = buildTrendRows(
			[counts],
			TYPES,
			period([type('walk', 4)]),
			period([type('walk', 5)])
		);
		expect(neutral).toMatchObject({ from: '4', to: '5', badge: '↑ 25 %', tone: 'neutral' });

		const [worse] = buildTrendRows(
			[{ ...counts, better: 'down' }],
			TYPES,
			period([type('walk', 4)]),
			period([type('walk', 5)])
		);
		expect(worse.tone).toBe('worse');

		const [better] = buildTrendRows(
			[{ ...counts, better: 'down' }],
			TYPES,
			period([type('walk', 5)]),
			period([type('walk', 4)])
		);
		expect(better.tone).toBe('better');
	});

	it('shows a dash instead of an infinite change from a zero base', () => {
		const [row] = buildTrendRows(
			[{ type: 'walk', kind: 'count', better: 'up' }],
			TYPES,
			period([type('car_ride', 1)]),
			period([type('walk', 3)])
		);
		expect(row).toMatchObject({ from: '0', to: '3', badge: '–', tone: 'neutral' });
	});

	it('names a row built in Settings from its type and metric', () => {
		const rows = buildTrendRows(
			[
				{ type: 'car_ride', kind: 'count', better: null },
				{ type: 'car_ride', kind: 'avg', field: 'duration_min', better: null }
			],
			TYPES,
			null,
			null
		);
		expect(rows.map((row) => row.label)).toEqual(['🚗 Biltur · Antal', '🚗 Biltur · Längd']);
	});
});

describe('time away', () => {
	const at = (iso: string) => new Date(iso);
	const day = bucketSpan('day', '2026-10-05');

	it('spans a Stockholm day, and a DST night is 25 hours', () => {
		expect(day.from.toISOString()).toBe('2026-10-04T22:00:00.000Z');
		const autumn = bucketSpan('day', '2026-10-25');
		expect((autumn.to.getTime() - autumn.from.getTime()) / 3_600_000).toBe(25);
	});

	it('clips an absence to the period, counts overlaps once, and runs an open one to now', () => {
		const spans = [
			{ from: at('2026-10-05T05:00:00Z'), to: at('2026-10-05T16:00:00Z'), label: 'Hundvakt' },
			{ from: at('2026-10-05T15:00:00Z'), to: at('2026-10-05T17:00:00Z'), label: 'Hundvakt' },
			{ from: at('2026-10-04T20:00:00Z'), to: at('2026-10-04T23:00:00Z'), label: 'Hundvakt' }
		];
		// 05–17 is twelve hours, 22–23 the day's first hour.
		expect(awayMinutes(spans, day, at('2026-10-06T12:00:00Z'))).toBe(13 * 60);
		const open = [{ from: at('2026-10-05T20:00:00Z'), to: null, label: 'Hundvakt' }];
		expect(awayMinutes(open, day, at('2026-10-05T21:00:00Z'))).toBe(60);
	});

	it('compares a count per time at home, and says so', () => {
		// 5/10: away 07–18, eleven of 24 hours; 3 walks in 13 hours ≈ 5,5 a day.
		const [walks] = buildTrendRows(
			[{ type: 'walk', kind: 'count', better: null }],
			TYPES,
			period([type('walk', 11)]),
			period([type('walk', 3)], [], 13 / 24)
		);
		expect(walks).toMatchObject({ from: '11', to: '3', badge: '↓ 50 %', away: 'home' });
	});

	it('leaves an incident’s count alone: one accident in a short day is still one', () => {
		const [accidents] = buildTrendRows(
			[{ type: 'accident', kind: 'count', better: 'down' }],
			TYPES,
			period([type('accident', 1)]),
			period([type('accident', 1)], [], 13 / 24)
		);
		expect(accidents).toMatchObject({ badge: '±0 %', tone: 'neutral', away: null });
	});

	it('does not compare a count with too little time at home, nor touch other kinds', () => {
		const [count, length] = buildTrendRows(
			[
				{ type: 'walk', kind: 'count', better: null },
				{ type: 'walk', kind: 'avg', field: 'duration_min', better: null }
			],
			TYPES,
			period([type('walk', 11)], [detail('walk', 'duration_min', { avg_number: 13 })]),
			period([type('walk', 1)], [detail('walk', 'duration_min', { avg_number: 9 })], 0.1)
		);
		expect(count).toMatchObject({ badge: '–', tone: 'neutral', away: 'short' });
		expect(length).toMatchObject({ badge: '↓ 31 %', away: null });
	});
});

describe('a row’s sub-rows', () => {
	it('compares what Olycka revealed beneath it, each over every ride', () => {
		const [row] = buildTrendRows(
			[
				{
					type: 'car_ride',
					kind: 'share',
					field: 'accident',
					better: 'down',
					children: ['threw_up']
				}
			],
			TYPES,
			period(
				[type('car_ride', 4)],
				[
					detail('car_ride', 'accident', { answered: 2, happened: 2, share_answered: 1 }),
					detail('car_ride', 'threw_up', { answered: 1, happened: 1, share_answered: 1 })
				]
			),
			period(
				[type('car_ride', 4)],
				[detail('car_ride', 'accident', { answered: 1, happened: 1, share_answered: 1 })]
			)
		);
		expect(row.children).toEqual([
			{
				key: 'car_ride:share:accident>threw_up',
				label: 'Spydde',
				from: '25 %',
				to: '0 %',
				badge: '↓ 100 %',
				tone: 'better'
			}
		]);
	});
});
