// The shapes the app actually works with, derived from the generated
// schema in ./database.ts rather than written by hand.
//
// Two adjustments happen here, both because Postgres cannot tell the type
// generator everything it knows:
//
//  - View columns always generate as nullable, since Postgres cannot prove
//    non-nullability through a view. The views in this project do promise
//    non-null keys and counts, so those columns are narrowed below.
//  - `category` is a text column with a check constraint rather than a real
//    enum, so it generates as `string`. The union lives here instead.

import type { Database } from './database';

type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
/** A raw view row, before the narrowing below — for the mapping functions. */
export type ViewRow<T extends keyof Database['public']['Views']> =
	Database['public']['Views'][T]['Row'];
type Views<T extends keyof Database['public']['Views']> = ViewRow<T>;

/** Narrow the named columns of a view row to non-null. */
type NotNull<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };

export type EventCategory = 'routine' | 'care' | 'health';

/** A tracked activity: the catalogue row that drives every screen. */
export type EventType = Omit<Tables<'event_types'>, 'category'> & { category: EventCategory };

/** `details` is jsonb; each type's keys are described by DETAIL_FIELDS. */
export type EventDetails = Record<string, unknown>;

/** A logged event as the recent-events list needs it. */
export type EventRow = Pick<Tables<'events'>, 'id' | 'type_id' | 'occurred_at' | 'note'> & {
	details: EventDetails;
	type: Pick<EventType, 'label' | 'icon'> | null;
};

/** Insert shape for a new event; `id` travels from the client. */
export type EventInsert = Database['public']['Tables']['events']['Insert'];

/** One row of the Status screen: last done and next due for an activity. */
export type StatusRow = Omit<
	NotNull<Views<'dog_care_status'>, 'dog_id' | 'type_id' | 'label' | 'sort_order'>,
	'category'
> & { category: EventCategory };

/** The headline averages, one row per dog. */
export type StatSummary = NotNull<Views<'stats_summary'>, 'dog_id'>;

/** Per-type per-day counts; the walk and meal charts read different columns. */
type DailyCounts = NotNull<Views<'stats_daily_counts'>, 'day' | 'type_id' | 'n'>;
export type WalkDay = Pick<
	NotNull<DailyCounts, 'pee' | 'poop'>,
	'day' | 'n' | 'pee' | 'poop' | 'avg_gap_min' | 'avg_duration_min'
>;
export type MealDay = Pick<
	NotNull<DailyCounts, 'finished_true' | 'finished_false'>,
	'day' | 'n' | 'finished_true' | 'finished_false' | 'avg_gap_min'
>;

/** Accidents binned by day, ISO week or month, split kiss/bajs. */
export type AccidentBin = Pick<
	NotNull<Views<'stats_accident_bins'>, 'bucket' | 'n' | 'pee' | 'poop'>,
	'bucket' | 'n' | 'pee' | 'poop'
>;

/** One period bucket of the Trender comparison. */
export type TrendBucket = Pick<
	NotNull<Views<'stats_period_summary'>, 'bucket' | 'walks' | 'accidents'>,
	| 'bucket'
	| 'walks'
	| 'walk_gap_min'
	| 'walk_duration_min'
	| 'meal_gap_min'
	| 'meal_finish_rate'
	| 'accidents'
>;

/** A single weighing, flattened out of the event's details. */
export type WeightPoint = { occurred_at: string; kg: number };

/** The bucket size the stats screen is showing. */
export const PERIODS = ['day', 'week', 'month'] as const;
export type Period = (typeof PERIODS)[number];

/** Read a period from a query string, falling back to the daily view. */
export function toPeriod(raw: string | null): Period {
	return PERIODS.includes(raw as Period) ? (raw as Period) : 'day';
}
