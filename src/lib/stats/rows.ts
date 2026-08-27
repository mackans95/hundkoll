// Assembling each card's shape out of the generic views.
//
// The views are per type and per detail field and name neither, so which
// columns a walk or a meal consists of is decided here instead. That knowledge
// belongs on this side: it is the same knowledge DETAIL_FIELDS holds, and it is
// what let the views stop naming types at all.
//
// Shaping, not computing. Every number arrives aggregated — including the meal
// finish rate, which is a view column rather than a division here, so a ratio
// is never rounded twice.

import type {
	AccidentBin,
	DetailBucketRow,
	DetailWindowRow,
	MealDay,
	SimpleDay,
	StatSummary,
	TrendBucket,
	TypeBucketRow,
	TypeWindowRow,
	WalkDay
} from '$lib/types/domain';

/** One field's row for a type's bucket, or null when nothing carried it. */
function detailAt(
	rows: DetailBucketRow[],
	typeId: string,
	bucket: string,
	field: string
): DetailBucketRow | null {
	return (
		rows.find((row) => row.type_id === typeId && row.bucket === bucket && row.field === field) ??
		null
	);
}

/**
 * A bucket's total for one field. A missing row means no event that bucket
 * carried the field, which is a zero — the reading the old summed column gave.
 */
function totalAt(rows: DetailBucketRow[], typeId: string, bucket: string, field: string): number {
	return detailAt(rows, typeId, bucket, field)?.total ?? 0;
}

/** The walk chart's days: counts, kiss and bajs, and the day's own averages. */
export function walkDays(buckets: TypeBucketRow[], details: DetailBucketRow[]): WalkDay[] {
	return buckets
		.filter((bucket) => bucket.type_id === 'walk')
		.map((bucket) => ({
			day: bucket.bucket,
			n: bucket.n,
			pee: totalAt(details, 'walk', bucket.bucket, 'pee'),
			poop: totalAt(details, 'walk', bucket.bucket, 'poop'),
			avg_gap_min: bucket.avg_gap_min,
			avg_duration_min: detailAt(details, 'walk', bucket.bucket, 'duration_min')?.avg_number ?? null
		}));
}

/** The meal chart's days, split finished / not finished. */
export function mealDays(buckets: TypeBucketRow[], details: DetailBucketRow[]): MealDay[] {
	return buckets
		.filter((bucket) => bucket.type_id === 'meal')
		.map((bucket) => {
			const finished = detailAt(details, 'meal', bucket.bucket, 'finished');
			return {
				day: bucket.bucket,
				n: bucket.n,
				finished_true: finished?.happened ?? 0,
				// answered − happened rather than n − happened: a meal nobody
				// answered for is neither finished nor unfinished.
				finished_false: finished ? finished.answered - finished.happened : 0,
				avg_gap_min: bucket.avg_gap_min
			};
		});
}

/** The accident bins for whichever period the screen is showing. */
export function accidentBins(buckets: TypeBucketRow[], details: DetailBucketRow[]): AccidentBin[] {
	return buckets
		.filter((bucket) => bucket.type_id === 'accident')
		.map((bucket) => ({
			bucket: bucket.bucket,
			n: bucket.n,
			pee: totalAt(details, 'accident', bucket.bucket, 'pee'),
			poop: totalAt(details, 'accident', bucket.bucket, 'poop')
		}));
}

/** One type's days and counts, which is all a generated counts card plots. */
export function simpleDays(buckets: TypeBucketRow[], typeId: string): SimpleDay[] {
	return buckets
		.filter((bucket) => bucket.type_id === typeId)
		.map((bucket) => ({ day: bucket.bucket, n: bucket.n }));
}

/**
 * The Trender buckets. One per bucket that saw *any* activity, which is what
 * the wide view produced — a week with only a car ride in it still compares as
 * zero walks rather than going missing and reading as "not tracked yet".
 */
export function trendBuckets(buckets: TypeBucketRow[], details: DetailBucketRow[]): TrendBucket[] {
	const at = (typeId: string, bucket: string) =>
		buckets.find((row) => row.type_id === typeId && row.bucket === bucket) ?? null;

	return [...new Set(buckets.map((bucket) => bucket.bucket))].sort().map((bucket) => {
		const walk = at('walk', bucket);
		const meal = at('meal', bucket);
		return {
			bucket,
			walks: walk?.n ?? 0,
			walk_gap_min: walk?.avg_gap_min ?? null,
			walk_duration_min: detailAt(details, 'walk', bucket, 'duration_min')?.avg_number ?? null,
			meal_gap_min: meal?.avg_gap_min ?? null,
			meal_finish_rate: detailAt(details, 'meal', bucket, 'finished')?.share_answered ?? null,
			accidents: at('accident', bucket)?.n ?? 0
		};
	});
}

/**
 * The headline row. The three accident rates read three different windows —
 * 30, 84 and 180 days — because each divides by the days actually tracked
 * inside its own window, capped at it.
 */
export function statSummary(
	windows: TypeWindowRow[],
	details: DetailWindowRow[]
): StatSummary | null {
	const at = (typeId: string, windowDays: number) =>
		windows.find((row) => row.type_id === typeId && row.window_days === windowDays) ?? null;
	const metric = (typeId: string, field: string) =>
		details.find((row) => row.type_id === typeId && row.field === field) ?? null;

	// The view has a row per dog × type × window whether anything was logged or
	// not, so no walk row means the read failed — and a failed read has no
	// headline numbers, exactly as a missing summary row had none.
	const walk = at('walk', 30);
	if (!walk) {
		return null;
	}

	return {
		dog_id: walk.dog_id,
		walks_per_day: walk.per_day,
		avg_walk_gap_min: walk.avg_gap_min,
		avg_walk_duration_min: metric('walk', 'duration_min')?.avg_number ?? null,
		avg_meal_gap_min: at('meal', 30)?.avg_gap_min ?? null,
		// share_answered, not share_true: the rate is over the meals that were
		// answered for, which is what this number has always meant.
		meal_finish_rate: metric('meal', 'finished')?.share_answered ?? null,
		accidents_per_day: at('accident', 30)?.per_day ?? 0,
		accidents_per_week: at('accident', 84)?.per_week ?? 0,
		accidents_per_month: at('accident', 180)?.per_month ?? 0,
		days_counted: walk.days_counted
	};
}
