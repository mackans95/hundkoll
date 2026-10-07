// The Trender card: the last two complete periods, compared, one row per
// metric the household chose (trendConfig.ts).

import * as locale from '$lib/locale';
import * as format from '$lib/format';
import * as time from '$lib/time';
import { fieldsFor } from '$lib/events/fields';
import { isDaily } from '$lib/status/schedule';
import { numberWriter } from './cardSpec';
import type { DetailBucketRow, EventType, Period, TypeBucketRow } from '$lib/types/domain';
import {
	childRow,
	shareSource,
	trendKey,
	trendLabel,
	trendMetricLabel,
	type Better,
	type TrendConfigRow
} from './trendConfig';

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
	return locale.stats.trends.comparison(bucketLabel(period, latest), bucketLabel(period, prev));
}

/** A bucket as the card names it. ("week", "2026-09-28") → "v.40" */
export function bucketLabel(period: Period, iso: string): string {
	const labels: Record<Period, (iso: string) => string> = {
		day: format.dayLabel,
		week: format.weekLabel,
		month: format.monthLabel
	};
	return labels[period](iso);
}

/** Where a bucket starts and ends, as instants: Stockholm midnights. */
export function bucketSpan(period: Period, bucket: string): { from: Date; to: Date } {
	const next =
		period === 'day'
			? time.addDays(bucket, 1)
			: period === 'week'
				? time.addDays(bucket, 7)
				: time.addMonths(bucket, 1);
	return {
		from: time.stockholmInputToUtc(`${bucket}T00:00`)!,
		to: time.stockholmInputToUtc(`${next}T00:00`)!
	};
}

/** An absence: from the hand-over to the return, or to now while still away. */
export type AwaySpan = { from: Date; to: Date | null; label: string };

/** How many minutes of a span she was away, absences that overlap each other counted once. */
export function awayMinutes(
	spans: AwaySpan[],
	within: { from: Date; to: Date },
	now: Date
): number {
	const clipped = spans
		.map((span) => ({
			from: Math.max(span.from.getTime(), within.from.getTime()),
			to: Math.min((span.to ?? now).getTime(), within.to.getTime())
		}))
		.filter((span) => span.to > span.from)
		.sort((a, b) => a.from - b.from);

	let total = 0;
	let reach = -Infinity;
	for (const span of clipped) {
		const from = Math.max(span.from, reach);
		if (span.to > from) total += span.to - from;
		reach = Math.max(reach, span.to);
	}
	return total / 60_000;
}

/**
 * Below this share of a period at home, a count says too little to compare:
 * a day with an hour at home would read as a doubling or a collapse.
 */
export const MIN_HOME_SHARE = 0.2;

/**
 * Explains why the card is empty, which it is until two complete periods
 * have been tracked.
 * "month" → "Visas när två hela månader har spårats."
 */
export function trendPending(period: Period): string {
	return locale.stats.trends.pending(period);
}

export type TrendTone = 'better' | 'worse' | 'neutral';

export type TrendRow = {
	key: string;
	label: string;
	from: string;
	to: string;
	badge: string;
	tone: TrendTone;
	/**
	 * Set on a count when either period had time away: 'home' when the change
	 * compares the rate per time at home, 'short' when one period had too
	 * little of it to compare at all.
	 */
	away: 'home' | 'short' | null;
	/** What the row's field revealed, compared the same way beneath it. */
	children: {
		key: string;
		label: string;
		from: string;
		to: string;
		badge: string;
		tone: TrendTone;
	}[];
};

/**
 * One period's rows from the two views, for the types and fields the list
 * names, and how much of it she was at home: 1 for a period with no absence.
 */
export type TrendPeriod = { types: TypeBucketRow[]; details: DetailBucketRow[]; homeShare: number };

/**
 * One row's number in one period, or null when there is nothing to say. A
 * count with no row is zero; everything else with no row is unknown.
 */
export function trendValue(row: TrendConfigRow, period: TrendPeriod): number | null {
	const type = period.types.find((bucket) => bucket.type_id === row.type);
	if (row.kind === 'count') return type?.n ?? 0;
	if (row.kind === 'gap') return type?.avg_gap_min ?? null;

	const detail = period.details.find(
		(bucket) => bucket.type_id === row.type && bucket.field === row.field
	);
	if (row.kind === 'avg') return detail?.avg_number ?? null;

	const field = fieldsFor(row.type).find((candidate) => candidate.name === row.field);
	if (!field) return null;
	if (shareSource(field) === 'answered') return detail?.share_answered ?? null;
	const n = type?.n ?? 0;
	return n > 0 ? (detail?.happened ?? 0) / n : null;
}

/** How a row's value reads: counts as numbers, shares as percent, the rest in their field's unit. */
function trendFormat(row: TrendConfigRow): (value: number) => string {
	if (row.kind === 'count') return format.swedishNumber;
	if (row.kind === 'share') return format.percentageText;
	const write = row.kind === 'gap' ? format.minutesText : numberWriter(row.type, row.field);
	return (value) => locale.units.approximately(write(value));
}

/**
 * The change between two values as a percentage, and whether it is an
 * improvement by the row's own measure. An en dash when there is nothing to
 * compare, including a zero base, where every change is infinite.
 * (4, 5, 'down') → { badge: "↑ 25 %", tone: 'worse' }
 */
function changeBadge(
	from: number | null,
	to: number | null,
	better: Better
): { badge: string; tone: TrendTone } {
	if (from === null || to === null || from === 0) {
		return { badge: locale.units.missing, tone: 'neutral' };
	}

	const percent = Math.round(((to - from) / Math.abs(from)) * 100);
	if (percent === 0) {
		return { badge: locale.stats.trends.unchanged, tone: 'neutral' };
	}

	const direction = percent > 0 ? 'up' : 'down';
	return {
		badge: locale.stats.trends.change(direction, Math.abs(percent)),
		tone: better === null ? 'neutral' : better === direction ? 'better' : 'worse'
	};
}

/**
 * Whether a row's change should be compared per time at home. Only a count
 * depends on how long she was home, and only for a type with a daily rhythm
 * (Dagligen on Status): walks and meals happen at a rate while she is there,
 * whereas one accident in a short day is still one accident, not a jump.
 * Gaps already skip the time away; averages and shares are per event.
 */
function adjusts(
	row: TrendConfigRow,
	types: Pick<EventType, 'id' | 'interval' | 'interval_type'>[]
): boolean {
	const type = types.find((candidate) => candidate.id === row.type);
	return row.kind === 'count' && type !== undefined && isDaily(type);
}

/**
 * One row per configured metric comparing the two periods, each already
 * formatted. A metric with no data on either side still gets a row, so the
 * list does not change height as history accumulates.
 */
export function buildTrendRows(
	config: TrendConfigRow[],
	types: Pick<EventType, 'id' | 'label' | 'icon' | 'interval' | 'interval_type'>[],
	prev: TrendPeriod | null,
	latest: TrendPeriod | null
): TrendRow[] {
	return config.map((row) => {
		const from = prev ? trendValue(row, prev) : null;
		const to = latest ? trendValue(row, latest) : null;
		const show = trendFormat(row);

		// The numbers shown stay what was logged; an adjusted change compares
		// the rate per time at home.
		const homes = [prev?.homeShare ?? 1, latest?.homeShare ?? 1];
		const away =
			!adjusts(row, types) || homes.every((home) => home === 1)
				? null
				: homes.some((home) => home < MIN_HOME_SHARE)
					? 'short'
					: 'home';
		const change =
			away === 'short'
				? { badge: locale.units.missing, tone: 'neutral' as const }
				: away === 'home'
					? changeBadge(
							from === null ? null : from / homes[0],
							to === null ? null : to / homes[1],
							row.better
						)
					: changeBadge(from, to, row.better);

		return {
			key: trendKey(row),
			label: trendLabel(
				row,
				types.find((type) => type.id === row.type)
			),
			from: from === null ? locale.units.missing : show(from),
			to: to === null ? locale.units.missing : show(to),
			...change,
			away,
			children: (row.children ?? []).map((name) => {
				const child = childRow(row, name);
				const childFrom = prev ? trendValue(child, prev) : null;
				const childTo = latest ? trendValue(child, latest) : null;
				const write = trendFormat(child);
				return {
					key: `${trendKey(row)}>${name}`,
					label: trendMetricLabel(child),
					from: childFrom === null ? locale.units.missing : write(childFrom),
					to: childTo === null ? locale.units.missing : write(childTo),
					...changeBadge(childFrom, childTo, row.better)
				};
			})
		};
	});
}
