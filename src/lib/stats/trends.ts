// The Trender card: the last two complete periods, compared.

import * as locale from '$lib/locale';
import * as format from '$lib/format';
import * as time from '$lib/time';
import type { Period, TrendBucket } from '$lib/types/domain';

/**
 * Names the last two complete buckets for a period. Today never takes part —
 * a day still in progress would always look like a decline.
 * ("2026-08-14", "day") → { prev: "2026-08-12", latest: "2026-08-13" }
 */
export function trendBucketKeys(today: string, period: Period): { prev: string; latest: string } {
	if (period === 'day') {
		return { prev: time.addDays(today, -2), latest: time.addDays(today, -1) };
	}

	if (period === 'week') {
		const monday = time.mondayOf(today);
		return { prev: time.addDays(monday, -14), latest: time.addDays(monday, -7) };
	}

	const firstOfMonth = `${today.slice(0, 7)}-01`;
	return { prev: time.addMonths(firstOfMonth, -2), latest: time.addMonths(firstOfMonth, -1) };
}

/**
 * Says which two buckets the card is comparing, so the percentages have
 * something to refer to.
 * ("week", …) → "v.33 jämfört med v.32"
 */
export function trendCaption(period: Period, prev: string, latest: string): string {
	const bucketLabel: Record<Period, (iso: string) => string> = {
		day: format.dayLabel,
		week: format.weekLabel,
		month: format.monthLabel
	};

	const label = bucketLabel[period];
	return locale.stats.trends.comparison(label(latest), label(prev));
}

/**
 * Explains why the card is empty, which it is until two complete periods
 * have been tracked.
 * "month" → "Visas när två hela månader har spårats."
 */
export function trendPending(period: Period): string {
	return locale.stats.trends.pending(period);
}

type TrendMetric = {
	label: string;
	get: (bucket: TrendBucket) => number | null;
	format: (value: number) => string;
};

export type TrendRow = { label: string; from: string; to: string; badge: string };

/**
 * Writes the change between two values as a neutral percentage — whether more
 * is better depends on the metric. An en dash when there is nothing to
 * compare, including a zero base, where every change is infinite.
 * (4, 5) → "↑ 25 %"
 */
function changeBadge(from: number | null, to: number | null): string {
	if (from === null || to === null || from === 0) {
		return locale.units.missing;
	}

	const percent = Math.round(((to - from) / Math.abs(from)) * 100);
	if (percent === 0) {
		return locale.stats.trends.unchanged;
	}

	return locale.stats.trends.change(percent > 0 ? 'up' : 'down', Math.abs(percent));
}

/**
 * Builds one row per metric comparing the two periods, each already
 * formatted for display. A metric with no data on either side still gets a
 * row, so the list does not change height as history accumulates.
 */
export function buildTrendRows(prev: TrendBucket | null, latest: TrendBucket | null): TrendRow[] {
	const metrics: TrendMetric[] = [
		{ label: locale.stats.trends.metrics.walks, get: (b) => b.walks, format: format.swedishNumber },
		{
			label: locale.stats.trends.metrics.walkGap,
			get: (b) => b.walk_gap_min,
			format: (v) => locale.units.approximately(format.minutesText(v))
		},
		{
			label: locale.stats.trends.metrics.walkDuration,
			get: (b) => b.walk_duration_min,
			format: (v) => locale.units.approximately(format.minutesText(v))
		},
		{
			label: locale.stats.trends.metrics.mealGap,
			get: (b) => b.meal_gap_min,
			format: (v) => locale.units.approximately(format.minutesText(v))
		},
		{
			label: locale.stats.trends.metrics.mealFinishRate,
			get: (b) => b.meal_finish_rate,
			format: format.percentageText
		},
		{
			label: locale.stats.trends.metrics.accidents,
			get: (b) => b.accidents,
			format: format.swedishNumber
		}
	];

	return metrics.map((metric) => {
		const from = prev ? metric.get(prev) : null;
		const to = latest ? metric.get(latest) : null;

		return {
			label: metric.label,
			from: from === null ? locale.units.missing : metric.format(from),
			to: to === null ? locale.units.missing : metric.format(to),
			badge: changeBadge(from, to)
		};
	});
}
