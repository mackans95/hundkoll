// One Statistik card as the page draws it (plan 29b): its heading, its chart
// (bars or a timeline) and its tiles, all from the type's configuration.
// Built on the server from the generic rows; the page only renders it.

import type { LegendItem } from '$lib/components/ChartLegend.svelte';
import { fieldsFor, shortFieldLabel } from '$lib/events/fields';
import * as format from '$lib/format';
import * as locale from '$lib/locale';
import type { ColumnBucket, TrendPoint, TrendTick } from '$lib/types/charts';
import type { DetailBucketRow, FieldPoint, Period, TypeBucketRow } from '$lib/types/domain';
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
};

/** The axis labels of a timeline by period: every 7th day, or every 3rd week or month. */
function periodTicks(today: string, period: Period): TrendTick[] {
	const starts = bucketStarts(today, period);
	const every = period === 'day' ? DAY_TICK_EVERY : PERIOD_TICK_EVERY;
	return starts.flatMap((start, i) =>
		i % every === 0 ? [{ at: i / (starts.length - 1), label: AXIS_LABEL[period](start) }] : []
	);
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
			tooltip: { heading: day, rows: [[{ label: name, value: write(point.value) }]] }
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
	const count = countLabel(input.typeId, input.type.label);
	return starts.flatMap((start, i) => {
		const row = input.details.find(
			(detail) => detail.bucket === start && detail.field === fieldName
		);
		if (row?.avg_number == null) return [];
		const n = input.buckets.find((bucket) => bucket.bucket === start)?.n ?? row.answered;
		return [
			{
				at: starts.length === 1 ? 0.5 : i / (starts.length - 1),
				value: row.avg_number,
				text: locale.units.approximately(write(row.avg_number)),
				tooltip: {
					heading: TOOLTIP_HEADING[period](start),
					rows: [
						[{ label: name, value: locale.units.approximately(write(row.avg_number)) }],
						[{ label: count, value: String(n) }]
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
		const field = fieldsFor(typeId).find((candidate) => candidate.name === chart.field);
		const name = shortFieldLabel(field?.label ?? chart.field);
		const period = chart.picker ? input.period : 'day';
		const points = chart.every
			? everyPoint(input, name, write)
			: averagePoints(input, period, chart.field, name, write);
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
				latest: last
					? chart.every
						? write(last.value)
						: locale.units.approximately(write(last.value))
					: null,
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
