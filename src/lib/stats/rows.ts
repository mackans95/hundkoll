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
	DetailBucketRow,
	DetailWindowRow,
	SimpleDay,
	StatSummary,
	TypeBucketRow,
	TypeWindowRow
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
		days_counted: walk.days_counted,
		away_days: walk.away_days
	};
}
