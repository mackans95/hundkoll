import { addDays, addMonths, mondayOf, stockholmNowForInput } from '$lib/time';
import type { PageServerLoad } from './$types';

const PERIODS = ['day', 'week', 'month'] as const;
export type Period = (typeof PERIODS)[number];

export type TrendBucket = {
	bucket: string;
	walks: number;
	walk_gap_min: number | null;
	walk_duration_min: number | null;
	meal_gap_min: number | null;
	meal_finish_rate: number | null;
	accidents: number;
};

/** The last two COMPLETE buckets for a period — today never participates. */
function trendBuckets(today: string, period: Period): { prev: string; latest: string } {
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

export type Summary = {
	dog_id: string;
	walks_per_day: number | null;
	avg_walk_gap_min: number | null;
	avg_walk_duration_min: number | null;
	avg_meal_gap_min: number | null;
	meal_finish_rate: number | null;
	accidents_per_day: number | null;
	accidents_per_week: number | null;
	accidents_per_month: number | null;
	days_counted: number | null;
};

type WalkDay = {
	day: string;
	n: number;
	pee: number;
	poop: number;
	avg_gap_min: number | null;
	avg_duration_min: number | null;
};
type MealDay = {
	day: string;
	n: number;
	finished_true: number;
	finished_false: number;
	avg_gap_min: number | null;
};
type AccidentBin = { bucket: string; n: number; pee: number; poop: number };
type WeightEvent = { occurred_at: string; details: Record<string, unknown> };

// How far back the accident chart looks per bin size (12-ish buckets each).
const BIN_WINDOW_DAYS: Record<Period, number> = { day: 30, week: 84, month: 365 };

export const load: PageServerLoad = async ({ url, locals: { supabase } }) => {
	const rawPeriod = url.searchParams.get('period') as Period | null;
	const period: Period = rawPeriod && PERIODS.includes(rawPeriod) ? rawPeriod : 'day';
	const rawTrend = url.searchParams.get('trend') as Period | null;
	const trend: Period = rawTrend && PERIODS.includes(rawTrend) ? rawTrend : 'day';
	const { prev: trendPrevBucket, latest: trendLatestBucket } = trendBuckets(
		stockholmNowForInput().slice(0, 10),
		trend
	);

	const daysAgo = (days: number) =>
		new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

	const [summaryRes, walksRes, mealsRes, binsRes, weightsRes, trendRes] = await Promise.all([
		supabase.from('stats_summary').select('*').limit(1).maybeSingle<Summary>(),
		supabase
			.from('stats_daily_counts')
			.select('day, n, pee, poop, avg_gap_min, avg_duration_min')
			.eq('type_id', 'walk')
			.gte('day', daysAgo(30))
			.order('day')
			.overrideTypes<WalkDay[]>(),
		supabase
			.from('stats_daily_counts')
			.select('day, n, finished_true, finished_false, avg_gap_min')
			.eq('type_id', 'meal')
			.gte('day', daysAgo(30))
			.order('day')
			.overrideTypes<MealDay[]>(),
		supabase
			.from('stats_accident_bins')
			.select('bucket, n, pee, poop')
			.eq('period', period)
			.gte('bucket', daysAgo(BIN_WINDOW_DAYS[period]))
			.order('bucket')
			.overrideTypes<AccidentBin[]>(),
		supabase
			.from('events')
			.select('occurred_at, details')
			.eq('type_id', 'weight')
			.order('occurred_at')
			.overrideTypes<WeightEvent[]>(),
		supabase
			.from('stats_period_summary')
			.select(
				'bucket, walks, walk_gap_min, walk_duration_min, meal_gap_min, meal_finish_rate, accidents'
			)
			.eq('period', trend)
			.in('bucket', [trendPrevBucket, trendLatestBucket])
			.overrideTypes<TrendBucket[]>()
	]);

	const trendRows = trendRes.data ?? [];
	return {
		period,
		trend,
		trendPrev: trendRows.find((r) => r.bucket === trendPrevBucket) ?? null,
		trendLatest: trendRows.find((r) => r.bucket === trendLatestBucket) ?? null,
		trendPrevBucket,
		trendLatestBucket,
		summary: summaryRes.data,
		walkDays: walksRes.data ?? [],
		mealDays: mealsRes.data ?? [],
		accidentBins: binsRes.data ?? [],
		weights: (weightsRes.data ?? [])
			.filter((w) => typeof w.details.kg === 'number')
			.map((w) => ({ occurred_at: w.occurred_at, kg: w.details.kg as number }))
	};
};
