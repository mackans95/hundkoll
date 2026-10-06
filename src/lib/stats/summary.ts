// The headline numbers, as text.
//
// Every average is marked with "~" because it divides by the days actually
// tracked, and an average of a partial history is an estimate. A value that
// has nothing behind it shows an en dash rather than a zero.

import * as locale from '$lib/locale';
import * as format from '$lib/format';
import type { DetailMetric, Period, StatSummary } from '$lib/types/domain';

export type Tile = { label: string; value: string };

const DASH = locale.units.missing;

/**
 * Marks a value as an estimate, or reports that there is none. The formatter
 * is passed in rather than chosen here so minutes, counts and shares can all
 * go through the same "~ or dash" decision.
 * (5.66, swedishNumber) → "~5,7", (null, …) → "–"
 */
export function approximately(
	value: number | null | undefined,
	write: (value: number) => string
): string {
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
 * The days spent away inside the window, written for the subtitle — or null
 * when there were none worth a decimal, so the sentence stays short.
 * (0.333) → "0,3", (0.02) → null
 */
export function daysAwayText(summary: StatSummary | null): string | null {
	const away = summary?.away_days ?? 0;
	return away >= 0.05 ? format.swedishNumber(away) : null;
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
 * A generated card's share-of-events tile. No "~": a share is measured, not
 * extrapolated, the same reason the meal finish rate carries none.
 *
 * `without` asks for the events where the field was *not* true, which is what
 * "rides that went fine" means. A field nobody has ever answered has no row at
 * all, and that is not the same as knowing nothing: with events behind it, an
 * accident that never happened is 100 % fine — with no events, a dash.
 */
export function shareTile(
	label: string,
	metric: DetailMetric | null,
	events: number,
	without = false
): Tile {
	if (metric) {
		const share = without ? metric.share_not_true : metric.share_true;
		return { label, value: share == null ? DASH : format.percentageText(share) };
	}

	return {
		label,
		value: without && events > 0 ? format.percentageText(1) : DASH
	};
}

/** A share that may not exist yet, written as a percentage or a dash. No "~": it is counted. */
export function shareValueTile(label: string, share: number | null): Tile {
	return { label, value: share === null ? DASH : format.percentageText(share) };
}
