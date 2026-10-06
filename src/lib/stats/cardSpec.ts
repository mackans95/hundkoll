// How a type's Statistik card looks (plan 29), stored per type in
// type_settings.stats_card. 29a configures the tiles; 29b adds the chart.
// Pure, so the rules are testable: what each type may show, today's six
// cards as defaults, and every tile's value from the generic stats views.

import * as format from '$lib/format';
import * as locale from '$lib/locale';
import { fieldsFor, shortFieldLabel, type DetailField } from '$lib/events/fields';
import type { DetailRow } from './detailDays';
import { longestWhen } from './outcomes';
import { approximately, periodReady, shareTile, shareValueTile, type Tile } from './summary';
import { shareSource } from './trendConfig';
import type { DetailWindowRow, TypeWindowRow } from '$lib/types/domain';

/**
 *   per_day, per_week, per_month   events per period    stats_type_windows (30/84/180 days)
 *   gap                            time between them    stats_type_windows.avg_gap_min
 *   avg                            a number's average   stats_detail_windows.avg_number
 *   share, share_without           how often it did     stats_detail_windows (see shareSource)
 *   longest                        a number's largest while an outcome was yes
 *   latest                         a number's last value
 * The last two read the type's own events: no view keeps an extreme or a last value.
 */
export type TileKind =
	| 'per_day'
	| 'per_week'
	| 'per_month'
	| 'gap'
	| 'avg'
	| 'share'
	| 'share_without'
	| 'longest'
	| 'latest';

export type TileSpec = {
	kind: TileKind;
	/** The detail field, for the kinds that read one. */
	field?: string;
	/** longest only: the outcome that has to be yes. */
	when?: string;
	/** Only the defaults carry one, so today's cards keep their names. */
	label?: string;
};

/** Identifies a tile, so a card holds each one once. "longest:duration_min:calm" */
export function tileKey(tile: Pick<TileSpec, 'kind' | 'field' | 'when'>): string {
	return `${tile.kind}:${tile.field ?? ''}:${tile.when ?? ''}`;
}

const words = locale.stats;

/** Today's cards' tiles, until someone edits them. Vikt has none: its value is in the header. */
const DEFAULT_TILES: Record<string, TileSpec[]> = {
	walk: [
		{ kind: 'per_day', label: words.walks.perDay },
		{ kind: 'gap', label: words.walks.betweenWalks },
		{ kind: 'avg', field: 'duration_min', label: words.walks.averageLength }
	],
	meal: [
		{ kind: 'gap', label: words.meals.betweenMeals },
		{ kind: 'share', field: 'finished', label: words.meals.finishRate }
	],
	accident: [
		{ kind: 'per_day', label: words.accidents.perDay },
		{ kind: 'per_week', label: words.accidents.perWeek },
		{ kind: 'per_month', label: words.accidents.perMonth }
	],
	weight: [],
	alone: [
		{ kind: 'avg', field: 'duration_min', label: words.alone.avgDurationMin },
		{ kind: 'share', field: 'calm', label: words.alone.calmShare },
		{ kind: 'avg', field: 'anxious_after_min', label: words.alone.avgAnxiousAfterMin },
		{ kind: 'longest', field: 'duration_min', when: 'calm', label: words.alone.longestCalm }
	],
	car_ride: [
		{ kind: 'avg', field: 'duration_min', label: words.carRide.avgDurationMin },
		{ kind: 'share_without', field: 'accident', label: words.carRide.withoutAccident }
	]
};

/** The most tiles a new type starts with: a full second row would push the next card down. */
const MAX_DEFAULT_TILES = 4;

/** A type's tiles before anyone edits them: today's for the six, else per day and each number's average. */
export function defaultTiles(typeId: string): TileSpec[] {
	return (
		DEFAULT_TILES[typeId] ??
		[
			{ kind: 'per_day' as const },
			...fieldsFor(typeId)
				.filter((field) => field.input === 'number')
				.map((field): TileSpec => ({ kind: 'avg', field: field.name }))
		].slice(0, MAX_DEFAULT_TILES)
	);
}

/** Every tile a type's fields allow, in the order its page offers them. */
export function tilesFor(typeId: string): TileSpec[] {
	const fields = fieldsFor(typeId);
	const outcomes = fields.filter((field) => field.input === 'outcome');
	return [
		{ kind: 'per_day' },
		{ kind: 'per_week' },
		{ kind: 'per_month' },
		{ kind: 'gap' },
		...fields.flatMap((field): TileSpec[] =>
			field.input === 'number'
				? [
						{ kind: 'avg', field: field.name },
						{ kind: 'latest', field: field.name },
						...outcomes.map((outcome): TileSpec => ({
							kind: 'longest',
							field: field.name,
							when: outcome.name
						}))
					]
				: field.input === 'outcome'
					? [{ kind: 'share', field: field.name }]
					: [
							{ kind: 'share', field: field.name },
							{ kind: 'share_without', field: field.name }
						]
		)
	];
}

/**
 * Reads a stored card back: its tiles, kept only where the type still
 * supports them, each once. Null, or anything that isn't a card, is the
 * default; an empty list is a real choice.
 */
export function parseTiles(typeId: string, raw: unknown): TileSpec[] {
	const tiles = (raw as { tiles?: unknown } | null)?.tiles;
	if (!Array.isArray(tiles)) {
		return defaultTiles(typeId);
	}

	const supported = new Map(tilesFor(typeId).map((tile) => [tileKey(tile), tile]));
	const seen = new Set<string>();
	const kept: TileSpec[] = [];
	for (const item of tiles) {
		if (typeof item !== 'object' || item === null) continue;
		const { kind, field, when, label } = item as Record<string, unknown>;
		const key = tileKey({
			kind: kind as TileKind,
			field: typeof field === 'string' ? field : undefined,
			when: typeof when === 'string' ? when : undefined
		});
		const tile = supported.get(key);
		if (!tile || seen.has(key)) continue;
		seen.add(key);
		kept.push({ ...tile, ...(typeof label === 'string' && label !== '' ? { label } : {}) });
	}
	return kept;
}

function field(typeId: string, name: string | undefined): DetailField | undefined {
	return fieldsFor(typeId).find((candidate) => candidate.name === name);
}

/** What a field is called on a tile: an outcome by its "yes", anything else shortened. */
function fieldWord(typeId: string, name: string | undefined): string {
	const declared = field(typeId, name);
	return declared?.outcome?.yes ?? shortFieldLabel(declared?.label ?? name ?? '');
}

/** A tile's caption: its own label, or one built from the kind and field. */
export function tileLabel(typeId: string, tile: TileSpec): string {
	if (tile.label) return tile.label;
	const t = words.tiles;
	const name = fieldWord(typeId, tile.field);
	switch (tile.kind) {
		case 'per_day':
			return t.perDay;
		case 'per_week':
			return t.perWeek;
		case 'per_month':
			return t.perMonth;
		case 'gap':
			return t.gap;
		case 'avg':
		case 'share':
			return name;
		case 'share_without':
			return t.without(name);
		case 'longest':
			return t.longest(fieldWord(typeId, tile.when));
		case 'latest':
			return t.latest(name);
	}
}

/**
 * How one of a type's number fields reads: minutes for a _min field (or one
 * declared in min), kg for Vikt, the declared unit otherwise, else a plain
 * number. Shared with Trender.
 */
export function numberWriter(typeId: string, name: string | undefined): (value: number) => string {
	const unit = field(typeId, name)?.unit;
	if (unit === 'min' || name?.endsWith('_min')) return format.minutesText;
	if (unit === 'kg' || name === 'kg') {
		return (value) => locale.units.kilograms(format.swedishNumber(value));
	}
	if (unit) return (value) => `${format.swedishNumber(value)} ${unit}`;
	return format.swedishNumber;
}

/** One type's rows from the generic views, and its own events when a tile needs them. */
export type TileData = {
	/** The type's window rows: 30, 84 and 180 days. */
	windows: TypeWindowRow[];
	/** The type's 30-day detail rows, one per field ever logged. */
	metrics: DetailWindowRow[];
	/** The type's events of the last 30 days, oldest first; empty when no tile reads them. */
	events: DetailRow[];
	/** Days tracked, which per week and per month wait for. */
	tracked: number;
};

/** Whether a tile reads the type's own events, so the loader knows to fetch them. */
export function tileReadsEvents(tile: TileSpec): boolean {
	return tile.kind === 'longest' || tile.kind === 'latest';
}

const DASH = locale.units.missing;

/** Each tile's caption and value, in the card's order. */
export function tileValues(typeId: string, tiles: TileSpec[], data: TileData): Tile[] {
	const window = (days: number) => data.windows.find((row) => row.window_days === days);
	const metric = (name: string | undefined) =>
		data.metrics.find((row) => row.field === name) ?? null;
	const events = window(30)?.events ?? 0;

	return tiles.map((tile) => {
		const label = tileLabel(typeId, tile);
		switch (tile.kind) {
			case 'per_day':
				return { label, value: approximately(window(30)?.per_day, format.swedishNumber) };
			case 'per_week':
				return {
					label,
					value: periodReady('week', data.tracked)
						? approximately(window(84)?.per_week, format.swedishNumber)
						: DASH
				};
			case 'per_month':
				return {
					label,
					value: periodReady('month', data.tracked)
						? approximately(window(180)?.per_month, format.swedishNumber)
						: DASH
				};
			case 'gap':
				return { label, value: approximately(window(30)?.avg_gap_min, format.minutesText) };
			case 'avg':
				return {
					label,
					value: approximately(metric(tile.field)?.avg_number, numberWriter(typeId, tile.field))
				};
			case 'share': {
				const declared = field(typeId, tile.field);
				return declared && shareSource(declared) === 'answered'
					? shareValueTile(label, metric(tile.field)?.share_answered ?? null)
					: shareTile(label, metric(tile.field), events);
			}
			case 'share_without':
				return shareTile(label, metric(tile.field), events, true);
			case 'longest': {
				const longest = longestWhen(data.events, tile.field ?? '', tile.when ?? '');
				// One real event, not an average: no "~".
				return {
					label,
					value: longest === null ? DASH : numberWriter(typeId, tile.field)(longest)
				};
			}
			case 'latest': {
				const last = data.events.findLast(
					(row) => typeof row.details?.[tile.field ?? ''] === 'number'
				);
				const value = last?.details?.[tile.field ?? ''] as number | undefined;
				return {
					label,
					value: value === undefined ? DASH : numberWriter(typeId, tile.field)(value)
				};
			}
		}
	});
}

/**
 * The tiles in the order the type page posted them, then the one edit its
 * button asked for. Moves and adds happen on screen and arrive only with
 * Spara; without JS each button posts the page with its own edit.
 */
export function planTiles(typeId: string, current: TileSpec[], form: FormData): TileSpec[] {
	const byKey = new Map(current.map((tile) => [tileKey(tile), tile]));
	const supported = new Map(tilesFor(typeId).map((tile) => [tileKey(tile), tile]));

	const tiles: TileSpec[] = [];
	for (const key of form.getAll('tile').map(String)) {
		// A stored tile keeps its label; one added on the page is built afresh.
		const tile = byKey.get(key) ?? supported.get(key);
		if (tile && !tiles.some((existing) => tileKey(existing) === key)) tiles.push(tile);
	}

	const [op, at] = String(form.get('tile_op') ?? '').split(':');
	const i = Number(at);
	if (op === 'add') {
		const added = supported.get(String(form.get('tile_add') ?? ''));
		if (added && !tiles.some((tile) => tileKey(tile) === tileKey(added))) tiles.push(added);
	} else if (op === 'remove' && tiles[i]) {
		tiles.splice(i, 1);
	} else if ((op === 'up' || op === 'down') && tiles[i]) {
		const j = op === 'up' ? i - 1 : i + 1;
		if (tiles[j]) [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
	}
	return tiles;
}

/** Whether two tile lists say the same thing, so an untouched form writes nothing. */
export function sameTiles(a: TileSpec[], b: TileSpec[]): boolean {
	return JSON.stringify(a.map(tileKey)) === JSON.stringify(b.map(tileKey));
}

/**
 * How a bar chart divides each column (plan 29b):
 *   none     one bar per period
 *   answer   by a checkbox or outcome: yes / no / unknown (Mat, Ensamtid)
 *   counts   by up to two count fields, and what's left (Olyckor's kiss, bajs)
 */
export type BarSplit =
	{ by: 'none' } | { by: 'answer'; field: string } | { by: 'counts'; fields: string[] };

export type ChartSpec =
	| {
			kind: 'bars';
			/** Day / week / month tabs over the chart, like Olyckor's; else the last 30 days. */
			picker: boolean;
			split: BarSplit;
			/** Whether the tooltip counts by emoji (🚶 7 · 🟡 5) or by name (Kiss: 5). */
			tooltip: 'text' | 'emoji';
	  }
	| { kind: 'timeline'; field: string };

/** More than two would need colours the palette doesn't validate side by side. */
export const MAX_COUNT_SPLIT = 2;

const bars = (split: BarSplit, tooltip: 'text' | 'emoji', picker = false): ChartSpec => ({
	kind: 'bars',
	picker,
	split,
	tooltip
});

/** Today's charts, until someone edits them; a generated type's is written here too. */
const DEFAULT_CHARTS: Record<string, ChartSpec> = {
	// codegen:default-charts — npm run new-event inserts generated charts here
	walk: bars({ by: 'none' }, 'emoji'),
	meal: bars({ by: 'answer', field: 'finished' }, 'emoji'),
	accident: bars({ by: 'counts', fields: ['pee', 'poop'] }, 'emoji', true),
	weight: { kind: 'timeline', field: 'kg' },
	alone: bars({ by: 'answer', field: 'calm' }, 'emoji'),
	car_ride: bars({ by: 'none' }, 'text')
};

/** A type's chart before anyone edits it: one bar a day, named in words. */
export function defaultChart(typeId: string): ChartSpec {
	return DEFAULT_CHARTS[typeId] ?? bars({ by: 'none' }, 'text');
}

/** Every way the type's fields let a bar be split, in the order its page offers them. */
export function splitsFor(typeId: string): BarSplit[] {
	const fields = fieldsFor(typeId).filter((field) => !field.revealedBy);
	const counted = fields.filter((field) => field.input === 'count').slice(0, MAX_COUNT_SPLIT);
	return [
		{ by: 'none' },
		...fields
			.filter((field) => field.input === 'checkbox' || field.input === 'outcome')
			.map((field): BarSplit => ({ by: 'answer', field: field.name })),
		...(counted.length > 0
			? [{ by: 'counts', fields: counted.map((field) => field.name) } as BarSplit]
			: [])
	];
}

/** The number fields a timeline may plot. */
export function timelineFieldsFor(typeId: string): string[] {
	return fieldsFor(typeId)
		.filter((field) => field.input === 'number')
		.map((field) => field.name);
}

/** Identifies a split for a form's select. "answer:finished", "counts:pee,poop" */
export function splitKey(split: BarSplit): string {
	if (split.by === 'answer') return `answer:${split.field}`;
	if (split.by === 'counts') return `counts:${split.fields.join(',')}`;
	return 'none';
}

/** How a split reads on the type page. */
export function splitLabel(typeId: string, split: BarSplit): string {
	const t = words.chart;
	if (split.by === 'answer') return t.byAnswer(fieldWord(typeId, split.field));
	if (split.by === 'counts') {
		return t.byCounts(split.fields.map((name) => fieldWord(typeId, name)).join(` ${t.and} `));
	}
	return t.noSplit;
}

/**
 * Reads a stored chart back, falling back to the type's default for anything
 * its fields no longer allow: a split by a removed field, a timeline of a
 * field that is gone.
 */
export function parseChart(typeId: string, raw: unknown): ChartSpec {
	const chart = (raw as { chart?: Record<string, unknown> } | null)?.chart;
	if (!chart || typeof chart !== 'object') {
		return defaultChart(typeId);
	}
	if (chart.kind === 'timeline') {
		return typeof chart.field === 'string' && timelineFieldsFor(typeId).includes(chart.field)
			? { kind: 'timeline', field: chart.field }
			: defaultChart(typeId);
	}
	if (chart.kind !== 'bars') {
		return defaultChart(typeId);
	}
	const posted = chart.split as BarSplit | undefined;
	const split = splitsFor(typeId).find(
		(candidate) => posted !== undefined && splitKey(candidate) === splitKey(posted)
	);
	return bars(
		split ?? { by: 'none' },
		chart.tooltip === 'emoji' ? 'emoji' : 'text',
		chart.picker === true
	);
}

/** Whether a chart draws a second series, which rules out the neutral colour. */
export function chartPaired(chart: ChartSpec): boolean {
	return chart.kind === 'bars' && chart.split.by !== 'none';
}

/**
 * The chart the type page posted, or the current one when it posted no chart
 * fields. A choice the fields don't allow falls back rather than failing the save.
 */
export function planChart(typeId: string, current: ChartSpec, form: FormData): ChartSpec {
	if (!form.has('chart_present')) {
		return current;
	}
	if (form.get('chart_kind') === 'timeline') {
		const field = String(form.get('chart_field') ?? '');
		const fields = timelineFieldsFor(typeId);
		return fields.length > 0
			? { kind: 'timeline', field: fields.includes(field) ? field : fields[0] }
			: current;
	}
	const key = String(form.get('chart_split') ?? 'none');
	const split = splitsFor(typeId).find((candidate) => splitKey(candidate) === key) ?? {
		by: 'none'
	};
	return bars(
		split,
		form.get('chart_tooltip') === 'emoji' ? 'emoji' : 'text',
		form.getAll('chart_picker').includes('true')
	);
}

/** Whether two charts say the same thing, so an untouched form writes nothing. */
export function sameChart(a: ChartSpec, b: ChartSpec): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}
