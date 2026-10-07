// The Trender list as stored and as the settings forms edit it (plan 27).

import { describe, expect, it } from 'vitest';
import {
	addTrend,
	DEFAULT_TRENDS,
	parseTrendRows,
	planTrendList,
	setTypeTrends,
	trendChildren,
	trendKey,
	trendsFor,
	type TrendConfigRow
} from '$lib/stats/trendConfig';

const KNOWN = new Set(['walk', 'meal', 'accident', 'car_ride', 'bath']);

const submit = (fields: [string, string][]) => {
	const form = new FormData();
	for (const [key, value] of fields) form.append(key, value);
	return form;
};

const keys = (rows: TrendConfigRow[]) => rows.map(trendKey);

describe('trendsFor', () => {
	it('offers a count and a gap for every type, and one metric per top-level field', () => {
		expect(keys(trendsFor('bath'))).toEqual(['bath:count:', 'bath:gap:']);
		expect(keys(trendsFor('car_ride'))).toEqual([
			'car_ride:count:',
			'car_ride:gap:',
			'car_ride:avg:duration_min',
			// Only the top level: Spydde and Bajsade are chosen under Olycka.
			'car_ride:share:accident'
		]);
	});
});

describe('parseTrendRows', () => {
	it('reads the defaults back unchanged', () => {
		expect(parseTrendRows(JSON.parse(JSON.stringify(DEFAULT_TRENDS)), KNOWN)).toEqual(
			DEFAULT_TRENDS
		);
	});

	it('skips a removed type, a removed field, a wrong kind and a duplicate', () => {
		const stored = [
			{ type: 'gone', kind: 'count' },
			{ type: 'walk', kind: 'avg', field: 'gone' },
			{ type: 'walk', kind: 'avg', field: 'pee' },
			{ type: 'walk', kind: 'count', better: 'sideways' },
			{ type: 'walk', kind: 'count', better: 'up' }
		];
		expect(parseTrendRows(stored, KNOWN)).toEqual([{ type: 'walk', kind: 'count', better: null }]);
	});

	it('reads anything but a list as an empty one', () => {
		expect(parseTrendRows({ rows: [] }, KNOWN)).toEqual([]);
	});
});

describe('planTrendList', () => {
	const list = DEFAULT_TRENDS.slice(0, 3);
	const posted = (op: string) =>
		submit([
			...list.flatMap((row): [string, string][] => [
				['key', trendKey(row)],
				['better', row.better ?? '']
			]),
			['op', op]
		]);

	it('moves a row up, and leaves the top row where it is', () => {
		const moved = planTrendList(list, posted('up:1'));
		expect('rows' in moved && keys(moved.rows)).toEqual([
			'walk:gap:',
			'walk:count:',
			'walk:avg:duration_min'
		]);
		const top = planTrendList(list, posted('up:0'));
		expect('rows' in top && keys(top.rows)).toEqual(keys(list));
	});

	it('removes a row, keeping its label on the others', () => {
		const removed = planTrendList(list, posted('remove:0'));
		expect('rows' in removed && removed.rows).toEqual(list.slice(1));
	});

	it('takes each row’s direction from the form', () => {
		const form = submit(
			list.flatMap((row, i): [string, string][] => [
				['key', trendKey(row)],
				['better', i === 0 ? 'down' : '']
			])
		);
		const saved = planTrendList(list, form);
		expect('rows' in saved && saved.rows[0].better).toBe('down');
	});
});

describe('addTrend', () => {
	it('appends a supported metric once', () => {
		const added = addTrend([], 'car_ride:share:accident');
		expect(keys(added)).toEqual(['car_ride:share:accident']);
		expect(addTrend(added, 'car_ride:share:accident')).toBe(added);
		expect(addTrend(added, 'car_ride:avg:accident')).toBe(added);
	});
});

describe('setTypeTrends', () => {
	it('drops the type’s unticked rows and appends the newly ticked, leaving the rest', () => {
		const next = setTypeTrends(DEFAULT_TRENDS, 'walk', ['walk:gap:', 'walk:share:pee']);
		expect(keys(next)).toEqual([
			'walk:gap:',
			'meal:gap:',
			'meal:share:finished',
			'accident:count:',
			'walk:share:pee'
		]);
	});
});

describe('sub-rows', () => {
	const accident = { type: 'car_ride', kind: 'share' as const, field: 'accident', better: null };

	it('offers a share what its field reveals, and nothing else', () => {
		expect(trendChildren(accident).map((field) => field.name)).toEqual(['pooped', 'threw_up']);
		expect(trendChildren({ type: 'car_ride', kind: 'avg', field: 'duration_min' })).toEqual([]);
	});

	it('folds a sub-field stored as its own row into its parent’s', () => {
		const stored = [accident, { type: 'car_ride', kind: 'share', field: 'threw_up', better: null }];
		expect(parseTrendRows(stored, KNOWN)).toEqual([{ ...accident, children: ['threw_up'] }]);
		// Without its parent in the list, it has nowhere to go.
		expect(parseTrendRows([stored[1]], KNOWN)).toEqual([]);
	});

	it('takes each row’s ticked sub-rows from the settings form', () => {
		const planned = planTrendList(
			[accident],
			submit([
				['key', 'car_ride:share:accident'],
				['better', ''],
				['children:car_ride:share:accident', 'threw_up'],
				['children:car_ride:share:accident', 'gone']
			])
		);
		expect('rows' in planned && planned.rows).toEqual([{ ...accident, children: ['threw_up'] }]);
	});

	it('applies a type page’s sub-switches to its parent', () => {
		const next = setTypeTrends(
			[],
			'car_ride',
			['car_ride:share:accident'],
			['car_ride:share:accident>pooped']
		);
		expect(next).toEqual([{ ...accident, children: ['pooped'] }]);
	});
});
