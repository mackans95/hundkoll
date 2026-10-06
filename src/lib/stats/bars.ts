// Any type's bar chart from its configuration (plan 29b): columns, colours,
// legend and tooltip, from the generic bucket views and, where a tooltip needs
// more than a view can say, the type's own events. Today's six cards are the
// defaults, and each tooltip shape below is the one a card already had:
//
//   no split, emoji      Promenader   🚶 7 · 🟡 5 · 💩 2, then the day's gap and averages
//   no split, words      Biltur       the count and averages, each field that happened
//   split by a checkbox  Mat          ✅ 3 · ❌ 1, then the share and the gap
//   split by an outcome  Ensamtid     a row per outcome, what "no" revealed boxed under it
//   split by counts      Olyckor      🟡 2 · 💩 1 · ❔ 1
//
// The emoji/words choice swaps a count's emoji for its name and back; a field
// without an emoji is named in either mode. The two shapes that read events
// are the day view's; a week or month view of the same split counts from the
// views instead, which have no per-event detail.

import * as format from '$lib/format';
import * as locale from '$lib/locale';
import { fieldsFor, fieldsRevealedBy, shortFieldLabel, type DetailField } from '$lib/events/fields';
import type { LegendItem } from '$lib/components/ChartLegend.svelte';
import type { ColumnBucket, TooltipCell, TooltipRow } from '$lib/types/charts';
import type { DetailBucketRow, Period, TypeBucketRow } from '$lib/types/domain';
import * as time from '$lib/time';
import { simpleCountBuckets } from './buckets';
import { numberWriter, type ChartSpec } from './cardSpec';
import { countDetailDays, type DetailRow } from './detailDays';
import { outcomeDays, type Mean } from './outcomes';
import { accidentColors, aloneColors, mealColors, NEUTRAL_COLOR, type ChartColor } from './palette';

export type BarChart = Extract<ChartSpec, { kind: 'bars' }>;

const DAILY_WINDOW = 30;
const PERIOD_COLUMNS = 12;
const DAY_TICK_EVERY = 7;
const PERIOD_TICK_EVERY = 3;

const words = locale.stats;
const DASH = locale.units.missing;

/** What a type's count is called in its tooltip: a plural where today's cards had one. */
const COUNT_LABELS: Record<string, string> = {
	walk: words.walks.emptyTooltip,
	meal: words.meals.emptyTooltip,
	alone: words.alone.emptyTooltip,
	car_ride: words.carRide.tooltipLabel
};

export function countLabel(typeId: string, label: string): string {
	return COUNT_LABELS[typeId] ?? label;
}

/** The column starts a chart covers, oldest first: 30 days, 12 Mondays or 12 firsts. */
export function bucketStarts(today: string, period: Period): string[] {
	if (period === 'day') {
		return time.lastDays(today, DAILY_WINDOW);
	}
	if (period === 'week') {
		const monday = time.mondayOf(today);
		return Array.from({ length: PERIOD_COLUMNS }, (_, i) =>
			time.addDays(monday, -7 * (PERIOD_COLUMNS - 1 - i))
		);
	}
	return Array.from({ length: PERIOD_COLUMNS }, (_, i) =>
		time.addMonths(today, -(PERIOD_COLUMNS - 1 - i))
	);
}

// A tick has room for a date but not for "Vecka 33", so the axis and the
// tooltip label the same bucket differently.
const AXIS_LABEL: Record<Period, (start: string) => string> = {
	day: format.dayLabel,
	week: format.weekLabel,
	month: format.monthLabel
};
const TOOLTIP_HEADING: Record<Period, (start: string) => string> = {
	day: format.dayLabel,
	week: format.weekHeading,
	month: format.monthLabel
};

function cell(label: string, value: string, color?: string): TooltipCell {
	return color === undefined ? { label, value } : { label, value, color };
}

/** A count labelled by an emoji, sized up so the emoji reads at a glance. */
function countCell(label: string, count: number): TooltipCell {
	return { label, value: String(count), big: true };
}

function tooltipRow(...cells: (TooltipCell | null)[]): TooltipCell[] {
	return cells.filter((c): c is TooltipCell => c !== null);
}

/** A count by its emoji in emoji mode, else by name. */
function counted(emoji: boolean, symbol: string | undefined, name: string, n: number): TooltipCell {
	return emoji && symbol ? countCell(symbol, n) : cell(name, String(n));
}

/** An average that may not exist: "~12 min", or a dash. */
function optionalAverage(typeId: string, field: string, value: number | null): string {
	return value === null ? DASH : locale.units.approximately(numberWriter(typeId, field)(value));
}

/** A mean still being summed: "42 min" for one event, "~42 min" for several, a dash for none. */
function meanValue(typeId: string, field: string, mean: Mean): string {
	if (mean.n === 0) return DASH;
	const text = numberWriter(typeId, field)(mean.sum / mean.n);
	return mean.n > 1 ? locale.units.approximately(text) : text;
}

/** The yes / no / unknown names of a field a chart is split by. */
export function answerWords(field: DetailField | undefined): {
	yes: string;
	no: string;
	unknown: string;
	yesSymbol?: string;
	noSymbol?: string;
} {
	if (field?.outcome) {
		return { ...field.outcome };
	}
	const name = shortFieldLabel(field?.label ?? '');
	return {
		yes: field?.answers?.yes ?? name,
		no: field?.answers?.no ?? words.chart.notAnswer(name),
		unknown: words.chart.unknown,
		yesSymbol: field?.answers?.yesSymbol,
		noSymbol: field?.answers?.noSymbol
	};
}

/** The colours a chart draws in, one per segment. */
export function barColors(typeId: string, chart: BarChart, color: ChartColor): string[] {
	const split = chart.split;
	if (split.by === 'answer') {
		const field = fieldsFor(typeId).find((candidate) => candidate.name === split.field);
		// An outcome's unknown is the colour's second shade; a checkbox's, a quieter grey.
		return field?.input === 'outcome' ? aloneColors(color) : mealColors(color);
	}
	if (split.by === 'counts') {
		return split.fields.length === 1 ? [color.main, NEUTRAL_COLOR] : accidentColors(color);
	}
	return [color.main];
}

/** The legend under a split chart; a third entry only once it has something in it. */
export function barLegend(
	typeId: string,
	chart: BarChart,
	colors: string[],
	buckets: ColumnBucket[]
): LegendItem[] {
	const split = chart.split;
	if (split.by === 'none') return [];
	const last = buckets.some((bucket) => (bucket.segments.at(-1) ?? 0) > 0);
	const fields = fieldsFor(typeId);
	if (split.by === 'answer') {
		const answer = answerWords(fields.find((field) => field.name === split.field));
		return [
			{ color: colors[0], label: answer.yes },
			{ color: colors[1], label: answer.no },
			...(last ? [{ color: colors[2], label: answer.unknown }] : [])
		];
	}
	return [
		...split.fields.map((name, i) => ({
			color: colors[i],
			label: shortFieldLabel(fields.find((field) => field.name === name)?.label ?? name)
		})),
		...(last
			? [{ color: colors[split.fields.length], label: words.accidents.legendUnspecified }]
			: [])
	];
}

/** Whether a chart reads the type's own events: a words tooltip with no split, or an outcome split, by day. */
export function barNeedsEvents(typeId: string, chart: BarChart, period: Period): boolean {
	if (period !== 'day') return false;
	if (chart.split.by === 'none') return chart.tooltip === 'text';
	if (chart.split.by === 'answer') {
		const name = chart.split.field;
		return fieldsFor(typeId).find((field) => field.name === name)?.input === 'outcome';
	}
	return false;
}

export type BarInput = {
	typeId: string;
	/** The type's catalogue name and icon: the icon is its emoji. */
	type: { label: string; icon: string | null };
	chart: BarChart;
	/** The period on screen: day unless the chart has its tabs. */
	period: Period;
	today: string;
	colors: string[];
	/** The type's bucket rows at that period. */
	buckets: TypeBucketRow[];
	/** The type's detail-field bucket rows at that period. */
	details: DetailBucketRow[];
	/** The type's events of the last 30 days, when barNeedsEvents says so. */
	events: DetailRow[];
};

/** Every column of one type's bar chart, tooltips included. */
export function barBuckets(input: BarInput): ColumnBucket[] {
	const { typeId, chart, period, today, colors } = input;
	const fields = fieldsFor(typeId);
	const roots = fields.filter((field) => !field.revealedBy);
	const emoji = chart.tooltip === 'emoji';
	const label = countLabel(typeId, input.type.label);
	const byBucket = new Map(input.buckets.map((row) => [row.bucket, row]));
	const detail = (bucket: string, name: string) =>
		input.details.find((row) => row.bucket === bucket && row.field === name) ?? null;
	const tickEvery = period === 'day' ? DAY_TICK_EVERY : PERIOD_TICK_EVERY;
	const column = (start: string, i: number, segments: number[], rows: TooltipRow[]) => ({
		label: AXIS_LABEL[period](start),
		tick: i % tickEvery === 0,
		segments,
		tooltip: { heading: TOOLTIP_HEADING[period](start), rows }
	});
	const starts = bucketStarts(today, period);
	const gapCell = (start: string) =>
		cell(
			words.walks.between,
			optionalAverage(typeId, '_min', byBucket.get(start)?.avg_gap_min ?? null)
		);

	const split = chart.split;

	if (split.by === 'counts') {
		const counts = split.fields.map((name) => fields.find((field) => field.name === name));
		return starts.map((start, i) => {
			const n = byBucket.get(start)?.n ?? 0;
			const totals = split.fields.map((name) => detail(start, name)?.total ?? 0);
			const other = Math.max(0, n - totals.reduce((sum, total) => sum + total, 0));
			return column(
				start,
				i,
				[...totals, other],
				[
					tooltipRow(
						...counts.map((field, j) =>
							counted(emoji, field?.symbol, shortFieldLabel(field?.label ?? ''), totals[j])
						),
						other > 0
							? counted(emoji, words.symbols.unknown, words.accidents.legendUnspecified, other)
							: null
					)
				]
			);
		});
	}

	if (split.by === 'answer') {
		const field = fields.find((candidate) => candidate.name === split.field);
		const answer = answerWords(field);

		// An outcome by day: each outcome's own row, its length, and what "no"
		// revealed boxed beneath it, from the events (Ensamtid).
		if (field?.input === 'outcome' && period === 'day') {
			const measure = roots.find((candidate) => candidate.input === 'number');
			const revealed = fieldsRevealedBy(fields, field.name);
			const days = new Map(
				outcomeDays(input.events, {
					outcome: field.name,
					measure: measure?.name ?? '',
					revealed
				}).map((day) => [day.day, day])
			);
			return starts.map((start, i) => {
				const row = days.get(start);
				const groups = row
					? [
							{ group: row.yes, label: answer.yes, color: colors[0] },
							{ group: row.no, label: answer.no, color: colors[1] },
							{ group: row.unknown, label: answer.unknown, color: colors[2] }
						]
					: [];
				const measured = (mean: Mean) => (measure ? meanValue(typeId, measure.name, mean) : DASH);
				return column(
					start,
					i,
					[row?.yes.count ?? 0, row?.no.count ?? 0, row?.unknown.count ?? 0],
					!row
						? [tooltipRow(cell(label, '0', colors[0]))]
						: [
								tooltipRow(
									emoji && input.type.icon
										? countCell(input.type.icon, row.n)
										: cell(label, String(row.n)),
									measure ? cell(shortFieldLabel(measure.label), measured(row.measure)) : null
								),
								...groups
									.filter(({ group }) => group.count > 0)
									.flatMap(({ group, label: name, color }) => {
										const nested = [
											...revealed
												.filter((child) => (group.numbers[child.name]?.n ?? 0) > 0)
												.map((child) =>
													tooltipRow(
														cell(
															shortFieldLabel(child.label),
															meanValue(typeId, child.name, group.numbers[child.name])
														)
													)
												),
											tooltipRow(
												...revealed
													.filter((child) => (group.counts[child.name] ?? 0) > 0)
													.map((child) => cell(child.label, String(group.counts[child.name])))
											)
										].filter((cells) => cells.length > 0);
										return [
											// The count bold after a colon, the length past a divider, like the first row.
											tooltipRow(cell(`${name}:`, String(group.count), color), {
												value: measured(group.measure)
											}),
											...(nested.length > 0 ? [{ nested }] : [])
										];
									})
							]
				);
			});
		}

		// A checkbox, or any split by week or month: counts in a line, then the
		// share and the gap (Mat).
		return starts.map((start, i) => {
			const n = byBucket.get(start)?.n ?? 0;
			const answered = detail(start, split.field);
			const yes = answered?.happened ?? 0;
			// answered − happened rather than n − happened: an event nobody
			// answered for is neither yes nor no.
			const no = answered ? answered.answered - answered.happened : 0;
			const unknown = Math.max(0, n - yes - no);
			const judged = yes + no;
			return column(
				start,
				i,
				[yes, no, unknown],
				n === 0
					? [tooltipRow(cell(label, '0', colors[0]))]
					: [
							tooltipRow(
								counted(emoji, answer.yesSymbol, answer.yes, yes),
								counted(emoji, answer.noSymbol, answer.no, no),
								unknown > 0 ? counted(emoji, words.symbols.unknown, answer.unknown, unknown) : null
							),
							tooltipRow(
								judged > 0 ? cell(words.meals.share, format.percentageText(yes / judged)) : null,
								gapCell(start)
							)
						]
			);
		});
	}

	// No split, in words, by day: the count, the day's averages, and each field
	// that happened with what it revealed (Biltur).
	if (!emoji && period === 'day') {
		const days = input.buckets.map((row) => ({ day: row.bucket, n: row.n }));
		return simpleCountBuckets(days, today, label, colors[0], {
			typeId,
			counts: countDetailDays(input.events, fields)
		});
	}

	// No split: the count and each counted field in a line, then the gap and
	// each number's average (Promenader). By week or month in words, the same.
	const countedFields = roots.filter((field) => field.input === 'count');
	const numbers = roots.filter((field) => field.input === 'number');
	return starts.map((start, i) => {
		const n = byBucket.get(start)?.n ?? 0;
		return column(
			start,
			i,
			[n],
			n === 0
				? [tooltipRow(cell(label, '0', colors[0]))]
				: [
						tooltipRow(
							emoji && input.type.icon
								? countCell(input.type.icon, n)
								: cell(label, String(n), colors[0]),
							...countedFields.map((field) =>
								counted(
									emoji,
									field.symbol,
									shortFieldLabel(field.label),
									detail(start, field.name)?.total ?? 0
								)
							)
						),
						tooltipRow(
							gapCell(start),
							...numbers.map((field) =>
								cell(
									shortFieldLabel(field.label),
									optionalAverage(typeId, field.name, detail(start, field.name)?.avg_number ?? null)
								)
							)
						)
					]
		);
	});
}
