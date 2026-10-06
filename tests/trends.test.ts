// Trender (plan 27): the two buckets compared, each configured row's value
// read out of the generic views, and the badge saying whether it improved.

import { describe, expect, it } from 'vitest';
import { buildTrendRows, trendBucketKeys, trendValue, type TrendPeriod } from '$lib/stats/trends';
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

const period = (types: TypeBucketRow[], details: DetailBucketRow[] = []): TrendPeriod => ({
	types,
	details
});

const TYPES = [
	{ id: 'walk', label: 'Promenad', icon: '🚶' },
	{ id: 'car_ride', label: 'Biltur', icon: '🚗' }
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
		expect(rows.map((row) => row.label)).toEqual(['🚗 Biltur · antal', '🚗 Biltur · Längd']);
	});
});
