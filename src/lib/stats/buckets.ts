// Turning view rows into chart columns.
//
// Pure functions: rows in, columns out. The database only returns days that
// have events, so every builder zero-fills its window first — a gap in the
// chart has to mean "nothing happened", not "no row".

import type { ColumnBucket } from '$lib/components/charts/types';
import * as format from '$lib/format';
import * as time from '$lib/time';
import type { AccidentBin, MealDay, Period, WalkDay } from '$lib/types/domain';
import { MEAL_COLORS, WALK_COLOR } from './palette';

/** How many columns each period shows, and how often it labels one. */
const DAILY_WINDOW = 30;
const PERIOD_COLUMNS = 12;
const DAY_TICK_EVERY = 7;
const PERIOD_TICK_EVERY = 3;

/** "~42 min", or an en dash when the average has nothing to average. */
function optionalMinutes(value: number | null): string {
	return value === null ? '–' : `~${format.minutesText(value)}`;
}

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
						? [[{ label: 'Promenader', value: '0', color: WALK_COLOR }]]
						: [
								[
									{ label: '🚶', value: String(n), big: true },
									{ label: '🟡', value: String(row?.pee ?? 0), big: true },
									{ label: '💩', value: String(row?.poop ?? 0), big: true }
								],
								[
									{ label: 'Tid mellan', value: optionalMinutes(row?.avg_gap_min ?? null) },
									{ label: 'Längd', value: optionalMinutes(row?.avg_duration_min ?? null) }
								]
							]
			}
		};
	});
}

export function mealBuckets(days: MealDay[], today: string): ColumnBucket[] {
	const byDay = new Map(days.map((day) => [day.day, day]));

	return time.lastDays(today, DAILY_WINDOW).map((day, i) => {
		const row = byDay.get(day);
		const finished = row?.finished_true ?? 0;
		const notFinished = row?.finished_false ?? 0;
		// Meals logged by a quick tap say nothing either way.
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
						? [[{ label: 'Mål', value: '0', color: MEAL_COLORS[0] }]]
						: [
								[
									{ label: '✅', value: String(finished), big: true },
									{ label: '❌', value: String(notFinished), big: true },
									...(unknown > 0 ? [{ label: '❔', value: String(unknown), big: true }] : [])
								],
								[
									...(judged > 0
										? [{ label: 'Andel', value: format.pctText(finished / judged) }]
										: []),
									{ label: 'Tid mellan', value: optionalMinutes(row?.avg_gap_min ?? null) }
								]
							]
			}
		};
	});
}

/** The bucket start dates the accident chart covers, oldest first. */
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

export function accidentBuckets(
	bins: AccidentBin[],
	period: Period,
	today: string
): ColumnBucket[] {
	const byBucket = new Map(bins.map((bin) => [bin.bucket, bin]));
	const tickEvery = period === 'day' ? DAY_TICK_EVERY : PERIOD_TICK_EVERY;

	return accidentStarts(today, period).map((start, i) => {
		const bin = byBucket.get(start);
		const pee = bin?.pee ?? 0;
		const poop = bin?.poop ?? 0;
		const other = Math.max(0, (bin?.n ?? 0) - pee - poop);

		return {
			label: AXIS_LABEL[period](start),
			tick: i % tickEvery === 0,
			segments: [pee, poop, other],
			tooltip: {
				heading: TOOLTIP_HEADING[period](start),
				rows: [
					[
						{ label: '🟡', value: String(pee), big: true },
						{ label: '💩', value: String(poop), big: true },
						...(other > 0 ? [{ label: '❔', value: String(other), big: true }] : [])
					]
				]
			}
		};
	});
}
