// A Statistik card's tiles as configuration (plan 29): today's cards as the
// defaults, every tile kind read out of the generic window views, and the
// type page's edits.

import { describe, expect, it } from 'vitest';
import * as locale from '$lib/locale';
import {
	defaultChart,
	defaultDetails,
	parseChart,
	planChart,
	defaultTiles,
	parseTiles,
	planTiles,
	tileKey,
	tilesFor,
	tileValues,
	type TileData
} from '$lib/stats/cardSpec';
import { shareTile } from '$lib/stats/summary';
import { packCells } from '$lib/stats/tooltip';
import { cardView } from '$lib/stats/cardView';
import { chartColor } from '$lib/stats/palette';
import type { DetailWindowRow, TypeWindowRow } from '$lib/types/domain';

const DASH = locale.units.missing;

const window = (window_days: number, part: Partial<TypeWindowRow> = {}): TypeWindowRow => ({
	dog_id: 'dog',
	type_id: 'walk',
	window_days,
	events: 0,
	days_counted: 30,
	per_day: 0,
	per_week: 0,
	per_month: 0,
	avg_gap_min: null,
	away_days: 0,
	...part
});

const metric = (field: string, part: Partial<DetailWindowRow> = {}): DetailWindowRow => ({
	type_id: 'walk',
	field,
	events: 12,
	answered: 12,
	avg_number: null,
	share_true: null,
	share_not_true: null,
	share_answered: null,
	...part
});

const data = (part: Partial<TileData> = {}): TileData => ({
	windows: [],
	metrics: [],
	events: [],
	tracked: 30,
	...part
});

const keys = (tiles: { kind: string; field?: string; when?: string }[]) =>
	tiles.map((tile) => tileKey(tile as Parameters<typeof tileKey>[0]));

describe('defaultTiles', () => {
	it('is each of today’s cards, in its order, with its captions', () => {
		const values = (type: string) =>
			tileValues(type, defaultTiles(type), data()).map((tile) => tile.label);
		expect(values('walk')).toEqual([
			locale.stats.walks.perDay,
			locale.stats.walks.betweenWalks,
			locale.stats.walks.averageLength
		]);
		expect(values('meal')).toEqual([
			locale.stats.meals.betweenMeals,
			locale.stats.meals.finishRate
		]);
		expect(values('accident')).toEqual([
			locale.stats.accidents.perDay,
			locale.stats.accidents.perWeek,
			locale.stats.accidents.perMonth
		]);
		expect(values('weight')).toEqual([]);
		expect(values('alone')).toEqual([
			locale.stats.alone.avgDurationMin,
			locale.stats.alone.calmShare,
			locale.stats.alone.avgAnxiousAfterMin,
			locale.stats.alone.longestCalm
		]);
		expect(values('car_ride')).toEqual([
			locale.stats.carRide.avgDurationMin,
			locale.stats.carRide.withoutAccident
		]);
	});

	it('gives any other type per day and each number’s average', () => {
		expect(keys(defaultTiles('bath'))).toEqual(['per_day::']);
	});
});

describe('tilesFor', () => {
	it('offers what the fields allow: averages of numbers, shares of the rest', () => {
		const offered = keys(tilesFor('alone'));
		expect(offered).toContain('avg:duration_min:');
		expect(offered).toContain('longest:duration_min:calm');
		expect(offered).toContain('share:calm:');
		expect(offered).not.toContain('share_without:calm:');
		expect(offered).not.toContain('avg:calm:');
	});
});

describe('tileValues', () => {
	it('reads per day, and per week only once a full week is tracked', () => {
		const rows = [window(30, { per_day: 3.4 }), window(84, { per_week: 24 })];
		const [day, week] = tileValues(
			'walk',
			[{ kind: 'per_day' }, { kind: 'per_week' }],
			data({ windows: rows, tracked: 6 })
		);
		expect(day.value).toBe('~3,4');
		expect(week.value).toBe(DASH);
	});

	it('writes an average in its field’s unit, and a gap in minutes', () => {
		const [avg, gap] = tileValues(
			'walk',
			[{ kind: 'avg', field: 'duration_min' }, { kind: 'gap' }],
			data({
				windows: [window(30, { avg_gap_min: 150 })],
				metrics: [metric('duration_min', { avg_number: 12.2 })]
			})
		);
		expect(avg.value).toBe('~12 min');
		expect(gap.value).toBe('~2,5 tim');
	});

	it('takes a checkbox asked every time over the meals that answered', () => {
		const [share] = tileValues(
			'meal',
			[{ kind: 'share', field: 'finished' }],
			data({ metrics: [metric('finished', { share_answered: 0.98, share_true: 0.5 })] })
		);
		expect(share.value).toBe('98 %');
	});

	it('reads a reveal never once logged as every ride fine, as shareTile always has', () => {
		const [without] = tileValues(
			'car_ride',
			[{ kind: 'share_without', field: 'accident' }],
			data({ windows: [window(30, { events: 12 })] })
		);
		expect(without.value).toBe(shareTile('', null, 12, true).value);
		expect(without.value).toBe('100 %');
	});

	it('finds the longest calm stretch in the events, and the latest value', () => {
		const events = [
			{ occurred_at: '2026-10-01T08:00:00Z', details: { duration_min: 40, calm: true } },
			{ occurred_at: '2026-10-02T08:00:00Z', details: { duration_min: 90, calm: false } },
			{ occurred_at: '2026-10-03T08:00:00Z', details: { duration_min: 55, calm: true } }
		];
		const [longest, latest] = tileValues(
			'alone',
			[
				{ kind: 'longest', field: 'duration_min', when: 'calm' },
				{ kind: 'latest', field: 'duration_min' }
			],
			data({ events })
		);
		expect(longest.value).toBe('55 min');
		expect(latest.value).toBe('55 min');
	});
});

describe('parseTiles', () => {
	it('reads nothing stored as the defaults, and an empty list as a choice', () => {
		expect(parseTiles('walk', null)).toEqual(defaultTiles('walk'));
		expect(parseTiles('walk', { tiles: [] })).toEqual([]);
	});

	it('drops a tile the type no longer supports, and a duplicate', () => {
		const stored = {
			tiles: [
				{ kind: 'avg', field: 'gone' },
				{ kind: 'gap' },
				{ kind: 'gap' },
				{ kind: 'avg', field: 'pee' }
			]
		};
		expect(keys(parseTiles('walk', stored))).toEqual(['gap::']);
	});
});

describe('planTiles', () => {
	const posted = (keys: string[], op = '', add = '') => {
		const form = new FormData();
		for (const key of keys) form.append('tile', key);
		if (op) form.set('tile_op', op);
		if (add) form.set('tile_add', add);
		return form;
	};
	const walk = defaultTiles('walk');

	it('keeps the defaults’ captions through a move', () => {
		const moved = planTiles('walk', walk, posted(keys(walk), 'down:0'));
		expect(keys(moved)).toEqual(['gap::', 'per_day::', 'avg:duration_min:']);
		expect(moved[1].label).toBe(locale.stats.walks.perDay);
	});

	it('adds a supported tile once, and removes one', () => {
		const added = planTiles('walk', walk, posted(keys(walk), 'add', 'share:pee:'));
		expect(keys(added).at(-1)).toBe('share:pee:');
		expect(planTiles('walk', walk, posted(keys(walk), 'add', 'avg:pee:'))).toEqual(walk);
		expect(keys(planTiles('walk', walk, posted(keys(walk), 'remove:0')))).toEqual([
			'gap::',
			'avg:duration_min:'
		]);
	});
});

describe('the chart’s configuration', () => {
	const posted = (fields: [string, string][]) => {
		const form = new FormData();
		form.set('chart_present', '1');
		for (const [key, value] of fields) form.append(key, value);
		return form;
	};

	it('reads a timeline stored before it had modes as every event, Vikt’s', () => {
		expect(
			parseChart('car_ride', { chart: { kind: 'timeline', field: 'duration_min' } })
		).toMatchObject({
			kind: 'timeline',
			field: 'duration_min',
			every: true,
			picker: false
		});
	});

	it('reads bars stored before they had details as the type’s default tooltip', () => {
		const chart = parseChart('walk', {
			chart: { kind: 'bars', split: { by: 'none' }, picker: false, tooltip: 'emoji' }
		});
		expect(chart.kind === 'bars' && chart.details).toEqual(defaultDetails('walk'));
	});

	it('keeps the ticked details in the list’s order, after its one move', () => {
		const chart = planChart(
			'walk',
			defaultChart('walk'),
			posted([
				['chart_kind', 'bars'],
				['chart_split', 'none'],
				['details_present', '1'],
				['detail', 'count'],
				['detail', 'gap'],
				['detail', 'avg:duration_min'],
				['detail_on', 'gap'],
				['detail_on', 'avg:duration_min'],
				['detail_op', 'up:2']
			])
		);
		expect(chart.kind === 'bars' && chart.details).toEqual(['avg:duration_min', 'gap']);
	});

	it('takes an average timeline with tabs, and drops tabs from an every-event one', () => {
		const base: [string, string][] = [
			['chart_kind', 'timeline'],
			['chart_field', 'duration_min'],
			['chart_picker', 'false'],
			['chart_picker', 'true']
		];
		expect(
			planChart('walk', defaultChart('walk'), posted([...base, ['chart_points', 'average']]))
		).toMatchObject({ kind: 'timeline', field: 'duration_min', every: false, picker: true });
		expect(
			planChart('walk', defaultChart('walk'), posted([...base, ['chart_points', 'every']]))
		).toMatchObject({ kind: 'timeline', field: 'duration_min', every: true, picker: false });
	});
});

describe('packCells', () => {
	const big = (label: string) => ({ label, value: '1', big: true });
	const text = (label: string) => ({ label, value: '1' });

	it('fits three emoji counts to a row, but two once one has words', () => {
		expect(
			packCells([big('🚶'), big('🟡'), big('💩'), big('❔')]).map((row) => row.length)
		).toEqual([3, 1]);
		expect(
			packCells([text('Tid mellan'), text('Längd'), text('Kiss')]).map((row) => row.length)
		).toEqual([2, 1]);
		expect(packCells([big('🏠'), text('Längd'), big('🟡')]).map((row) => row.length)).toEqual([
			2, 1
		]);
	});
});

describe('a timeline’s tooltips', () => {
	const view = (
		chart: Parameters<typeof cardView>[0]['chart'],
		history: Parameters<typeof cardView>[0]['history']
	) =>
		cardView({
			typeId: 'car_ride',
			type: { label: 'Biltur', icon: '🚗' },
			chart,
			color: chartColor('green'),
			tiles: [],
			period: 'day',
			today: '2026-10-06',
			tracked: 30,
			buckets: [],
			details: [],
			events: [],
			history
		}).chart;

	it('shows a ride’s own accident, its causes boxed under it, beside its length', () => {
		const chart = view(
			{
				kind: 'timeline',
				field: 'duration_min',
				every: true,
				picker: false,
				tooltip: 'text',
				details: ['count', 'avg:duration_min', 'count:accident']
			},
			[
				{
					occurred_at: '2026-10-05T08:00:00Z',
					value: 45,
					details: { duration_min: 45, accident: true, threw_up: true }
				}
			]
		);
		expect(chart.kind === 'timeline' && chart.points[0].tooltip.rows).toEqual([
			[{ label: 'Längd', value: '45 min' }],
			[{ label: 'Olycka:', value: '1' }],
			{ nested: [[{ label: 'Spydde', value: '1' }]] }
		]);
		expect(chart.kind === 'timeline' && chart.latestCaption).toBe('senaste');
	});
});
