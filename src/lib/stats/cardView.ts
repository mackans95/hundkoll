// One Statistik card as the page draws it (plan 29b): its heading, its chart
// (bars or a timeline) and its tiles, all from the type's configuration.
// Built on the server from the generic rows; the page only renders it.

import type { LegendItem } from '$lib/components/ChartLegend.svelte';
import { fieldsFor } from '$lib/events/fields';
import * as format from '$lib/format';
import * as locale from '$lib/locale';
import type { ColumnBucket, TrendPoint } from '$lib/types/charts';
import type { DetailBucketRow, FieldPoint, Period, TypeBucketRow } from '$lib/types/domain';
import { barBuckets, barColors, barLegend } from './bars';
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
	/** The last value, beside the heading: "4,8 kg". */
	latest: string | null;
	unit: string;
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

/** The unit a timeline's axis carries: the field's own, kg for Vikt, min for a duration. */
function timelineUnit(typeId: string, name: string): string {
	const field = fieldsFor(typeId).find((candidate) => candidate.name === name);
	if (field?.unit) return field.unit;
	if (name === 'kg' || name.endsWith('_kg')) return 'kg';
	return name.endsWith('_min') ? 'min' : '';
}

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

/** One card, ready to draw. */
export function cardView(input: CardInput): CardView {
	const { typeId, chart } = input;
	const heading = cardHeading(typeId, input.type);

	if (chart.kind === 'timeline') {
		const write = numberWriter(typeId, chart.field);
		const last = input.history.at(-1);
		return {
			type: typeId,
			heading,
			tiles: input.tiles,
			chart: {
				kind: 'timeline',
				points: input.history.map((point) => ({
					t: new Date(point.occurred_at).getTime(),
					label: format.dayLabel(point.occurred_at.slice(0, 10)),
					value: point.value
				})),
				latest: last ? write(last.value) : null,
				unit: timelineUnit(typeId, chart.field),
				color: input.color.main,
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
