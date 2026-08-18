// Turning view rows into chart columns: pure functions, rows in, columns out.
// Every builder zero-fills its window first — a gap in the chart has to mean
// "nothing happened", not "no row".

import type { ColumnBucket, TooltipCell } from '$lib/types/charts';
import * as locale from '$lib/locale';
import * as format from '$lib/format';
import * as time from '$lib/time';
import type { AccidentBin, MealDay, Period, WalkDay } from '$lib/types/domain';
import { MEAL_COLORS, WALK_COLOR } from './palette';

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
