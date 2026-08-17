// The Trender card: the last two complete periods, compared.

import { dayLabel, minutesText, monthLabel, pctText, svNum, weekLabel } from '$lib/format';
import { addDays, addMonths, mondayOf } from '$lib/time';
import type { Period, TrendBucket } from '$lib/types/domain';

/** The last two COMPLETE buckets for a period — today never participates. */
export function trendBucketKeys(today: string, period: Period): { prev: string; latest: string } {
	if (period === 'day') {
		return { prev: addDays(today, -2), latest: addDays(today, -1) };
	}
	if (period === 'week') {
		const monday = mondayOf(today);
		return { prev: addDays(monday, -14), latest: addDays(monday, -7) };
	}
	const first = `${today.slice(0, 7)}-01`;
	return { prev: addMonths(first, -2), latest: addMonths(first, -1) };
}

const BUCKET_LABEL: Record<Period, (iso: string) => string> = {
	day: dayLabel,
	week: weekLabel,
	month: monthLabel
};

/** "v.33 jämfört med v.32" */
export function trendCaption(period: Period, prev: string, latest: string): string {
	const label = BUCKET_LABEL[period];
	return `${label(latest)} jämfört med ${label(prev)}`;
}

/** Shown instead of the comparison until two complete periods exist. */
export function trendPending(period: Period): string {
	const noun = period === 'day' ? 'dagar' : period === 'week' ? 'veckor' : 'månader';
	return `Visas när två hela ${noun} har spårats.`;
}

type TrendMetric = {
	label: string;
	get: (bucket: TrendBucket) => number | null;
	format: (value: number) => string;
};

const TREND_METRICS: TrendMetric[] = [
	{ label: '🚶 Promenader', get: (b) => b.walks, format: (v) => svNum(v) },
	{
		label: '⏳ Mellan promenader',
		get: (b) => b.walk_gap_min,
		format: (v) => `~${minutesText(v)}`
	},
	{ label: '⏱️ Snittlängd', get: (b) => b.walk_duration_min, format: (v) => `~${minutesText(v)}` },
	{ label: '⏳ Mellan mål', get: (b) => b.meal_gap_min, format: (v) => `~${minutesText(v)}` },
	{ label: '✅ Åt upp', get: (b) => b.meal_finish_rate, format: pctText },
	{ label: '⚠️ Olyckor', get: (b) => b.accidents, format: (v) => svNum(v) }
];

export type TrendRow = { label: string; from: string; to: string; badge: string };

/** "↑ 12 %" — neutral, because whether more is better depends on the metric. */
function changeBadge(from: number | null, to: number | null): string {
	if (from === null || to === null || from === 0) {
		return '–';
	}
	const pct = Math.round(((to - from) / Math.abs(from)) * 100);
	return pct === 0 ? '±0 %' : `${pct > 0 ? '↑' : '↓'} ${Math.abs(pct)} %`;
}

export function buildTrendRows(prev: TrendBucket | null, latest: TrendBucket | null): TrendRow[] {
	return TREND_METRICS.map((metric) => {
		const from = prev ? metric.get(prev) : null;
		const to = latest ? metric.get(latest) : null;
		return {
			label: metric.label,
			from: from === null ? '–' : metric.format(from),
			to: to === null ? '–' : metric.format(to),
			badge: changeBadge(from, to)
		};
	});
}
