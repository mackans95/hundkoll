// One Statistik card as the page draws it (plan 29b): its heading, its chart
// (bars or a timeline) and its tiles, all from the type's configuration.
// Built on the server from the generic rows; the page only renders it.

import type { LegendItem } from '$lib/components/ChartLegend.svelte';
import { fieldsFor, shortFieldLabel, type DetailField } from '$lib/events/fields';
import * as format from '$lib/format';
import * as locale from '$lib/locale';
import type { ColumnBucket, TrendPoint, TrendTick } from '$lib/types/charts';
import type {
	DetailBucketRow,
	EventDetails,
	FieldPoint,
	Period,
	TypeBucketRow
} from '$lib/types/domain';
import { detailRows, viewCauses, type DetailOptions, type DetailSource } from './tooltip';
import {
	AXIS_LABEL,
	barBuckets,
	barColors,
	barLegend,
	bucketStarts,
	countLabel,
	DAY_TICK_EVERY,
	PERIOD_TICK_EVERY,
	TOOLTIP_HEADING
} from './bars';
import { cardHeading } from './cardConfig';
import { numberWriter, type ChartSpec } from './cardSpec';
import type { DetailRow } from './detailDays';
import type { ChartColor } from './palette';
import { periodReady, type Tile } from './summary';

export type BarsView = {
	kind: 'bars';
	buckets: ColumnBucket[];
	colors: string[];
	legend: LegendItem[];
	/** Day / week / month tabs over the chart. */
	picker: boolean;
	/** Whether the period on screen has run once in full; a partial one waits. */
	ready: boolean;
	pending: string;
	/** Over a chart with nothing in it. */
	empty: string;
};

export type TimelineView = {
	kind: 'timeline';
	points: TrendPoint[];
	ticks: TrendTick[];
	/** Day / week / month tabs over an average timeline. */
	picker: boolean;
	/** The last value, beside the heading: "4,8 kg". */
	latest: string | null;
	/** What that value is: "senaste", "snitt 6/10". */
	latestCaption: string;
	color: string;
	empty: string;
};

export type CardView = {
	type: string;
	heading: string;
	tiles: Tile[];
	chart: BarsView | TimelineView;
};

/** What an empty chart says, where today's cards said something of their own. */
const EMPTY_BARS: Record<string, string> = { accident: locale.stats.accidents.empty };
const EMPTY_TIMELINE: Record<string, string> = { weight: locale.stats.weight.empty };

export type CardInput = {
	typeId: string;
	type: { label: string; icon: string | null };
	chart: ChartSpec;
	color: ChartColor;
	tiles: Tile[];
	/** The period the page's tabs are on; a chart without tabs is always by day. */
	period: Period;
	today: string;
	/** Days tracked, which a week or month chart waits for. */
	tracked: number;
	buckets: TypeBucketRow[];
	details: DetailBucketRow[];
	events: DetailRow[];
	/** The timeline's field over all time, oldest first. */
	history: FieldPoint[];
	/** How a timeline's tooltips show their details; set by cardView itself. */
	detailOptions?: DetailOptions;
};

/** The axis labels of a timeline by period: every 7th day, or every 3rd week or month. */
function periodTicks(today: string, period: Period): TrendTick[] {
	const starts = bucketStarts(today, period);
	const every = period === 'day' ? DAY_TICK_EVERY : PERIOD_TICK_EVERY;
	return starts.flatMap((start, i) =>
		i % every === 0 ? [{ at: i / (starts.length - 1), label: AXIS_LABEL[period](start) }] : []
	);
}

/** What one event tells its point's tooltip: its own other values, and what it revealed. */
function eventSource(typeId: string, details: EventDetails): DetailSource {
	const fields = fieldsFor(typeId);
	const counted = (field: DetailField) => {
		const v = details[field.name];
		return v === true ? 1 : typeof v === 'number' ? Math.max(0, Math.floor(v)) : 0;
	};
	return {
		n: null,
		avg: (field) => {
			const v = details[field.name];
			return typeof v === 'number' ? numberWriter(typeId, field.name)(v) : null;
		},
		count: counted,
		causes: (field) =>
			fields
				.filter((child) => child.revealedBy === field.name && counted(child) > 0)
				.map((child) => ({ label: child.label, n: counted(child) })),
		share: () => null
	};
}

/** What one period tells its point's tooltip, from the views. */
function periodSource(typeId: string, input: CardInput, start: string): DetailSource {
	const bucket = input.buckets.find((row) => row.bucket === start);
	const detail = (name: string) =>
		input.details.find((row) => row.bucket === start && row.field === name);
	const average = (name: string, value: number | null | undefined) =>
		value == null ? null : locale.units.approximately(numberWriter(typeId, name)(value));
	return {
		n: bucket?.n ?? 0,
		gap: average('_min', bucket?.avg_gap_min) ?? locale.units.missing,
		avg: (field) => average(field.name, detail(field.name)?.avg_number),
		count: (field) =>
			field.input === 'count'
				? (detail(field.name)?.total ?? 0)
				: (detail(field.name)?.happened ?? 0),
		causes: (field) => viewCauses(typeId, field, (name) => detail(name)?.happened ?? 0),
		share: (field) => {
			const row = detail(field.name);
			return row && row.answered > 0 ? row.happened / row.answered : null;
		}
	};
}

/** Every event its own point, placed by time: Vikt's weighings. */
function everyPoint(
	input: CardInput,
	name: string,
	write: (value: number) => string
): TrendPoint[] {
	const history = input.history;
	if (history.length === 0) return [];
	const t0 = new Date(history[0].occurred_at).getTime();
	const t1 = new Date(history[history.length - 1].occurred_at).getTime();
	return history.map((point) => {
		const t = new Date(point.occurred_at).getTime();
		const day = format.dayLabel(point.occurred_at.slice(0, 10));
		return {
			// A lone point sits in the middle rather than at an edge.
			at: t1 === t0 ? 0.5 : (t - t0) / (t1 - t0),
			value: point.value,
			text: write(point.value),
			tooltip: {
				heading: day,
				rows: [
					[{ label: name, value: write(point.value) }],
					...detailRows(input.detailOptions!, eventSource(input.typeId, point.details))
				]
			}
		};
	});
}

/**
 * Each period's average as a point, placed by its period, a period with
 * nothing measured left out: a walk's average length per day, say.
 */
function averagePoints(
	input: CardInput,
	period: Period,
	fieldName: string,
	name: string,
	write: (value: number) => string
): TrendPoint[] {
	const starts = bucketStarts(input.today, period);
	return starts.flatMap((start, i) => {
		const row = input.details.find(
			(detail) => detail.bucket === start && detail.field === fieldName
		);
		if (row?.avg_number == null) return [];
		return [
			{
				at: starts.length === 1 ? 0.5 : i / (starts.length - 1),
				value: row.avg_number,
				text: locale.units.approximately(write(row.avg_number)),
				tooltip: {
					heading: TOOLTIP_HEADING[period](start),
					rows: [
						[{ label: name, value: locale.units.approximately(write(row.avg_number)) }],
						...detailRows(input.detailOptions!, periodSource(input.typeId, input, start))
					]
				}
			}
		];
	});
}

/** One card, ready to draw. */
export function cardView(input: CardInput): CardView {
	const { typeId, chart } = input;
	const heading = cardHeading(typeId, input.type);

	if (chart.kind === 'timeline') {
		const write = numberWriter(typeId, chart.field);
		// The plotted value leads every tooltip, so its own detail isn't repeated.
		const withOptions: CardInput = {
			...input,
			detailOptions: {
				typeId,
				details: chart.details,
				emoji: chart.tooltip === 'emoji',
				icon: input.type.icon,
				label: countLabel(typeId, input.type.label),
				color: input.color.main,
				skip: new Set([`avg:${chart.field}`])
			}
		};
		const field = fieldsFor(typeId).find((candidate) => candidate.name === chart.field);
		const name = shortFieldLabel(field?.label ?? chart.field);
		const period = chart.picker ? input.period : 'day';
		const points = chart.every
			? everyPoint(withOptions, name, write)
			: averagePoints(withOptions, period, chart.field, name, write);
		// Every-event: the span's two ends. By period: evenly, as the bar charts tick.
		const ticks: TrendTick[] = chart.every
			? input.history.length === 0
				? []
				: [
						{ at: 0, label: format.dayLabel(input.history[0].occurred_at.slice(0, 10)) },
						{ at: 1, label: format.dayLabel(input.history.at(-1)!.occurred_at.slice(0, 10)) }
					]
			: periodTicks(input.today, period);
		const last = points.at(-1);
		return {
			type: typeId,
			heading,
			tiles: input.tiles,
			chart: {
				kind: 'timeline',
				points,
				ticks,
				latest: last ? last.text : null,
				// Says what the number beside the heading is: the last weighing, or a period's average.
				latestCaption: !last
					? ''
					: chart.every
						? locale.stats.chart.latest
						: locale.stats.chart.averageOf(last.tooltip.heading),
				color: input.color.main,
				picker: chart.picker,
				empty: EMPTY_TIMELINE[typeId] ?? locale.stats.chart.emptyTimeline
			}
		};
	}

	const period = chart.picker ? input.period : 'day';
	const colors = barColors(typeId, chart, input.color);
	const buckets = barBuckets({
		typeId,
		type: input.type,
		chart,
		period,
		today: input.today,
		colors,
		buckets: input.buckets,
		details: input.details,
		events: input.events
	});
	return {
		type: typeId,
		heading,
		tiles: input.tiles,
		chart: {
			kind: 'bars',
			buckets,
			colors,
			legend: barLegend(typeId, chart, colors, buckets),
			picker: chart.picker,
			ready: periodReady(period, input.tracked),
			pending: period === 'day' ? '' : locale.stats.accidents.pending(period),
			empty: EMPTY_BARS[typeId] ?? locale.stats.emptyChart
		}
	};
}
