// Turning view rows into chart columns: pure functions, rows in, columns out.
// Every builder zero-fills its window first — a gap in the chart has to mean
// "nothing happened", not "no row".

import type { ColumnBucket, TooltipCell } from '$lib/types/charts';
import { fieldsFor, fieldsRevealedBy, type DetailField } from '$lib/events/fields';
import { dayBreakdown, dayMeans } from './detailDays';
import * as locale from '$lib/locale';
import * as format from '$lib/format';
import * as time from '$lib/time';
import type {
	AccidentBin,
	DetailDayCount,
	MealDay,
	Period,
	SimpleDay,
	WalkDay
} from '$lib/types/domain';
import type { Mean, OutcomeDay } from './outcomes';
import { ALONE_COLORS, MEAL_COLORS, WALK_COLOR } from './palette';

// Window widths and tick spacing, shared so the charts line up with each other.
const DAILY_WINDOW = 30;
const PERIOD_COLUMNS = 12;
const DAY_TICK_EVERY = 7;
const PERIOD_TICK_EVERY = 3;

/**
 * Writes an average that may not exist, since a day with a single walk has
 * no gap to average and no duration unless one was logged.
 * 42 → "~42 min", null → "–"
 */
function optionalMinutes(value: number | null): string {
	return value === null
		? locale.units.missing
		: locale.units.approximately(format.minutesText(value));
}

/**
 * A field label made short enough for a tooltip: no unit in parentheses, which
 * the value already carries, and no question mark, which asks the dialog's
 * question rather than naming an answer. "Längd (minuter)" → "Längd".
 */
function tooltipLabel(label: string): string {
	return label.replace(/\s*\([^)]*\)$/, '').replace(/\?$/, '');
}

/**
 * A number field's day as its own summary of the mean, rounded to the field's
 * step: "30 min" for one event, "~32 min" for several.
 */
function meanText(field: DetailField, sum: number, n: number): string {
	const decimals = field.step?.split('.')[1]?.length ?? 0;
	const mean = Number((sum / n).toFixed(decimals));
	const text = field.summarize?.(mean) ?? format.swedishNumber(mean);
	return n > 1 ? locale.units.approximately(text) : text;
}

/** A tooltip cell; coloured when it stands in for a legend entry. */
function cell(label: string, value: string, color?: string): TooltipCell {
	return color === undefined ? { label, value } : { label, value, color };
}

/** A count labelled by an emoji, sized up so the emoji reads at a glance. */
function countCell(label: string, count: number): TooltipCell {
	return { label, value: String(count), big: true };
}

/** A tooltip row, with the cells that had nothing to say left out. */
function tooltipRow(...cells: (TooltipCell | null)[]): TooltipCell[] {
	return cells.filter((c): c is TooltipCell => c !== null);
}

/**
 * Builds plain count-per-day columns for the last 30 days — the shared
 * builder generated stats cards call, so each new type does not grow a
 * bespoke one. `label` names the count in the tooltip.
 */
export function simpleCountBuckets(
	days: SimpleDay[],
	today: string,
	label: string,
	color: string,
	/**
	 * What to break each day's bar down by, when the type collects anything
	 * countable: its own detail counts, plus the type they belong to so the
	 * captions come from the catalogue rather than being passed in.
	 */
	breakdown?: { typeId: string; counts: DetailDayCount[] }
): ColumnBucket[] {
	const byDay = new Map(days.map((day) => [day.day, day.n]));
	const fields = breakdown ? fieldsFor(breakdown.typeId) : [];

	return time.lastDays(today, DAILY_WINDOW).map((day, i) => {
		const n = byDay.get(day) ?? 0;
		// Only what actually happened: a quiet day says the count and stops,
		// rather than listing every field as a zero.
		const groups = breakdown ? dayBreakdown(breakdown.counts, fields, day) : [];
		const means = breakdown && n > 0 ? dayMeans(breakdown.counts, fields, day) : [];

		return {
			label: format.dayLabel(day),
			tick: i % DAY_TICK_EVERY === 0,
			segments: [n],
			tooltip: {
				heading: format.dayLabel(day),
				// Like the walk tooltip: the count and the day's means first, then
				// each field that happened with what it revealed boxed under it.
				rows: [
					tooltipRow(
						cell(label, String(n), color),
						...means.map(({ field, sum, n: answered }) =>
							cell(tooltipLabel(field.label), meanText(field, sum, answered))
						)
					),
					...groups.flatMap((group) => [
						tooltipRow(cell(`${tooltipLabel(group.label)}:`, String(group.n))),
						...(group.children.length > 0
							? [
									{
										nested: [
											tooltipRow(
												...group.children.map((child) => cell(child.label, String(child.n)))
											)
										]
									}
								]
							: [])
					])
				]
			}
		};
	});
}

/** A length that may be a mean: "42 min" for one event, "~42 min" for several. */
function meanMinutes(mean: Mean): string {
	if (mean.n === 0) {
		return locale.units.missing;
	}
	const text = format.minutesText(mean.sum / mean.n);
	return mean.n > 1 ? locale.units.approximately(text) : text;
}

/**
 * Builds Ensamtid's columns for the last 30 days, stacked Lugn / Orolig / Vet
 * ej like the meal chart. The tooltip reads like the walk one (the count and
 * the day's length), then a row per outcome with its own length, and what was
 * noticed under Orolig in an inset box beneath it, so one anxious session with
 * two signs never reads as three events.
 */
export function aloneBuckets(days: OutcomeDay[], today: string): ColumnBucket[] {
	const byDay = new Map(days.map((day) => [day.day, day]));
	const words = locale.stats.alone;
	const revealed = fieldsRevealedBy(fieldsFor('alone'), 'calm');
	return time.lastDays(today, DAILY_WINDOW).map((day, i) => {
		const row = byDay.get(day);
		const groups = row
			? [
					{ group: row.yes, label: words.legendCalm, color: ALONE_COLORS[0] },
					{ group: row.no, label: words.legendAnxious, color: ALONE_COLORS[1] },
					{ group: row.unknown, label: words.legendUnknown, color: ALONE_COLORS[2] }
				]
			: [];
		return {
			label: format.dayLabel(day),
			tick: i % DAY_TICK_EVERY === 0,
			segments: [row?.yes.count ?? 0, row?.no.count ?? 0, row?.unknown.count ?? 0],
			tooltip: {
				heading: format.dayLabel(day),
				rows: !row
					? [tooltipRow(cell(words.emptyTooltip, '0', ALONE_COLORS[0]))]
					: [
							tooltipRow(
								countCell(locale.stats.symbols.alone, row.n),
								cell(words.length, meanMinutes(row.measure))
							),
							...groups
								.filter(({ group }) => group.count > 0)
								.flatMap(({ group, label, color }) => {
									const nested = [
										...revealed
											.filter((field) => (group.numbers[field.name]?.n ?? 0) > 0)
											.map((field) =>
												tooltipRow(cell(words.after, meanMinutes(group.numbers[field.name])))
											),
										tooltipRow(
											...revealed
												.filter((field) => (group.counts[field.name] ?? 0) > 0)
												.map((field) => cell(field.label, String(group.counts[field.name])))
										)
									].filter((cells) => cells.length > 0);
									return [
										// The count bold after a colon, the length past a divider, like the first row.
										tooltipRow(cell(`${label}:`, String(group.count), color), {
											value: meanMinutes(group.measure)
										}),
										...(nested.length > 0 ? [{ nested }] : [])
									];
								})
						]
			}
		};
	});
}

/**
 * Builds the walks-per-day columns for the last 30 days. Each column carries
 * its own counts and averages, so the tooltip needs no further query.
 */
export function walkBuckets(days: WalkDay[], today: string): ColumnBucket[] {
	const byDay = new Map(days.map((day) => [day.day, day]));

	return time.lastDays(today, DAILY_WINDOW).map((day, i) => {
		const row = byDay.get(day);
		const n = row?.n ?? 0;
		return {
			label: format.dayLabel(day),
			tick: i % DAY_TICK_EVERY === 0,
			segments: [n],
			tooltip: {
				heading: format.dayLabel(day),
				rows:
					n === 0
						? [tooltipRow(cell(locale.stats.walks.emptyTooltip, '0', WALK_COLOR))]
						: [
								tooltipRow(
									countCell(locale.stats.symbols.walk, n),
									countCell(locale.stats.symbols.pee, row?.pee ?? 0),
									countCell(locale.stats.symbols.poop, row?.poop ?? 0)
								),
								tooltipRow(
									cell(locale.stats.walks.between, optionalMinutes(row?.avg_gap_min ?? null)),
									cell(locale.stats.walks.length, optionalMinutes(row?.avg_duration_min ?? null))
								)
							]
			}
		};
	});
}

/**
 * Builds the meals-per-day columns for the last 30 days, stacked by whether
 * she finished. A meal logged with a quick tap says nothing either way, so it
 * becomes a third "unknown" segment rather than being counted as unfinished.
 */
export function mealBuckets(days: MealDay[], today: string): ColumnBucket[] {
	const byDay = new Map(days.map((day) => [day.day, day]));

	return time.lastDays(today, DAILY_WINDOW).map((day, i) => {
		const row = byDay.get(day);
		const finished = row?.finished_true ?? 0;
		const notFinished = row?.finished_false ?? 0;
		const unknown = Math.max(0, (row?.n ?? 0) - finished - notFinished);
		const judged = finished + notFinished;

		return {
			label: format.dayLabel(day),
			tick: i % DAY_TICK_EVERY === 0,
			segments: [finished, notFinished, unknown],
			tooltip: {
				heading: format.dayLabel(day),
				rows:
					(row?.n ?? 0) === 0
						? [tooltipRow(cell(locale.stats.meals.emptyTooltip, '0', MEAL_COLORS[0]))]
						: [
								tooltipRow(
									countCell(locale.stats.symbols.finished, finished),
									countCell(locale.stats.symbols.notFinished, notFinished),
									unknown > 0 ? countCell(locale.stats.symbols.unknown, unknown) : null
								),
								tooltipRow(
									judged > 0
										? cell(locale.stats.meals.share, format.percentageText(finished / judged))
										: null,
									cell(locale.stats.walks.between, optionalMinutes(row?.avg_gap_min ?? null))
								)
							]
			}
		};
	});
}

/**
 * Lists the bucket start dates the accident chart covers, oldest first —
 * 30 days, or 12 weeks aligned to Mondays, or 12 months aligned to the 1st.
 */
function accidentStarts(today: string, period: Period): string[] {
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

/**
 * Builds the accident columns for the selected period, split kiss/bajs. An
 * accident logged without saying which becomes a third neutral segment.
 */
export function accidentBuckets(
	bins: AccidentBin[],
	period: Period,
	today: string
): ColumnBucket[] {
	// A tick has room for a date but not for "Vecka 33", so the axis and the
	// tooltip label the same bucket differently.
	const axisLabel: Record<Period, (start: string) => string> = {
		day: format.dayLabel,
		week: format.weekLabel,
		month: format.monthLabel
	};
	const tooltipHeading: Record<Period, (start: string) => string> = {
		day: format.dayLabel,
		week: format.weekHeading,
		month: format.monthLabel
	};

	const byBucket = new Map(bins.map((bin) => [bin.bucket, bin]));
	const tickEvery = period === 'day' ? DAY_TICK_EVERY : PERIOD_TICK_EVERY;

	return accidentStarts(today, period).map((start, i) => {
		const bin = byBucket.get(start);
		const pee = bin?.pee ?? 0;
		const poop = bin?.poop ?? 0;
		const other = Math.max(0, (bin?.n ?? 0) - pee - poop);

		return {
			label: axisLabel[period](start),
			tick: i % tickEvery === 0,
			segments: [pee, poop, other],
			tooltip: {
				heading: tooltipHeading[period](start),
				rows: [
					tooltipRow(
						countCell(locale.stats.symbols.pee, pee),
						countCell(locale.stats.symbols.poop, poop),
						other > 0 ? countCell(locale.stats.symbols.unknown, other) : null
					)
				]
			}
		};
	});
}
