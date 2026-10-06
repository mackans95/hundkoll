// The stats queries. Aggregation happens in SQL — see supabase/migrations —
// so this module only reads, narrows the nullable view columns into the domain
// types once, and hands the rows to $lib/stats/rows.ts to be paired up.
//
// The four views are generic: per type and per detail field, at bucket grain
// and at window grain. None of them names a type, so which columns a walk or a
// meal consists of is decided on this side.

import * as rows from '$lib/stats/rows';
import {
	awayMinutes,
	bucketSpan,
	buildTrendRows,
	trendBucketKeys,
	type AwaySpan,
	type TrendPeriod,
	type TrendRow
} from '$lib/stats/trends';
import * as time from '$lib/time';
import type {
	AccidentBin,
	DetailBucketRow,
	DetailDayCount,
	DetailMetric,
	DetailWindowRow,
	EventDetails,
	MealDay,
	Period,
	SimpleDay,
	StatSummary,
	TypeBucketRow,
	TypeWindowRow,
	ViewRow,
	WeightPoint
} from '$lib/types/domain';
import type { WalkDay } from '$lib/types/domain';
import { fieldsFor, fieldsRevealedBy } from '$lib/events/fields';
import { longestWhen, outcomeDays, type OutcomeDay } from '$lib/stats/outcomes';
import { detailDayCounts, weightHistory } from './events';
import { listTypeSettings } from './typeSettings';
import { readTrendConfig } from './trendSettings';
import { readCardConfig } from './statsSettings';
import { defaultCards, type CardRow } from '$lib/stats/cardConfig';
import { listEventTypes } from './care';
import { CHARTED_TYPES, chartColor, chartColorKey, type ChartColor } from '$lib/stats/palette';
import type { Db } from './db';

export type Stats = {
	// codegen:stats-shape — npm run new-event inserts card data fields here
	aloneMetrics: DetailMetric[];
	/** Lugn / Orolig / Vet ej per day: the card is stacked by outcome (plan 22). */
	aloneOutcomes: OutcomeDay[];
	/** The longest alone time she stayed calm through, in the 30 days. */
	aloneLongestCalm: number | null;
	carRideDetailDays: DetailDayCount[];
	carRideMetrics: DetailMetric[];
	carRideDays: SimpleDay[];
	period: Period;
	/** The Stockholm day the query windows were cut from, for the charts to
	 * zero-fill the same window. */
	today: string;
	summary: StatSummary | null;
	walkDays: WalkDay[];
	mealDays: MealDay[];
	accidentBins: AccidentBin[];
	weights: WeightPoint[];
	/** The cards in Settings → Tabeller's order, each shown or not (plan 28). */
	cards: CardRow[];
	/** Each charted type's colour, as Settings chose it (plan 26). */
	chartColors: Record<string, ChartColor>;
	/** Whether any read failed. Empty charts and unreadable ones look the same
	 * otherwise, and the second must not be cached as the first. */
	failed: boolean;
};

// The mappers take exactly the columns their query selects, so a select and
// its reader drifting apart is a compile error rather than an empty chart.
type SelectedTypeBucket = Pick<
	ViewRow<'stats_type_buckets'>,
	'type_id' | 'bucket' | 'n' | 'avg_gap_min'
>;
type SelectedDetailBucket = Pick<
	ViewRow<'stats_detail_buckets'>,
	| 'type_id'
	| 'bucket'
	| 'field'
	| 'answered'
	| 'happened'
	| 'total'
	| 'avg_number'
	| 'share_answered'
>;
type SelectedTypeWindow = Pick<
	ViewRow<'stats_type_windows'>,
	| 'dog_id'
	| 'type_id'
	| 'window_days'
	| 'events'
	| 'days_counted'
	| 'per_day'
	| 'per_week'
	| 'per_month'
	| 'avg_gap_min'
	| 'away_days'
>;
type SelectedMetric = Pick<
	ViewRow<'stats_detail_windows'>,
	'field' | 'events' | 'answered' | 'avg_number' | 'share_true' | 'share_not_true'
>;
type SelectedDetailWindow = SelectedMetric &
	Pick<ViewRow<'stats_detail_windows'>, 'type_id' | 'share_answered'>;

const TYPE_BUCKET_COLUMNS = 'type_id, bucket, n, avg_gap_min';
const DETAIL_BUCKET_COLUMNS =
	'type_id, bucket, field, answered, happened, total, avg_number, share_answered';
const TYPE_WINDOW_COLUMNS =
	'dog_id, type_id, window_days, events, days_counted, per_day, per_week, per_month, avg_gap_min, away_days';
// A generated card selects these for its own type; the view windows itself,
// so there is no date filter to keep in step with the charts.
const METRIC_COLUMNS = 'field, events, answered, avg_number, share_true, share_not_true';
const DETAIL_WINDOW_COLUMNS = `type_id, ${METRIC_COLUMNS}, share_answered`;

/** Narrows a type bucket; a row without a bucket or a type names nothing. */
function toTypeBucket(row: SelectedTypeBucket): TypeBucketRow | null {
	if (!row.bucket || !row.type_id) {
		return null;
	}
	return {
		type_id: row.type_id,
		bucket: row.bucket,
		n: row.n ?? 0,
		avg_gap_min: row.avg_gap_min
	};
}

/** Narrows one detail field's bucket row. */
function toDetailBucket(row: SelectedDetailBucket): DetailBucketRow | null {
	if (!row.bucket || !row.type_id || !row.field) {
		return null;
	}
	return {
		type_id: row.type_id,
		bucket: row.bucket,
		field: row.field,
		answered: row.answered ?? 0,
		happened: row.happened ?? 0,
		total: row.total ?? 0,
		avg_number: row.avg_number,
		share_answered: row.share_answered
	};
}

/** Narrows one type's trailing-window row. */
function toTypeWindow(row: SelectedTypeWindow): TypeWindowRow | null {
	if (!row.dog_id || !row.type_id || row.window_days === null) {
		return null;
	}
	return {
		dog_id: row.dog_id,
		type_id: row.type_id,
		window_days: row.window_days,
		events: row.events ?? 0,
		days_counted: row.days_counted ?? 1,
		per_day: row.per_day ?? 0,
		per_week: row.per_week ?? 0,
		per_month: row.per_month ?? 0,
		avg_gap_min: row.avg_gap_min,
		away_days: row.away_days ?? 0
	};
}

/** Narrows one detail-field metric row; a row without a field names nothing. */
function toDetailMetric(row: SelectedMetric): DetailMetric | null {
	if (!row.field) {
		return null;
	}
	return {
		field: row.field,
		events: row.events ?? 0,
		answered: row.answered ?? 0,
		avg_number: row.avg_number,
		share_true: row.share_true,
		share_not_true: row.share_not_true
	};
}

/** The same row with the type and the answered-share the summary reads. */
function toDetailWindow(row: SelectedDetailWindow): DetailWindowRow | null {
	const metric = toDetailMetric(row);
	if (!metric || !row.type_id) {
		return null;
	}
	return { ...metric, type_id: row.type_id, share_answered: row.share_answered };
}

/** Keeps the rows that survived narrowing and drops the ones that did not. */
function present<T>(rows: (T | null)[]): T[] {
	return rows.filter((row): row is T => row !== null);
}

/**
 * Reads a period out of a query string, falling back to the daily view when
 * the parameter is missing or is not one we recognise.
 * "week" → "week", "fortnight" → "day"
 */
export function toPeriod(raw: string | null): Period {
	// A record: adding a Period without teaching this function is a compile error.
	const PERIODS: Record<Period, true> = { day: true, week: true, month: true };

	// hasOwn, not `in` — `in` walks the prototype chain, so ?period=toString
	// would pass for a period.
	return raw !== null && Object.hasOwn(PERIODS, raw) ? (raw as Period) : 'day';
}

/** Everything the stats screen shows, for one period. */
export async function loadStats(db: Db, period: Period): Promise<Stats> {
	// How far back to read per bin size, each covering a dozen-ish buckets.
	const BIN_WINDOW_DAYS: Record<Period, number> = { day: 30, week: 84, month: 365 };
	const DAILY_WINDOW_DAYS = 30;

	const today = time.stockholmNowForInput().slice(0, 10);

	// Counted in Stockholm days, the same days the charts zero-fill — a UTC
	// cutoff would disagree with them for the hours around midnight.
	const daysAgo = (days: number) => time.addDays(today, -days);

	// The daily charts read two types and four fields out of one pair of reads,
	// which is what a per-type-per-field view buys over a column per metric.
	const DAILY_TYPES = ['walk', 'meal'];
	const DAILY_FIELDS = ['pee', 'poop', 'finished', 'duration_min'];

	// Kept as an array as well as destructured, so the failure check below sees
	// every read — including the ones npm run new-event adds, which would
	// otherwise need listing a second time and eventually would not be.
	const results = await Promise.all([
		// codegen:stats-queries — npm run new-event inserts card queries here
		db
			.from('stats_detail_windows')
			.select(METRIC_COLUMNS)
			.eq('type_id', 'alone')
			.eq('window_days', 30),
		// The type's own events: the outcome split with its signs and lengths, and
		// the longest calm stretch, all come from these; no view can name the fields.
		db
			.from('events')
			.select('occurred_at, details')
			.eq('type_id', 'alone')
			.gte('occurred_at', daysAgo(DAILY_WINDOW_DAYS)),
		detailDayCounts(db, 'car_ride', daysAgo(DAILY_WINDOW_DAYS)),
		db
			.from('stats_detail_windows')
			.select(METRIC_COLUMNS)
			.eq('type_id', 'car_ride')
			.eq('window_days', 30),
		db
			.from('stats_type_buckets')
			.select(TYPE_BUCKET_COLUMNS)
			.eq('type_id', 'car_ride')
			.eq('period', 'day')
			.gte('bucket', daysAgo(DAILY_WINDOW_DAYS))
			.order('bucket'),
		db
			.from('stats_type_buckets')
			.select(TYPE_BUCKET_COLUMNS)
			.in('type_id', DAILY_TYPES)
			.eq('period', 'day')
			.gte('bucket', daysAgo(DAILY_WINDOW_DAYS))
			.order('bucket'),
		db
			.from('stats_detail_buckets')
			.select(DETAIL_BUCKET_COLUMNS)
			.in('type_id', DAILY_TYPES)
			.in('field', DAILY_FIELDS)
			.eq('period', 'day')
			.gte('bucket', daysAgo(DAILY_WINDOW_DAYS)),
		db
			.from('stats_type_windows')
			.select(TYPE_WINDOW_COLUMNS)
			.in('type_id', ['walk', 'meal', 'accident']),
		db
			.from('stats_detail_windows')
			.select(DETAIL_WINDOW_COLUMNS)
			.in('type_id', ['walk', 'meal'])
			.in('field', ['duration_min', 'finished'])
			.eq('window_days', 30),
		db
			.from('stats_type_buckets')
			.select(TYPE_BUCKET_COLUMNS)
			.eq('type_id', 'accident')
			.eq('period', period)
			.gte('bucket', daysAgo(BIN_WINDOW_DAYS[period]))
			.order('bucket'),
		db
			.from('stats_detail_buckets')
			.select(DETAIL_BUCKET_COLUMNS)
			.eq('type_id', 'accident')
			.in('field', ['pee', 'poop'])
			.eq('period', period)
			.gte('bucket', daysAgo(BIN_WINDOW_DAYS[period])),
		weightHistory(db),
		// A failed read draws the defaults, which is no reason to call the page failed.
		listTypeSettings(db),
		readCardConfig(db)
	]);

	const [
		// codegen:stats-results — one name here per query above, same order
		aloneMetricsRes,
		aloneEventsRes,
		carRideDetailDays,
		carRideMetricsRes,
		carRideRes,
		dailyRes,
		dailyDetailRes,
		windowsRes,
		windowDetailRes,
		binsRes,
		binDetailRes,
		weights,
		settings,
		cards
	] = results;

	// Asked of the array rather than of each name, so a query added here later —
	// by hand or by the generator — is covered without being remembered. The
	// two entries that are not view reads report their own failures already and
	// carry no `error` to find.
	const failed = results.some(
		(result) => result !== null && typeof result === 'object' && 'error' in result && result.error
	);

	const aloneEvents = (aloneEventsRes.data ?? []).map((row) => ({
		occurred_at: row.occurred_at,
		details: (row.details ?? {}) as EventDetails
	}));

	const dailyBuckets = present((dailyRes.data ?? []).map(toTypeBucket));
	const dailyDetails = present((dailyDetailRes.data ?? []).map(toDetailBucket));

	return {
		// codegen:stats-return — npm run new-event inserts narrowed results here
		aloneMetrics: present((aloneMetricsRes.data ?? []).map(toDetailMetric)),
		aloneOutcomes: outcomeDays(aloneEvents, {
			outcome: 'calm',
			measure: 'duration_min',
			revealed: fieldsRevealedBy(fieldsFor('alone'), 'calm')
		}),
		aloneLongestCalm: longestWhen(aloneEvents, 'duration_min', 'calm'),
		carRideDetailDays,
		carRideMetrics: present((carRideMetricsRes.data ?? []).map(toDetailMetric)),
		carRideDays: rows.simpleDays(present((carRideRes.data ?? []).map(toTypeBucket)), 'car_ride'),
		period,
		today,
		summary: rows.statSummary(
			present((windowsRes.data ?? []).map(toTypeWindow)),
			present((windowDetailRes.data ?? []).map(toDetailWindow))
		),
		walkDays: rows.walkDays(dailyBuckets, dailyDetails),
		mealDays: rows.mealDays(dailyBuckets, dailyDetails),
		accidentBins: rows.accidentBins(
			present((binsRes.data ?? []).map(toTypeBucket)),
			present((binDetailRes.data ?? []).map(toDetailBucket))
		),
		weights,
		// A failed read shows every card in the default order rather than none.
		cards: cards ?? defaultCards(),
		chartColors: Object.fromEntries(
			Object.keys(CHARTED_TYPES).map((typeId) => [
				typeId,
				chartColor(chartColorKey(typeId, settings?.get(typeId)?.chart_color))
			])
		),
		failed
	};
}

export type Trends = {
	period: Period;
	rows: TrendRow[];
	/** Each compared period she spent part of away, for the line under the caption. */
	away: { bucket: string; minutes: number; label: string }[];
	/** Both buckets exist: anything at all was logged in each. */
	complete: boolean;
	prevBucket: string;
	latestBucket: string;
	failed: boolean;
};

/** The last two complete buckets of one period, one row per configured trend. */
export async function loadTrends(db: Db, period: Period): Promise<Trends> {
	const today = time.stockholmNowForInput().slice(0, 10);
	const { prev: prevBucket, latest: latestBucket } = trendBucketKeys(today, period);

	const types = await listEventTypes(db);
	const config = await readTrendConfig(db, new Set((types ?? []).map((type) => type.id)));
	const rows = config ?? [];
	const typeIds = [...new Set(rows.map((row) => row.type))];
	const fields = [...new Set(rows.flatMap((row) => (row.field ? [row.field] : [])))];

	const prevSpan = bucketSpan(period, prevBucket);
	const latestSpan = bucketSpan(period, latestBucket);

	const [typeRes, detailRes, awayRes] = await Promise.all([
		// No type filter: a bucket the view produced exists if *anything* was
		// logged in it, so a week of only car rides still compares.
		db
			.from('stats_type_buckets')
			.select(TYPE_BUCKET_COLUMNS)
			.eq('period', period)
			.in('bucket', [prevBucket, latestBucket]),
		// Skipped when no row names a field: there is nothing to filter on.
		fields.length > 0
			? db
					.from('stats_detail_buckets')
					.select(DETAIL_BUCKET_COLUMNS)
					.in('type_id', typeIds)
					.in('field', fields)
					.eq('period', period)
					.in('bucket', [prevBucket, latestBucket])
			: { data: [], error: null },
		// Absences overlapping either period: started before the end, and not
		// ended before the start.
		db
			.from('events')
			.select('occurred_at, ended_at, type:event_types!inner(label, category)')
			.eq('type.category', 'absence')
			.lt('occurred_at', latestSpan.to.toISOString())
			.or(`ended_at.is.null,ended_at.gt.${prevSpan.from.toISOString()}`)
	]);

	const now = new Date();
	const spans: AwaySpan[] = (awayRes.data ?? []).map((event) => ({
		from: new Date(event.occurred_at),
		to: event.ended_at ? new Date(event.ended_at) : null,
		label: event.type.label
	}));
	const awayIn = (span: { from: Date; to: Date }) => awayMinutes(spans, span, now);
	const homeShare = (span: { from: Date; to: Date }) =>
		1 - awayIn(span) / ((span.to.getTime() - span.from.getTime()) / 60_000);

	const typeBuckets = present((typeRes.data ?? []).map(toTypeBucket));
	const detailBuckets = present((detailRes.data ?? []).map(toDetailBucket));
	const at = (bucket: string, span: { from: Date; to: Date }): TrendPeriod | null =>
		typeBuckets.some((row) => row.bucket === bucket)
			? {
					types: typeBuckets.filter((row) => row.bucket === bucket),
					details: detailBuckets.filter((row) => row.bucket === bucket),
					homeShare: homeShare(span)
				}
			: null;
	const prev = at(prevBucket, prevSpan);
	const latest = at(latestBucket, latestSpan);

	return {
		period,
		rows: buildTrendRows(rows, types ?? [], prev, latest),
		away: [
			{ bucket: prevBucket, span: prevSpan },
			{ bucket: latestBucket, span: latestSpan }
		]
			.map(({ bucket, span }) => ({
				bucket,
				minutes: awayIn(span),
				label: spans[0]?.label ?? ''
			}))
			.filter((entry) => entry.minutes > 0),
		complete: prev !== null && latest !== null,
		prevBucket,
		latestBucket,
		failed: Boolean(
			types === null || config === null || typeRes.error || detailRes.error || awayRes.error
		)
	};
}
