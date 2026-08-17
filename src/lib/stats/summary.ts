// The headline numbers, as text.
//
// Every average is marked with "~" because it divides by the days actually
// tracked, and an average of a partial history is an estimate. A value that
// has nothing behind it shows an en dash rather than a zero.

import * as locale from '$lib/locale';
import * as format from '$lib/format';
import type { Period, StatSummary } from '$lib/types/domain';

export type Tile = { label: string; value: string };

const DASH = locale.units.missing;

/**
 * Marks a value as an estimate, or reports that there is none. The formatter
 * is passed in rather than chosen here so minutes, counts and shares can all
 * go through the same "~ or dash" decision.
 * (5.66, swedishNumber) → "~5,7", (null, …) → "–"
 */
function approximately(value: number | null | undefined, write: (value: number) => string): string {
	return value === null || value === undefined ? DASH : locale.units.approximately(write(value));
}

/**
 * Counts the days that actually hold routine events, which is what every
 * average in this file divides by.
 */
export function daysTracked(summary: StatSummary | null): number {
	return summary?.days_counted ?? 0;
}

/**
 * Decides whether a per-week or per-month figure is worth showing at all.
 * Below a full period there is only a partial one to extrapolate from, and a
 * pace invented that way reads as fact.
 * ("week", 6) → false, ("week", 7) → true
 */
export function periodReady(period: Period, tracked: number): boolean {
	if (period === 'day') {
		return true;
	}

	return period === 'week' ? tracked >= 7 : tracked >= 30;
}

/**
 * Builds the walk tiles, per day first — it is the number worth reading —
 * then the two averages that explain the shape of the day.
 */
export function walkTiles(summary: StatSummary | null): Tile[] {
	return [
		{
			label: locale.stats.walks.perDay,
			value: approximately(summary?.walks_per_day, format.swedishNumber)
		},
		{
			label: locale.stats.walks.betweenWalks,
			value: approximately(summary?.avg_walk_gap_min, format.minutesText)
		},
		{
			label: locale.stats.walks.averageLength,
			value: approximately(summary?.avg_walk_duration_min, format.minutesText)
		}
	];
}

/**
 * Builds the meal tiles. The finish rate is a measured share of meals rather
 * than an average over days, so it carries no "~".
 */
export function mealTiles(summary: StatSummary | null): Tile[] {
	return [
		{
			label: locale.stats.meals.betweenMeals,
			value: approximately(summary?.avg_meal_gap_min, format.minutesText)
		},
		{
			label: locale.stats.meals.finishRate,
			value:
				summary?.meal_finish_rate == null ? DASH : format.percentageText(summary.meal_finish_rate)
		}
	];
}

/**
 * Builds the accident tiles for all three periods at once. The week and month
 * figures stay blank until enough has been tracked to mean them.
 */
export function accidentTiles(summary: StatSummary | null, tracked: number): Tile[] {
	return [
		{
			label: locale.stats.accidents.perDay,
			value: approximately(summary?.accidents_per_day, format.swedishNumber)
		},
		{
			label: locale.stats.accidents.perWeek,
			value: periodReady('week', tracked)
				? approximately(summary?.accidents_per_week, format.swedishNumber)
				: DASH
		},
		{
			label: locale.stats.accidents.perMonth,
			value: periodReady('month', tracked)
				? approximately(summary?.accidents_per_month, format.swedishNumber)
				: DASH
		}
	];
}
