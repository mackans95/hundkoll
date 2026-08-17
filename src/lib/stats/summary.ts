// The headline numbers, as text.
//
// Every average is marked with "~" because it divides by the days actually
// tracked, and an average of a partial history is an estimate. A value that
// has nothing behind it shows an en dash rather than a zero.

import { minutesText, pctText, svNum } from '$lib/format';
import type { Period, StatSummary } from '$lib/types/domain';

export type Tile = { label: string; value: string };

const DASH = '–';

function approx(value: number | null | undefined, format: (v: number) => string): string {
	return value === null || value === undefined ? DASH : `~${format(value)}`;
}

/** Days that actually hold routine events, which is what the averages divide by. */
export function daysTracked(summary: StatSummary | null): number {
	return summary?.days_counted ?? 0;
}

/**
 * Whether a per-week or per-month figure is worth showing at all. Below a
 * full period there is only a partial one to extrapolate from, and a pace
 * invented that way reads as fact.
 */
export function periodReady(period: Period, tracked: number): boolean {
	if (period === 'day') {
		return true;
	}
	return period === 'week' ? tracked >= 7 : tracked >= 30;
}

/** Per day first — it is the number worth reading — then the two averages. */
export function walkTiles(summary: StatSummary | null): Tile[] {
	return [
		{ label: '🚶 per dag', value: approx(summary?.walks_per_day, (v) => svNum(v)) },
		{ label: '⏳ mellan promenader', value: approx(summary?.avg_walk_gap_min, minutesText) },
		{ label: '⏱️ snittlängd', value: approx(summary?.avg_walk_duration_min, minutesText) }
	];
}

export function mealTiles(summary: StatSummary | null): Tile[] {
	return [
		{ label: '⏳ mellan mål', value: approx(summary?.avg_meal_gap_min, minutesText) },
		{
			label: '✅ åt upp',
			// A finish rate is a measured share, not an estimate — no "~".
			value: summary?.meal_finish_rate == null ? DASH : pctText(summary.meal_finish_rate)
		}
	];
}

export function accidentTiles(summary: StatSummary | null, tracked: number): Tile[] {
	return [
		{ label: 'per dag', value: approx(summary?.accidents_per_day, (v) => svNum(v)) },
		{
			label: 'per vecka',
			value: periodReady('week', tracked)
				? approx(summary?.accidents_per_week, (v) => svNum(v))
				: DASH
		},
		{
			label: 'per månad',
			value: periodReady('month', tracked)
				? approx(summary?.accidents_per_month, (v) => svNum(v))
				: DASH
		}
	];
}
