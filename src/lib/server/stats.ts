// The stats queries. Aggregation happens in SQL — see supabase/migrations —
// so this module only reads and narrows the nullable view columns into the
// domain types, once, so pages never handle a `number | null` count.

import { trendBucketKeys } from '$lib/stats/trends';
import * as time from '$lib/time';
import type {
	AccidentBin,
	MealDay,
	Period,
	StatSummary,
	TrendBucket,
	ViewRow,
	WeightPoint
} from '$lib/types/domain';
import type { WalkDay } from '$lib/types/domain';
import { weightHistory } from './events';
import type { Db } from './db';

export type Stats = {
	period: Period;
	trend: Period;
	/** The Stockholm day the query windows were cut from, for the charts to
	 * zero-fill the same window. */
	today: string;
	trendPrev: TrendBucket | null;
	trendLatest: TrendBucket | null;
	trendPrevBucket: string;
	trendLatestBucket: string;
	summary: StatSummary | null;
	walkDays: WalkDay[];
	mealDays: MealDay[];
	accidentBins: AccidentBin[];
	weights: WeightPoint[];
};

// The mappers take exactly the columns their query selects, so a select and
// its reader drifting apart is a compile error rather than an empty chart.
type SelectedDaily = Pick<
	ViewRow<'stats_daily_counts'>,
	| 'day'
	| 'n'
	| 'pee'
	| 'poop'
	| 'finished_true'
	| 'finished_false'
	| 'avg_gap_min'
	| 'avg_duration_min'
>;
type SelectedBin = Pick<ViewRow<'stats_accident_bins'>, 'bucket' | 'n' | 'pee' | 'poop'>;
type SelectedPeriod = Pick<
	ViewRow<'stats_period_summary'>,
	| 'bucket'
	| 'walks'
	| 'walk_gap_min'
	| 'walk_duration_min'
	| 'meal_gap_min'
	| 'meal_finish_rate'
	| 'accidents'
>;

/** Narrows a daily-counts row into the columns the walk chart reads. */
function toWalkDay(row: SelectedDaily): WalkDay | null {
	if (!row.day) {
		return null;
	}
	return {
		day: row.day,
		n: row.n ?? 0,
		pee: row.pee ?? 0,
		poop: row.poop ?? 0,
		avg_gap_min: row.avg_gap_min,
		avg_duration_min: row.avg_duration_min
	};
}

/** Narrows a daily-counts row into the columns the meal chart reads. */
function toMealDay(row: SelectedDaily): MealDay | null {
	if (!row.day) {
		return null;
	}
	return {
		day: row.day,
		n: row.n ?? 0,
		finished_true: row.finished_true ?? 0,
		finished_false: row.finished_false ?? 0,
		avg_gap_min: row.avg_gap_min
	};
}

/** Narrows one accident bin, whichever period it was binned by. */
function toAccidentBin(row: SelectedBin): AccidentBin | null {
	if (!row.bucket) {
		return null;
	}
	return { bucket: row.bucket, n: row.n ?? 0, pee: row.pee ?? 0, poop: row.poop ?? 0 };
}

/** Narrows one period bucket into the metrics the Trender card compares. */
function toTrendBucket(row: SelectedPeriod): TrendBucket | null {
	if (!row.bucket) {
		return null;
	}
	return {
		bucket: row.bucket,
		walks: row.walks ?? 0,
		walk_gap_min: row.walk_gap_min,
		walk_duration_min: row.walk_duration_min,
		meal_gap_min: row.meal_gap_min,
		meal_finish_rate: row.meal_finish_rate,
		accidents: row.accidents ?? 0
	};
}

/** Keeps the rows that survived narrowing and drops the ones that did not. */
function present<T>(rows: (T | null)[]): T[] {
	return rows.filter((row): row is T => row !== null);
}

/** Everything the stats screen shows, for one period and one trend period. */
export async function loadStats(db: Db, period: Period, trend: Period): Promise<Stats> {
	// How far back to read per bin size, each covering a dozen-ish buckets.
	const BIN_WINDOW_DAYS: Record<Period, number> = { day: 30, week: 84, month: 365 };
	const DAILY_WINDOW_DAYS = 30;

	const today = time.stockholmNowForInput().slice(0, 10);
	const { prev: trendPrevBucket, latest: trendLatestBucket } = trendBucketKeys(today, trend);

	// Counted in Stockholm days, the same days the charts zero-fill — a UTC
	// cutoff would disagree with them for the hours around midnight.
	const daysAgo = (days: number) => time.addDays(today, -days);

	const dailyColumns =
		'day, n, pee, poop, finished_true, finished_false, avg_gap_min, avg_duration_min';

	const [summaryRes, walksRes, mealsRes, binsRes, weights, trendRes] = await Promise.all([
		db.from('stats_summary').select('*').limit(1).maybeSingle(),
		db
			.from('stats_daily_counts')
			.select(dailyColumns)
			.eq('type_id', 'walk')
			.gte('day', daysAgo(DAILY_WINDOW_DAYS))
			.order('day'),
		db
			.from('stats_daily_counts')
			.select(dailyColumns)
			.eq('type_id', 'meal')
			.gte('day', daysAgo(DAILY_WINDOW_DAYS))
			.order('day'),
		db
			.from('stats_accident_bins')
			.select('bucket, n, pee, poop')
			.eq('period', period)
			.gte('bucket', daysAgo(BIN_WINDOW_DAYS[period]))
			.order('bucket'),
		weightHistory(db),
		db
			.from('stats_period_summary')
			.select(
				'bucket, walks, walk_gap_min, walk_duration_min, meal_gap_min, meal_finish_rate, accidents'
			)
			.eq('period', trend)
			.in('bucket', [trendPrevBucket, trendLatestBucket])
	]);

	const trendRows = present((trendRes.data ?? []).map(toTrendBucket));
	const summary = summaryRes.data;

	return {
		period,
		trend,
		today,
		trendPrev: trendRows.find((row) => row.bucket === trendPrevBucket) ?? null,
		trendLatest: trendRows.find((row) => row.bucket === trendLatestBucket) ?? null,
		trendPrevBucket,
		trendLatestBucket,
		summary: summary?.dog_id ? { ...summary, dog_id: summary.dog_id } : null,
		walkDays: present((walksRes.data ?? []).map(toWalkDay)),
		mealDays: present((mealsRes.data ?? []).map(toMealDay)),
		accidentBins: present((binsRes.data ?? []).map(toAccidentBin)),
		weights
	};
}
