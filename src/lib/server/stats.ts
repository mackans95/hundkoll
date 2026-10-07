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
	DetailBucketRow,
	DetailDayCount,
	DetailMetric,
	DetailWindowRow,
	EventDetails,
	Period,
	SimpleDay,
	StatSummary,
	TypeBucketRow,
	TypeWindowRow,
	ViewRow
} from '$lib/types/domain';
import { barNeedsEvents } from '$lib/stats/bars';
import { cardView, type CardView } from '$lib/stats/cardView';
import { fieldHistory } from './events';
import { listTypeSettings } from './typeSettings';
import { typeSettings } from '$lib/typeSettings';
import { tileReadsEvents, tileValues } from '$lib/stats/cardSpec';
import { readTrendConfig } from './trendSettings';
import { readCardConfig } from './statsSettings';
import { defaultCards, type CardRow } from '$lib/stats/cardConfig';
import { listEventTypes } from './care';
import { CHARTED_TYPES, chartColor } from '$lib/stats/palette';
import type { Db } from './db';

export type Stats = {
	period: Period;
	summary: StatSummary | null;
	/** The cards in Settings → Tabeller's order, each shown or not (plan 28). */
	cards: CardRow[];
	/** Each charted type's card, drawn from its configuration (plan 29). */
	views: Record<string, CardView>;
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

	// Read first: each card's configuration decides what the reads below fetch.
	// A failed read draws the defaults, which is no reason to call the page failed.
	const settings = await listTypeSettings(db);
	const charted = Object.keys(CHARTED_TYPES);
	const config = Object.fromEntries(
		charted.map((type) => [type, typeSettings(type, settings?.get(type))])
	);
	const chartOf = (type: string) => config[type].chart!;
	const periodOf = (type: string): Period => (chartOf(type).picker ? period : 'day');
	// Bars and an average timeline read the bucket views; an every-event
	// timeline reads the field's whole history instead.
	const bucketed = charted.filter((type) => {
		const chart = chartOf(type);
		return chart.kind === 'bars' || !chart.every;
	});
	const daily = bucketed.filter((type) => periodOf(type) === 'day');
	const tabbed = bucketed.filter((type) => periodOf(type) !== 'day');
	const timelines = charted.filter((type) => {
		const chart = chartOf(type);
		return chart.kind === 'timeline' && chart.every;
	});
	// The type's own events, for a tooltip or a tile no view can answer.
	const eventTypes = charted.filter((type) => {
		const chart = chartOf(type);
		return (
			config[type].tiles.some(tileReadsEvents) ||
			(chart.kind === 'bars' && barNeedsEvents(type, chart, periodOf(type)))
		);
	});

	// A bucket and detail read per period on screen: by day for most, at the
	// tabs' period for a chart that has them.
	async function bucketReads(types: string[], at: Period) {
		if (types.length === 0) {
			return { buckets: [] as TypeBucketRow[], details: [] as DetailBucketRow[], error: false };
		}
		const [bucketsRes, detailsRes] = await Promise.all([
			db
				.from('stats_type_buckets')
				.select(TYPE_BUCKET_COLUMNS)
				.in('type_id', types)
				.eq('period', at)
				.gte('bucket', daysAgo(BIN_WINDOW_DAYS[at]))
				.order('bucket'),
			db
				.from('stats_detail_buckets')
				.select(DETAIL_BUCKET_COLUMNS)
				.in('type_id', types)
				.eq('period', at)
				.gte('bucket', daysAgo(BIN_WINDOW_DAYS[at]))
		]);
		return {
			buckets: present((bucketsRes.data ?? []).map(toTypeBucket)),
			details: present((detailsRes.data ?? []).map(toDetailBucket)),
			error: Boolean(bucketsRes.error || detailsRes.error)
		};
	}

	const [dailyRows, tabbedRows, windowsRes, windowDetailRes, eventsRes, types, histories, cards] =
		await Promise.all([
			bucketReads(daily, 'day'),
			bucketReads(tabbed, period),
			// Every card's tiles come out of these two, by type and field.
			db.from('stats_type_windows').select(TYPE_WINDOW_COLUMNS).in('type_id', charted),
			db
				.from('stats_detail_windows')
				.select(DETAIL_WINDOW_COLUMNS)
				.in('type_id', charted)
				.eq('window_days', 30),
			eventTypes.length > 0
				? db
						.from('events')
						.select('type_id, occurred_at, details')
						.in('type_id', eventTypes)
						.gte('occurred_at', daysAgo(DAILY_WINDOW_DAYS))
						.order('occurred_at')
				: { data: [], error: null },
			listEventTypes(db),
			Promise.all(
				timelines.map((type) => {
					const chart = chartOf(type);
					return chart.kind === 'timeline' ? fieldHistory(db, type, chart.field) : [];
				})
			),
			readCardConfig(db)
		]);

	const failed = Boolean(
		dailyRows.error ||
		tabbedRows.error ||
		windowsRes.error ||
		windowDetailRes.error ||
		eventsRes.error ||
		types === null
	);

	const typeBuckets = [...dailyRows.buckets, ...tabbedRows.buckets];
	const detailBuckets = [...dailyRows.details, ...tabbedRows.details];
	const windows = present((windowsRes.data ?? []).map(toTypeWindow));
	const windowDetails = present((windowDetailRes.data ?? []).map(toDetailWindow));
	const summary = rows.statSummary(windows, windowDetails);
	const tracked = summary?.days_counted ?? 0;
	const eventsOf = (type: string) =>
		(eventsRes.data ?? [])
			.filter((row) => row.type_id === type)
			.map((row) => ({
				occurred_at: row.occurred_at,
				details: (row.details ?? {}) as EventDetails
			}));

	const views = Object.fromEntries(
		charted.map((type) => {
			const chart = chartOf(type);
			const catalogue = types?.find((candidate) => candidate.id === type);
			const typeEvents = eventsOf(type);
			return [
				type,
				cardView({
					typeId: type,
					type: { label: catalogue?.label ?? type, icon: catalogue?.icon ?? null },
					chart,
					color: chartColor(config[type].chartColor ?? 'slate'),
					tiles: tileValues(type, config[type].tiles, {
						windows: windows.filter((row) => row.type_id === type),
						metrics: windowDetails.filter((row) => row.type_id === type),
						events: typeEvents,
						tracked
					}),
					period,
					today,
					tracked,
					buckets: typeBuckets.filter((row) => row.type_id === type),
					details: detailBuckets.filter((row) => row.type_id === type),
					events: typeEvents,
					history: histories[timelines.indexOf(type)] ?? []
				})
			];
		})
	);

	return {
		period,
		summary,
		// A failed read shows every card in the default order rather than none.
		cards: cards ?? defaultCards(),
		views,
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
	const fields = [
		...new Set(rows.flatMap((row) => [...(row.field ? [row.field] : []), ...(row.children ?? [])]))
	];

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
