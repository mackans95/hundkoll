// The shapes the app actually works with, derived from the generated schema
// in ./database.ts. Two adjustments Postgres cannot express to the generator:
// view columns generate as nullable even when the view promises otherwise
// (narrowed below), and `category` is a checked text column, so its union
// lives here.

import type { Database } from './database';

type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
/** A raw view row, before the narrowing below — for the mapping functions. */
export type ViewRow<T extends keyof Database['public']['Views']> =
	Database['public']['Views'][T]['Row'];
type Views<T extends keyof Database['public']['Views']> = ViewRow<T>;

/** Narrow the named columns of a view row to non-null. */
type NotNull<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };

export type EventCategory = 'routine' | 'care' | 'health' | 'other';

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

/**
 * The generic view rows, narrowed. The views are per type and per detail field
 * and name neither, so a card's columns are picked out of these by
 * $lib/stats/rows.ts rather than selected by name.
 */
export type TypeBucketRow = {
	type_id: string;
	bucket: string;
	n: number;
	avg_gap_min: number | null;
};
export type DetailBucketRow = {
	type_id: string;
	bucket: string;
	field: string;
	answered: number;
	happened: number;
	total: number;
	avg_number: number | null;
	share_answered: number | null;
};
export type TypeWindowRow = {
	dog_id: string;
	type_id: string;
	window_days: number;
	events: number;
	days_counted: number;
	per_day: number;
	per_week: number;
	per_month: number;
	avg_gap_min: number | null;
};

/**
 * The headline averages for one dog. Assembled from the window views rather
 * than read from one wide row, so the shape is stated here — and the rates are
 * non-null, because a type with no events counts zero rather than nothing.
 */
export type StatSummary = {
	dog_id: string;
	walks_per_day: number;
	avg_walk_gap_min: number | null;
	avg_walk_duration_min: number | null;
	avg_meal_gap_min: number | null;
	meal_finish_rate: number | null;
	accidents_per_day: number;
	accidents_per_week: number;
	accidents_per_month: number;
	days_counted: number;
};

/** Per-day counts; the walk and meal charts read different fields. */
export type WalkDay = {
	day: string;
	n: number;
	pee: number;
	poop: number;
	avg_gap_min: number | null;
	avg_duration_min: number | null;
};
export type MealDay = {
	day: string;
	n: number;
	finished_true: number;
	finished_false: number;
	avg_gap_min: number | null;
};

/**
 * One detail field's headline numbers over the last 30 days. `events` counts
 * every event of the type and `answered` only those carrying the field — the
 * gap is what lets a share divide by every event, which is what a reveal needs.
 */
export type DetailMetric = Pick<
	NotNull<Views<'stats_detail_windows'>, 'field' | 'events' | 'answered'>,
	'field' | 'events' | 'answered' | 'avg_number' | 'share_true' | 'share_not_true'
>;

/**
 * The same row with its type, for the cards that read more than one. It also
 * carries `share_answered`, which divides by the events that answered rather
 * than by every event — the meal finish rate, where a meal logged from the tile
 * without opening the dialog is not a meal she left.
 */
export type DetailWindowRow = DetailMetric & { type_id: string; share_answered: number | null };

/**
 * How much one detail field accounted for on one Stockholm day — what a
 * generated card's tooltip breaks its bar down by. Counted in TypeScript
 * rather than SQL; see $lib/stats/detailDays.ts for why.
 */
export type DetailDayCount = { day: string; field: string; n: number };

/** Accidents binned by day, ISO week or month, split kiss/bajs. */
export type AccidentBin = { bucket: string; n: number; pee: number; poop: number };

/** One period bucket of the Trender comparison. */
export type TrendBucket = {
	bucket: string;
	walks: number;
	walk_gap_min: number | null;
	walk_duration_min: number | null;
	meal_gap_min: number | null;
	meal_finish_rate: number | null;
	accidents: number;
};

/** A single weighing, flattened out of the event's details. */
export type WeightPoint = { occurred_at: string; kg: number };

/** One day's count of a type, for generated counts-per-day cards. */
export type SimpleDay = { day: string; n: number };

/** One numeric detail value over time, for generated trend-line cards. */
export type FieldPoint = { occurred_at: string; value: number };

/** The bucket size the stats screen is showing. */
export type Period = 'day' | 'week' | 'month';
